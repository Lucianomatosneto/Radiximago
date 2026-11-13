"""
USUARIOS DESCARTAVEIS PARA OS TESTES NO NAVEGADOR (Playwright) - 13/11/2026.

Cria, SO num banco de teste (ENVIRONMENT=test), uma conta por perfil e duas
fichas aprovadas minimas (so texto e metadados, sem imagem real) para o
robo do Playwright usar as telas com login:

- administrador: login em duas etapas JA cadastrado (segredo TOTP sorteado
  agora), Termos de Uso da versao atual ja aceitos;
- curador: idem (o perfil tambem exige as duas etapas);
- estudante: SEM aceite dos Termos (o teste confere que o aceite aparece).

Senhas e segredos sao sorteados a cada execucao, com gerador criptografico,
e NUNCA vao para arquivo versionado nem para o log:
- com --saida-env ARQUIVO (no GitHub: $GITHUB_ENV), as variaveis
  E2E_<PERFIL>_EMAIL / _SENHA / _TOTP sao acrescentadas a esse arquivo;
- na saida padrao so aparecem os comandos "::add-mask::", que fazem o
  GitHub esconder esses valores em qualquer log seguinte.

Uso (pasta backend, com o mesmo .env/variaveis da API de teste):
    ENVIRONMENT=test python -m scripts.semear_usuarios_teste --saida-env "$GITHUB_ENV"

Recusa rodar em qualquer outro ambiente (development, production...):
este script cria contas com senha conhecida por quem o executa.
"""

from __future__ import annotations

import argparse
import secrets
import sys
from datetime import datetime, timezone

import pyotp
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import gerar_hash_senha
from app.modules import mfa
from app.modules.curations import Curation, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.termos_uso import TERMOS_VERSAO, AceiteTermosUso, resumo_do_perfil
from app.modules.users import User, UserRole

DOMINIO = "e2e.radix.test"  # dominio reservado para testes (RFC 2606): nunca entrega e-mail
MARCA_FICHAS = "[e2e]"
PERFIS = {
    "ADMIN": (UserRole.administrador, True, True),  # (perfil, com 2 etapas, termos ja aceitos)
    "CURADOR": (UserRole.curador, True, True),
    "ESTUDANTE": (UserRole.estudante, False, False),
}


class AmbienteNaoPermitido(RuntimeError):
    pass


def conferir_ambiente(ambiente: str | None = None) -> None:
    ambiente = settings.ENVIRONMENT if ambiente is None else ambiente
    if ambiente != "test":
        raise AmbienteNaoPermitido(
            f"Recusado: ENVIRONMENT={ambiente!r}. Este script so roda com ENVIRONMENT=test "
            "(banco descartavel dos testes)."
        )


def _senha() -> str:
    return secrets.token_urlsafe(18)  # 24 caracteres, ~144 bits


def _usuario(db: Session, chave: str, perfil: UserRole, com_mfa: bool, termos: bool) -> dict:
    email = f"{chave.lower()}@{DOMINIO}"
    senha = _senha()
    usuario = db.query(User).filter(User.email == email).first()
    if usuario is None:
        usuario = User(email=email, nome=f"Teste {chave.title()} E2E", perfil=perfil, instituicao="Teste automatizado")
        db.add(usuario)
    usuario.senha_hash = gerar_hash_senha(senha)
    usuario.perfil = perfil
    usuario.ativo = True
    usuario.bloqueado = False
    usuario.excluido = False
    segredo = None
    if com_mfa:
        segredo = pyotp.random_base32()
        usuario.totp_segredo_cifrado = mfa.cifrar(segredo)
        usuario.totp_ativo = True
        usuario.totp_ultimo_passo = None
    db.flush()
    if termos:
        ja = db.query(AceiteTermosUso).filter(
            AceiteTermosUso.usuario_id == usuario.id, AceiteTermosUso.versao == TERMOS_VERSAO
        ).first()
        if ja is None:
            db.add(AceiteTermosUso(
                usuario_id=usuario.id, versao=TERMOS_VERSAO, perfil=perfil.value,
                resumo_textos=resumo_do_perfil(perfil.value), aceito_em=datetime.now(timezone.utc),
            ))
    else:
        # conta que deve VER o aceite: rodar o script de novo volta ao "nunca aceitou"
        db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == usuario.id).delete()
    return {"usuario": usuario, "email": email, "senha": senha, "totp": segredo}


def _fichas(db: Session, curador: User) -> list[Curation]:
    """Duas fichas aprovadas minimas (sem imagem real: a referencia ao Orthanc e ficticia)."""
    dados = [
        ("e2e-sintetica-1", "periapical", [36], "lesao_periapical", "Lesão periapical no dente 36 (ficha de teste automatizado)."),
        ("e2e-sintetica-2", "interproximal", [16, 17], "carie", "Cárie na face distal do dente 16 (ficha de teste automatizado)."),
    ]
    fichas = []
    for orthanc_id, tipo, dentes, achado, descricao in dados:
        ref = db.query(OrthancReference).filter(OrthancReference.orthanc_id == orthanc_id).first()
        if ref is None:
            ref = OrthancReference(orthanc_id=orthanc_id, resource_type="instance", ativo=True, anonimizacao_status="concluida")
            db.add(ref)
            db.flush()
        ficha = db.query(Curation).filter(Curation.orthanc_reference_id == ref.id).first()
        if ficha is None:
            ficha = Curation(orthanc_reference_id=ref.id, marcacoes=[])
            db.add(ficha)
        ficha.tipo_radiografia = tipo
        ficha.dentes = dentes
        ficha.genero = "feminino"
        ficha.qualidade_tecnica = "boa"
        ficha.achado_principal = achado
        ficha.descricao_didatica = f"{MARCA_FICHAS} {descricao}"
        ficha.anonimizacao_validada = True
        ficha.status = StatusCuradoria.APROVADA.value
        ficha.curador_id = curador.id
        fichas.append(ficha)
    return fichas


def semear(db: Session) -> dict[str, dict]:
    conferir_ambiente()
    contas = {chave: _usuario(db, chave, *conf) for chave, conf in PERFIS.items()}
    _fichas(db, contas["CURADOR"]["usuario"])
    db.commit()
    return contas


def variaveis(contas: dict[str, dict]) -> dict[str, str]:
    saida = {}
    for chave, c in contas.items():
        saida[f"E2E_{chave}_EMAIL"] = c["email"]
        saida[f"E2E_{chave}_SENHA"] = c["senha"]
        if c["totp"]:
            saida[f"E2E_{chave}_TOTP"] = c["totp"]
    return saida


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cria usuarios descartaveis para os testes no navegador.")
    parser.add_argument("--saida-env", required=True, help="arquivo onde acrescentar CHAVE=valor (no GitHub: $GITHUB_ENV)")
    args = parser.parse_args(argv)
    try:
        conferir_ambiente()
    except AmbienteNaoPermitido as erro:
        print(erro, file=sys.stderr)
        return 2
    db = SessionLocal()
    try:
        vars_ = variaveis(semear(db))
    finally:
        db.close()
    for nome, valor in vars_.items():
        if not nome.endswith("_EMAIL"):
            print(f"::add-mask::{valor}")
    with open(args.saida_env, "a", encoding="utf-8") as arquivo:
        for nome, valor in vars_.items():
            arquivo.write(f"{nome}={valor}\n")
    print(f"Usuarios de teste prontos: {', '.join(PERFIS)} (credenciais em {args.saida_env}, nao no log).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
