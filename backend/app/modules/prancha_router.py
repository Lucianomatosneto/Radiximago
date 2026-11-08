"""
Rotas da PRANCHA (folha A4: imagens empilhadas a esquerda, informacoes da
curadoria a direita - ver app/modules/prancha.py).

- POST /prancha/arquivo -> devolve a prancha em PDF (ou PNG; varias folhas
  em PNG vao num ZIP). Usado por "Baixar" e por "Imprimir" (a tela abre o
  PDF e chama a impressao do navegador).
- GET  /prancha/destinatarios -> para quem a prancha pode ir: o proprio
  e-mail COMPLETO; o de outras pessoas MASCARADO (g•••o@hotmail.com - o
  dominio inteiro, para conferir erro de digitacao, sem expor o endereco), e
  o aviso de provavel erro de digitacao ("hotmai.com" -> "hotmail.com").
- POST /prancha/email   -> envia a prancha em PDF anexado para o PROPRIO
  usuario (o e-mail da conta dele).
- ETAPA E (08/11/2026, decisao do Luciano) - para OUTRAS pessoas vai so um
  LINK que exige login; a imagem nao sai do sistema. Qualquer perfil envia
  para qualquer usuario cadastrado e ativo, escolhido pelo nome ou e-mail:
    GET  /prancha/pessoas?busca=          procura pessoas (e-mail mascarado)
    POST /prancha/enviar                  {pedido + pessoas + grupos + recado}
    GET  /prancha/recebidas               as pranchas que recebi
    GET  /prancha/recebidas/{id}/arquivo  abre a prancha (montada na hora)
- Em todas: a pessoa escolhe 1, 2 ou 3 imagens por folha, QUAIS dados vao ao
  lado (tipo, regiao, achados, descricao, lista de marcadores) e se os
  marcadores aparecem SOBRE a imagem.

Regras (as mesmas do /search):
- qualquer usuario logado; so imagens APROVADAS e ativas
  (_buscar_ficha_aprovada - 404 se alguma nao puder ser vista);
- limites de quantidade e frequencia (app/core/rate_limit.py) e no maximo
  MAX_ZIPS_SIMULTANEOS montagens pesadas ao mesmo tempo (ASVS 15.2.2);
- cada prancha gerada fica na auditoria (quem, quantas, quais fichas).
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.cabecalhos import disposicao_de_arquivo
from app.core.database import get_db
from app.core.config import settings
from app.core.email import enviar_email_link_prancha, enviar_email_prancha
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
from app.modules.prancha_envios import DESTINATARIOS_MAX, RECADO_MAX, PranchaEnviada
from app.modules.prancha import ItemPrancha, descrever_ficha, em_pdf, em_png, montar_paginas
from app.modules.search_router import _buscar_ficha_aprovada
from app.modules.users import User, UserRole
from app.core.email_digitacao import sugestao_de_email


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prancha", tags=["Prancha"])


class PedidoPrancha(BaseModel):
    curation_ids: List[int] = Field(min_length=1, max_length=MAX_IMAGENS_PRANCHA)
    # numero de cada imagem na tela (o mesmo "#3" que a pessoa ve); opcional
    numeros: Optional[List[int]] = Field(default=None, max_length=MAX_IMAGENS_PRANCHA)
    por_folha: Literal[1, 2, 3] = 2
    com_informacoes: bool = True
    # quais dados vao ao lado da imagem (None = todos) - etapa E
    campos: Optional[List[Literal["tipo", "regiao", "achados", "descricao", "marcadores"]]] = Field(
        default=None, max_length=5)
    com_marcacoes: bool = True
    formato: Literal["pdf", "png"] = "pdf"
    # (antigo) destinatario no /email; hoje so o proprio usuario e aceito
    para_id: Optional[int] = Field(default=None, ge=1)

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
                # sem a escolha de dados (pedido antigo): a lista de marcadores
                # acompanha a opcao "marcadores sobre a imagem", como antes
                linhas=descrever_ficha(
                    ficha,
                    ficha.marcacoes if (pedido.campos is not None or pedido.com_marcacoes) else None,
                    pedido.campos,
                ),
            )
            for ficha, img in zip(fichas, imagens)
        ]
        com_informacoes = pedido.com_informacoes and pedido.campos != []
        paginas = montar_paginas(itens, pedido.por_folha, com_informacoes)
    return paginas, list(vistos)


def _auditar(db: Session, usuario: User, acao: str, ids: list[int], pedido: PedidoPrancha, folhas: int,
             para_id: int | None = None) -> None:
    db.add(AuditLog(
        usuario_id=usuario.id, acao=acao, entidade="curation", entidade_id=ids[0] if len(ids) == 1 else None,
        resultado="sucesso",
        detalhes=(
            f"{len(ids)} imagem(ns) em {folhas} folha(s), {pedido.por_folha} por folha, "
            f"informacoes={'sim' if pedido.com_informacoes else 'nao'}"
            + (f" ({', '.join(pedido.campos) or 'nenhuma'})" if pedido.campos is not None else "") + ", "
            f"marcacoes={'sim' if pedido.com_marcacoes else 'nao'}; fichas: {', '.join(map(str, ids))}"
            + (f"; para_id={para_id}" if para_id is not None else "")
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


def _mascarar(email: str) -> str:
    """'gabrielly.machado@hotmai.com' -> 'g•••o@hotmai.com': o DOMINIO fica
    inteiro (e onde costuma estar o erro de digitacao), o resto nao vaza."""
    usuario, _, dominio = (email or "").rpartition("@")
    if not usuario:
        return "•••"
    inicio_fim = usuario[0] + "•••" + (usuario[-1] if len(usuario) > 1 else "")
    return f"{inicio_fim}@{dominio}"


def _pessoa(u: User, proprio: bool) -> dict:
    sugerido = sugestao_de_email(u.email)
    return {
        "id": u.id,
        "nome": u.nome,
        "perfil": u.perfil.value if hasattr(u.perfil, "value") else str(u.perfil),
        # e-mail COMPLETO so o da propria pessoa; de outros, mascarado (a regra
        # geral do sistema: nenhuma leitura expoe o e-mail de outro usuario -
        # tests/test_exposicao_de_dados.py)
        "email": u.email if proprio else _mascarar(u.email),
        "email_sugerido": (sugerido if proprio else _mascarar(sugerido)) if sugerido else None,
    }


@router.get("/destinatarios")
def destinatarios(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """O e-mail da propria conta (o PDF anexado so vai para ele). Para outras
    pessoas, a tela usa /prancha/pessoas e /prancha/enviar (link com login)."""
    return {"proprio": _pessoa(usuario, True), "outros": []}


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
    destino = usuario
    if pedido.para_id is not None and pedido.para_id != usuario.id:
        # etapa E (08/11/2026): o PDF anexado so vai para o proprio e-mail
        raise HTTPException(
            status_code=422,
            detail="O PDF anexado só vai para o seu e-mail. Para outra pessoa, use “Enviar a pessoas” (vai um link que exige login).",
        )
    paginas, ids = _montar(db, pedido)
    pdf = em_pdf(paginas)
    enviar_email_prancha(
        destino.email, destino.nome, len(ids), len(paginas), pdf, f"radix-imago-prancha-{len(ids)}-imagens.pdf",
        remetente=None if destino is usuario else usuario.nome,
    )
    _auditar(db, usuario, "prancha_enviada_email", ids, pedido, len(paginas), para_id=destino.id)
    email_visivel = destino.email if destino is usuario else _mascarar(destino.email)
    return {
        "mensagem": f"Prancha com {len(ids)} imagem(ns) enviada para {email_visivel}.",
        "destinatario": email_visivel,
    }


# ---------------------------------------------------------------------------
# ETAPA E (08/11/2026): prancha para OUTRAS pessoas - so um link com login
# ---------------------------------------------------------------------------

LIMITE_BUSCA_PESSOAS = "60/minute"


def _pessoa_curta(u: User) -> dict:
    return {"id": u.id, "nome": u.nome, "perfil": u.perfil.value if hasattr(u.perfil, "value") else str(u.perfil),
            "email": _mascarar(u.email)}


@router.get("/pessoas")
@limiter.limit(LIMITE_BUSCA_PESSOAS)
def procurar_pessoas(
    request: Request,
    busca: str = Query("", max_length=80),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Pessoas cadastradas e ativas pelo nome ou e-mail (no minimo 3 letras;
    e-mail mascarado; ate 20). A propria pessoa nao aparece."""
    termo = busca.strip().lower()
    if len(termo) < 3:
        return {"pessoas": []}
    pessoas = (
        db.query(User)
        .filter(User.ativo.is_(True), User.excluido.is_(False), User.bloqueado.isnot(True), User.id != usuario.id)
        .filter(or_(func.lower(User.nome).contains(termo), func.lower(User.email).contains(termo)))
        .order_by(User.nome).limit(20).all()
    )
    return {"pessoas": [_pessoa_curta(u) for u in pessoas]}


class PedidoEnvio(PedidoPrancha):
    pessoas: List[int] = Field(default_factory=list, max_length=DESTINATARIOS_MAX)
    grupos: List[int] = Field(default_factory=list, max_length=20)
    recado: Optional[str] = Field(default=None, max_length=RECADO_MAX)


@router.post("/enviar")
@limiter.limit(LIMITE_PRANCHA_EMAIL)
def enviar_prancha_a_pessoas(
    request: Request,
    pedido: PedidoEnvio,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    from app.modules.grupos_router import membros_dos_grupos, pessoas_validas  # (evita import circular)

    ids_unicos = list(dict.fromkeys(pedido.curation_ids))
    for cid in ids_unicos:  # 404 se alguma imagem nao puder ser vista
        _buscar_ficha_aprovada(db, cid)
    alvo = set(pedido.pessoas) | membros_dos_grupos(db, usuario.id, pedido.grupos)
    alvo.discard(usuario.id)
    destinos = pessoas_validas(db, list(alvo))[:DESTINATARIOS_MAX]
    if not destinos:
        raise HTTPException(status_code=422, detail="Escolha ao menos uma pessoa cadastrada para receber a prancha.")
    recado = (pedido.recado or "").strip() or None
    criadas: list[PranchaEnviada] = []
    for d in destinos:
        envio = PranchaEnviada(
            remetente_id=usuario.id, destinatario_id=d.id, curation_ids=pedido.curation_ids,
            numeros=pedido.numeros, por_folha=pedido.por_folha, com_informacoes=pedido.com_informacoes,
            campos=pedido.campos, com_marcacoes=pedido.com_marcacoes, recado=recado,
        )
        db.add(envio)
        criadas.append(envio)
    db.flush()
    for envio, d in zip(criadas, destinos):
        db.add(AuditLog(
            usuario_id=usuario.id, acao="prancha_enviada_link", entidade="prancha_enviada", entidade_id=envio.id,
            resultado="sucesso",
            detalhes=(f"{len(ids_unicos)} imagem(ns) para o usuario {d.id}; fichas: "
                      f"{', '.join(map(str, ids_unicos))}")[:1000],
        ))
    db.commit()
    falhas = 0
    for envio, d in zip(criadas, destinos):
        link = f"{settings.FRONTEND_URL.rstrip('/')}/pranchas-recebidas?abrir={envio.id}"
        try:
            enviar_email_link_prancha(d.email, d.nome, usuario.nome, len(ids_unicos), link)
        except Exception:
            falhas += 1
            logger.exception("Prancha: aviso por e-mail nao saiu (envio %s).", envio.id)
    return {
        "mensagem": f"Prancha enviada a {len(destinos)} pessoa(s). Cada uma recebe um e-mail com o link (é preciso entrar no Rádix para ver).",
        "enviadas": len(destinos),
        "avisos_que_falharam": falhas,
    }


def _envio_recebido(db: Session, usuario: User, envio_id: int) -> PranchaEnviada:
    envio = db.get(PranchaEnviada, envio_id)
    if not envio or envio.destinatario_id != usuario.id:
        raise HTTPException(status_code=404, detail="Prancha não encontrada.")
    return envio


def _disponiveis(db: Session, ids: list[int]) -> list[int]:
    ok = []
    for cid in dict.fromkeys(ids):
        try:
            _buscar_ficha_aprovada(db, cid)
            ok.append(cid)
        except HTTPException:
            pass
    return ok


@router.get("/recebidas")
def pranchas_recebidas(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    envios = (db.query(PranchaEnviada, User)
              .join(User, User.id == PranchaEnviada.remetente_id)
              .filter(PranchaEnviada.destinatario_id == usuario.id)
              .order_by(PranchaEnviada.criado_em.desc()).limit(200).all())
    return {"pranchas": [{
        "id": e.id, "de": r.nome, "imagens": len(dict.fromkeys(e.curation_ids or [])), "por_folha": e.por_folha,
        "recado": e.recado or "", "criado_em": e.criado_em.isoformat() if e.criado_em else None,
        "visto": e.visto_em is not None,
    } for e, r in envios]}


@router.get("/recebidas/{envio_id}/arquivo")
@limiter.limit(LIMITE_PRANCHA)
def abrir_prancha_recebida(
    request: Request,
    envio_id: int,
    formato: Literal["pdf", "png"] = "pdf",
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    envio = _envio_recebido(db, usuario, envio_id)
    ids = _disponiveis(db, envio.curation_ids or [])
    if not ids:
        raise HTTPException(status_code=410, detail="As imagens desta prancha não estão mais disponíveis.")
    numeros_por_id = dict(zip(envio.curation_ids or [], envio.numeros or []))
    pedido = PedidoPrancha(
        curation_ids=ids, numeros=[numeros_por_id.get(c, i + 1) for i, c in enumerate(ids)] if envio.numeros else None,
        por_folha=envio.por_folha, com_informacoes=envio.com_informacoes, campos=envio.campos,
        com_marcacoes=envio.com_marcacoes, formato=formato,
    )
    paginas, ids = _montar(db, pedido)
    if envio.visto_em is None:
        envio.visto_em = datetime.now(timezone.utc)
    db.add(AuditLog(usuario_id=usuario.id, acao="prancha_recebida_aberta", entidade="prancha_enviada",
                    entidade_id=envio.id, resultado="sucesso", detalhes=f"{len(ids)} imagem(ns), formato {formato}"))
    db.commit()
    nome = f"radix-imago-prancha-recebida-{envio.id}"
    if formato == "pdf":
        conteudo, tipo, arquivo = em_pdf(paginas), "application/pdf", f"{nome}.pdf"
    else:
        conteudo, tipo, arquivo = em_png(paginas, nome)
    return Response(
        content=conteudo, media_type=tipo,
        headers={"Content-Disposition": disposicao_de_arquivo(arquivo, baixar=True), "Cache-Control": "no-store"},
    )
