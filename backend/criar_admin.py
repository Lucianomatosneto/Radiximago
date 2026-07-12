"""
Script de criacao do primeiro administrador (seed/bootstrap).

Uso: rodar dentro do container radix-api.
Pede nome, e-mail e senha pelo terminal, cria um usuario
com perfil 'administrador' e senha criptografada (bcrypt).

As credenciais NAO ficam escritas no arquivo - sao digitadas na hora.
"""

import getpass

from app.core.database import SessionLocal
from app.core.security import gerar_hash_senha
from app.modules.users import User, UserRole


def criar_administrador():
    print("=" * 50)
    print("CRIACAO DO PRIMEIRO ADMINISTRADOR - Radix Imago")
    print("=" * 50)

    nome = input("Nome do administrador: ").strip()
    email = input("E-mail: ").strip().lower()
    senha = getpass.getpass("Senha (nao aparece ao digitar): ")
    senha2 = getpass.getpass("Repita a senha: ")

    if senha != senha2:
        print("\n[ERRO] As senhas nao coincidem. Nada foi criado.")
        return

    if len(senha) < 8:
        print("\n[ERRO] A senha deve ter ao menos 8 caracteres.")
        return

    db = SessionLocal()
    try:
        existente = db.query(User).filter(User.email == email).first()
        if existente:
            print(f"\n[AVISO] Ja existe um usuario com o e-mail {email}.")
            print("Nada foi criado.")
            return

        novo_admin = User(
            nome=nome,
            email=email,
            senha_hash=gerar_hash_senha(senha),
            perfil=UserRole.administrador,
            ativo=True,
            bloqueado=False,
        )
        db.add(novo_admin)
        db.commit()
        db.refresh(novo_admin)

        print("\n" + "=" * 50)
        print("[SUCESSO] Administrador criado!")
        print(f"  ID:     {novo_admin.id}")
        print(f"  Nome:   {novo_admin.nome}")
        print(f"  E-mail: {novo_admin.email}")
        print(f"  Perfil: {novo_admin.perfil.value}")
        print("=" * 50)
    except Exception as e:
        db.rollback()
        print(f"\n[ERRO] Falha ao criar administrador: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    criar_administrador()