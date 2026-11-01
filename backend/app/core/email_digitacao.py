"""
PROVAVEIS ERROS DE DIGITACAO NO E-MAIL (01/11/2026 - QA: "hotmai.com").

So AVISA ("voce quis dizer hotmail.com?"), nunca bloqueia: o dominio pode
existir de verdade. A mesma lista existe nas telas
(frontend/src/lib/emailDigitacao.ts) - o teste
tests/test_prancha_email_destino.py confere que as duas sao iguais.
"""

DOMINIOS_TROCADOS: dict[str, str] = {
    "hotmai.com": "hotmail.com",
    "hotmal.com": "hotmail.com",
    "hotmial.com": "hotmail.com",
    "hotmil.com": "hotmail.com",
    "hotamil.com": "hotmail.com",
    "hotmail.co": "hotmail.com",
    "hotmail.con": "hotmail.com",
    "hotmail.com.b": "hotmail.com.br",
    "gmial.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gamil.com": "gmail.com",
    "gnail.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "outlok.com": "outlook.com",
    "outllok.com": "outlook.com",
    "outlook.co": "outlook.com",
    "outlook.con": "outlook.com",
    "yaho.com": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "yahoo.com.b": "yahoo.com.br",
    "yaho.com.br": "yahoo.com.br",
    "ufsc.b": "ufsc.br",
    "ufcs.br": "ufsc.br",
}


def sugestao_de_email(email: str | None) -> str | None:
    """'gabi@hotmai.com' -> 'gabi@hotmail.com'; None quando nao ha suspeita."""
    if not email or "@" not in email:
        return None
    usuario, dominio = email.strip().rsplit("@", 1)
    certo = DOMINIOS_TROCADOS.get(dominio.lower())
    return f"{usuario}@{certo}" if certo else None
