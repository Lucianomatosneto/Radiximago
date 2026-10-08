"""
Endpoints de Achados odontologicos estruturados (Fase 2), vinculados a uma
ficha de curadoria. Modelo ORM/enums em app/modules/achados.py (Fase 1,
aprovada, nao alterada por este arquivo).

Um Achado so existe dentro do ciclo de vida de uma ficha - por isso todas
as rotas sao aninhadas sob /curation/{curation_id}/achados, mesmo padrao
ja usado por /curation/{curation_id}/reviews. Autorizacao identica ao
resto do modulo de curadoria (PERFIS_CURADORIA) - nao existe politica
paralela nem restricao adicional por "dono" da ficha (a Curadoria atual
tambem nao tem essa restricao: qualquer administrador/suporte/curador edita
qualquer ficha).

Criar/editar/excluir um Achado so e permitido enquanto a ficha ainda esta
em status editavel (STATUS_EDITAVEIS) - mesma regra ja aplicada a
PATCH /curation/{curation_id} para os campos legados da propria ficha.
Consultar (GET) funciona independente do status, mesmo padrao de
GET /curation/{curation_id}.
"""

from typing import List

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth import exigir_perfis, PERFIS_CURADORIA
from app.modules.users import User
from app.modules.curations import DENTES_PERMANENTES
from app.modules.achados import Achado, TipoAchado

from .common import STATUS_EDITAVEIS, _buscar_ficha, _registrar_auditoria, _registrar_historico
from .router import router
from .schemas import AchadoCreate, AchadoUpdate, AchadoOut


def _normalizar_dentes(dentes: List[int] | None, dente_nao_identificado: bool) -> List[int]:
    """
    Valida os numeros FDI (mesma lista DENTES_PERMANENTES ja usada para
    Curation.dentes) e normaliza duplicatas por dedupe + ordenacao - nao
    rejeita, seguindo o mesmo padrao tolerante do frontend atual
    (PainelDadosSobrepostos.tsx.adicionarDente ja ignora silenciosamente
    uma tentativa de adicionar um dente ja presente, em vez de erro).

    dente_nao_identificado=True exige lista de dentes vazia - as duas
    informacoes juntas seriam contraditorias (o curador afirma nao saber
    identificar o dente E informa numeros especificos ao mesmo tempo).
    Decisao registrada no relatorio da Fase 2.
    """
    lista = dentes or []

    if dente_nao_identificado and lista:
        raise HTTPException(
            status_code=422,
            detail="Um achado com dente_nao_identificado=true nao pode informar dentes.",
        )

    invalidos = [d for d in lista if d not in DENTES_PERMANENTES]
    if invalidos:
        raise HTTPException(
            status_code=422,
            detail=f"Dentes invalidos (use apenas 11-48, notacao FDI): {invalidos}",
        )

    return sorted(set(lista))


def _validar_outros(tipo: str, descricao: str | None) -> None:
    """
    tipo='outro' exige descricao preenchida (nao vazia, nao so espacos) -
    regra aprovada na Fase 4 (antes era so recomendado no frontend, sem
    reforco no backend). 422 se violada - nunca confiar so na validacao
    do frontend.
    """
    if tipo == TipoAchado.OUTRO.value and not (descricao or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Descreva o achado selecionado como Outros.",
        )


def _exigir_ficha_editavel(ficha) -> None:
    if ficha.status not in STATUS_EDITAVEIS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A ficha {ficha.id} esta '{ficha.status}' (ja finalizada ou em "
                f"revisao) e seus achados nao podem mais ser alterados."
            ),
        )


def _buscar_achado(db: Session, curation_id: int, achado_id: int) -> Achado:
    """
    Busca o achado JA FILTRANDO por curation_id (nao so por achado_id) -
    protecao contra IDOR: um achado_id valido de OUTRA ficha nunca "vaza"
    aqui, mesmo que o usuario tenha acesso a alguma ficha (a rota exige o
    curation_id no path e o achado precisa pertencer a ELE especificamente).
    """
    achado = (
        db.query(Achado)
        .filter(Achado.id == achado_id, Achado.curation_id == curation_id)
        .first()
    )
    if not achado:
        raise HTTPException(
            status_code=404,
            detail=f"Achado {achado_id} nao encontrado na ficha {curation_id}.",
        )
    return achado


def _marcacoes_para_dict(marcacoes) -> list:
    return [m.model_dump(mode="json") for m in marcacoes] if marcacoes is not None else []


# ---------------------------------------------------------------------
# POST /curation/{curation_id}/achados  -> cria um achado
# ---------------------------------------------------------------------
@router.post("/{curation_id}/achados", response_model=AchadoOut)
def criar_achado(
    curation_id: int,
    dados: AchadoCreate,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Cria um achado (0..N por ficha) vinculado a uma ficha de curadoria."""
    ficha = _buscar_ficha(db, curation_id)
    _exigir_ficha_editavel(ficha)

    dentes_normalizados = _normalizar_dentes(dados.dentes, dados.dente_nao_identificado)
    _validar_outros(dados.tipo.value, dados.descricao)

    achado = Achado(
        curation_id=curation_id,
        tipo=dados.tipo.value,
        regiao_anatomica=dados.regiao_anatomica.value if dados.regiao_anatomica else None,
        dentes=dentes_normalizados,
        dente_nao_identificado=dados.dente_nao_identificado,
        descricao=dados.descricao,
        marcacoes=_marcacoes_para_dict(dados.marcacoes),
    )
    db.add(achado)
    db.flush()  # garante achado.id antes de referencia-lo no historico/auditoria

    _registrar_historico(
        db, ficha.id, usuario.id, "achado_criado",
        ficha.status, ficha.status, f"Achado {achado.id} ({achado.tipo}) criado.",
    )
    _registrar_auditoria(
        db, usuario.id, "criacao_achado", achado.id, "sucesso",
        f"Achado {achado.id} criado na ficha {ficha.id} por usuario {usuario.id}.",
        entidade="achado",
    )
    db.commit()
    db.refresh(achado)
    return achado


# ---------------------------------------------------------------------
# GET /curation/{curation_id}/achados  -> lista os achados da ficha
# ---------------------------------------------------------------------
@router.get("/{curation_id}/achados", response_model=List[AchadoOut])
def listar_achados(
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Lista todos os achados de uma ficha (qualquer status - so leitura)."""
    _buscar_ficha(db, curation_id)
    return (
        db.query(Achado)
        .filter(Achado.curation_id == curation_id)
        .order_by(Achado.id)
        .all()
    )


# ---------------------------------------------------------------------
# GET /curation/{curation_id}/achados/{achado_id}  -> um achado especifico
# ---------------------------------------------------------------------
@router.get("/{curation_id}/achados/{achado_id}", response_model=AchadoOut)
def obter_achado(
    curation_id: int,
    achado_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    _buscar_ficha(db, curation_id)
    return _buscar_achado(db, curation_id, achado_id)


# ---------------------------------------------------------------------
# PATCH /curation/{curation_id}/achados/{achado_id}  -> atualizacao parcial
# ---------------------------------------------------------------------
@router.patch("/{curation_id}/achados/{achado_id}", response_model=AchadoOut)
def atualizar_achado(
    curation_id: int,
    achado_id: int,
    dados: AchadoUpdate,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    ficha = _buscar_ficha(db, curation_id)
    _exigir_ficha_editavel(ficha)
    achado = _buscar_achado(db, curation_id, achado_id)

    # dente_nao_identificado/dentes sao validados JUNTOS mesmo em update
    # parcial - usa o valor ja enviado ou, se nao enviado, o valor atual do
    # registro, pra nao permitir um estado inconsistente via edicao parcial
    # (ex.: so mandar dentes=[45] numa ficha que ja tinha
    # dente_nao_identificado=true).
    dente_nao_identificado_final = (
        dados.dente_nao_identificado
        if dados.dente_nao_identificado is not None
        else achado.dente_nao_identificado
    )
    dentes_final = dados.dentes if dados.dentes is not None else achado.dentes
    dentes_normalizados = _normalizar_dentes(dentes_final, dente_nao_identificado_final)

    # Mesmo raciocinio do dente_nao_identificado acima: valida o par
    # tipo/descricao FINAL (apos o merge), nao so o que veio nesta
    # requisicao - evita que uma edicao parcial deixe um achado tipo=outro
    # sem descricao (ex.: alguem muda so a regiao de um achado que ja era
    # "outro" com descricao vazia herdada de antes desta regra existir).
    tipo_final = dados.tipo.value if dados.tipo is not None else achado.tipo
    descricao_final = dados.descricao if dados.descricao is not None else achado.descricao
    _validar_outros(tipo_final, descricao_final)

    if dados.tipo is not None:
        achado.tipo = dados.tipo.value
    if dados.regiao_anatomica is not None:
        achado.regiao_anatomica = dados.regiao_anatomica.value
    if dados.dentes is not None or dados.dente_nao_identificado is not None:
        achado.dentes = dentes_normalizados
        achado.dente_nao_identificado = dente_nao_identificado_final
    if dados.descricao is not None:
        achado.descricao = dados.descricao
    if dados.marcacoes is not None:
        achado.marcacoes = _marcacoes_para_dict(dados.marcacoes)

    _registrar_historico(
        db, ficha.id, usuario.id, "achado_editado",
        ficha.status, ficha.status, f"Achado {achado.id} editado.",
    )
    _registrar_auditoria(
        db, usuario.id, "edicao_achado", achado.id, "sucesso",
        f"Achado {achado.id} da ficha {ficha.id} editado por usuario {usuario.id}.",
        entidade="achado",
    )
    db.commit()
    db.refresh(achado)
    return achado


# ---------------------------------------------------------------------
# DELETE /curation/{curation_id}/achados/{achado_id}  -> exclui o achado
# ---------------------------------------------------------------------
@router.delete("/{curation_id}/achados/{achado_id}", status_code=204)
def excluir_achado(
    curation_id: int,
    achado_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    ficha = _buscar_ficha(db, curation_id)
    _exigir_ficha_editavel(ficha)
    achado = _buscar_achado(db, curation_id, achado_id)

    achado_id_excluido, tipo_excluido = achado.id, achado.tipo
    db.delete(achado)

    _registrar_historico(
        db, ficha.id, usuario.id, "achado_excluido",
        ficha.status, ficha.status, f"Achado {achado_id_excluido} ({tipo_excluido}) excluido.",
    )
    _registrar_auditoria(
        db, usuario.id, "exclusao_achado", achado_id_excluido, "sucesso",
        f"Achado {achado_id_excluido} da ficha {ficha.id} excluido por usuario {usuario.id}.",
        entidade="achado",
    )
    db.commit()
    return None
