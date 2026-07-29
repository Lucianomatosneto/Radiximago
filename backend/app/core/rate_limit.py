"""
Limiter compartilhado (slowapi) - protecao contra forca bruta em
endpoints publicos sensiveis (login, redefinicao de senha).

Fica em modulo proprio (em vez de dentro de main.py ou auth.py) pra
evitar import circular: main.py precisa registrar o limiter na app, e
os routers precisam do mesmo limiter pra decorar suas rotas.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
