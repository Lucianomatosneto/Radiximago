from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import get_db
from app.core.security import gerar_hash_senha
from app.modules.users import User, UserRole
from app.modules.auth import obter_usuario_atual

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

@router.post("/", response_model=UsuarioResposta)
def criar_usuario(
    dados: UsuarioCriar,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(obter_usuario_atual)
):
    if usuario_atual.perfil != UserRole.administrador:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
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
    db.commit()
    return {"mensagem": f"Usuário {'bloqueado' if usuario.bloqueado else 'desbloqueado'} com sucesso"}