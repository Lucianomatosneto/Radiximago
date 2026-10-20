"""
Troca o ARQUIVO de uma imagem ja cadastrada por uma versao ajustada (girada
ou com a moldura recortada) - app/modules/geometria_imagem.py.

Por que "trocar" e nao "editar": o Orthanc nao altera arquivos guardados.
O arquivo novo recebe outro identificador de instancia (SOPInstanceUID),
entra no MESMO estudo e na MESMA serie, e o registro do Radix
(OrthancReference) passa a apontar para ele. Fichas, achados, anotacoes,
compartilhamentos e imagens salvas apontam para o registro do Radix (e nao
para o arquivo), entao continuam ligados a imagem.

Ordem pensada para nunca perder a imagem:
1. envia o arquivo novo ao Orthanc;
2. atualiza o registro e as marcacoes (coordenadas relativas, 0 a 1) e grava
   a auditoria, tudo numa unica transacao do banco;
3. so entao apaga o arquivo antigo. Se o passo 2 falhar, quem e apagado e o
   arquivo NOVO - o antigo continua valendo.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules import orthanc_client
from app.modules.achados import Achado
from app.modules.anotacoes import AnotacaoImagem
from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation
from app.modules.orthanc_references import OrthancReference

logger = logging.getLogger(__name__)

TransformarMarcacoes = Callable[[list[dict] | None], list[dict]]
TransformarPonto = Callable[[float, float], tuple[float, float]]


MODALIDADES_EM_VOLUME = {"CT", "MR", "PT", "NM", "US"}


class ImagemDeVolume(ValueError):
    """Corte de tomografia/ressonancia: girar um corte so desalinharia o volume."""


def conferir_pode_ajustar(tags: dict) -> None:
    """
    Radiografias (intraoral IO, panoramica PX, DX, CR) podem ser ajustadas uma
    a uma, mesmo que o aparelho tenha guardado varias na mesma serie. Ja um
    corte de tomografia faz parte de um volume (tem posicao no espaco -
    ImagePositionPatient): ajustar so ele quebraria a reconstrucao.
    """
    if str(tags.get("Modality") or "").upper() in MODALIDADES_EM_VOLUME or tags.get("ImagePositionPatient"):
        raise ImagemDeVolume("Esta imagem é um corte de um exame em volume (ex.: tomografia) e não pode ser girada sozinha.")


def _ajustar_marcacoes(db: Session, ref: OrthancReference, marcacoes: TransformarMarcacoes, ponto: TransformarPonto) -> int:
    """Leva todas as marcacoes e anotacoes da imagem para a nova posicao. Devolve quantas fichas."""
    fichas = db.query(Curation).filter(Curation.orthanc_reference_id == ref.id).all()
    for ficha in fichas:
        if ficha.marcacoes:
            ficha.marcacoes = marcacoes(ficha.marcacoes)  # lista nova: o banco grava a mudanca
        for achado in db.query(Achado).filter(Achado.curation_id == ficha.id).all():
            if achado.marcacoes:
                achado.marcacoes = marcacoes(achado.marcacoes)
        for nota in db.query(AnotacaoImagem).filter(AnotacaoImagem.curation_id == ficha.id).all():
            if nota.pos_x is not None and nota.pos_y is not None:
                nota.pos_x, nota.pos_y = ponto(nota.pos_x, nota.pos_y)
            if nota.alvo_x is not None and nota.alvo_y is not None:
                nota.alvo_x, nota.alvo_y = ponto(nota.alvo_x, nota.alvo_y)
    return len(fichas)


def substituir_arquivo(
    db: Session,
    ref: OrthancReference,
    novo_arquivo: bytes,
    *,
    acao: str,
    detalhes: str,
    usuario_id: int | None,
    marcacoes: TransformarMarcacoes,
    ponto: TransformarPonto,
    antes_de_gravar: Callable[[OrthancReference], None] | None = None,
) -> OrthancReference:
    antigo = ref.orthanc_id
    novo = orthanc_client.enviar_instancia(novo_arquivo).get("ID")
    if not novo or novo == antigo:
        raise RuntimeError("O Orthanc não devolveu um identificador novo para a imagem ajustada.")
    try:
        tags = orthanc_client.obter_tags_simplificadas_instancia(novo)
        ref.orthanc_id = novo
        ref.sop_instance_uid = tags.get("SOPInstanceUID") or ref.sop_instance_uid
        ref.dicomweb_url = f"{settings.DICOMWEB_URL}/instances/{novo}"
        if antes_de_gravar:
            antes_de_gravar(ref)
        fichas = _ajustar_marcacoes(db, ref, marcacoes, ponto)
        db.add(AuditLog(
            usuario_id=usuario_id, acao=acao, entidade="orthanc_reference", entidade_id=ref.id,
            resultado="sucesso",
            detalhes=f"{detalhes} Arquivo {antigo} substituído por {novo}; marcações ajustadas em {fichas} ficha(s).",
        ))
        db.commit()
    except Exception:
        db.rollback()
        try:
            orthanc_client.excluir_instancia(novo)
        except Exception:
            logger.exception("Nao foi possivel apagar a instancia nova %s depois da falha.", novo)
        raise
    try:
        orthanc_client.excluir_instancia(antigo)
    except Exception:
        # nao e grave (o arquivo antigo tambem esta anonimizado), mas fica registrado
        logger.exception("Arquivo antigo %s nao foi apagado do Orthanc.", antigo)
        db.add(AuditLog(
            usuario_id=usuario_id, acao=acao, entidade="orthanc_reference", entidade_id=ref.id,
            resultado="erro", detalhes=f"Arquivo antigo {antigo} não foi apagado do Orthanc (apagar manualmente).",
        ))
        db.commit()
    return ref
