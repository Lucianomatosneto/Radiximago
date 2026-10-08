"""
Testes da Busca Avancada odontologica estruturada (Fase 4) - dente unico,
multiplos dentes (ANY/ALL), quadrante, achado (legado + estruturado),
achado+dente, achado+regiao, erro tecnico, filtros combinados, regressao
dos filtros ja existentes, e a regra de resultado unico (sem duplicacao).

`criar_ficha()` (conftest.py) ja cria com status=APROVADA por padrao - e
exatamente o que GET /search exige (regra de ouro), entao a maioria dos
testes aqui usa o default sem passar `status=`. Achados/erros tecnicos sao
criados via ORM direto (nao pela API), que so aceita escrita em fichas
'pendente'/'em_analise' - mais simples pra setup de teste marcar a ficha
como aprovada so DEPOIS de montar o achado.
"""

from app.modules.achados import Achado, ErroTecnico
from app.modules.curations import Curation
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _curador_autenticado(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    return cabecalho_auth(token)


def _limpar_achados(db, curation_id):
    db.query(Achado).filter(Achado.curation_id == curation_id).delete()
    db.query(ErroTecnico).filter(ErroTecnico.curation_id == curation_id).delete()
    db.commit()


def _definir_dentes(db, ficha, dentes):
    ficha.dentes = dentes
    db.add(ficha)
    db.commit()


def _ids_encontrados(resposta_json):
    return {item["curation_id"] for item in resposta_json["itens"]}


# TESTE 1: busca somente por dente 46 -> ficha 45,46,47 encontrada
def test_busca_por_um_dente(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    _definir_dentes(db, ficha, [45, 46, 47])

    resposta = client.get("/search", headers=headers, params={"dente": 46})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 2: ANY 45,46,47 -> ficha so com 45 e encontrada
def test_busca_any_encontra_com_um_dos_dentes(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    _definir_dentes(db, ficha, [45])

    resposta = client.get("/search", headers=headers, params={"dentes": [45, 46, 47], "modo_dentes": "qualquer_um"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 3: ANY 45,46,47 -> ficha so com 48 NAO e encontrada
def test_busca_any_nao_encontra_sem_nenhum_dos_dentes(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    _definir_dentes(db, ficha, [48])

    resposta = client.get("/search", headers=headers, params={"dentes": [45, 46, 47], "modo_dentes": "qualquer_um"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id not in _ids_encontrados(resposta.json())


# TESTE 4: ALL 45,46,47 -> ficha com exatamente 45,46,47 e encontrada
def test_busca_all_encontra_com_todos_os_dentes(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    _definir_dentes(db, ficha, [45, 46, 47])

    resposta = client.get("/search", headers=headers, params={"dentes": [45, 46, 47], "modo_dentes": "todos"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 5: ALL 45,46,47 -> ficha so com 45,46 (falta o 47) NAO e encontrada
def test_busca_all_nao_encontra_com_dente_faltando(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    _definir_dentes(db, ficha, [45, 46])

    resposta = client.get("/search", headers=headers, params={"dentes": [45, 46, 47], "modo_dentes": "todos"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id not in _ids_encontrados(resposta.json())


# TESTE 6: Quadrante 4 -> ficha com 45,46 (dentro do Q4) e encontrada
def test_busca_por_quadrante_encontra(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    _definir_dentes(db, ficha, [45, 46])

    resposta = client.get("/search", headers=headers, params={"quadrante": 4})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 7: Quadrante 4 -> ficha com 35,36 (fora do Q4) NAO e encontrada
def test_busca_por_quadrante_nao_encontra_fora_do_quadrante(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    _definir_dentes(db, ficha, [35, 36])

    resposta = client.get("/search", headers=headers, params={"quadrante": 4})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id not in _ids_encontrados(resposta.json())


# TESTE 8: achado simples LEGADO -> encontrada
def test_busca_achado_legado(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    ficha.alteracoes_observadas = ["carie_dentina"]
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"achado": "carie_dentina"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 9: achado simples ESTRUTURADO -> encontrada
def test_busca_achado_estruturado(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise")
    db.add(Achado(curation_id=ficha.id, tipo="carie_dentina"))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"achado": "carie_dentina"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())

    _limpar_achados(db, ficha.id)


# TESTE 10: achado LEGADO + ESTRUTURADO na mesma ficha -> resultado UMA unica vez
def test_busca_achado_legado_e_estruturado_sem_duplicar(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise")
    ficha.alteracoes_observadas = ["carie_dentina"]
    db.add(Achado(curation_id=ficha.id, tipo="carie_dentina"))
    db.add(Achado(curation_id=ficha.id, tipo="carie_dentina"))  # 2 achados estruturados do MESMO tipo, de proposito
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"achado": "carie_dentina"})

    assert resposta.status_code == 200, resposta.text
    itens_desta_ficha = [i for i in resposta.json()["itens"] if i["curation_id"] == ficha.id]
    assert len(itens_desta_ficha) == 1, "a ficha nao pode aparecer mais de uma vez no resultado"

    _limpar_achados(db, ficha.id)


# TESTE 11: achado + dente CORRETO (mesmo registro de Achado) -> encontrada
def test_busca_achado_mais_dente_correto(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise")
    _definir_dentes(db, ficha, [45, 46, 47])
    db.add(Achado(curation_id=ficha.id, tipo="lesao_periapical", dentes=[46]))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"achado": "lesao_periapical", "dentes": [46]})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())

    _limpar_achados(db, ficha.id)


# TESTE 12: achado + dente INCORRETO (dente da ficha, mas nao do achado) -> NAO encontrada
def test_busca_achado_mais_dente_incorreto_nao_encontra(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise")
    _definir_dentes(db, ficha, [45, 46, 47])
    db.add(Achado(curation_id=ficha.id, tipo="lesao_periapical", dentes=[46]))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"achado": "lesao_periapical", "dentes": [45]})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id not in _ids_encontrados(resposta.json())

    _limpar_achados(db, ficha.id)


# TESTE ADICIONAL OBRIGATORIO (secao 4 do pedido - "exemplo critico"):
# Curation.dentes=[36,46], Achado(lesao_periapical, dentes=[36]).
# Busca dente=46 + achado=lesao_periapical -> NAO ENCONTRAR (o 46 esta na
# ficha, mas nao esta associado a ESTE achado - so o 36 esta).
def test_exemplo_critico_dente_da_ficha_mas_nao_do_achado(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise")
    _definir_dentes(db, ficha, [36, 46])
    db.add(Achado(curation_id=ficha.id, tipo="lesao_periapical", dentes=[36]))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"achado": "lesao_periapical", "dentes": [46]})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id not in _ids_encontrados(resposta.json()), (
        "falso positivo: o 46 pertence a ficha mas nao ao achado - nao deveria encontrar"
    )

    _limpar_achados(db, ficha.id)


# TESTE 13: achado + regiao -> so corresponde ao estruturado (legado nao tem regiao)
def test_busca_achado_mais_regiao_so_estruturado(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)

    # Ficha A: achado estruturado com tipo E regiao corretos -> deve encontrar.
    ficha_a = criar_ficha(status="em_analise")
    db.add(Achado(curation_id=ficha_a.id, tipo="lesao_periapical", regiao_anatomica="regiao_periapical"))
    ficha_a.status = "aprovada"
    db.add(ficha_a)

    # Ficha B: achado LEGADO com o mesmo tipo (mas o legado nao tem
    # regiao) -> NAO deve encontrar (a combinacao achado+regiao exige
    # estruturado).
    ficha_b = criar_ficha(status="em_analise")
    ficha_b.alteracoes_observadas = ["lesao_periapical"]
    ficha_b.status = "aprovada"
    db.add(ficha_b)
    db.commit()

    resposta = client.get(
        "/search", headers=headers,
        params={"achado": "lesao_periapical", "regiao_anatomica": "regiao_periapical"},
    )

    assert resposta.status_code == 200, resposta.text
    encontrados = _ids_encontrados(resposta.json())
    assert ficha_a.id in encontrados
    assert ficha_b.id not in encontrados

    _limpar_achados(db, ficha_a.id)
    _limpar_achados(db, ficha_b.id)


# TESTE 14: erro tecnico -> encontrada
def test_busca_erro_tecnico(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise")
    db.add(ErroTecnico(curation_id=ficha.id, tipo="movimento"))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"erro_tecnico": "movimento"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())

    _limpar_achados(db, ficha.id)


# TESTE 15: erro tecnico + tipo de exame -> AND aplicado (nao bate se o tipo de exame for outro)
def test_busca_erro_tecnico_mais_tipo_exame_aplica_and(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise", tipo_radiografia="panoramica")
    db.add(ErroTecnico(curation_id=ficha.id, tipo="movimento"))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta_bate = client.get(
        "/search", headers=headers, params={"erro_tecnico": "movimento", "tipo_radiografia": "panoramica"}
    )
    resposta_nao_bate = client.get(
        "/search", headers=headers, params={"erro_tecnico": "movimento", "tipo_radiografia": "periapical"}
    )

    assert ficha.id in _ids_encontrados(resposta_bate.json())
    assert ficha.id not in _ids_encontrados(resposta_nao_bate.json())

    _limpar_achados(db, ficha.id)


# TESTE 16: faixa etaria sozinha continua funcionando
def test_busca_faixa_etaria_sozinha(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    ficha.idade_min, ficha.idade_max = 20, 30
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"idade_min": 25})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 17: tipo de exame sozinho continua funcionando
def test_busca_tipo_exame_sozinho(client, criar_usuario, criar_ficha):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(tipo_radiografia="oclusal")

    resposta = client.get("/search", headers=headers, params={"tipo_radiografia": "oclusal"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 18: origem sozinha continua funcionando
def test_busca_origem_sozinha(client, criar_usuario, criar_ficha, db):
    from app.modules.orthanc_references import OrthancReference
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()
    ref = db.query(OrthancReference).filter(OrthancReference.id == ficha.orthanc_reference_id).first()
    ref.origem = "ufsc"
    db.add(ref)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"origem": "ufsc"})

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())


# TESTE 19: todos os filtros combinados -> resultado correto
def test_busca_todos_os_filtros_combinados(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise", tipo_radiografia="periapical")
    _definir_dentes(db, ficha, [45, 46, 47])
    ficha.idade_min, ficha.idade_max = 20, 40
    db.add(Achado(curation_id=ficha.id, tipo="lesao_periapical", regiao_anatomica="regiao_periapical", dentes=[45, 46, 47]))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get(
        "/search", headers=headers,
        params={
            "tipo_radiografia": "periapical",
            "quadrante": 4,
            "dentes": [45, 46, 47],
            "modo_dentes": "todos",
            "achado": "lesao_periapical",
            "regiao_anatomica": "regiao_periapical",
            "idade_min": 20,
            "idade_max": 40,
        },
    )

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json())

    _limpar_achados(db, ficha.id)


# TESTE 20: nenhum filtro -> comportamento atual preservado (nao quebra, devolve algo)
def test_busca_sem_filtros_preserva_comportamento(client, criar_usuario, criar_ficha):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha()

    resposta = client.get("/search", headers=headers)

    assert resposta.status_code == 200, resposta.text
    assert ficha.id in _ids_encontrados(resposta.json()) or resposta.json()["total"] >= 1


# TESTE 21: FDI invalido em 'dentes' -> rejeitar
def test_busca_fdi_invalido_e_rejeitado(client, criar_usuario, criar_ficha):
    headers = _curador_autenticado(client, criar_usuario)
    criar_ficha()

    resposta = client.get("/search", headers=headers, params={"dentes": [99]})

    assert resposta.status_code == 422


# TESTE 22: modo_dentes invalido -> rejeitar
def test_busca_modo_dentes_invalido_e_rejeitado(client, criar_usuario, criar_ficha):
    headers = _curador_autenticado(client, criar_usuario)
    criar_ficha()

    resposta = client.get("/search", headers=headers, params={"dentes": [46], "modo_dentes": "qualquercoisa"})

    assert resposta.status_code == 422


# TESTE 23: contagem sem duplicacao - ficha com 3 achados do mesmo tipo aparece 1x no total/itens
def test_busca_contagem_sem_duplicacao(client, criar_usuario, criar_ficha, db):
    headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status="em_analise")
    for _ in range(3):
        db.add(Achado(curation_id=ficha.id, tipo="cisto"))
    ficha.status = "aprovada"
    db.add(ficha)
    db.commit()

    resposta = client.get("/search", headers=headers, params={"achado": "cisto"})

    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()
    ocorrencias = [i for i in dados["itens"] if i["curation_id"] == ficha.id]
    assert len(ocorrencias) == 1, "a ficha com 3 achados do mesmo tipo nao pode aparecer 3x no resultado"

    _limpar_achados(db, ficha.id)
