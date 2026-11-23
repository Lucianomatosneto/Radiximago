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
"""

from typing import List

from fastapi import Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import PERFIS_CURADORIA_ESCRITA, exigir_perfis
from app.modules.curations import Curation, TipoRadiografia
from app.modules.orthanc_references import DestinoImagem, OrthancReference
from app.modules.users import User

from .common import _registrar_auditoria
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
    na_fila = (
        db.query(OrthancReference)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(
            OrthancReference.id.in_(ids),
            OrthancReference.ativo.is_(True),
            OrthancReference.destino == DestinoImagem.FILA.value,
            Curation.id.is_(None),
        )
        .all()
    )
    for ref in na_fila:
        ref.tipo_preliminar = dados.tipo.value
        ref.tipo_preliminar_origem = ORIGEM_TRIAGEM
    alteradas = [ref.id for ref in na_fila]
    _registrar_auditoria(
        db, usuario.id, "triagem_modalidade", None, "sucesso",
        f"tipo={dados.tipo.value}; alteradas={len(alteradas)}; ids={','.join(map(str, alteradas))}",
        entidade="orthanc_reference",
    )
    db.commit()
    return {"alteradas": len(alteradas), "ignoradas": len(ids) - len(alteradas)}
