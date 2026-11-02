"""
TROCA DA CHAVE que cifra as fotos das pastas de pacientes (02/11/2026).

Problema: as fotos sao cifradas com uma chave (CASOS_CHAVE; se ela estiver
vazia, usa-se a JWT_SECRET_KEY). Trocar a chave "no escuro" deixa TODAS as
fotos ilegiveis. Isto aqui faz a troca com seguranca: le cada foto com a chave
ANTIGA, regrava com a chave NOVA e confere antes de substituir.

Garantias:
- modo simulacao por padrao (nao altera nada);
- cada arquivo so e substituido depois de conferir que a copia nova abre e e
  igual ao original (troca atomica: ou fica o antigo, ou fica o novo);
- pode ser repetido: arquivos que ja estao na chave nova sao reconhecidos e
  pulados (se cair a luz no meio, basta rodar de novo);
- arquivo que nenhuma das duas chaves abre e contado como "ilegivel" e NAO e
  tocado (acao humana necessaria).
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.modules import casos_arquivos

_VERSAO = casos_arquivos._VERSAO


def _aes(segredo: str) -> AESGCM:
    return AESGCM(casos_arquivos._chave(segredo))


def _decifrar(aes: AESGCM, dados: bytes) -> bytes:
    if not dados.startswith(_VERSAO):
        raise InvalidTag()
    return aes.decrypt(dados[2:14], dados[14:], _VERSAO)


def _cifrar(aes: AESGCM, dados: bytes) -> bytes:
    nonce = secrets.token_bytes(12)
    return _VERSAO + nonce + aes.encrypt(nonce, dados, _VERSAO)


def rotacionar(pasta: Path | str, segredo_antigo: str, segredo_novo: str, aplicar: bool = False) -> dict:
    """Devolve contagens: total, a_trocar, trocadas, ja_na_chave_nova, ilegiveis (lista de nomes)."""
    if not segredo_antigo or not segredo_novo:
        raise ValueError("Informe a chave antiga e a nova.")
    if segredo_antigo == segredo_novo:
        raise ValueError("A chave nova e igual a antiga.")
    antiga, nova = _aes(segredo_antigo), _aes(segredo_novo)
    resultado = {"total": 0, "a_trocar": 0, "trocadas": 0, "ja_na_chave_nova": 0, "ilegiveis": []}
    for arquivo in sorted(Path(pasta).glob("*.rx")):
        resultado["total"] += 1
        dados = arquivo.read_bytes()
        try:
            claro = _decifrar(antiga, dados)
        except InvalidTag:
            try:
                _decifrar(nova, dados)
                resultado["ja_na_chave_nova"] += 1
            except InvalidTag:
                resultado["ilegiveis"].append(arquivo.name)
            continue
        resultado["a_trocar"] += 1
        if not aplicar:
            continue
        novo = _cifrar(nova, claro)
        if _decifrar(nova, novo) != claro:  # conferencia antes de substituir
            resultado["ilegiveis"].append(arquivo.name)
            continue
        temporario = arquivo.with_suffix(".tmp")
        temporario.write_bytes(novo)
        os.replace(temporario, arquivo)
        try:
            os.chmod(arquivo, 0o600)
        except OSError:
            pass
        resultado["trocadas"] += 1
    return resultado
