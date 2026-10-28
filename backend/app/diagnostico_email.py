"""
DIAGNOSTICO DO E-MAIL (cadastro e "esqueci a senha") - um comando so.

Uso (PowerShell, na pasta do projeto):
    docker compose exec radix-api python -m app.diagnostico_email
    docker compose exec radix-api python -m app.diagnostico_email seu@email.com   (tambem envia um e-mail de teste)

Mostra, passo a passo, onde o envio para:
  1. configuracao lida pelo sistema (sem mostrar a senha: so o tamanho);
  2. o computador acha o servidor (DNS);
  3. abre a conexao (porta) e liga a criptografia;
  4. login com o usuario e a senha de app;
  5. (opcional) envia um e-mail de teste;
  6. ultimas falhas de envio registradas na auditoria.
Nao grava nada no banco e nunca imprime a senha.
"""

import socket
import sys
import time

from app.core.config import settings
from app.core.email import abrir_conexao_smtp, enviar_email, senha_smtp


def ok(texto: str) -> None:
    print(f"  [OK]   {texto}")


def falha(texto: str, dica: str = "") -> None:
    print(f"  [ERRO] {texto}")
    if dica:
        print(f"         O que fazer: {dica}")


def principal() -> int:
    print("\n=== DIAGNOSTICO DO E-MAIL - Radix Imago ===\n")

    print("1) Configuracao que o sistema esta usando (arquivo .env):")
    senha = senha_smtp()
    usuario = settings.SMTP_USER or ""
    print(f"     SMTP_HOST     = {settings.SMTP_HOST or '(vazio)'}")
    print(f"     SMTP_PORT     = {settings.SMTP_PORT}")
    print(f"     SMTP_USE_TLS  = {settings.SMTP_USE_TLS}")
    print(f"     SMTP_USER     = {'***@' + usuario.split('@')[-1] if '@' in usuario else ('(vazio)' if not usuario else '*** (sem @)')}")
    print(f"     SMTP_PASSWORD = {len(senha)} caracteres (sem os espacos)")
    print(f"     SMTP_FROM     = {settings.SMTP_FROM}")
    print(f"     FRONTEND_URL  = {settings.FRONTEND_URL}   (endereco que vai no link do e-mail)")
    if not settings.SMTP_HOST:
        falha("SMTP_HOST vazio: o sistema NAO envia e-mail nenhum.", "preencha SMTP_HOST no .env e rode: docker compose up -d radix-api")
        return 1
    if "gmail" in settings.SMTP_HOST and len(senha) != 16:
        falha(
            f"no Gmail a senha de app tem 16 letras; a configurada tem {len(senha)}.",
            "crie uma 'Senha de app' em myaccount.google.com > Seguranca e cole no SMTP_PASSWORD.",
        )
    if "gmail" in settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_USER.lower() not in settings.SMTP_FROM.lower():
        falha("SMTP_FROM com endereco diferente do SMTP_USER: o Gmail pode recusar.", "use o mesmo e-mail nos dois.")

    print("\n2) O servidor e encontrado na internet (DNS)?")
    try:
        endereco = socket.gethostbyname(settings.SMTP_HOST)
        ok(f"{settings.SMTP_HOST} -> {endereco}")
    except OSError as e:
        falha(f"nao achou {settings.SMTP_HOST} ({e}).", "confira o nome em SMTP_HOST e a internet do computador.")
        return 1

    print("\n3) Conexao e criptografia:")
    inicio = time.time()
    try:
        servidor = abrir_conexao_smtp(timeout=15)
        ok(f"conectou na porta {settings.SMTP_PORT} em {time.time() - inicio:.1f} s")
    except Exception as e:  # noqa: BLE001 - diagnostico: mostrar qualquer falha
        falha(
            f"{type(e).__name__}: {e}",
            "a porta pode estar bloqueada (antivirus/firewall/rede da instituicao). Teste SMTP_PORT=465 ou 587 no .env.",
        )
        return 1

    print("\n4) Login com usuario e senha de app:")
    try:
        with servidor:
            if settings.SMTP_USER:
                servidor.login(settings.SMTP_USER, senha)
            ok("login aceito pelo servidor")
    except Exception as e:  # noqa: BLE001
        texto = str(e).replace(usuario, "***") if usuario else str(e)
        falha(
            f"{type(e).__name__}: {texto[:200]}",
            "se aparecer 535/534: a senha de app esta errada ou foi apagada - gere outra no Google. "
            "Se a conexao 'fechou inesperadamente': antivirus/firewall interrompendo; teste a outra porta (465/587).",
        )
        return 1

    if len(sys.argv) > 1:
        destino = sys.argv[1].strip()
        print(f"\n5) Enviando e-mail de teste para {destino} ...")
        try:
            enviar_email(destino, "Teste de e-mail - Radix Imago", "<p>Teste do diagnostico de e-mail do Rádix Imago. Se chegou, o envio funciona.</p>")
            ok("o servidor aceitou o e-mail. Confira a caixa de entrada E a pasta Spam/Lixo eletronico.")
        except Exception as e:  # noqa: BLE001
            falha(f"{type(e).__name__}: {str(e)[:200]}")
            return 1
    else:
        print("\n5) (para enviar um e-mail de teste, rode de novo com o seu e-mail no fim do comando)")

    print("\n6) Ultimas falhas de envio registradas na auditoria:")
    try:
        from app.core.database import SessionLocal
        from app.modules.audit_logs import AuditLog

        with SessionLocal() as db:
            linhas = (
                db.query(AuditLog)
                .filter(AuditLog.acao == "falha_envio_email")
                .order_by(AuditLog.id.desc())
                .limit(5)
                .all()
            )
            if not linhas:
                ok("nenhuma falha registrada")
            for a in linhas:
                quando = getattr(a, "criado_em", None) or getattr(a, "data_hora", None) or ""
                print(f"     - {quando}  {(a.detalhes or '')[:150]}")
    except Exception as e:  # noqa: BLE001
        print(f"     (nao foi possivel ler a auditoria: {type(e).__name__})")

    print("\nTudo certo ate aqui: o envio funciona. Se a pessoa nao recebe, confira Spam e se o e-mail digitado tem conta ativa")
    print("(no 'esqueci a senha', e-mail sem conta NAO recebe nada - de proposito, por seguranca).\n")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
