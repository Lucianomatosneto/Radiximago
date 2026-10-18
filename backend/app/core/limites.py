"""
Limites de tamanho dos dados recebidos pela API (OWASP ASVS 2.2.1 - ver
docs/SEGURANCA.md, secao 2).

Um so lugar define quanto cabe em cada tipo de campo, para todas as rotas
usarem a mesma regra (DRY). Sem limite, alguem poderia enviar um texto de
centenas de megabytes e travar o servidor ou o banco; e nomes maiores que a
coluna do banco davam erro 500 em vez de uma mensagem clara (422).

Os valores cabem com folga no uso real: a descricao didatica mais longa
gerada por macro tem ate 4000 caracteres (macros_router.py), e a ficha
aceita o dobro para o curador completar.
"""

from typing import Annotated

from pydantic import EmailStr, Field

# --- textos ------------------------------------------------------------
NOME_MAX = 150          # = coluna users.nome / access_requests.nome
INSTITUICAO_MAX = 200   # = coluna users.instituicao
EMAIL_MAX = 150         # = coluna users.email
TEXTO_CURTO_MAX = 500
TEXTO_MEDIO_MAX = 2000
TEXTO_LONGO_MAX = 8000
SENHA_MAX = 256         # a politica de senha (politica_senha.py) e mais estrita; isto so barra abuso
CODIGO_MAX = 200        # codigos de link (redefinicao, confirmacao de e-mail)

Nome = Annotated[str, Field(min_length=1, max_length=NOME_MAX)]
Instituicao = Annotated[str, Field(max_length=INSTITUICAO_MAX)]
Email = Annotated[EmailStr, Field(max_length=EMAIL_MAX)]
TextoCurto = Annotated[str, Field(max_length=TEXTO_CURTO_MAX)]
TextoMedio = Annotated[str, Field(max_length=TEXTO_MEDIO_MAX)]
TextoLongo = Annotated[str, Field(max_length=TEXTO_LONGO_MAX)]
Senha = Annotated[str, Field(max_length=SENHA_MAX)]
Codigo = Annotated[str, Field(min_length=1, max_length=CODIGO_MAX)]

# --- listas (quantos itens cabem numa ficha) --------------------------
MAX_DENTES = 52          # 32 permanentes + 20 deciduos
MAX_MARCACOES = 200
MAX_ACHADOS = 100
MAX_TERMOS = 200
MAX_ERROS_TECNICOS = 50
MAX_ALTERACOES = 50
