"""
Rotas de "Anotacoes" - notas pessoais de estudo que qualquer usuario pode
criar numa imagem, com cor/tamanho/negrito/italico escolhidos por ele.

Autoatendimento (mesmo padrao de saved_images_router.py): sempre em cima
do proprio usuario logado, nunca mostra nem deixa mexer na anotacao de
outro usuario.

Endpoints:
- GET    /annotations/{curation_id}   -> lista as anotacoes do usuario logado numa imagem
- POST   /annotations/{curation_id}   -> cria uma anotacao nova
- PUT    /annotations/{annotation_id} -> edita uma anotacao (texto e/ou estilo/posicao)
- DELETE /annotations/{annotation_id} -> remove uma anotacao
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import obter_usuario_atual
from app.modules.users import User
from app.modules.curations import Curation
from app.modules.anotacoes import AnotacaoImagem

router = APIRouter(prefix="/annotations", tags=["Anotacoes"])


class AnotacaoCreate(BaseModel):
    texto: str = Field(min_length=1, max_length=2000)
    cor: str = Field(default="#facc15", max_length=20)
    tamanho_fonte: int = Field(default=14, ge=10, le=48)
    negrito: bool = False
    italico: bool = False
    pos_x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    pos_y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    # Ponto pra onde a seta aponta - so vem preenchido se o usuario clicou
    # E arrastou ao criar a nota. Se None, a nota nao tem seta.
    alvo_x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    alvo_y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    # Se True, a nota fica sempre visivel na imagem (nao so um marcador
    # pequeno que precisa ser clicado).
    fixada: bool = False


class AnotacaoUpdate(BaseModel):
    # Tudo opcional: o frontend sempre manda o objeto inteiro reenviado,
    # mas a API aceita atualizacao parcial tambem, sem quebrar se um dia
    # mudar isso.
    texto: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    cor: Optional[str] = Field(default=None, max_length=20)
    tamanho_fonte: Optional[int] = Field(default=None, ge=10, le=48)
    negrito: Optional[bool] = None
    italico: Optional[bool] = None
    pos_x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    pos_y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    alvo_x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    alvo_y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    fixada: Optional[bool] = None


def _serializar(anotacao: AnotacaoImagem) -> dict:
    return {
        "id": anotacao.id,
        "curation_id": anotacao.curation_id,
        "texto": anotacao.texto,
        "cor": anotacao.cor,
        "tamanho_fonte": anotacao.tamanho_fonte,
        "negrito": anotacao.negrito,
        "italico": anotacao.italico,
        "pos_x": anotacao.pos_x,
        "pos_y": anotacao.pos_y,
        "alvo_x": anotacao.alvo_x,
        "alvo_y": anotacao.alvo_y,
        "fixada": anotacao.fixada,
        "criado_em": anotacao.criado_em.isoformat() if anotacao.criado_em else None,
        "atualizado_em": anotacao.atualizado_em.isoformat() if anotacao.atualizado_em else None,
    }


@router.get("/{curation_id}")
def listar_anotacoes(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Lista as anotacoes do usuario logado numa imagem especifica."""
    anotacoes = (
        db.query(AnotacaoImagem)
        .filter(
            AnotacaoImagem.curation_id == curation_id,
            AnotacaoImagem.usuario_id == usuario.id,
        )
        .order_by(AnotacaoImagem.criado_em)
        .all()
    )
    return {"itens": [_serializar(a) for a in anotacoes]}


@router.post("/{curation_id}")
def criar_anotacao(
    curation_id: int,
    dados: AnotacaoCreate,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Cria uma anotacao nova (nota pessoal de estudo) numa imagem."""
    ficha = db.query(Curation).filter(Curation.id == curation_id).first()
    if not ficha:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")

    anotacao = AnotacaoImagem(
        curation_id=curation_id,
        usuario_id=usuario.id,
        texto=dados.texto.strip(),
        cor=dados.cor,
        tamanho_fonte=dados.tamanho_fonte,
        negrito=dados.negrito,
        italico=dados.italico,
        pos_x=dados.pos_x,
        pos_y=dados.pos_y,
        alvo_x=dados.alvo_x,
        alvo_y=dados.alvo_y,
        fixada=dados.fixada,
    )
    db.add(anotacao)
    db.commit()
    db.refresh(anotacao)
    return _serializar(anotacao)


@router.put("/{annotation_id}")
def editar_anotacao(
    annotation_id: int,
    dados: AnotacaoUpdate,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Edita uma anotacao - so o proprio autor pode editar a dele."""
    anotacao = (
        db.query(AnotacaoImagem)
        .filter(AnotacaoImagem.id == annotation_id, AnotacaoImagem.usuario_id == usuario.id)
        .first()
    )
    if not anotacao:
        raise HTTPException(status_code=404, detail="Anotação não encontrada.")

    if dados.texto is not None:
        anotacao.texto = dados.texto.strip()
    if dados.cor is not None:
        anotacao.cor = dados.cor
    if dados.tamanho_fonte is not None:
        anotacao.tamanho_fonte = dados.tamanho_fonte
    if dados.negrito is not None:
        anotacao.negrito = dados.negrito
    if dados.italico is not None:
        anotacao.italico = dados.italico
    if dados.pos_x is not None:
        anotacao.pos_x = dados.pos_x
    if dados.pos_y is not None:
        anotacao.pos_y = dados.pos_y
    # alvo_x/alvo_y sao sempre sobrescritos (mesmo com None), diferente dos
    # campos acima: o usuario pode querer REMOVER a seta (o "Remover seta"
    # do frontend manda null de proposito). Como o frontend sempre reenvia
    # o estado completo da nota a cada salvamento, isso e seguro.
    anotacao.alvo_x = dados.alvo_x
    anotacao.alvo_y = dados.alvo_y
    if dados.fixada is not None:
        anotacao.fixada = dados.fixada

    db.commit()
    db.refresh(anotacao)
    return _serializar(anotacao)


@router.delete("/{annotation_id}")
def remover_anotacao(
    annotation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Remove uma anotacao - so o proprio autor pode remover a dele."""
    anotacao = (
        db.query(AnotacaoImagem)
        .filter(AnotacaoImagem.id == annotation_id, AnotacaoImagem.usuario_id == usuario.id)
        .first()
    )
    if not anotacao:
        raise HTTPException(status_code=404, detail="Anotação não encontrada.")

    db.delete(anotacao)
    db.commit()
    return {"mensagem": "Anotação removida."}
