"""Criacao e edicao da ficha de curadoria (antes de aprovar/descartar)."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA, PERFIS_CURADORIA_ESCRITA, PERFIS_FICHA_LEITURA, PERFIS_FICHA_ESCRITA
from app.modules.users import User
from app.modules.orthanc_references import DestinoImagem, OrthancReference
from app.modules.curations import Curation, StatusCuradoria, DENTES_PERMANENTES
from app.modules.vocabulario import CurationTermo, TermoVocabulario
from app.modules.achados import Achado, ErroTecnico, TipoAchado, regiao_do_achado
from app.modules.curations import AlteracaoObservada

from .common import STATUS_EDITAVEIS, _buscar_ficha, _perfil_de, e_rascunho_do_professor, _registrar_auditoria, _registrar_historico, _valor
from .router import router
from .schemas import CurationCreate, CurationUpdate


def _regioes_unicas(regioes) -> list[str] | None:
    """Regioes que a imagem mostra, sem repetir e na ordem recebida."""
    if regioes is None:
        return None
    return list(dict.fromkeys(_valor(r) for r in regioes))


# ---------------------------------------------------------------------
# POST /curation/{orthanc_reference_id}  -> cria a ficha
# ---------------------------------------------------------------------
@router.post("/{orthanc_reference_id}")
def criar_curadoria(
    orthanc_reference_id: int,
    dados: CurationCreate,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_ESCRITA)),
    db: Session = Depends(get_db),
):
    """Cria a ficha de curadoria de uma imagem (status inicial: em_analise).

    Etapa C (08/11/2026):
    - PROFESSOR comeca a ficha so de imagens que ELE enviou (fila ou "so para
      mim"); ela fica como rascunho dele (sugerida_por_id) ate ele enviar ao
      curador. Abrir de novo devolve o mesmo rascunho.
    - CURADOR que abre uma sugestao ja enviada por um professor assume a
      ficha (vira o curador dela) e encontra tudo preenchido.
    """
    professor = _perfil_de(usuario) == "professor"

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
    if professor:
        if imagem.enviado_por_id != usuario.id or imagem.destino == DestinoImagem.ANALISE.value:
            raise HTTPException(status_code=404, detail=f"Imagem {orthanc_reference_id} nao encontrada.")
    elif imagem.destino != DestinoImagem.FILA.value:
        # etapa B (08/11/2026): so imagens da fila de curadoria recebem ficha
        raise HTTPException(
            status_code=409,
            detail="Esta imagem nao esta na fila de curadoria (e pessoal ou esta em analise).",
        )

    ja_existe = (
        db.query(Curation)
        .filter(Curation.orthanc_reference_id == orthanc_reference_id)
        .first()
    )
    if ja_existe and professor and ja_existe.sugerida_por_id == usuario.id and e_rascunho_do_professor(ja_existe):
        return _resposta_criacao(ja_existe, "Rascunho de sugestao aberto.")
    if (ja_existe and not professor and ja_existe.sugerida_por_id and ja_existe.sugestao_enviada_em is not None
            and ja_existe.curador_id is None and ja_existe.status in STATUS_EDITAVEIS):
        ja_existe.curador_id = usuario.id
        _registrar_historico(
            db, ja_existe.id, usuario.id, "sugestao_assumida",
            ja_existe.status, ja_existe.status, "Curador abriu a sugestao enviada pelo professor.",
        )
        db.commit()
        return _resposta_criacao(ja_existe, "Sugestao do professor aberta.")
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
        regioes_imagem=_regioes_unicas(dados.regioes_imagem),
        qualidade_tecnica=_valor(dados.qualidade_tecnica),
        dificuldade=_valor(dados.dificuldade),
        descricao_didatica=dados.descricao_didatica,
        observacoes_internas=dados.observacoes_internas,
        status=StatusCuradoria.EM_ANALISE.value,
        anonimizacao_validada=False,
        # o rascunho do professor ainda nao tem curador (quem assumir vira o curador)
        curador_id=None if professor else usuario.id,
        sugerida_por_id=usuario.id if professor else None,
    )
    db.add(ficha)
    db.flush()

    _registrar_historico(
        db, ficha.id, usuario.id, "criacao",
        None, StatusCuradoria.EM_ANALISE.value, "Ficha de curadoria criada.",
    )
    db.commit()
    db.refresh(ficha)

    return _resposta_criacao(ficha, "Ficha de curadoria criada com sucesso.")


def _resposta_criacao(ficha: Curation, mensagem: str) -> dict:
    return {
        "mensagem": mensagem,
        "curation_id": ficha.id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "status": ficha.status,
        "tipo_radiografia": ficha.tipo_radiografia,
        "dentes": ficha.dentes,
        "sugerida_por_id": ficha.sugerida_por_id,
    }


# ---------------------------------------------------------------------
# PATCH /curation/{curation_id}  -> edita os campos de classificacao
# ---------------------------------------------------------------------
ALTERACOES_LEGADAS = {a.value for a in AlteracaoObservada}


def _sincronizar_achados(db: Session, ficha: Curation, achados: list, usuario_id: int) -> None:
    """
    Secao unica "Achados": substitui os achados estruturados da ficha pela
    lista recebida (o frontend sempre manda o estado completo) e DERIVA os
    campos legados, para a Pesquisa avancada continuar funcionando igual:
    - alteracoes_observadas = tipos dos achados (sem repetir);
    - dentes da ficha = dentes que ja estavam + os dentes dos achados.
    Validacao identica a das rotas /curation/{id}/achados (dentes FDI,
    "outro" exige descricao).
    """
    from .achados import _normalizar_dentes, _validar_outros  # evita import circular

    # 08/11/2026: achados que sao termos do vocabulario (lista unica de
    # achados + termos). O termo precisa existir; o nome dele vira a
    # descricao do "outro" e a ficha fica LIGADA ao termo (e isso que faz a
    # imagem aparecer na Pesquisa avancada por esse termo).
    ids_termos = {item.termo_id for item in achados if item.termo_id}
    termos = {t.id: t for t in db.query(TermoVocabulario).filter(TermoVocabulario.id.in_(ids_termos))} if ids_termos else {}
    faltando = sorted(ids_termos - set(termos))
    if faltando:
        raise HTTPException(status_code=422, detail=f"Termos do vocabulário inexistentes: {faltando}")

    novos = []
    for item in achados:
        dentes = _normalizar_dentes(item.dentes, item.dente_nao_identificado)
        termo = termos.get(item.termo_id) if item.termo_id else None
        tipo = "outro" if termo else item.tipo.value
        descricao = item.descricao or (termo.termo if termo else None)
        _validar_outros(tipo, descricao)
        novos.append(Achado(
            curation_id=ficha.id,
            termo_id=termo.id if termo else None,
            tipo=tipo,
            regiao_anatomica=regiao_do_achado(tipo, item.regiao_anatomica.value if item.regiao_anatomica else None),
            dentes=dentes,
            dente_nao_identificado=item.dente_nao_identificado,
            descricao=descricao,
            marcacoes=[m.model_dump(mode="json") for m in (item.marcacoes or [])],
        ))

    # grava antes o que a lista "termos" ja ligou nesta mesma edicao: sem
    # isso o mesmo termo era inserido duas vezes e o banco recusava (500)
    db.flush()
    ligados = {t for (t,) in db.query(CurationTermo.termo_id).filter(CurationTermo.curation_id == ficha.id)}
    for termo_id in ids_termos - ligados:
        db.add(CurationTermo(curation_id=ficha.id, termo_id=termo_id, vinculado_por_id=usuario_id))
    # termo que so estava ligado por uma marcacao que saiu: desliga tambem
    # (senao a imagem continuaria aparecendo na busca por esse termo)
    antes = {t for (t,) in db.query(Achado.termo_id).filter(Achado.curation_id == ficha.id, Achado.termo_id.isnot(None))}
    saiu = antes - ids_termos
    if saiu:
        db.query(CurationTermo).filter(
            CurationTermo.curation_id == ficha.id, CurationTermo.termo_id.in_(saiu)
        ).delete(synchronize_session=False)

    db.query(Achado).filter(Achado.curation_id == ficha.id).delete(synchronize_session=False)
    for a in novos:
        db.add(a)

    tipos = list(dict.fromkeys(a.tipo for a in novos if a.tipo in ALTERACOES_LEGADAS))
    ficha.alteracoes_observadas = tipos
    dentes_achados = {d for a in novos for d in (a.dentes or [])}
    ficha.dentes = sorted(set(ficha.dentes or []) | dentes_achados)
    if novos and ficha.achado_principal == "normal":
        ficha.achado_principal = None
    _registrar_historico(
        db, ficha.id, usuario_id, "achados_atualizados",
        ficha.status, ficha.status, f"{len(novos)} achado(s) registrado(s) na secao Achados.",
    )


@router.patch("/{curation_id}")
def editar_curadoria(
    curation_id: int,
    dados: CurationUpdate,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_ESCRITA)),
    db: Session = Depends(get_db),
):
    """
    Atualiza parcialmente os campos de classificacao de uma ficha (so os
    campos enviados). Nao altera `status` - isso continua exclusivo de
    approve/discard/request-review/apply-review-decision. So permite editar
    fichas ainda 'pendente' ou 'em_analise'.
    """
    ficha = _buscar_ficha(db, curation_id, usuario, escrita=True)

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
    if dados.regioes_imagem is not None:
        ficha.regioes_imagem = _regioes_unicas(dados.regioes_imagem)
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
    if dados.origem is not None and ficha.orthanc_reference is not None:
        ficha.orthanc_reference.origem = dados.origem.value
    if dados.termos is not None:
        ids_validos = {
            t for (t,) in db.query(TermoVocabulario.id).filter(TermoVocabulario.id.in_(set(dados.termos))).all()
        }
        invalidos = sorted(set(dados.termos) - ids_validos)
        if invalidos:
            raise HTTPException(status_code=422, detail=f"Termos do vocabulário inexistentes: {invalidos}")
        atuais = {
            c.termo_id: c for c in db.query(CurationTermo).filter(CurationTermo.curation_id == ficha.id).all()
        }
        for termo_id, ligacao in atuais.items():
            if termo_id not in ids_validos:
                db.delete(ligacao)
        for termo_id in ids_validos - set(atuais):
            db.add(CurationTermo(curation_id=ficha.id, termo_id=termo_id, vinculado_por_id=usuario.id))
    if dados.achados is not None:
        _sincronizar_achados(db, ficha, dados.achados, usuario.id)
    if dados.sem_alteracoes is not None:
        tem_achados = (
            len(dados.achados) > 0
            if dados.achados is not None
            else db.query(Achado.id).filter(Achado.curation_id == ficha.id).first() is not None
        )
        if dados.sem_alteracoes:
            if tem_achados:
                raise HTTPException(
                    status_code=422,
                    detail="Uma imagem com achados registrados não pode ser marcada como 'sem alterações'.",
                )
            ficha.achado_principal = "normal"
        elif ficha.achado_principal == "normal":
            ficha.achado_principal = None
    if dados.erros_tecnicos is not None:
        from .erros_tecnicos import exigir_erro_compativel  # evita import circular
        for e in dados.erros_tecnicos:
            exigir_erro_compativel(e.value, ficha.tipo_radiografia)
        # lista completa (substitui): um registro por tipo, sem repetir
        db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).delete(synchronize_session=False)
        for tipo in dict.fromkeys(e.value for e in dados.erros_tecnicos):
            db.add(ErroTecnico(curation_id=ficha.id, tipo=tipo))
        _registrar_historico(
            db, ficha.id, usuario.id, "erros_tecnicos_atualizados",
            ficha.status, ficha.status, f"{len(dados.erros_tecnicos)} erro(s) tecnico(s) registrado(s).",
        )
    if dados.origem_voz:
        _registrar_auditoria(
            db, usuario.id, "preenchimento_por_voz", ficha.id, "sucesso",
            f"Ficha {ficha.id} editada com apoio da curadoria por voz.",
        )

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
        "regioes_imagem": ficha.regioes_imagem,
        "qualidade_tecnica": ficha.qualidade_tecnica,
        "dificuldade": ficha.dificuldade,
        "descricao_didatica": ficha.descricao_didatica,
        "observacoes_internas": ficha.observacoes_internas,
        "status": ficha.status,
        "anonimizacao_validada": ficha.anonimizacao_validada,
        "origem": ficha.orthanc_reference.origem if ficha.orthanc_reference else None,
        "atualizado_em": ficha.atualizado_em.isoformat() if ficha.atualizado_em else None,
    }
