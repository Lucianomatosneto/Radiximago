"""
SUGESTAO DO PROFESSOR (etapa C, 08/11/2026 - decisao do Luciano).

O professor usa a MESMA tela de Curadoria, mas so com as imagens que ele
enviou. Ele preenche a ficha (tipo, regiao, achados, desenhos sobre a imagem,
descricao) e escolhe:
- "Enviar ao curador": a ficha entra na fila do curador ja preenchida; o
  curador corrige o que precisar e e o UNICO que publica no banco geral;
- "Guardar em Minhas imagens": a imagem fica so com ele (destino "pessoal"),
  com as marcacoes, e ele pode continuar editando depois.

- GET  /curation/professor/fila                 imagens dele para marcar
- POST /curation/{curation_id}/enviar-sugestao  manda ao curador
- POST /curation/{curation_id}/guardar-para-mim guarda so para ele
"""

from fastapi import Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import get_db
from app.modules.auth import exigir_perfis
from app.modules.curations import Curation, StatusCuradoria
from app.modules.orthanc_references import DestinoImagem, OrthancReference
from app.modules.users import User, UserRole

from .common import _buscar_ficha, _registrar_auditoria, _registrar_historico
from .router import router


@router.get("/professor/fila")
def fila_do_professor(usuario: User = Depends(exigir_perfis(UserRole.professor)), db: Session = Depends(get_db)):
    """Imagens que o professor enviou e ainda pode marcar: sem ficha, ou com o
    rascunho dele ainda nao enviado ao curador."""
    linhas = (
        db.query(OrthancReference, Curation.id)
        .outerjoin(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(
            OrthancReference.enviado_por_id == usuario.id,
            OrthancReference.ativo.is_(True),
            OrthancReference.destino != DestinoImagem.ANALISE.value,
            or_(
                Curation.id.is_(None),
                and_(Curation.sugerida_por_id == usuario.id, Curation.sugestao_enviada_em.is_(None),
                     Curation.status == StatusCuradoria.EM_ANALISE.value),
            ),
        )
        .order_by(OrthancReference.id)
        .limit(500)
        .all()
    )
    itens = [
        {
            "orthanc_reference_id": ref.id,
            "curation_id": curation_id,
            "destino": ref.destino,
            "study_instance_uid": ref.study_instance_uid,
            "series_instance_uid": ref.series_instance_uid,
            "sop_instance_uid": ref.sop_instance_uid,
            "orthanc_id": ref.orthanc_id,
            "resource_type": ref.resource_type,
            "dicomweb_url": ref.dicomweb_url,
        }
        for ref, curation_id in linhas
    ]
    return {"total_pendentes": len(itens), "aguardando_recorte": 0, "skip": 0, "limit": len(itens),
            "quantidade_retornada": len(itens), "itens": itens}


def _rascunho(db: Session, curation_id: int, usuario: User) -> tuple[Curation, OrthancReference]:
    ficha = _buscar_ficha(db, curation_id, usuario, escrita=True)
    if ficha.sugerida_por_id != usuario.id:
        raise HTTPException(status_code=404, detail="Ficha nao encontrada.")
    return ficha, db.get(OrthancReference, ficha.orthanc_reference_id)


@router.post("/{curation_id}/enviar-sugestao")
def enviar_sugestao(curation_id: int, usuario: User = Depends(exigir_perfis(UserRole.professor)),
                    db: Session = Depends(get_db)):
    ficha, ref = _rascunho(db, curation_id, usuario)
    ficha.sugestao_enviada_em = func.now()
    ref.destino = DestinoImagem.FILA.value
    _registrar_historico(db, ficha.id, usuario.id, "envio_ao_curador", ficha.status, ficha.status,
                         "Professor enviou a ficha preenchida ao curador.")
    _registrar_auditoria(db, usuario.id, "sugestao_professor_enviada", ficha.id, "sucesso",
                         f"Imagem {ref.id}: sugestao enviada a fila do curador.")
    db.commit()
    return {"mensagem": "Sugestao enviada ao curador. So ele publica a imagem no banco de imagens."}


@router.post("/{curation_id}/guardar-para-mim")
def guardar_para_mim(curation_id: int, usuario: User = Depends(exigir_perfis(UserRole.professor)),
                     db: Session = Depends(get_db)):
    ficha, ref = _rascunho(db, curation_id, usuario)
    ref.destino = DestinoImagem.PESSOAL.value
    _registrar_auditoria(db, usuario.id, "sugestao_professor_guardada", ficha.id, "sucesso",
                         f"Imagem {ref.id}: guardada em Minhas imagens com as marcacoes.")
    db.commit()
    return {"mensagem": "Guardada em Minhas imagens. Voce pode continuar marcando e enviar ao curador depois."}
