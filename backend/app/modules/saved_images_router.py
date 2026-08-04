"""
Roteador de "Minhas imagens" (imagens salvas).

Endpoints:
- POST   /saved-images/{curation_id}  -> salva uma imagem aprovada pro usuario logado
- DELETE /saved-images/{curation_id}  -> remove dos salvos
- GET    /saved-images/               -> lista as imagens salvas do usuario logado

Autoatendimento: sempre em cima do proprio usuario logado (obter_usuario_atual),
nao existe acao de admin aqui.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth import obter_usuario_atual
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference
from app.modules.curations import Curation, StatusCuradoria
from app.modules.saved_images import SavedImage

router = APIRouter(prefix="/saved-images", tags=["Minhas imagens"])


@router.post("/{curation_id}")
def salvar_imagem(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    ficha = (
        db.query(Curation)
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.id == curation_id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
        .filter(OrthancReference.ativo.is_(True))
        .first()
    )
    if not ficha:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")

    ja_salva = (
        db.query(SavedImage)
        .filter(SavedImage.user_id == usuario.id, SavedImage.curation_id == curation_id)
        .first()
    )
    if ja_salva:
        return {"mensagem": "Imagem já estava salva."}

    salva = SavedImage(user_id=usuario.id, curation_id=curation_id)
    db.add(salva)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"mensagem": "Imagem já estava salva."}

    return {"mensagem": "Imagem salva com sucesso."}


@router.delete("/{curation_id}")
def remover_imagem_salva(
    curation_id: int,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    salva = (
        db.query(SavedImage)
        .filter(SavedImage.user_id == usuario.id, SavedImage.curation_id == curation_id)
        .first()
    )
    if not salva:
        raise HTTPException(status_code=404, detail="Essa imagem não está salva.")

    db.delete(salva)
    db.commit()
    return {"mensagem": "Imagem removida dos salvos."}


@router.get("/")
def listar_imagens_salvas(
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    resultados = (
        db.query(SavedImage, Curation, OrthancReference)
        .join(Curation, SavedImage.curation_id == Curation.id)
        .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(SavedImage.user_id == usuario.id)
        .order_by(SavedImage.criado_em.desc())
        .all()
    )

    itens = []
    for salva, ficha, ref in resultados:
        if ref.study_instance_uid:
            viewer_url = f"{settings.OHIF_BASE_URL}/viewer?StudyInstanceUIDs={ref.study_instance_uid}"
        else:
            viewer_url = None
        itens.append({
            "curation_id": ficha.id,
            "orthanc_reference_id": ref.id,
            "modalidade": ficha.modalidade,
            "tipo_radiografia": ficha.tipo_radiografia,
            "dentes": ficha.dentes,
            "achado_principal": ficha.achado_principal,
            "achados_detalhe": ficha.achados_detalhe,
            "alteracoes_observadas": ficha.alteracoes_observadas,
            "marcacoes": ficha.marcacoes,
            "qualidade_tecnica": ficha.qualidade_tecnica,
            "dificuldade": ficha.dificuldade,
            "descricao_didatica": ficha.descricao_didatica,
            "viewer_url": viewer_url,
            "salvo_em": salva.criado_em.isoformat() if salva.criado_em else None,
        })

    return {"quantidade": len(itens), "itens": itens}
