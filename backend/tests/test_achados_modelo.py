"""
Testes de modelo da Fase 1 (classificacao odontologica estruturada).

Validam exclusivamente o MODELO DE DADOS (tabelas `achados` e
`erros_tecnicos`, relacoes com `curations`) via SQLAlchemy direto - nao ha
endpoint de API pra essas tabelas ainda (ver achados.py). Cada teste cria
e remove seus proprios registros (mesmo padrao de conftest.py); nenhum
teste depende de estado de outro teste.

`criar_ficha` (conftest.py) cria a Curation/OrthancReference de teste e as
remove no seu proprio teardown - por isso cada teste aqui remove os
Achado/ErroTecnico que criou ANTES do fim do teste (nao no teardown da
fixture), pra nao violar a foreign key (curations so pode ser removida
depois que os achados/erros_tecnicos que apontam pra ela ja sumiram - mesmo
motivo de criar_ficha ja remover CurationHistory/CurationReview antes de
remover a Curation).
"""

from app.modules.achados import Achado, ErroTecnico, TipoAchado, RegiaoAnatomica, TipoErroTecnico


def _limpar_achados(db, curation_id):
    db.query(Achado).filter(Achado.curation_id == curation_id).delete()
    db.query(ErroTecnico).filter(ErroTecnico.curation_id == curation_id).delete()
    db.commit()


def test_ficha_sem_achado(db, criar_ficha):
    """Teste 1: uma ficha sem nenhum Achado deve funcionar normalmente."""
    ficha = criar_ficha()
    achados = db.query(Achado).filter(Achado.curation_id == ficha.id).all()
    assert achados == []


def test_ficha_com_um_achado(db, criar_ficha):
    """Teste 2: ficha com um unico Achado."""
    ficha = criar_ficha()
    achado = Achado(
        curation_id=ficha.id,
        tipo=TipoAchado.CARIE_DENTINA.value,
        regiao_anatomica=RegiaoAnatomica.COROA.value,
        dentes=[46],
    )
    db.add(achado)
    db.commit()
    db.refresh(achado)

    encontrados = db.query(Achado).filter(Achado.curation_id == ficha.id).all()
    assert len(encontrados) == 1
    assert encontrados[0].tipo == "carie_dentina"
    assert encontrados[0].dentes == [46]

    _limpar_achados(db, ficha.id)


def test_ficha_com_tres_achados(db, criar_ficha):
    """Teste 3: ficha com tres Achados independentes."""
    ficha = criar_ficha()
    tipos = [TipoAchado.CARIE_DENTINA, TipoAchado.PERDA_OSSEA_HORIZONTAL, TipoAchado.CISTO]
    for tipo in tipos:
        db.add(Achado(curation_id=ficha.id, tipo=tipo.value))
    db.commit()

    encontrados = db.query(Achado).filter(Achado.curation_id == ficha.id).all()
    assert len(encontrados) == 3
    assert {a.tipo for a in encontrados} == {t.value for t in tipos}

    _limpar_achados(db, ficha.id)


def test_achado_relacionado_a_varios_dentes(db, criar_ficha):
    """
    Teste 4: um UNICO achado relacionado a 45, 46 e 47 - nao deve virar
    tres achados (regra obrigatoria da especificacao consolidada).
    """
    ficha = criar_ficha()
    achado = Achado(
        curation_id=ficha.id,
        tipo=TipoAchado.PERDA_OSSEA_HORIZONTAL.value,
        regiao_anatomica=RegiaoAnatomica.PERIODONTO.value,
        dentes=[45, 46, 47],
    )
    db.add(achado)
    db.commit()

    encontrados = db.query(Achado).filter(Achado.curation_id == ficha.id).all()
    assert len(encontrados) == 1
    assert sorted(encontrados[0].dentes) == [45, 46, 47]

    _limpar_achados(db, ficha.id)


def test_dois_achados_mesmo_dente(db, criar_ficha):
    """
    Teste 5: o mesmo dente (46) com dois achados diferentes - carie +
    tratamento endodontico, cada um seu proprio registro.
    """
    ficha = criar_ficha()
    db.add(Achado(curation_id=ficha.id, tipo=TipoAchado.CARIE_DENTINA.value, dentes=[46]))
    db.add(Achado(curation_id=ficha.id, tipo=TipoAchado.TRATAMENTO_ENDODONTICO_PRESENTE.value, dentes=[46]))
    db.commit()

    encontrados = db.query(Achado).filter(Achado.curation_id == ficha.id).all()
    assert len(encontrados) == 2
    assert all(a.dentes == [46] for a in encontrados)
    assert {a.tipo for a in encontrados} == {"carie_dentina", "tratamento_endodontico_presente"}

    _limpar_achados(db, ficha.id)


def test_achado_sem_dente(db, criar_ficha):
    """Teste 6: achado geral, sem dente especifico (ex.: alteracao de seio maxilar)."""
    ficha = criar_ficha()
    achado = Achado(
        curation_id=ficha.id,
        tipo=TipoAchado.ALTERACAO_SEIO_MAXILAR.value,
        regiao_anatomica=RegiaoAnatomica.SEIO_MAXILAR.value,
        dentes=None,
    )
    db.add(achado)
    db.commit()
    db.refresh(achado)

    assert achado.dentes is None

    _limpar_achados(db, ficha.id)


def test_achado_outro_com_descricao(db, criar_ficha):
    """Teste 7: tipo = Outro, com descricao preservada integralmente."""
    ficha = criar_ficha()
    achado = Achado(
        curation_id=ficha.id,
        tipo=TipoAchado.OUTRO.value,
        descricao="Taurodontismo",
    )
    db.add(achado)
    db.commit()
    db.refresh(achado)

    assert achado.tipo == "outro"
    assert achado.descricao == "Taurodontismo"

    _limpar_achados(db, ficha.id)


def test_achado_com_varias_marcacoes(db, criar_ficha):
    """Teste 8: achado com mais de uma marcacao espacial (JSONB)."""
    ficha = criar_ficha()
    marcacoes = [
        {"id": "a1", "tipo": "oval", "x": 0.1, "y": 0.1, "largura": 0.05, "altura": 0.05},
        {"id": "a2", "tipo": "retangulo", "x": 0.5, "y": 0.5, "largura": 0.1, "altura": 0.1},
    ]
    achado = Achado(curation_id=ficha.id, tipo=TipoAchado.CARIE_DENTINA.value, marcacoes=marcacoes)
    db.add(achado)
    db.commit()
    db.refresh(achado)

    assert len(achado.marcacoes) == 2
    assert achado.marcacoes[0]["tipo"] == "oval"
    assert achado.marcacoes[1]["tipo"] == "retangulo"

    _limpar_achados(db, ficha.id)


def test_erro_tecnico_independente_de_achado(db, criar_ficha):
    """
    Teste 9: erro tecnico existe como dimensao independente - uma ficha
    pode ter erro tecnico sem nenhum achado odontologico, e vice-versa.
    """
    ficha = criar_ficha()
    db.add(Achado(curation_id=ficha.id, tipo=TipoAchado.CARIE_DENTINA.value))
    db.add(ErroTecnico(
        curation_id=ficha.id,
        tipo=TipoErroTecnico.MOVIMENTO.value,
        descricao="Movimento durante a exposicao.",
    ))
    db.commit()

    achados = db.query(Achado).filter(Achado.curation_id == ficha.id).all()
    erros = db.query(ErroTecnico).filter(ErroTecnico.curation_id == ficha.id).all()
    assert len(achados) == 1
    assert len(erros) == 1
    assert erros[0].tipo == "movimento"
    # Confirma que erro tecnico NAO reaproveita o vocabulario de TipoAchado
    # (sao enums/tabelas diferentes de proposito).
    assert erros[0].tipo not in {t.value for t in TipoAchado}

    _limpar_achados(db, ficha.id)


def test_dados_antigos_continuam_acessiveis(db, criar_ficha):
    """
    Teste 10 (regressao): os campos legados de classificacao continuam
    existindo, graváveis e legiveis normalmente - a Fase 1 nao alterou
    achado_principal/alteracoes_observadas/achados_detalhe/marcacoes/dentes.
    """
    ficha = criar_ficha(tipo_radiografia="periapical")
    ficha.dentes = [45, 46, 47]
    ficha.achados_detalhe = "Observacao legada preservada"
    ficha.alteracoes_observadas = ["carie_dentina"]
    ficha.marcacoes = [{"id": "m1", "tipo": "oval", "x": 0.2, "y": 0.2, "largura": 0.05, "altura": 0.05}]
    db.add(ficha)
    db.commit()
    db.refresh(ficha)

    assert ficha.dentes == [45, 46, 47]
    assert ficha.achados_detalhe == "Observacao legada preservada"
    assert ficha.alteracoes_observadas == ["carie_dentina"]
    assert len(ficha.marcacoes) == 1
    # achado_principal continua existindo e aceitando escrita (mesmo sem
    # nenhum caminho do frontend enviar isso hoje - ver especificacao).
    ficha.achado_principal = "normal"
    db.add(ficha)
    db.commit()
    db.refresh(ficha)
    assert ficha.achado_principal == "normal"

    # Relacionamento novo (Curation.achados) nao quebra o acesso aos
    # campos antigos nem exige nenhum Achado associado.
    assert ficha.achados == []
    assert ficha.erros_tecnicos == []
