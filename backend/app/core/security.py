from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verificar_senha(senha_plana: str, senha_hash: str) -> bool:
    return pwd_context.verify(senha_plana, senha_hash)

def gerar_hash_senha(senha: str) -> str:
    return pwd_context.hash(senha)

def criar_token_acesso(dados: dict, expira_em: Optional[int] = None) -> str:
    dados_token = dados.copy()
    minutos = expira_em or settings.JWT_EXPIRE_MINUTES
    expiracao = datetime.utcnow() + timedelta(minutes=minutos)
    dados_token.update({"exp": expiracao})
    token = jwt.encode(dados_token, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token

def decodificar_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None