"""
Script para trocar a senha de um usuario existente.
A nova senha e digitada de forma oculta e criptografada (bcrypt).
"""

import getpass

from app.core.database import SessionLocal
from app.core.security import gerar_hash_senha
from app.modules.users import User


def trocar_senha():
    print("=" * 50)
    print("TROCA DE SENHA - Radix Imago")
    print("=" * 50)

    email = input("E-mail do usuario: ").strip().lower()
    nova = getpass.getpass("Nova senha (nao aparece ao digitar): ")
    nova2 = getpass.getpass("Repita a nova senha: ")

    if nova != nova2:
        print("\n[ERRO] As senhas nao coincidem. Nada foi alterado.")
        return

    if len(nova) < 8:
        print("\n[ERRO] A senha deve ter ao menos 8 caracteres.")
        return

    db = SessionLocal()
    try:
        usuario = db.query(User).filter(User.email == email).first()
        if not usuario:
            print(f"\n[ERRO] Nenhum usuario com o e-mail {email}.")
            return

        usuario.senha_hash = gerar_hash_senha(nova)
        db.commit()

        print("\n[SUCESSO] Senha alterada para o usuario:", email)
    except Exception as e:
        db.rollback()
        print(f"\n[ERRO] Falha ao trocar senha: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    trocar_senha()