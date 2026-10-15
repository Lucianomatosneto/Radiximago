from datetime import datetime, timedelta, timezone
from typing import Optional

# PyJWT (out/2026): substitui python-jose, que tinha falhas conhecidas
# (CVE-2024-33663/33664) e dependia do pacote "ecdsa" (falha sem correcao).
# O Radix so usa HS256 (chave simetrica do .env), suportado nativamente.
import jwt
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
    expiracao = datetime.now(timezone.utc) + timedelta(minutes=minutos)
    dados_token.update({"exp": expiracao})
    return jwt.encode(dados_token, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decodificar_token(token: str) -> Optional[dict]:
    """Assinatura e validade (exp) conferidas; so o algoritmo configurado e
    aceito (OWASP ASVS 9.1.1, 9.1.2, 9.2.1). Token invalido -> None."""
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
