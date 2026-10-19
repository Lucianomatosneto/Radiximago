"""
Login em duas etapas (MFA - "autenticacao de multiplos fatores"), OWASP
ASVS 6.3.3 - decisao do responsavel em 19/10/2026 (grupo 6 do Nivel 2):

- OBRIGATORIO para quem tem poder no sistema: administrador, suporte e
  curadoria (PERFIS_MFA_OBRIGATORIO);
- OPCIONAL para os demais (estudante, professor, pesquisador), que podem
  ligar em "Meus acessos".

Como funciona (TOTP, RFC 6238 - o padrao do Google/Microsoft Authenticator):
1. no cadastro, o servidor sorteia um SEGREDO e mostra um QR code; o
   aplicativo do celular guarda o segredo;
2. a cada 30 s, celular e servidor calculam o mesmo codigo de 6 numeros a
   partir do segredo e do relogio - nada trafega entre eles;
3. no login, depois da senha certa, a pessoa digita o codigo do momento.

Protecoes:
- segredo guardado CIFRADO no banco (Fernet = AES-128 + HMAC-SHA256), com
  chave derivada da JWT_SECRET_KEY (HKDF, contexto proprio). Quem copiar so
  o banco nao consegue gerar codigos. Trocar a JWT_SECRET_KEY obriga todos
  a cadastrar o aplicativo de novo (documentado em docs/CRIPTOGRAFIA.md);
- cada codigo vale UMA vez (totp_ultimo_passo), com tolerancia de 30 s
  para relogio atrasado/adiantado;
- 8 codigos de RECUPERACAO de uso unico, guardados so como resumo
  (SHA-256), para quando o celular nao estiver a mao;
- o "vale" entre a senha e o codigo (desafio) dura 5 min, aceita no maximo
  5 tentativas e so pode ser usado uma vez.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import time

import pyotp
import segno
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.config import settings
from app.modules.users import User, UserRole

PERFIS_MFA_OBRIGATORIO = (UserRole.administrador, UserRole.suporte, UserRole.curador)
NOME_NO_APLICATIVO = "Radix Imago"
QUANTIDADE_CODIGOS_RECUPERACAO = 8
TENTATIVAS_POR_DESAFIO = 5
# letras e numeros sem os que se confundem (0/O, 1/I/L)
_ALFABETO_RECUPERACAO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


# --- quem precisa ------------------------------------------------------------

def _perfil(usuario: User) -> UserRole:
    return usuario.perfil if isinstance(usuario.perfil, UserRole) else UserRole(usuario.perfil)


def mfa_obrigatorio(usuario: User) -> bool:
    return _perfil(usuario) in PERFIS_MFA_OBRIGATORIO


def precisa_segundo_fator(usuario: User) -> bool:
    return mfa_obrigatorio(usuario) or bool(usuario.totp_ativo)


# --- segredo cifrado -----------------------------------------------------------

def _cofre() -> Fernet:
    chave = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"radix-imago/totp/v1").derive(
        settings.JWT_SECRET_KEY.encode("utf-8")
    )
    return Fernet(base64.urlsafe_b64encode(chave))


def cifrar(segredo: str) -> str:
    return _cofre().encrypt(segredo.encode("ascii")).decode("ascii")


def decifrar(cifrado: str | None) -> str | None:
    if not cifrado:
        return None
    try:
        return _cofre().decrypt(cifrado.encode("ascii")).decode("ascii")
    except InvalidToken:
        return None  # chave do servidor trocada: o cadastro precisa ser refeito


def iniciar_cadastro(usuario: User) -> dict:
    """Sorteia um segredo novo (ainda NAO ativo) e devolve o que a tela mostra."""
    segredo = pyotp.random_base32()  # 160 bits (RFC 4226 recomenda 160)
    usuario.totp_segredo_cifrado = cifrar(segredo)
    usuario.totp_ultimo_passo = None
    endereco = pyotp.TOTP(segredo).provisioning_uri(name=usuario.email, issuer_name=NOME_NO_APLICATIVO)
    qr = segno.make(endereco, error="m")
    return {
        "segredo": segredo,  # para digitar a mao, se a camera nao ler o QR
        "endereco": endereco,
        "qr_code": qr.svg_data_uri(scale=5, border=2, dark="#000", light="#fff"),
    }


# --- conferencia dos codigos -------------------------------------------------

def conferir_codigo(usuario: User, codigo: str) -> bool:
    """Codigo de 6 numeros do aplicativo: aceito uma vez so, com 30 s de tolerancia."""
    segredo = decifrar(usuario.totp_segredo_cifrado)
    codigo = (codigo or "").strip().replace(" ", "")
    if not segredo or not (len(codigo) == 6 and codigo.isdigit()):
        return False
    totp = pyotp.TOTP(segredo)
    passo_atual = int(time.time()) // totp.interval
    for passo in (passo_atual - 1, passo_atual, passo_atual + 1):
        if secrets.compare_digest(totp.at(passo * totp.interval), codigo):
            if usuario.totp_ultimo_passo is not None and passo <= usuario.totp_ultimo_passo:
                return False  # codigo ja usado (ou anterior a um ja usado)
            usuario.totp_ultimo_passo = passo
            return True
    return False


def _resumo(codigo: str) -> str:
    normalizado = codigo.strip().upper().replace("-", "").replace(" ", "")
    return hashlib.sha256(normalizado.encode("utf-8")).hexdigest()


def gerar_codigos_recuperacao(usuario: User) -> list[str]:
    """8 codigos novos (XXXX-XXXX, ~40 bits cada); os antigos deixam de valer."""
    codigos = [
        "".join(secrets.choice(_ALFABETO_RECUPERACAO) for _ in range(8))
        for _ in range(QUANTIDADE_CODIGOS_RECUPERACAO)
    ]
    usuario.codigos_recuperacao = [_resumo(c) for c in codigos]
    return [f"{c[:4]}-{c[4:]}" for c in codigos]


def usar_codigo_recuperacao(usuario: User, codigo: str) -> bool:
    resumo = _resumo(codigo or "")
    guardados = list(usuario.codigos_recuperacao or [])
    for i, item in enumerate(guardados):
        if secrets.compare_digest(item, resumo):
            del guardados[i]
            usuario.codigos_recuperacao = guardados  # lista nova: o banco grava a mudanca
            return True
    return False


def conferir_segundo_fator(usuario: User, codigo: str) -> tuple[bool, bool]:
    """(aceito, foi_codigo_de_recuperacao)."""
    if conferir_codigo(usuario, codigo):
        return True, False
    if usar_codigo_recuperacao(usuario, codigo):
        return True, True
    return False, False


def ativar(usuario: User) -> list[str]:
    usuario.totp_ativo = True
    return gerar_codigos_recuperacao(usuario)


def desligar(usuario: User) -> None:
    usuario.totp_ativo = False
    usuario.totp_segredo_cifrado = None
    usuario.totp_ultimo_passo = None
    usuario.codigos_recuperacao = None


# --- desafios (o "vale" entre a senha e o codigo) -----------------------------
# Guardados na memoria do processo: duram 5 min. Se o servidor reiniciar no
# meio, a pessoa so precisa digitar a senha de novo.

_trava = threading.Lock()
_desafios: dict[str, dict] = {}  # jti -> {"expira": t, "tentativas": n, "usado": bool}


def novo_identificador_desafio() -> str:
    identificador = secrets.token_urlsafe(16)
    agora = time.time()
    with _trava:
        for jti in [j for j, d in _desafios.items() if d["expira"] < agora]:
            del _desafios[jti]
        _desafios[identificador] = {"expira": agora + 300, "tentativas": 0, "usado": False}
    return identificador


def desafio_disponivel(identificador: str) -> bool:
    with _trava:
        dados = _desafios.get(identificador)
        return bool(dados) and not dados["usado"] and dados["tentativas"] < TENTATIVAS_POR_DESAFIO


def registrar_tentativa_errada(identificador: str) -> int:
    """Devolve quantas tentativas ainda restam neste desafio."""
    with _trava:
        dados = _desafios.get(identificador)
        if not dados:
            return 0
        dados["tentativas"] += 1
        return max(0, TENTATIVAS_POR_DESAFIO - dados["tentativas"])


def consumir_desafio(identificador: str) -> None:
    with _trava:
        if identificador in _desafios:
            _desafios[identificador]["usado"] = True
