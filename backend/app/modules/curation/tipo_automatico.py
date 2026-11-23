"""
TIPO DE RADIOGRAFIA SUGERIDO A PARTIR DA PROPRIA IMAGEM (18/11/2026)

Antes, toda ficha nova comecava como "periapical", ate em tomografias
(pendencia aberta desde jul/2026; dossie, documento 05, F20). Agora, quando
quem abre a ficha nao informa o tipo, o sistema sugere um a partir dos dados
DICOM da imagem, e o curador confere e corrige na ficha, como sempre.

Regras (simples e explicaveis - ficam registradas no historico da ficha):
- Modality "CT"  -> tomografia (TCFC/CBCT e exportada como CT);
- Modality "PX"  -> panoramica ("Panoramic X-Ray" no padrao DICOM);
- imagem bem mais larga que alta (largura/altura >= 1,6) -> panoramica;
- qualquer outro caso -> periapical (o tipo intraoral mais comum).

Se o Orthanc nao responder, a ficha e criada assim mesmo, como periapical:
abrir a imagem nunca falha por causa da sugestao.
"""

import logging

from app.modules import orthanc_client
from app.modules.curations import TipoRadiografia

logger = logging.getLogger(__name__)

PROPORCAO_PANORAMICA = 1.6
PADRAO = TipoRadiografia.PERIAPICAL


def _inteiro(valor) -> int | None:
    try:
        numero = int(str(valor).strip().split("\\")[0])
    except (TypeError, ValueError):
        return None
    return numero if numero > 0 else None


def sugerir_tipo(tags: dict) -> tuple[TipoRadiografia, str]:
    """
    Funcao pura: recebe as tags DICOM simplificadas e devolve
    (tipo sugerido, motivo em texto para o historico).
    """
    modalidade = str(tags.get("Modality") or "").strip().upper()
    if modalidade == "CT":
        return TipoRadiografia.TOMOGRAFIA, "modalidade DICOM CT"
    if modalidade == "PX":
        return TipoRadiografia.PANORAMICA, "modalidade DICOM PX"
    linhas, colunas = _inteiro(tags.get("Rows")), _inteiro(tags.get("Columns"))
    if linhas and colunas and colunas / linhas >= PROPORCAO_PANORAMICA:
        return TipoRadiografia.PANORAMICA, f"imagem larga ({colunas}x{linhas})"
    return PADRAO, "padrao (sem indicio de panoramica ou tomografia)"


INTRAORAL = "intraoral"


def tipo_preliminar_automatico(tags: dict) -> str:
    """Modalidade PRELIMINAR na entrada da imagem (23/11/2026): as mesmas
    regras de sugerir_tipo, mas sem fingir saber o que nao da para saber -
    periapical, interproximal e oclusal tem o mesmo DICOM, entao o resto
    fica "intraoral" (o curador define o tipo exato na ficha)."""
    tipo, _motivo = sugerir_tipo(tags)
    if tipo in (TipoRadiografia.TOMOGRAFIA, TipoRadiografia.PANORAMICA):
        return tipo.value
    return INTRAORAL


def sugerir_tipo_da_imagem(orthanc_id: str) -> tuple[TipoRadiografia, str]:
    """Busca as tags no Orthanc e aplica sugerir_tipo; sem resposta, usa o padrao."""
    try:
        tags = orthanc_client.obter_tags_simplificadas_instancia(orthanc_id)
    except Exception:  # noqa: BLE001 - qualquer falha do Orthanc cai no padrao
        logger.warning("Sem tags do Orthanc para sugerir o tipo da instancia %s; usando o padrao.", orthanc_id)
        return PADRAO, "padrao (Orthanc indisponivel)"
    return sugerir_tipo(tags or {})
