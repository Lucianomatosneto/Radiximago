from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verificar_senha, criar_token_acesso, decodificar_token
from app.modules.users import User
from app.modules.audit_logs import AuditLog

router = APIRouter(prefix="/auth", tags=["Autenticação"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

class TokenResposta(BaseModel):
    access_token: str
    token_type: str
    perfil: str
    nome: str

@router.post("/login", response_model=TokenResposta)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    usuario = db.query(User).filter(User.email == form_data.username).first()
    if not usuario:
        db.add(AuditLog(
            usuario_id=None, acao="falha_login", entidade="user", resultado="negado",
            detalhes=f"Tentativa de login com e-mail nao cadastrado: {form_data.username}",
        ))
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if not verificar_senha(form_data.password, usuario.senha_hash):
        db.add(AuditLog(
            usuario_id=usuario.id, acao="falha_login", entidade="user", entidade_id=usuario.id,
            resultado="negado", detalhes="Senha incorreta.",
        ))
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if usuario.bloqueado:
        db.add(AuditLog(
            usuario_id=usuario.id, acao="falha_login", entidade="user", entidade_id=usuario.id,
            resultado="negado", detalhes="Usuario bloqueado.",
        ))
        db.commit()
        raise HTTPException(status_code=403, detail="Usuário bloqueado")
    if not usuario.ativo:
        db.add(AuditLog(
            usuario_id=usuario.id, acao="falha_login", entidade="user", entidade_id=usuario.id,
            resultado="negado", detalhes="Usuario inativo.",
        ))
        db.commit()
        raise HTTPException(status_code=403, detail="Usuário inativo")
    token = criar_token_acesso({"sub": str(usuario.id), "perfil": usuario.perfil})
    db.add(AuditLog(
        usuario_id=usuario.id, acao="login", entidade="user", entidade_id=usuario.id,
        resultado="sucesso",
    ))
    db.commit()
    return {"access_token": token, "token_type": "bearer", "perfil": usuario.perfil, "nome": usuario.nome}

def obter_usuario_atual(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decodificar_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    usuario = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not usuario or usuario.bloqueado or not usuario.ativo:
        raise HTTPException(status_code=401, detail="Acesso negado")
    return usuario

@router.get("/me")
def meu_perfil(usuario: User = Depends(obter_usuario_atual)):
    return {"id": usuario.id, "nome": usuario.nome, "email": usuario.email, "perfil": usuario.perfil}