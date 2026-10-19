from datetime import datetime, timedelta, timezone
from typing import Optional

# PyJWT (out/2026): substitui python-jose, que tinha falhas conhecidas
# (CVE-2024-33663/33664) e dependia do pacote "ecdsa" (falha sem correcao).
# O Radix so usa HS256 (chave simetrica do .env), suportado nativamente.
import jwt
from passlib.context import CryptContext

from app.core.config import settings

# Agilidade criptografica (OWASP ASVS 11.2.2 - docs/CRIPTOGRAFIA.md): a lista
# de esquemas e o custo minimo ficam AQUI. Para trocar de algoritmo (ex.:
# Argon2), basta pô-lo na frente da lista; senhas antigas continuam
# entrando e sao regravadas no novo padrao no proximo login
# (senha_precisa_atualizar). O mesmo vale se o custo minimo subir.
BCRYPT_CUSTO = 12
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__default_rounds=BCRYPT_CUSTO,
    bcrypt__min_rounds=BCRYPT_CUSTO,
)


def verificar_senha(senha_plana: str, senha_hash: str) -> bool:
    return pwd_context.verify(senha_plana, senha_hash)


def senha_precisa_atualizar(senha_hash: str) -> bool:
    """True se o resumo da senha usa algoritmo ou custo antigos (regravar no login)."""
    return pwd_context.needs_update(senha_hash)


def gerar_hash_senha(senha: str) -> str:
    return pwd_context.hash(senha)


# Quem emite, para quem e para que serve o token (OWASP ASVS 9.2.2 e 9.2.3):
# um token so vale se foi emitido PELO Radix, PARA a API do Radix e for do
# TIPO "sessao". Um token assinado com a mesma chave para outra finalidade
# (ou de outro sistema que compartilhe a chave) e recusado.
EMISSOR_TOKEN = "radix-imago"
PUBLICO_TOKEN = "radix-imago-api"
TIPO_TOKEN_SESSAO = "sessao"


def criar_token_acesso(dados: dict, expira_em: Optional[int] = None) -> str:
    dados_token = dados.copy()
    minutos = expira_em or settings.JWT_EXPIRE_MINUTES
    expiracao = datetime.now(timezone.utc) + timedelta(minutes=minutos)
    dados_token.update({"exp": expiracao, "iss": EMISSOR_TOKEN, "aud": PUBLICO_TOKEN, "tipo": TIPO_TOKEN_SESSAO})
    return jwt.encode(dados_token, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decodificar_token(token: str) -> Optional[dict]:
    """Assinatura, validade (exp), emissor (iss), publico (aud) e tipo
    conferidos; so o algoritmo configurado e aceito (OWASP ASVS 9.1.1,
    9.1.2, 9.2.1, 9.2.2, 9.2.3). Token invalido -> None."""
    try:
        dados = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM],
            audience=PUBLICO_TOKEN, issuer=EMISSOR_TOKEN,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError:
        return None
    return dados if dados.get("tipo") == TIPO_TOKEN_SESSAO else None
