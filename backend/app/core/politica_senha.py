"""
Politica de senha do Radix (docs/SEGURANCA.md, secao "Senhas").

Um unico lugar decide se uma senha NOVA pode ser usada - cadastro, troca,
redefinicao e criacao de conta pelo administrador chamam a mesma funcao,
para nao haver regra diferente em cada tela (DRY).

- Minimo 8 caracteres (OWASP ASVS 6.2.1).
- Maximo 128 caracteres (ASVS 6.2.9 pede que caibam ao menos 64). Desde a
  troca para Argon2 (app/core/security.py) a senha inteira e considerada,
  com qualquer acento ou simbolo; antes, com bcrypt, so os primeiros 72
  bytes contavam e o limite era 64 caracteres/72 bytes.
- Recusa as senhas mais comuns (senhas_comuns.txt, ASVS 6.2.4), as que ja
  VAZARAM na internet (senhas_vazadas.txt: 100 mil mais frequentes na base
  Have I Been Pwned, segundo o NCSC - ASVS 6.2.12; checagem local, nada sai
  do servidor) e palavras do contexto (ASVS 6.2.11). Sem regra de
  "maiuscula + numero + simbolo" (ASVS 6.2.5 recomenda nao exigir).
- So vale para senhas novas: senhas ja cadastradas continuam funcionando.
"""

from functools import lru_cache
from pathlib import Path

SENHA_MIN_CARACTERES = 8
SENHA_MAX_CARACTERES = 128

_ARQUIVO_LISTA = Path(__file__).with_name("senhas_comuns.txt")
_ARQUIVO_VAZADAS = Path(__file__).with_name("senhas_vazadas.txt")


def _ler_lista(arquivo: Path) -> frozenset[str]:
    linhas = arquivo.read_text(encoding="utf-8").splitlines()
    return frozenset(l.strip().lower() for l in linhas if l.strip() and not l.startswith("#"))


@lru_cache(maxsize=1)
def _senhas_comuns() -> frozenset[str]:
    """Carrega a lista uma vez so (fica na memoria, ~12 mil senhas)."""
    return _ler_lista(_ARQUIVO_LISTA)


@lru_cache(maxsize=1)
def _senhas_vazadas() -> frozenset[str]:
    """Senhas vazadas (~46 mil com 8+ caracteres, ~3 MB na memoria), carregadas uma vez."""
    return _ler_lista(_ARQUIVO_VAZADAS)


def problema_na_senha(senha: str, email: str | None = None, nome: str | None = None) -> str | None:
    """Devolve a mensagem do problema (em portugues, para o usuario) ou None se a senha serve."""
    if len(senha) < SENHA_MIN_CARACTERES:
        return f"A senha deve ter ao menos {SENHA_MIN_CARACTERES} caracteres."
    if len(senha) > SENHA_MAX_CARACTERES:
        return f"A senha pode ter no máximo {SENHA_MAX_CARACTERES} caracteres."
    minuscula = senha.strip().lower()
    contexto = set()
    if email:
        contexto.add(email.strip().lower())
        contexto.add(email.split("@", 1)[0].strip().lower())
    if nome:
        contexto.add(nome.strip().lower())
        contexto.add(nome.replace(" ", "").strip().lower())
    if minuscula in _senhas_comuns() or minuscula in contexto:
        return "Essa senha é muito comum ou fácil de adivinhar. Escolha outra (dica: uma frase curta)."
    if minuscula in _senhas_vazadas():
        return "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra (dica: uma frase curta)."
    return None
