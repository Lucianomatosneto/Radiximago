"""
Endpoints de Erro Tecnico (Fase 2), vinculados a uma ficha de curadoria.
Modelo ORM/enum em app/modules/achados.py (Fase 1, aprovada).

Dimensao INDEPENDENTE de Achado, de proposito (ver especificacao tecnica
consolidada): erro tecnico descreve um problema da AQUISICAO da imagem
(movimento, angulacao, corte etc.), nao um achado clinico odontologico -
por isso vive em tabela propria, sem nenhuma foreign key ou relacionamento
para `achados`. Mesmo padrao de rota/autorizacao/status editavel de
achados.py (ver docstring la para o raciocinio completo, nao duplicado
aqui).
"""

from typing import List

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_FICHA_LEITURA, PERFIS_FICHA_ESCRITA
from app.modules.users import User
from app.modules.achados import ErroTecnico, erro_vale_para_exame

ROTULO_EXAME = {
    "periapical": "Periapical", "interproximal": "Interproximal", "oclusal": "Oclusal",
    "panoramica": "Panorâmica", "tomografia": "Tomografia (TCFC)",
}


def exigir_erro_nao_repetido(db: Session, curation_id: int, tipo_erro: str, exceto_id: int | None = None) -> None:
    """409 quando a ficha ja tem esse erro tecnico (01/11/2026 - reteste do
    QA: a API aceitava o mesmo erro duas vezes; a lista da ficha no PATCH ja
    guardava um registro por tipo)."""
    consulta = db.query(ErroTecnico.id).filter(ErroTecnico.curation_id == curation_id, ErroTecnico.tipo == tipo_erro)
    if exceto_id is not None:
        consulta = consulta.filter(ErroTecnico.id != exceto_id)
    if consulta.first():
        raise HTTPException(status_code=409, detail=f"A ficha já tem o erro técnico '{tipo_erro}'.")


def exigir_erro_compativel(tipo_erro: str, tipo_radiografia: str | None) -> None:
    """422 quando o erro tecnico nao vale para o tipo de exame (01/11/2026 -
    QA item 4: antes a API aceitava e a tela apagava o registro no proximo
    salvamento, parecendo "sucesso sem salvar")."""
    if not erro_vale_para_exame(tipo_erro, tipo_radiografia):
        raise HTTPException(
            status_code=422,
            detail=(
                f"O erro técnico '{tipo_erro}' não se aplica a "
                f"{ROTULO_EXAME.get(tipo_radiografia, tipo_radiografia)}. "
                "Escolha um erro da lista desse tipo de exame."
            ),
        )

from .achados import _exigir_ficha_editavel  # reaproveitado, nao duplicado
from .common import _buscar_ficha, _registrar_auditoria, _registrar_historico
from .router import router
from .schemas import ErroTecnicoCreate, ErroTecnicoUpdate, ErroTecnicoOut


def _buscar_erro_tecnico(db: Session, curation_id: int, erro_id: int) -> ErroTecnico:
    """Mesma protecao contra IDOR de _buscar_achado: filtra por curation_id."""
    erro = (
        db.query(ErroTecnico)
        .filter(ErroTecnico.id == erro_id, ErroTecnico.curation_id == curation_id)
        .first()
    )
    if not erro:
        raise HTTPException(
            status_code=404,
            detail=f"Erro tecnico {erro_id} nao encontrado na ficha {curation_id}.",
        )
    return erro


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/erros-tecnicos  -> cria um erro tecnico
# ---------------------------------------------------------------------
@router.post("/{curation_id}/erros-tecnicos", response_model=ErroTecnicoOut)
def criar_erro_tecnico(
    curation_id: int,
    dados: ErroTecnicoCreate,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_ESCRITA)),
    db: Session = Depends(get_db),
):
    """Cria um erro tecnico (0..N por ficha), independente de Achado."""
    ficha = _buscar_ficha(db, curation_id, usuario, escrita=True)
    _exigir_ficha_editavel(ficha)
    exigir_erro_compativel(dados.tipo.value, ficha.tipo_radiografia)
    exigir_erro_nao_repetido(db, ficha.id, dados.tipo.value)

    erro = ErroTecnico(
        curation_id=curation_id,
        tipo=dados.tipo.value,
        descricao=dados.descricao,
    )
    db.add(erro)
    db.flush()

    _registrar_historico(
        db, ficha.id, usuario.id, "erro_tecnico_criado",
        ficha.status, ficha.status, f"Erro tecnico {erro.id} ({erro.tipo}) criado.",
    )
    _registrar_auditoria(
        db, usuario.id, "criacao_erro_tecnico", erro.id, "sucesso",
        f"Erro tecnico {erro.id} criado na ficha {ficha.id} por usuario {usuario.id}.",
        entidade="erro_tecnico",
    )
    db.commit()
    db.refresh(erro)
    return erro


# ---------------------------------------------------------------------
# GET /curation/{curation_id}/erros-tecnicos  -> lista os erros da ficha
# ---------------------------------------------------------------------
@router.get("/{curation_id}/erros-tecnicos", response_model=List[ErroTecnicoOut])
def listar_erros_tecnicos(
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
    db: Session = Depends(get_db),
):
    _buscar_ficha(db, curation_id, usuario, escrita=False)
    return (
        db.query(ErroTecnico)
        .filter(ErroTecnico.curation_id == curation_id)
        .order_by(ErroTecnico.id)
        .all()
    )


# ---------------------------------------------------------------------
# GET /curation/{curation_id}/erros-tecnicos/{erro_id}
# ---------------------------------------------------------------------
@router.get("/{curation_id}/erros-tecnicos/{erro_id}", response_model=ErroTecnicoOut)
def obter_erro_tecnico(
    curation_id: int,
    erro_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
    db: Session = Depends(get_db),
):
    _buscar_ficha(db, curation_id, usuario, escrita=False)
    return _buscar_erro_tecnico(db, curation_id, erro_id)


# ---------------------------------------------------------------------
# PATCH /curation/{curation_id}/erros-tecnicos/{erro_id}
# ---------------------------------------------------------------------
@router.patch("/{curation_id}/erros-tecnicos/{erro_id}", response_model=ErroTecnicoOut)
def atualizar_erro_tecnico(
    curation_id: int,
    erro_id: int,
    dados: ErroTecnicoUpdate,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_ESCRITA)),
    db: Session = Depends(get_db),
):
    ficha = _buscar_ficha(db, curation_id, usuario, escrita=True)
    _exigir_ficha_editavel(ficha)
    erro = _buscar_erro_tecnico(db, curation_id, erro_id)

    if dados.tipo is not None:
        exigir_erro_compativel(dados.tipo.value, ficha.tipo_radiografia)
        exigir_erro_nao_repetido(db, ficha.id, dados.tipo.value, exceto_id=erro.id)
        erro.tipo = dados.tipo.value
    if dados.descricao is not None:
        erro.descricao = dados.descricao

    _registrar_historico(
        db, ficha.id, usuario.id, "erro_tecnico_editado",
        ficha.status, ficha.status, f"Erro tecnico {erro.id} editado.",
    )
    _registrar_auditoria(
        db, usuario.id, "edicao_erro_tecnico", erro.id, "sucesso",
        f"Erro tecnico {erro.id} da ficha {ficha.id} editado por usuario {usuario.id}.",
        entidade="erro_tecnico",
    )
    db.commit()
    db.refresh(erro)
    return erro


# ---------------------------------------------------------------------
# DELETE /curation/{curation_id}/erros-tecnicos/{erro_id}
# ---------------------------------------------------------------------
@router.delete("/{curation_id}/erros-tecnicos/{erro_id}", status_code=204)
def excluir_erro_tecnico(
    curation_id: int,
    erro_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_ESCRITA)),
    db: Session = Depends(get_db),
):
    ficha = _buscar_ficha(db, curation_id, usuario, escrita=True)
    _exigir_ficha_editavel(ficha)
    erro = _buscar_erro_tecnico(db, curation_id, erro_id)

    erro_id_excluido, tipo_excluido = erro.id, erro.tipo
    db.delete(erro)

    _registrar_historico(
        db, ficha.id, usuario.id, "erro_tecnico_excluido",
        ficha.status, ficha.status, f"Erro tecnico {erro_id_excluido} ({tipo_excluido}) excluido.",
    )
    _registrar_auditoria(
        db, usuario.id, "exclusao_erro_tecnico", erro_id_excluido, "sucesso",
        f"Erro tecnico {erro_id_excluido} da ficha {ficha.id} excluido por usuario {usuario.id}.",
        entidade="erro_tecnico",
    )
    db.commit()
    return None
