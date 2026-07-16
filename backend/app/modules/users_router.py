from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import get_db
from app.core.security import gerar_hash_senha
from app.modules.users import User, UserRole
from app.modules.auth import obter_usuario_atual
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

@router.get("/", response_model=list[UsuarioResposta])
def listar_usuarios(
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(obter_usuario_atual)
):
    if usuario_atual.perfil != UserRole.administrador:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return db.query(User).all()

@router.get("/{user_id}", response_model=UsuarioResposta)
def obter_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(obter_usuario_atual)
):
    if usuario_atual.perfil != UserRole.administrador:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario

@router.post("/", response_model=UsuarioResposta)
def criar_usuario(
    dados: UsuarioCriar,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(obter_usuario_atual)
):
    if usuario_atual.perfil != UserRole.administrador:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
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
    db.commit()
    db.refresh(novo)
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="criacao_usuario", entidade="user", entidade_id=novo.id,
        resultado="sucesso", detalhes=f"Usuario {novo.email} criado com perfil {novo.perfil.value}.",
    ))
    db.commit()
    return novo

@router.patch("/{user_id}/block")
def bloquear_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(obter_usuario_atual)
):
    if usuario_atual.perfil != UserRole.administrador:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    usuario.bloqueado = not usuario.bloqueado
    estado = "bloqueado" if usuario.bloqueado else "desbloqueado"
    db.commit()
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="bloqueio_usuario", entidade="user", entidade_id=usuario.id,
        resultado="sucesso", detalhes=f"Usuario {usuario.email} foi {estado}.",
    ))
    db.commit()
    return {"mensagem": f"Usuário {estado} com sucesso"}