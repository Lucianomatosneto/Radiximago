"""
Rotas da PRANCHA (folha A4: imagens empilhadas a esquerda, informacoes da
curadoria a direita - ver app/modules/prancha.py).

- POST /prancha/arquivo -> devolve a prancha em PDF (ou PNG; varias folhas
  em PNG vao num ZIP). Usado por "Baixar" e por "Imprimir" (a tela abre o
  PDF e chama a impressao do navegador).
- POST /prancha/email   -> envia a prancha em PDF para o e-mail do PROPRIO
  usuario (sem destinatario livre - mesma regra dos outros envios).

Regras (as mesmas do /search):
- qualquer usuario logado; so imagens APROVADAS e ativas
  (_buscar_ficha_aprovada - 404 se alguma nao puder ser vista);
- limites de quantidade e frequencia (app/core/rate_limit.py) e no maximo
  MAX_ZIPS_SIMULTANEOS montagens pesadas ao mesmo tempo (ASVS 15.2.2);
- cada prancha gerada fica na auditoria (quem, quantas, quais fichas).
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.core.cabecalhos import disposicao_de_arquivo
from app.core.database import get_db
from app.core.email import enviar_email_prancha
from app.core.rate_limit import (
    LIMITE_PRANCHA,
    LIMITE_PRANCHA_EMAIL,
    MAX_IMAGENS_PRANCHA,
    MAX_IMAGENS_PRANCHA_EMAIL,
    VagaDeTrabalhoPesado,
    limiter,
)
from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog
from app.modules.auth import obter_usuario_atual
from app.modules.marcacoes_imagem import desenhar_marcacoes_na_imagem
from app.modules.prancha import ItemPrancha, descrever_ficha, em_pdf, em_png, montar_paginas
from app.modules.search_router import _buscar_ficha_aprovada
from app.modules.users import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prancha", tags=["Prancha"])


class PedidoPrancha(BaseModel):
    curation_ids: List[int] = Field(min_length=1, max_length=MAX_IMAGENS_PRANCHA)
    # numero de cada imagem na tela (o mesmo "#3" que a pessoa ve); opcional
    numeros: Optional[List[int]] = Field(default=None, max_length=MAX_IMAGENS_PRANCHA)
    por_folha: Literal[2, 3] = 2
    com_informacoes: bool = True
    com_marcacoes: bool = True
    formato: Literal["pdf", "png"] = "pdf"

    @model_validator(mode="after")
    def _conferir(self):
        if self.numeros is not None:
            if len(self.numeros) != len(self.curation_ids):
                raise ValueError("numeros deve ter um numero para cada imagem")
            if any(n < 1 or n > 100000 for n in self.numeros):
                raise ValueError("numero de imagem invalido")
        return self


def _montar(db: Session, pedido: PedidoPrancha) -> tuple[list, list[int]]:
    """Busca as fichas (conferindo a permissao), as imagens e monta as folhas."""
    vistos: dict[int, int] = {}
    for i, cid in enumerate(pedido.curation_ids):
        if cid not in vistos:  # a mesma imagem duas vezes entra uma vez so
            vistos[cid] = pedido.numeros[i] if pedido.numeros else len(vistos) + 1
    fichas = [_buscar_ficha_aprovada(db, cid) for cid in vistos]

    def imagem(ficha) -> bytes | None:
        try:
            conteudo = orthanc_client.obter_preview_instancia(ficha.orthanc_reference.orthanc_id)
            if pedido.com_marcacoes and ficha.marcacoes:
                conteudo = desenhar_marcacoes_na_imagem(conteudo, ficha.marcacoes)
            return conteudo
        except Exception:
            # a folha sai mesmo assim, com "Imagem indisponível" no lugar
            logger.warning("Prancha: imagem da ficha %s indisponivel no Orthanc.", ficha.id)
            return None

    with VagaDeTrabalhoPesado():
        with ThreadPoolExecutor(max_workers=4) as grupo:
            imagens = list(grupo.map(imagem, fichas))
        itens = [
            ItemPrancha(
                numero=vistos[ficha.id],
                curation_id=ficha.id,
                imagem_png=img,
                linhas=descrever_ficha(ficha, ficha.marcacoes if pedido.com_marcacoes else None),
            )
            for ficha, img in zip(fichas, imagens)
        ]
        paginas = montar_paginas(itens, pedido.por_folha, pedido.com_informacoes)
    return paginas, list(vistos)


def _auditar(db: Session, usuario: User, acao: str, ids: list[int], pedido: PedidoPrancha, folhas: int) -> None:
    db.add(AuditLog(
        usuario_id=usuario.id, acao=acao, entidade="curation", entidade_id=ids[0] if len(ids) == 1 else None,
        resultado="sucesso",
        detalhes=(
            f"{len(ids)} imagem(ns) em {folhas} folha(s), {pedido.por_folha} por folha, "
            f"informacoes={'sim' if pedido.com_informacoes else 'nao'}, "
            f"marcacoes={'sim' if pedido.com_marcacoes else 'nao'}; fichas: {', '.join(map(str, ids))}"
        )[:1000],
    ))
    db.commit()


@router.post("/arquivo")
@limiter.limit(LIMITE_PRANCHA)
def gerar_prancha(
    request: Request,
    pedido: PedidoPrancha,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    paginas, ids = _montar(db, pedido)
    nome = f"radix-imago-prancha-{len(ids)}-imagens"
    if pedido.formato == "pdf":
        conteudo, tipo, arquivo = em_pdf(paginas), "application/pdf", f"{nome}.pdf"
    else:
        conteudo, tipo, arquivo = em_png(paginas, nome)
    _auditar(db, usuario, "prancha_gerada", ids, pedido, len(paginas))
    return Response(
        content=conteudo,
        media_type=tipo,
        headers={"Content-Disposition": disposicao_de_arquivo(arquivo, baixar=True), "Cache-Control": "no-store"},
    )


@router.post("/email")
@limiter.limit(LIMITE_PRANCHA_EMAIL)
def enviar_prancha_por_email(
    request: Request,
    pedido: PedidoPrancha,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    if len(set(pedido.curation_ids)) > MAX_IMAGENS_PRANCHA_EMAIL:
        raise HTTPException(
            status_code=400,
            detail=f"Por e-mail, a prancha aceita até {MAX_IMAGENS_PRANCHA_EMAIL} imagens. Use “Baixar” para mais.",
        )
    paginas, ids = _montar(db, pedido)
    pdf = em_pdf(paginas)
    enviar_email_prancha(
        usuario.email, usuario.nome, len(ids), len(paginas), pdf, f"radix-imago-prancha-{len(ids)}-imagens.pdf",
    )
    _auditar(db, usuario, "prancha_enviada_email", ids, pedido, len(paginas))
    return {"mensagem": f"Prancha com {len(ids)} imagem(ns) enviada para {usuario.email}."}
