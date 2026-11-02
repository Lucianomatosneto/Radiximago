"""
Helpers e constantes compartilhados entre os submodulos de curadoria -
usados por mais de um sub-fluxo (consultas, ficha, aprovacao/descarte,
segunda opiniao).
"""

from typing import Optional

from fastapi import HTTPException

from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation, CurationHistory, StatusCuradoria

STATUS_FINAIS = [
    StatusCuradoria.APROVADA.value,
    StatusCuradoria.DESCARTADA.value,
]

# Só se edita uma ficha enquanto ela ainda nao passou por uma decisao
# (aprovacao/descarte) nem esta em segunda opiniao.
STATUS_EDITAVEIS = [
    StatusCuradoria.PENDENTE.value,
    StatusCuradoria.EM_ANALISE.value,
]


def _valor(campo) -> Optional[str]:
    """Converte um Enum opcional no texto guardado no banco (ou None)."""
    return campo.value if campo is not None else None


def _registrar_historico(db, curation_id, usuario_id, acao, status_ant, status_novo, justificativa):
    """Grava um registro no historico de curadoria (rastreabilidade)."""
    db.add(CurationHistory(
        curation_id=curation_id,
        usuario_id=usuario_id,
        acao=acao,
        status_anterior=status_ant,
        status_novo=status_novo,
        justificativa=justificativa,
    ))


def _registrar_auditoria(db, usuario_id, acao, entidade_id, resultado, detalhes, entidade="curation"):
    """
    Grava um registro na auditoria (Bloco 4). `entidade` default "curation"
    preserva todo chamador existente (aprovacao, descarte, edicao de
    ficha etc.) - achados/erros_tecnicos (Fase 2) passam entidade="achado"
    ou "erro_tecnico" explicitamente, reaproveitando o mesmo mecanismo em
    vez de um sistema de auditoria paralelo.
    """
    db.add(AuditLog(
        usuario_id=usuario_id,
        acao=acao,
        entidade=entidade,
        entidade_id=entidade_id,
        resultado=resultado,
        detalhes=detalhes,
    ))


def _buscar_ficha(db, curation_id) -> Curation:
    """Busca a ficha ou levanta 404."""
    ficha = db.query(Curation).filter(Curation.id == curation_id).first()
    if not ficha:
        raise HTTPException(
            status_code=404,
            detail=f"Ficha de curadoria {curation_id} nao encontrada.",
        )
    return ficha


def _exigir_fora_de_segunda_opiniao(ficha: Curation, curation_id: int) -> None:
    """
    Bloqueia aprovar/descartar diretamente enquanto a ficha esta em
    segunda_opiniao - o unico caminho para sair desse status e
    /apply-review-decision. Compartilhado por aprovar_curadoria e
    descartar_curadoria.
    """
    if ficha.status == StatusCuradoria.SEGUNDA_OPINIAO.value:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A ficha {curation_id} esta em segunda opiniao. Use "
                f"POST /curation/{curation_id}/apply-review-decision para aplicar a decisao final."
            ),
        )


def _campos_minimos_faltando(ficha) -> list:
    """Campos minimos para LIBERAR uma imagem (Bloco 6, secao 10; decisao de
    02/11/2026: quem cura e o curador e a regra vale no servidor, nao so na
    tela). Devolve os nomes (em portugues) do que falta."""
    faltando = []
    if not ficha.tipo_radiografia:
        faltando.append("tipo de radiografia")
    if not (ficha.dentes or ficha.regioes_imagem):
        faltando.append("dente ou região anatômica")
    if not (ficha.achado_principal or ficha.alteracoes_observadas or getattr(ficha, "achados", None)):
        faltando.append("achado radiográfico")
    if not ficha.qualidade_tecnica:
        faltando.append("qualidade técnica")
    if not (ficha.descricao_didatica or "").strip():
        faltando.append("descrição didática")
    return faltando


def _executar_aprovacao(db, ficha, usuario, anonimizacao_validada, observacoes, acao="aprovacao", origem=""):
    """
    Aplica a aprovacao a uma ficha. Regra LGPD: so libera com anonimizacao validada.
    Compartilhado por /approve e /apply-review-decision.
    """
    if not anonimizacao_validada:
        _registrar_auditoria(
            db, usuario.id, acao, ficha.id, "negado",
            f"Tentativa de aprovar sem anonimizacao validada.{origem}",
        )
        db.commit()
        raise HTTPException(
            status_code=422,
            detail="Aprovacao bloqueada: a anonimizacao precisa estar validada para liberar a imagem.",
        )

    faltando = _campos_minimos_faltando(ficha)
    if faltando:
        _registrar_auditoria(
            db, usuario.id, acao, ficha.id, "negado",
            f"Tentativa de aprovar com campos minimos faltando: {', '.join(faltando)}.{origem}",
        )
        db.commit()
        raise HTTPException(
            status_code=422,
            detail="Aprovacao bloqueada: preencha antes de liberar a imagem: " + ", ".join(faltando) + ".",
        )

    status_anterior = ficha.status
    ficha.status = StatusCuradoria.APROVADA.value
    ficha.anonimizacao_validada = True

    _registrar_historico(
        db, ficha.id, usuario.id, acao,
        status_anterior, StatusCuradoria.APROVADA.value,
        (observacoes or "Ficha aprovada.") + origem,
    )
    ref = getattr(ficha, "orthanc_reference", None)
    situacao_texto = (ref.texto_na_imagem if ref else None) or "nao_verificado (imagem anterior a verificacao)"
    regioes = f", {ref.texto_regioes} tarjas" if ref and ref.texto_regioes else ""
    _registrar_auditoria(
        db, usuario.id, acao, ficha.id, "sucesso",
        f"Ficha aprovada por usuario {usuario.id}. Texto na imagem: {situacao_texto}{regioes}; "
        f"anonimizacao conferida pelo curador.{origem}",
    )


def _executar_descarte(db, ficha, usuario, motivo, acao="descarte", origem=""):
    """
    Aplica o descarte a uma ficha. Exige justificativa.
    Compartilhado por /discard e /apply-review-decision.
    """
    motivo_limpo = (motivo or "").strip()
    if not motivo_limpo:
        raise HTTPException(status_code=422, detail="O descarte exige uma justificativa (motivo).")

    status_anterior = ficha.status
    ficha.status = StatusCuradoria.DESCARTADA.value

    _registrar_historico(
        db, ficha.id, usuario.id, acao,
        status_anterior, StatusCuradoria.DESCARTADA.value, motivo_limpo + origem,
    )
    _registrar_auditoria(
        db, usuario.id, acao, ficha.id, "sucesso",
        f"Ficha descartada por usuario {usuario.id}. Motivo: {motivo_limpo}{origem}",
    )
    return motivo_limpo
