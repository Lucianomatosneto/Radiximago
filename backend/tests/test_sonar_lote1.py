"""SonarCloud, lote 1 (12/11/2026): trocas que NAO podem mudar resultado.

- S8786: a validacao de e-mail do compartilhamento deixou de usar uma
  regex lenta; aqui conferimos que a funcao nova responde IGUAL a regex
  antiga em casos fixos e em milhares de textos aleatorios, e que um texto
  enorme (o pior caso da regex antiga) e respondido na hora.
- S8396: campos opcionais da resposta de solicitacoes de acesso com valor
  padrao (None) continuam aceitando o mesmo conteudo.
"""

import random
import re
import time

from app.modules.compartilhamentos_router import email_valido
from app.modules.users_router import SolicitacaoAcessoResposta

_REGEX_ANTIGA = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _antiga(texto: str) -> bool:
    return bool(_REGEX_ANTIGA.match(texto))


# A rota faz email.strip() antes de validar; comparamos do mesmo jeito.
# (Sem o strip, a regex antiga aceitava "a@b.c\n" por causa do "$" do
# Python, que tambem casa antes de um "\n" final; a funcao nova recusa.)


def test_email_valido_igual_a_regex_antiga_casos_fixos():
    casos = [
        "", "a@b.c", "maria@ufsc.br", "a@b", "@b.c", "a@.c", "a@b.", "a@b..", "a@.b.c", "a.b@c.d",
        "a@@b.c", "a@b@c.d", "a b@c.d", "a@b .c", "a@b.c ", "a@b\tc.d", "ç@é.ü", "a@b.c.d.e",
        "x@y.z ", "a@b.c\n",
    ]
    for c in casos:
        assert email_valido(c.strip()) == _antiga(c.strip()), repr(c)
    assert email_valido("a@b.c\n") is False  # mais rigida que a regex antiga


def test_email_valido_igual_a_regex_antiga_aleatorio():
    sorteio = random.Random(20261112)
    letras = ["a", "b", "@", ".", " ", "\t", "\n", "x", "-", "ç"]
    for _ in range(20000):
        texto = "".join(sorteio.choice(letras) for _ in range(sorteio.randint(0, 10)))
        texto = texto.strip()
        assert email_valido(texto) == _antiga(texto), repr(texto)


def test_email_enorme_responde_rapido():
    inicio = time.perf_counter()
    assert email_valido("a@" + "." * 200_000 + "@") is False
    assert email_valido("a@b" + "." * 200_000) is True
    assert time.perf_counter() - inicio < 1


def test_solicitacao_resposta_aceita_sem_os_motivos():
    r = SolicitacaoAcessoResposta(
        id=1, nome="Pessoa", email="p@teste.example", instituicao="Teste",
        perfil_solicitado="estudante", status="pendente",
    )
    assert r.motivo is None and r.motivo_rejeicao is None
