from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import get_db
from app.core.security import gerar_hash_senha
from app.modules.users import User, UserRole
from app.modules.auth import exigir_perfis
from app.modules.audit_logs import AuditLog

router = APIRouter(prefix="/users", tags=["Usuários"])

class UsuarioCriar(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    perfil: UserRole = UserRole.estudante
    instituicao: Optional[str] = None

class UsuarioResposta(BaseModel):
    id: int
    nome: str
    email: str
    perfil: str
    instituicao: Optional[str]
    ativo: bool
    bloqueado: bool

    class Config:
        from_attributes = True

class UsuarioAtualizar(BaseModel):
    nome: Optional[str] = None
    instituicao: Optional[str] = None

@router.get("/", response_model=list[UsuarioResposta])
def listar_usuarios(
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(UserRole.administrador))
):
    return db.query(User).all()

@router.get("/{user_id}", response_model=UsuarioResposta)
def obter_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(UserRole.administrador))
):
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario

@router.post("/", response_model=UsuarioResposta)
def criar_usuario(
    dados: UsuarioCriar,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(UserRole.administrador))
):
    if len(dados.senha) < 8:
        raise HTTPException(status_code=422, detail="A senha deve ter ao menos 8 caracteres.")
    existente = db.query(User).filter(User.email == dados.email).first()
    if existente:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    novo = User(
        nome=dados.nome,
        email=dados.email,
        senha_hash=gerar_hash_senha(dados.senha),
        perfil=dados.perfil,
        instituicao=dados.instituicao
    )
    db.add(novo)
    db.flush()
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="criacao_usuario", entidade="user", entidade_id=novo.id,
        resultado="sucesso", detalhes=f"Usuario {novo.email} criado com perfil {novo.perfil.value}.",
    ))
    db.commit()
    db.refresh(novo)
    return novo

@router.patch("/{user_id}/block")
def bloquear_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(UserRole.administrador))
):
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    usuario.bloqueado = not usuario.bloqueado
    estado = "bloqueado" if usuario.bloqueado else "desbloqueado"
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="bloqueio_usuario", entidade="user", entidade_id=usuario.id,
        resultado="sucesso", detalhes=f"Usuario {usuario.email} foi {estado}.",
    ))
    db.commit()
    return {"mensagem": f"Usuário {estado} com sucesso"}

@router.patch("/{user_id}", response_model=UsuarioResposta)
def atualizar_usuario(
    user_id: int,
    dados: UsuarioAtualizar,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(UserRole.administrador))
):
    """
    Atualiza nome e/ou instituicao de um usuario existente.
    NAO permite trocar o perfil por aqui - troca de perfil e sensivel demais
    para um PATCH simples e fica de fora deliberadamente (ver AUDITORIA_BACKEND.md).
    """
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if dados.nome is not None:
        usuario.nome = dados.nome
    if dados.instituicao is not None:
        usuario.instituicao = dados.instituicao

    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="edicao_usuario", entidade="user", entidade_id=usuario.id,
        resultado="sucesso", detalhes=f"Dados do usuario {usuario.email} atualizados (nome/instituicao).",
    ))
    db.commit()
    db.refresh(usuario)
    return usuario