"""
Redefine o LOGIN EM DUAS ETAPAS de uma conta, pelo servidor - para quando o
proprio ADMINISTRADOR perdeu o celular e os codigos de recuperacao (nao ha
outro administrador para fazer pela tela Usuarios).

Uso (na pasta do Radix, no computador/servidor que roda o sistema):
    docker compose exec radix-api python redefinir_segundo_fator.py

Quem roda este roteiro ja controla o servidor, entao nao abre brecha nova.
Fica registrado na auditoria. No proximo login, a pessoa cadastra o
aplicativo de novo.
"""

from app.core.database import SessionLocal
from app.modules import mfa
from app.modules.audit_logs import AuditLog
from app.modules.sessoes import encerrar_sessoes_do_usuario
from app.modules.users import User


def redefinir() -> None:
    print("=" * 50)
    print("REDEFINIR LOGIN EM DUAS ETAPAS - Radix Imago")
    print("=" * 50)
    email = input("E-mail da conta: ").strip().lower()
    db = SessionLocal()
    try:
        usuario = db.query(User).filter(User.email == email, User.excluido.is_(False)).first()
        if not usuario:
            print(f"\n[ERRO] Nenhuma conta com o e-mail {email}.")
            return
        if input(f"Confirma redefinir o segundo fator de {usuario.nome}? (s/n) ").strip().lower() != "s":
            print("Nada foi alterado.")
            return
        mfa.desligar(usuario)
        fechadas = encerrar_sessoes_do_usuario(db, usuario.id, "segundo_fator_redefinido")
        db.add(AuditLog(
            usuario_id=None, acao="segundo_fator_redefinido_pelo_servidor", entidade="user",
            entidade_id=usuario.id, resultado="sucesso",
            detalhes=f"Pelo roteiro redefinir_segundo_fator.py. Sessoes encerradas: {fechadas}.",
        ))
        db.commit()
        print("\n[SUCESSO] Segundo fator redefinido. No proximo login, cadastre o aplicativo de novo.")
    finally:
        db.close()


if __name__ == "__main__":
    redefinir()
