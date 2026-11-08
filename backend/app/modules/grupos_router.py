"""
GRUPOS DE ENVIO (etapa C, 08/11/2026) - professor e curador montam os
proprios grupos para enviar imagens a varias pessoas de uma vez.

- GET    /grupos                lista os MEUS grupos (com os membros)
- POST   /grupos                cria {nome, membros_ids}
- PUT    /grupos/{id}           renomeia e troca os membros
- DELETE /grupos/{id}           apaga o grupo (as imagens ja enviadas ficam)
- GET    /grupos/pessoas?busca= procura pessoas para colocar no grupo

Regras: so o dono ve e mexe no grupo; o e-mail das pessoas sai mascarado
(o nome e o perfil bastam para escolher); pessoas excluidas, bloqueadas ou
inativas nao entram. Tudo fica na auditoria.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.audit_logs import AuditLog
from app.modules.auth import exigir_perfis
from app.modules.grupos import MEMBROS_MAX, NOME_GRUPO_MAX, GrupoEnvio, GrupoEnvioMembro
from app.modules.prancha_router import _mascarar
from app.modules.users import User, UserRole

router = APIRouter(prefix="/grupos", tags=["Grupos de envio"])

PERFIS_GRUPOS = (UserRole.professor, UserRole.curador, UserRole.administrador)


def _perfil(u: User) -> str:
    return u.perfil.value if hasattr(u.perfil, "value") else str(u.perfil)


def _pessoa(u: User) -> dict:
    return {"id": u.id, "nome": u.nome, "perfil": _perfil(u), "email": _mascarar(u.email)}


def pessoas_validas(db: Session, ids: list[int]) -> list[User]:
    """Usuarios ativos entre os ids pedidos (os demais sao ignorados)."""
    if not ids:
        return []
    return (db.query(User)
            .filter(User.id.in_(set(ids)), User.ativo.is_(True), User.excluido.is_(False), User.bloqueado.isnot(True))
            .all())


def membros_dos_grupos(db: Session, dono_id: int, grupos_ids: list[int]) -> set[int]:
    """Ids dos membros dos grupos pedidos - SO grupos do proprio dono."""
    if not grupos_ids:
        return set()
    return {
        uid for (uid,) in db.query(GrupoEnvioMembro.usuario_id)
        .join(GrupoEnvio, GrupoEnvio.id == GrupoEnvioMembro.grupo_id)
        .filter(GrupoEnvio.dono_id == dono_id, GrupoEnvio.id.in_(set(grupos_ids)))
    }


def _grupo_do_dono(db: Session, grupo_id: int, usuario: User) -> GrupoEnvio:
    grupo = db.get(GrupoEnvio, grupo_id)
    if not grupo or grupo.dono_id != usuario.id:
        raise HTTPException(status_code=404, detail="Grupo nao encontrado.")
    return grupo


def _saida(db: Session, grupo: GrupoEnvio) -> dict:
    membros = (db.query(User).join(GrupoEnvioMembro, GrupoEnvioMembro.usuario_id == User.id)
               .filter(GrupoEnvioMembro.grupo_id == grupo.id).order_by(User.nome).all())
    return {"id": grupo.id, "nome": grupo.nome, "membros": [_pessoa(u) for u in membros]}


class GrupoEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=NOME_GRUPO_MAX)
    membros_ids: list[int] = Field(default_factory=list, max_length=MEMBROS_MAX)


def _gravar_membros(db: Session, grupo: GrupoEnvio, ids: list[int], dono: User) -> int:
    db.query(GrupoEnvioMembro).filter(GrupoEnvioMembro.grupo_id == grupo.id).delete()
    validos = [u for u in pessoas_validas(db, ids) if u.id != dono.id]
    for u in validos:
        db.add(GrupoEnvioMembro(grupo_id=grupo.id, usuario_id=u.id))
    return len(validos)


def _auditar(db: Session, usuario: User, acao: str, grupo: GrupoEnvio, detalhes: str) -> None:
    db.add(AuditLog(usuario_id=usuario.id, acao=acao, entidade="grupo_envio",
                    entidade_id=grupo.id, resultado="sucesso", detalhes=detalhes))


@router.get("")
def meus_grupos(usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)), db: Session = Depends(get_db)):
    grupos = db.query(GrupoEnvio).filter(GrupoEnvio.dono_id == usuario.id).order_by(GrupoEnvio.nome).all()
    return {"grupos": [_saida(db, g) for g in grupos]}


@router.get("/pessoas")
def procurar_pessoas(busca: str = Query("", max_length=80),
                     usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)), db: Session = Depends(get_db)):
    termo = busca.strip().lower()
    consulta = db.query(User).filter(User.ativo.is_(True), User.excluido.is_(False),
                                     User.bloqueado.isnot(True), User.id != usuario.id)
    if termo:
        consulta = consulta.filter(or_(func.lower(User.nome).contains(termo), func.lower(User.email).contains(termo)))
    return {"pessoas": [_pessoa(u) for u in consulta.order_by(User.nome).limit(50).all()]}


@router.post("")
def criar_grupo(entrada: GrupoEntrada, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                db: Session = Depends(get_db)):
    grupo = GrupoEnvio(dono_id=usuario.id, nome=entrada.nome.strip())
    db.add(grupo)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Voce ja tem um grupo com esse nome.")
    n = _gravar_membros(db, grupo, entrada.membros_ids, usuario)
    _auditar(db, usuario, "grupo_envio_criado", grupo, f"{n} membro(s)")
    db.commit()
    return _saida(db, grupo)


@router.put("/{grupo_id}")
def editar_grupo(grupo_id: int, entrada: GrupoEntrada, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                 db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    grupo.nome = entrada.nome.strip()
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Voce ja tem um grupo com esse nome.")
    n = _gravar_membros(db, grupo, entrada.membros_ids, usuario)
    _auditar(db, usuario, "grupo_envio_editado", grupo, f"{n} membro(s)")
    db.commit()
    return _saida(db, grupo)


@router.delete("/{grupo_id}")
def apagar_grupo(grupo_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                 db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    _auditar(db, usuario, "grupo_envio_apagado", grupo, "grupo apagado (envios ja feitos continuam)")
    db.delete(grupo)
    db.commit()
    return {"mensagem": "Grupo apagado."}
