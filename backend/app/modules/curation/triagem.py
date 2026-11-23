"""
TRIAGEM DA MODALIDADE EM LOTE (pedido do Luciano, 23/11/2026).

O reconhecimento automatico na entrada (tipo_automatico.py) so separa
tomografia e panoramica: periapical, interproximal e oclusal tem o mesmo
DICOM e ficam como "intraoral". Aqui o curador (ou o administrador) ve as
miniaturas da fila, seleciona varias e diz o tipo de uma vez. Quem decide e
um profissional; a decisao fica na auditoria (triagem_modalidade) e vira o
tipo inicial da ficha quando a imagem for curada.

- POST /curation/triagem  {orthanc_reference_ids: [...], tipo}
  So mudam as imagens que ainda estao na fila (ativas, destino fila, sem
  ficha); as demais voltam contadas como "ignoradas".
- CORRIGIR (23/11/2026, pedido do Luciano: "classificou como interproximal
  mas e uma periapical"): vale tambem para tirar uma imagem da modalidade
  errada e por na certa. A sugestao enviada pelo professor, que fica na
  fila com a ficha dele, tambem e corrigida: o tipo da ficha muda e fica no
  historico da ficha.
"""

from typing import List

from fastapi import Depends
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import PERFIS_CURADORIA_ESCRITA, exigir_perfis
from app.modules.curations import Curation, StatusCuradoria, TipoRadiografia
from app.modules.orthanc_references import DestinoImagem, OrthancReference
from app.modules.users import User

from .common import _registrar_auditoria, _registrar_historico
from .router import router

MAX_POR_VEZ = 100
ORIGEM_TRIAGEM = "triagem"


class TriagemEntrada(BaseModel):
    orthanc_reference_ids: List[int] = Field(min_length=1, max_length=MAX_POR_VEZ)
    tipo: TipoRadiografia


@router.post("/triagem")
def triar_modalidade(
    dados: TriagemEntrada,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
    db: Session = Depends(get_db),
):
    ids = sorted(set(dados.orthanc_reference_ids))
    # sugestao do professor aguardando curador: esta na fila COM ficha (mesma
    # regra de consultas.listar_pendentes)
    sugestao_aguardando = and_(
        Curation.sugestao_enviada_em.isnot(None),
        Curation.status == StatusCuradoria.EM_ANALISE.value,
        Curation.curador_id.is_(None),
    )
    na_fila = (
        db.query(OrthancReference, Curation)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(
            OrthancReference.id.in_(ids),
            OrthancReference.ativo.is_(True),
            OrthancReference.destino == DestinoImagem.FILA.value,
            or_(Curation.id.is_(None), sugestao_aguardando),
        )
        .all()
    )
    for ref, ficha in na_fila:
        ref.tipo_preliminar = dados.tipo.value
        ref.tipo_preliminar_origem = ORIGEM_TRIAGEM
        if ficha is not None and ficha.tipo_radiografia != dados.tipo.value:
            anterior = ficha.tipo_radiografia
            ficha.tipo_radiografia = dados.tipo.value
            _registrar_historico(
                db, ficha.id, usuario.id, "triagem_modalidade", ficha.status, ficha.status,
                f"Tipo de radiografia corrigido na triagem: {anterior} -> {dados.tipo.value}.",
            )
    alteradas = [ref.id for ref, _ in na_fila]
    _registrar_auditoria(
        db, usuario.id, "triagem_modalidade", None, "sucesso",
        f"tipo={dados.tipo.value}; alteradas={len(alteradas)}; ids={','.join(map(str, alteradas))}",
        entidade="orthanc_reference",
    )
    db.commit()
    return {"alteradas": len(alteradas), "ignoradas": len(ids) - len(alteradas)}
