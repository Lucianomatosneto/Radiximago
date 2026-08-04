"""Criacao e edicao da ficha de curadoria (antes de aprovar/descartar)."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference
from app.modules.curations import Curation, StatusCuradoria, DENTES_PERMANENTES

from .common import STATUS_EDITAVEIS, _buscar_ficha, _registrar_auditoria, _registrar_historico, _valor
from .router import router
from .schemas import CurationCreate, CurationUpdate


# ---------------------------------------------------------------------
# POST /curation/{orthanc_reference_id}  -> cria a ficha
# ---------------------------------------------------------------------
@router.post("/{orthanc_reference_id}")
def criar_curadoria(
    orthanc_reference_id: int,
    dados: CurationCreate,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Cria a ficha de curadoria de uma imagem (status inicial: em_analise)."""

    imagem = (
        db.query(OrthancReference)
        .filter(OrthancReference.id == orthanc_reference_id)
        .first()
    )
    if not imagem:
        raise HTTPException(
            status_code=404,
            detail=f"Imagem {orthanc_reference_id} nao encontrada em orthanc_references.",
        )
    if not imagem.ativo:
        raise HTTPException(
            status_code=409,
            detail=f"Imagem {orthanc_reference_id} esta desativada e nao pode receber uma nova ficha.",
        )

    ja_existe = (
        db.query(Curation)
        .filter(Curation.orthanc_reference_id == orthanc_reference_id)
        .first()
    )
    if ja_existe:
        raise HTTPException(
            status_code=409,
            detail=f"A imagem {orthanc_reference_id} ja possui ficha (id {ja_existe.id}).",
        )

    if dados.dentes:
        invalidos = [d for d in dados.dentes if d not in DENTES_PERMANENTES]
        if invalidos:
            raise HTTPException(
                status_code=422,
                detail=f"Dentes invalidos (use apenas 11-48, notacao FDI): {invalidos}",
            )

    for rotulo, valor in (("idade_min", dados.idade_min), ("idade_max", dados.idade_max)):
        if valor is not None and not (0 <= valor <= 120):
            raise HTTPException(status_code=422, detail=f"{rotulo} deve estar entre 0 e 120.")
    if (
        dados.idade_min is not None
        and dados.idade_max is not None
        and dados.idade_min > dados.idade_max
    ):
        raise HTTPException(status_code=422, detail="idade_min nao pode ser maior que idade_max.")

    ficha = Curation(
        orthanc_reference_id=orthanc_reference_id,
        modalidade="RX",
        tipo_radiografia=dados.tipo_radiografia.value,
        dentes=dados.dentes,
        idade_min=dados.idade_min,
        idade_max=dados.idade_max,
        genero=_valor(dados.genero),
        achado_principal=_valor(dados.achado_principal),
        achados_detalhe=dados.achados_detalhe,
        alteracoes_observadas=[a.value for a in dados.alteracoes_observadas] if dados.alteracoes_observadas else None,
        qualidade_tecnica=_valor(dados.qualidade_tecnica),
        dificuldade=_valor(dados.dificuldade),
        descricao_didatica=dados.descricao_didatica,
        observacoes_internas=dados.observacoes_internas,
        status=StatusCuradoria.EM_ANALISE.value,
        anonimizacao_validada=False,
        curador_id=usuario.id,
    )
    db.add(ficha)
    db.flush()

    _registrar_historico(
        db, ficha.id, usuario.id, "criacao",
        None, StatusCuradoria.EM_ANALISE.value, "Ficha de curadoria criada.",
    )
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Ficha de curadoria criada com sucesso.",
        "curation_id": ficha.id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "status": ficha.status,
        "tipo_radiografia": ficha.tipo_radiografia,
        "dentes": ficha.dentes,
    }


# ---------------------------------------------------------------------
# PATCH /curation/{curation_id}  -> edita os campos de classificacao
# ---------------------------------------------------------------------
@router.patch("/{curation_id}")
def editar_curadoria(
    curation_id: int,
    dados: CurationUpdate,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Atualiza parcialmente os campos de classificacao de uma ficha (so os
    campos enviados). Nao altera `status` - isso continua exclusivo de
    approve/discard/request-review/apply-review-decision. So permite editar
    fichas ainda 'pendente' ou 'em_analise'.
    """
    ficha = _buscar_ficha(db, curation_id)

    if ficha.status not in STATUS_EDITAVEIS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A ficha {curation_id} esta '{ficha.status}' (ja finalizada ou em "
                f"revisao) e nao pode mais ser editada."
            ),
        )

    if dados.dentes:
        invalidos = [d for d in dados.dentes if d not in DENTES_PERMANENTES]
        if invalidos:
            raise HTTPException(
                status_code=422,
                detail=f"Dentes invalidos (use apenas 11-48, notacao FDI): {invalidos}",
            )

    idade_min_final = dados.idade_min if dados.idade_min is not None else ficha.idade_min
    idade_max_final = dados.idade_max if dados.idade_max is not None else ficha.idade_max
    for rotulo, valor in (("idade_min", idade_min_final), ("idade_max", idade_max_final)):
        if valor is not None and not (0 <= valor <= 120):
            raise HTTPException(status_code=422, detail=f"{rotulo} deve estar entre 0 e 120.")
    if (
        idade_min_final is not None
        and idade_max_final is not None
        and idade_min_final > idade_max_final
    ):
        raise HTTPException(status_code=422, detail="idade_min nao pode ser maior que idade_max.")

    if dados.modalidade is not None:
        ficha.modalidade = dados.modalidade.value
    if dados.tipo_radiografia is not None:
        ficha.tipo_radiografia = dados.tipo_radiografia.value
    if dados.dentes is not None:
        ficha.dentes = dados.dentes
    if dados.idade_min is not None:
        ficha.idade_min = dados.idade_min
    if dados.idade_max is not None:
        ficha.idade_max = dados.idade_max
    if dados.genero is not None:
        ficha.genero = dados.genero.value
    if dados.achado_principal is not None:
        ficha.achado_principal = dados.achado_principal.value
    if dados.marcacoes is not None:
        ficha.marcacoes = [m.model_dump(mode="json") for m in dados.marcacoes]
    if dados.achados_detalhe is not None:
        ficha.achados_detalhe = dados.achados_detalhe
    if dados.alteracoes_observadas is not None:
        ficha.alteracoes_observadas = [a.value for a in dados.alteracoes_observadas]
    if dados.qualidade_tecnica is not None:
        ficha.qualidade_tecnica = dados.qualidade_tecnica.value
    if dados.dificuldade is not None:
        ficha.dificuldade = dados.dificuldade.value
    if dados.descricao_didatica is not None:
        ficha.descricao_didatica = dados.descricao_didatica
    if dados.observacoes_internas is not None:
        ficha.observacoes_internas = dados.observacoes_internas
    if dados.anonimizacao_validada is not None:
        ficha.anonimizacao_validada = dados.anonimizacao_validada

    _registrar_historico(
        db, ficha.id, usuario.id, "edicao",
        ficha.status, ficha.status, "Campos de classificacao da ficha editados.",
    )
    _registrar_auditoria(
        db, usuario.id, "edicao_curadoria", ficha.id, "sucesso",
        f"Ficha {ficha.id} editada por usuario {usuario.id}.",
    )
    db.commit()
    db.refresh(ficha)

    return {
        "mensagem": "Ficha atualizada com sucesso.",
        "id": ficha.id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "modalidade": ficha.modalidade,
        "tipo_radiografia": ficha.tipo_radiografia,
        "dentes": ficha.dentes,
        "idade_min": ficha.idade_min,
        "idade_max": ficha.idade_max,
        "genero": ficha.genero,
        "achado_principal": ficha.achado_principal,
        "achados_detalhe": ficha.achados_detalhe,
        "alteracoes_observadas": ficha.alteracoes_observadas,
        "qualidade_tecnica": ficha.qualidade_tecnica,
        "dificuldade": ficha.dificuldade,
        "descricao_didatica": ficha.descricao_didatica,
        "observacoes_internas": ficha.observacoes_internas,
        "status": ficha.status,
        "anonimizacao_validada": ficha.anonimizacao_validada,
        "atualizado_em": ficha.atualizado_em.isoformat() if ficha.atualizado_em else None,
    }
