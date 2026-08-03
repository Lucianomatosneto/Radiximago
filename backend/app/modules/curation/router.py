"""Instancia unica do APIRouter compartilhada por todos os submodulos de
curadoria - existe num arquivo proprio (em vez de em __init__.py) so pra
evitar import circular entre os submodulos e o pacote."""

from fastapi import APIRouter

router = APIRouter(prefix="/curation", tags=["Curadoria"])
