"""
Rotas da SEGMENTACAO (pintura de estruturas) - ver segmentacoes.py.

  GET    /segmentacoes/ficha/{curation_id}  -> lista as pinturas da ficha
  POST   /segmentacoes/ficha/{curation_id}  -> nova estrutura (curador)
  PATCH  /segmentacoes/{id}                 -> muda nome/dente/cor/mascara (curador)
  DELETE /segmentacoes/{id}                 -> apaga a estrutura (curador)

Quem PINTA: so os perfis de curadoria, e so enquanto a ficha esta em
curadoria (mesma regra da edicao da ficha). Quem VE: curadoria sempre;
os demais so imagem APROVADA ou compartilhada com a propria pessoa (mesma
regra das imagens - visualizador_router.py). Toda gravacao fica na
auditoria (acoes segmentacao_criada / _alterada / _apagada).
"""

import re
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import PERFIS_CURADORIA, obter_usuario_atual
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.curation.common import STATUS_EDITAVEIS, _registrar_auditoria
from app.modules.curations import Curation, DENTES_PERMANENTES, StatusCuradoria
from app.modules.segmentacoes import (
    MAX_CARACTERES_MASCARA,
    MAX_SEGMENTACOES_POR_FICHA,
    MascaraInvalida,
    SegmentacaoCuradoria,
    mascara_para_exibir,
    pixels_pintados,
    sanitizar_mascara,
)
from app.modules.users import User

router = APIRouter(prefix="/segmentacoes", tags=["Segmentacao (pintura de estruturas)"])

COR_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
Nome = Annotated[str, Field(min_length=1, max_length=60)]
Mascara = Annotated[str, Field(min_length=1, max_length=MAX_CARACTERES_MASCARA)]
Cor = Annotated[str, Field(min_length=7, max_length=7)]


def _validar_cor(valor: Optional[str]) -> Optional[str]:
    if valor is not None and not COR_HEX.match(valor):
        raise ValueError("Cor inválida (use #RRGGBB).")
    return valor.lower() if valor else valor


def _validar_dente(valor: Optional[int]) -> Optional[int]:
    if valor is not None and valor not in DENTES_PERMANENTES:
        raise ValueError("Dente inválido (use a notação FDI, 11 a 48).")
    return valor


class SegmentacaoEntrada(BaseModel):
    nome: Nome
    dente: Optional[int] = None
    cor: Cor
    mascara: Mascara

    @field_validator("cor")
    @classmethod
    def _cor(cls, v):
        return _validar_cor(v)

    @field_validator("dente")
    @classmethod
    def _dente(cls, v):
        return _validar_dente(v)


class SegmentacaoAlteracao(BaseModel):
    nome: Optional[Nome] = None
    dente: Optional[int] = None
    sem_dente: bool = False  # tira o dente (dente=None sozinho significa "nao mudar")
    cor: Optional[Cor] = None
    mascara: Optional[Mascara] = None

    @field_validator("cor")
    @classmethod
    def _cor(cls, v):
        return _validar_cor(v)

    @field_validator("dente")
    @classmethod
    def _dente(cls, v):
        return _validar_dente(v)


def _perfil(usuario: User) -> str:
    return usuario.perfil.value if hasattr(usuario.perfil, "value") else str(usuario.perfil)


def _eh_curadoria(usuario: User) -> bool:
    return _perfil(usuario) in {p.value for p in PERFIS_CURADORIA}


def _pode_ver(db: Session, usuario: User, ficha: Curation) -> bool:
    if _eh_curadoria(usuario) or ficha.status == StatusCuradoria.APROVADA.value:
        return True
    return (
        db.query(CompartilhamentoImagem.id)
        .filter(CompartilhamentoImagem.curation_id == ficha.id, CompartilhamentoImagem.destinatario_id == usuario.id)
        .first()
        is not None
    )


def _ficha(db: Session, curation_id: int) -> Curation:
    ficha = db.query(Curation).filter(Curation.id == curation_id).first()
    if not ficha:
        raise HTTPException(status_code=404, detail="Ficha não encontrada.")
    return ficha


def _exigir_pintor(usuario: User, ficha: Curation) -> None:
    if not _eh_curadoria(usuario):
        raise HTTPException(status_code=403, detail="Somente a curadoria pode pintar estruturas.")
    if ficha.status not in STATUS_EDITAVEIS:
        raise HTTPException(status_code=409, detail="A ficha já foi finalizada e não pode mais ser pintada.")


def _saida(s: SegmentacaoCuradoria) -> dict:
    return {
        "id": s.id,
        "curation_id": s.curation_id,
        "nome": s.nome,
        "dente": s.dente,
        "cor": s.cor,
        "largura": s.largura,
        "altura": s.altura,
        "mascara": mascara_para_exibir(s.mascara),
        "atualizado_em": s.atualizado_em.isoformat() if s.atualizado_em else None,
    }


def _sanitizar(texto: str) -> tuple[bytes, int, int]:
    try:
        return sanitizar_mascara(texto)
    except MascaraInvalida as erro:
        raise HTTPException(status_code=422, detail=str(erro))


@router.get("/ficha/{curation_id}")
def listar(curation_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    ficha = _ficha(db, curation_id)
    if not _pode_ver(db, usuario, ficha):
        # mesma resposta de "nao existe": nao revela fichas fora do alcance
        raise HTTPException(status_code=404, detail="Ficha não encontrada.")
    itens = (
        db.query(SegmentacaoCuradoria)
        .filter(SegmentacaoCuradoria.curation_id == ficha.id)
        .order_by(SegmentacaoCuradoria.id)
        .all()
    )
    return {"curation_id": ficha.id, "itens": [_saida(s) for s in itens]}


@router.post("/ficha/{curation_id}", status_code=201)
def criar(
    curation_id: int,
    dados: SegmentacaoEntrada,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    ficha = _ficha(db, curation_id)
    _exigir_pintor(usuario, ficha)
    total = db.query(SegmentacaoCuradoria).filter(SegmentacaoCuradoria.curation_id == ficha.id).count()
    if total >= MAX_SEGMENTACOES_POR_FICHA:
        raise HTTPException(status_code=422, detail=f"Limite de {MAX_SEGMENTACOES_POR_FICHA} estruturas por imagem.")
    png, largura, altura = _sanitizar(dados.mascara)
    nova = SegmentacaoCuradoria(
        curation_id=ficha.id, nome=dados.nome.strip(), dente=dados.dente, cor=dados.cor,
        mascara=png, largura=largura, altura=altura, criado_por_id=usuario.id,
    )
    db.add(nova)
    db.flush()
    _registrar_auditoria(
        db, usuario.id, "segmentacao_criada", ficha.id, "sucesso",
        f"Estrutura '{nova.nome}' (id {nova.id}{', dente ' + str(nova.dente) if nova.dente else ''}) criada; "
        f"{pixels_pintados(png)} pixels pintados em {largura}x{altura}.",
    )
    db.commit()
    db.refresh(nova)
    return _saida(nova)


def _segmentacao(db: Session, segmentacao_id: int) -> SegmentacaoCuradoria:
    s = db.query(SegmentacaoCuradoria).filter(SegmentacaoCuradoria.id == segmentacao_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Estrutura não encontrada.")
    return s


@router.patch("/{segmentacao_id}")
def alterar(
    segmentacao_id: int,
    dados: SegmentacaoAlteracao,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    s = _segmentacao(db, segmentacao_id)
    ficha = _ficha(db, s.curation_id)
    _exigir_pintor(usuario, ficha)
    mudou = []
    if dados.nome is not None and dados.nome.strip() != s.nome:
        s.nome = dados.nome.strip()
        mudou.append("nome")
    if dados.sem_dente and s.dente is not None:
        s.dente = None
        mudou.append("dente")
    elif dados.dente is not None and dados.dente != s.dente:
        s.dente = dados.dente
        mudou.append("dente")
    if dados.cor is not None and dados.cor != s.cor:
        s.cor = dados.cor
        mudou.append("cor")
    if dados.mascara is not None:
        png, largura, altura = _sanitizar(dados.mascara)
        s.mascara, s.largura, s.altura = png, largura, altura
        mudou.append(f"pintura ({pixels_pintados(png)} pixels)")
    if mudou:
        _registrar_auditoria(
            db, usuario.id, "segmentacao_alterada", ficha.id, "sucesso",
            f"Estrutura '{s.nome}' (id {s.id}) alterada: {', '.join(mudou)}.",
        )
        db.commit()
        db.refresh(s)
    return _saida(s)


@router.delete("/{segmentacao_id}")
def apagar(segmentacao_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    s = _segmentacao(db, segmentacao_id)
    ficha = _ficha(db, s.curation_id)
    _exigir_pintor(usuario, ficha)
    _registrar_auditoria(
        db, usuario.id, "segmentacao_apagada", ficha.id, "sucesso", f"Estrutura '{s.nome}' (id {s.id}) apagada.",
    )
    db.delete(s)
    db.commit()
    return {"mensagem": "Estrutura apagada."}
