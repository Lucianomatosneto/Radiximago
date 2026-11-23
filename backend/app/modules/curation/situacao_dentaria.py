"""
Denticao, dentes deciduos, odontograma de situacao e estruturas fora dos
dentes (pedido do Luciano, 23/11/2026, junto com o layout da panoramica).

- denticao (decidua / mista / permanente): todos os tipos de exame;
- dentes deciduos (FDI 51-85): todos os tipos, mas so combinam com
  denticao mista ou decidua (dado coerente para a pesquisa);
- situacao_dentes: {"16": ["restaurado", "endodontia"]} - o dente (FDI) e
  como ele esta na imagem; um dente pode ter mais de uma situacao;
- estruturas_extradentais: so na panoramica (e o exame que mostra seios
  maxilares, ATM, canal mandibular, partes moles do pescoco etc.).

Regras de validacao (OWASP ASVS 2.2.1/2.2.3: valor de lista fechada e
combinacao coerente) ficam aqui, fora de ficha.py, para nao crescer o
arquivo da ficha.
"""

from typing import Iterable

from fastapi import HTTPException

from app.modules.curations import DENTES_DECIDUOS, DENTES_FDI

TIPOS_COM_ESTRUTURAS = {"panoramica"}


def normalizar_situacao(situacao: dict | None) -> dict | None:
    """Confere os dentes (chaves), tira situacoes repetidas e dentes sem
    situacao, e ordena pelo numero do dente. Dicionario vazio = None."""
    if situacao is None:
        return None
    limpo: dict[str, list[str]] = {}
    for chave, lista in situacao.items():
        try:
            dente = int(chave)
        except (TypeError, ValueError):
            dente = None
        if dente is None or dente not in DENTES_FDI or str(dente) != str(chave).strip():
            raise HTTPException(
                status_code=422,
                detail=f"Dente inválido no odontograma (notação FDI, 11-48 e decíduos 51-85): {chave}",
            )
        valores = list(dict.fromkeys(getattr(s, "value", s) for s in lista))
        if valores:
            limpo[str(dente)] = valores
    return {k: limpo[k] for k in sorted(limpo, key=int)} or None


def exigir_dentes_validos(dentes: Iterable[int] | None) -> None:
    invalidos = [d for d in (dentes or []) if d not in DENTES_FDI]
    if invalidos:
        raise HTTPException(
            status_code=422,
            detail=f"Dentes invalidos (use 11-48 ou deciduos 51-85, notacao FDI): {invalidos}",
        )


def exigir_deciduos_coerentes(denticao: str | None, dentes: Iterable[int] | None, situacao: dict | None) -> None:
    """Dente deciduo nao combina com denticao permanente."""
    if denticao != "permanente":
        return
    usados = set(dentes or []) | {int(k) for k in (situacao or {})}
    deciduos = sorted(usados & set(DENTES_DECIDUOS))
    if deciduos:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Dente decíduo ({', '.join(map(str, deciduos))}) não combina com dentição permanente. "
                "Escolha dentição mista ou decídua, ou retire o dente."
            ),
        )


def exigir_estruturas_no_tipo(estruturas: list | None, tipo_radiografia: str | None) -> None:
    if estruturas and tipo_radiografia not in TIPOS_COM_ESTRUTURAS:
        raise HTTPException(
            status_code=422,
            detail="Estruturas e achados fora dos dentes só se registram na radiografia panorâmica.",
        )
