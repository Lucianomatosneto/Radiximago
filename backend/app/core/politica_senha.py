"""
Politica de senha do Radix (docs/SEGURANCA.md, secao "Senhas").

Um unico lugar decide se uma senha NOVA pode ser usada - cadastro, troca,
redefinicao e criacao de conta pelo administrador chamam a mesma funcao,
para nao haver regra diferente em cada tela (DRY).

- Minimo 8 caracteres (OWASP ASVS 6.2.1).
- Maximo 64 caracteres e 72 bytes (ASVS 6.2.8): o bcrypt so le os primeiros
  72 bytes; acima disso o resto da senha seria ignorado sem aviso. Letras
  acentuadas ocupam 2 bytes e emojis 4, por isso o limite em bytes.
- Recusa as senhas mais comuns em vazamentos publicos e palavras do
  contexto (ASVS 6.2.4 / 6.2.11). Sem regra de "maiuscula + numero +
  simbolo" (ASVS 6.2.5 recomenda nao exigir).
- So vale para senhas novas: senhas ja cadastradas continuam funcionando.
"""

from functools import lru_cache
from pathlib import Path

SENHA_MIN_CARACTERES = 8
SENHA_MAX_CARACTERES = 64
SENHA_MAX_BYTES = 72  # limite do bcrypt

_ARQUIVO_LISTA = Path(__file__).with_name("senhas_comuns.txt")


@lru_cache(maxsize=1)
def _senhas_comuns() -> frozenset[str]:
    """Carrega a lista uma vez so (fica na memoria, ~12 mil senhas)."""
    linhas = _ARQUIVO_LISTA.read_text(encoding="utf-8").splitlines()
    return frozenset(l.strip().lower() for l in linhas if l.strip() and not l.startswith("#"))


def problema_na_senha(senha: str, email: str | None = None, nome: str | None = None) -> str | None:
    """Devolve a mensagem do problema (em portugues, para o usuario) ou None se a senha serve."""
    if len(senha) < SENHA_MIN_CARACTERES:
        return f"A senha deve ter ao menos {SENHA_MIN_CARACTERES} caracteres."
    if len(senha) > SENHA_MAX_CARACTERES or len(senha.encode("utf-8")) > SENHA_MAX_BYTES:
        return (
            f"A senha pode ter no máximo {SENHA_MAX_CARACTERES} caracteres "
            "(letras acentuadas e símbolos especiais ocupam mais espaço)."
        )
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
    return None
