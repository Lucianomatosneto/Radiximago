"""
Testes da API de Achados/Erros Tecnicos (Fase 2) - endpoints reais via
TestClient, autenticacao/autorizacao, validacoes de dominio e protecao
contra IDOR. Complementa test_achados_modelo.py (Fase 1, que valida so o
modelo ORM direto, sem passar pela API).

Cada teste cria seus proprios usuario/referencia/ficha e limpa depois
(achados/erros_tecnicos antes da ficha, pela mesma razao de FK explicada
em test_achados_modelo.py).
"""

from app.modules.achados import Achado, ErroTecnico
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _limpar(db, curation_id):
    db.query(Achado).filter(Achado.curation_id == curation_id).delete()
    db.query(ErroTecnico).filter(ErroTecnico.curation_id == curation_id).delete()
    db.commit()


def _curador_autenticado(client, criar_usuario):
    usuario = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, usuario.email)
    return usuario, cabecalho_auth(token)


def _ficha_editavel(criar_ficha):
    """
    criar_ficha() (conftest.py) tem status default APROVADA - achados so
    podem ser criados/editados enquanto a ficha esta pendente/em_analise
    (mesma regra ja aplicada a PATCH /curation/{id}), entao os testes que
    esperam sucesso precisam de uma ficha explicitamente em_analise.
    """
    return criar_ficha(status=StatusCuradoria.EM_ANALISE.value)


# TESTE 1: criar achado tipo=Carie, dente=46 -> sucesso
def test_criar_achado_carie_um_dente(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={"tipo": "carie_dentina", "dentes": [46]},
    )

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["tipo"] == "carie_dentina"
    assert corpo["dentes"] == [46]
    assert corpo["curation_id"] == ficha.id

    _limpar(db, ficha.id)


# TESTE 2: criar achado "Perda ossea" com dentes=[45,46,47] -> sucesso, UM achado so
def test_criar_achado_varios_dentes(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={"tipo": "perda_ossea_horizontal", "dentes": [47, 45, 46]},
    )

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["dentes"] == [45, 46, 47]  # normalizado/ordenado

    listagem = client.get(f"/curation/{ficha.id}/achados", headers=headers)
    assert len(listagem.json()) == 1

    _limpar(db, ficha.id)


# TESTE 3: criar dois achados relacionados ao 46 -> sucesso, independentes
def test_dois_achados_mesmo_dente(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    r1 = client.post(f"/curation/{ficha.id}/achados", headers=headers,
                      json={"tipo": "carie_dentina", "dentes": [46]})
    r2 = client.post(f"/curation/{ficha.id}/achados", headers=headers,
                      json={"tipo": "tratamento_endodontico_presente", "dentes": [46]})

    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] != r2.json()["id"]

    listagem = client.get(f"/curation/{ficha.id}/achados", headers=headers).json()
    assert len(listagem) == 2

    _limpar(db, ficha.id)


# TESTE 4: criar achado sem dente -> sucesso
def test_criar_achado_sem_dente(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={"tipo": "alteracao_seio_maxilar", "regiao_anatomica": "seio_maxilar"},
    )

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["dentes"] == []

    _limpar(db, ficha.id)


# TESTE 5: criar achado OUTRO + descricao -> sucesso, texto preservado
def test_criar_achado_outro_com_descricao(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={"tipo": "outro", "descricao": "Taurodontismo"},
    )

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["descricao"] == "Taurodontismo"

    _limpar(db, ficha.id)


# TESTE 6: criar achado com marcacao valida (formato ja existente) -> sucesso
def test_criar_achado_com_marcacao_valida(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={
            "tipo": "cisto",
            "marcacoes": [{"id": "m1", "tipo": "oval", "x": 0.2, "y": 0.3, "largura": 0.05, "altura": 0.05}],
        },
    )

    assert resposta.status_code == 200, resposta.text
    assert len(resposta.json()["marcacoes"]) == 1
    assert resposta.json()["marcacoes"][0]["tipo"] == "oval"

    _limpar(db, ficha.id)


# TESTE 7: FDI invalido -> rejeitar
def test_fdi_invalido_e_rejeitado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    for invalido in (10, 19, 20, 29, 30, 39, 40, 49, -1, 0, 100):
        resposta = client.post(
            f"/curation/{ficha.id}/achados",
            headers=headers,
            json={"tipo": "carie_dentina", "dentes": [invalido]},
        )
        assert resposta.status_code == 422, f"FDI {invalido} deveria ser rejeitado, veio {resposta.status_code}"

    assert db.query(Achado).filter(Achado.curation_id == ficha.id).count() == 0


# TESTE 8: dente duplicado -> normalizado (decisao documentada no relatorio)
def test_dente_duplicado_e_normalizado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={"tipo": "carie_dentina", "dentes": [45, 46, 46, 47]},
    )

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["dentes"] == [45, 46, 47]

    _limpar(db, ficha.id)


# TESTE 9: dente_nao_identificado=true -> comportamento correto e documentado
def test_dente_nao_identificado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    ok = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={"tipo": "cisto", "dente_nao_identificado": True},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["dente_nao_identificado"] is True
    assert ok.json()["dentes"] == []

    # dente_nao_identificado=true JUNTO com dentes preenchidos e contraditorio -> rejeita
    contraditorio = client.post(
        f"/curation/{ficha.id}/achados",
        headers=headers,
        json={"tipo": "cisto", "dente_nao_identificado": True, "dentes": [46]},
    )
    assert contraditorio.status_code == 422

    _limpar(db, ficha.id)


# TESTE 10: criar erro tecnico -> sucesso
def test_criar_erro_tecnico(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/erros-tecnicos",
        headers=headers,
        json={"tipo": "movimento", "descricao": "Movimento durante a exposicao."},
    )

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["tipo"] == "movimento"

    _limpar(db, ficha.id)


# TESTE 11: nao deve existir relacao Erro Tecnico <-> Achado
def test_erro_tecnico_nao_tem_relacao_com_achado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    achado = client.post(f"/curation/{ficha.id}/achados", headers=headers,
                          json={"tipo": "carie_dentina"}).json()
    erro = client.post(f"/curation/{ficha.id}/erros-tecnicos", headers=headers,
                        json={"tipo": "movimento"}).json()

    # Nenhum dos dois payloads tem campo que referencie o outro.
    assert "achado_id" not in erro
    assert "erro_tecnico_id" not in achado
    # Confirma tambem no modelo ORM (nao so na resposta da API).
    from app.modules.achados import Achado as AchadoModel
    colunas = {c.name for c in AchadoModel.__table__.columns}
    assert not any("erro" in c for c in colunas)

    _limpar(db, ficha.id)


# TESTE 12-15: usuario sem acesso (estudante) tentando criar/ver/editar/excluir -> negar
def test_estudante_nao_cria_achado(client, criar_usuario, criar_ficha):
    estudante = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, estudante.email)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados",
        headers=cabecalho_auth(token),
        json={"tipo": "carie_dentina"},
    )
    assert resposta.status_code == 403


def test_estudante_nao_visualiza_achado(client, criar_usuario, criar_ficha, db):
    _, headers_curador = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)
    achado_id = client.post(f"/curation/{ficha.id}/achados", headers=headers_curador,
                             json={"tipo": "carie_dentina"}).json()["id"]

    estudante = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, estudante.email)

    resposta_lista = client.get(f"/curation/{ficha.id}/achados", headers=cabecalho_auth(token))
    resposta_um = client.get(f"/curation/{ficha.id}/achados/{achado_id}", headers=cabecalho_auth(token))
    assert resposta_lista.status_code == 403
    assert resposta_um.status_code == 403

    _limpar(db, ficha.id)


def test_estudante_nao_altera_achado(client, criar_usuario, criar_ficha, db):
    _, headers_curador = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)
    achado_id = client.post(f"/curation/{ficha.id}/achados", headers=headers_curador,
                             json={"tipo": "carie_dentina"}).json()["id"]

    estudante = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, estudante.email)

    resposta = client.patch(
        f"/curation/{ficha.id}/achados/{achado_id}",
        headers=cabecalho_auth(token),
        json={"descricao": "tentativa nao autorizada"},
    )
    assert resposta.status_code == 403

    _limpar(db, ficha.id)


def test_estudante_nao_exclui_achado(client, criar_usuario, criar_ficha, db):
    _, headers_curador = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)
    achado_id = client.post(f"/curation/{ficha.id}/achados", headers=headers_curador,
                             json={"tipo": "carie_dentina"}).json()["id"]

    estudante = criar_usuario(perfil=UserRole.estudante)
    token = obter_token(client, estudante.email)

    resposta = client.delete(f"/curation/{ficha.id}/achados/{achado_id}", headers=cabecalho_auth(token))
    assert resposta.status_code == 403
    # confirma que o achado sobreviveu a tentativa negada
    assert client.get(f"/curation/{ficha.id}/achados/{achado_id}", headers=headers_curador).status_code == 200

    _limpar(db, ficha.id)


# Protecao explicita contra IDOR: achado_id valido, mas de OUTRA ficha
def test_idor_achado_de_outra_ficha_nao_vaza(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha_a = _ficha_editavel(criar_ficha)
    ficha_b = _ficha_editavel(criar_ficha)

    achado_da_ficha_b = client.post(
        f"/curation/{ficha_b.id}/achados", headers=headers, json={"tipo": "carie_dentina"}
    ).json()

    # curador tem acesso normal a achados (nao ha restricao por "dono"),
    # entao aqui o teste e sobre o PATH: pedir o achado de B usando o
    # curation_id de A precisa dar 404 (o achado nao pertence aquela ficha),
    # nao vazar o registro so porque o id numerico bate.
    resposta = client.get(
        f"/curation/{ficha_a.id}/achados/{achado_da_ficha_b['id']}", headers=headers
    )
    assert resposta.status_code == 404

    _limpar(db, ficha_a.id)
    _limpar(db, ficha_b.id)


# TESTE 16: criar achado e reiniciar o backend -> dado continua persistido
def test_achado_persiste_apos_nova_sessao_de_db(client, criar_usuario, criar_ficha, db):
    """
    Nao reinicia o container de verdade (custoso demais pra um teste
    automatizado) - o equivalente funcional e reabrir uma sessao NOVA do
    banco (SessionLocal) e confirmar que o dado esta la, exatamente o que
    aconteceria apos um restart real do processo. O restart real do
    container foi validado manualmente nesta fase (ver relatorio).
    """
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)
    achado_id = client.post(f"/curation/{ficha.id}/achados", headers=headers,
                             json={"tipo": "cisto", "dentes": [18]}).json()["id"]

    from app.core.database import SessionLocal
    nova_sessao = SessionLocal()
    try:
        persistido = nova_sessao.query(Achado).filter(Achado.id == achado_id).first()
        assert persistido is not None
        assert persistido.tipo == "cisto"
        assert persistido.dentes == [18]
    finally:
        nova_sessao.close()

    _limpar(db, ficha.id)


# Regras adicionais de dominio explicitas no pedido (nao numeradas 1-16,
# mas cobertas porque fazem parte da "REGRA ABSOLUTA" da fase)
def test_nao_edita_achado_de_ficha_finalizada(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    achado_id = client.post(f"/curation/{ficha.id}/achados", headers=headers,
                             json={"tipo": "cisto"}).json()["id"]

    ficha.status = StatusCuradoria.APROVADA.value
    db.add(ficha)
    db.commit()

    resposta_criar = client.post(f"/curation/{ficha.id}/achados", headers=headers,
                                  json={"tipo": "carie_dentina"})
    resposta_editar = client.patch(f"/curation/{ficha.id}/achados/{achado_id}", headers=headers,
                                    json={"descricao": "x"})
    resposta_excluir = client.delete(f"/curation/{ficha.id}/achados/{achado_id}", headers=headers)
    resposta_ler = client.get(f"/curation/{ficha.id}/achados/{achado_id}", headers=headers)

    assert resposta_criar.status_code == 409
    assert resposta_editar.status_code == 409
    assert resposta_excluir.status_code == 409
    assert resposta_ler.status_code == 200  # leitura continua liberada

    _limpar(db, ficha.id)


def test_editar_achado_parcial_preserva_campos_nao_enviados(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)
    achado_id = client.post(
        f"/curation/{ficha.id}/achados", headers=headers,
        json={"tipo": "carie_dentina", "dentes": [46], "descricao": "original"},
    ).json()["id"]

    resposta = client.patch(
        f"/curation/{ficha.id}/achados/{achado_id}", headers=headers,
        json={"descricao": "atualizado"},
    )

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["descricao"] == "atualizado"
    assert corpo["tipo"] == "carie_dentina"  # preservado
    assert corpo["dentes"] == [46]  # preservado

    _limpar(db, ficha.id)


# ---------------------------------------------------------------------
# Fase 4 - "Outros" obrigatorio (regra aprovada, reforcada no backend)
# ---------------------------------------------------------------------

# TESTE 24: tipo=outro + descricao preenchida -> sucesso
def test_outro_com_descricao_valida(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados", headers=headers,
        json={"tipo": "outro", "descricao": "Taurodontismo"},
    )

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["descricao"] == "Taurodontismo"

    _limpar(db, ficha.id)


# TESTE 25: tipo=outro + descricao vazia -> 422
def test_outro_sem_descricao_e_rejeitado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados", headers=headers,
        json={"tipo": "outro", "descricao": ""},
    )

    assert resposta.status_code == 422
    assert db.query(Achado).filter(Achado.curation_id == ficha.id).count() == 0


# TESTE 26: tipo=outro + descricao so com espacos -> 422
def test_outro_com_descricao_so_espacos_e_rejeitado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)

    resposta = client.post(
        f"/curation/{ficha.id}/achados", headers=headers,
        json={"tipo": "outro", "descricao": "   "},
    )

    assert resposta.status_code == 422
    assert db.query(Achado).filter(Achado.curation_id == ficha.id).count() == 0


# Validacao tambem se aplica na edicao (PATCH): mudar um achado JA outro
# para descricao vazia deve ser rejeitado do mesmo jeito.
def test_editar_outro_para_descricao_vazia_e_rejeitado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)
    achado_id = client.post(
        f"/curation/{ficha.id}/achados", headers=headers,
        json={"tipo": "outro", "descricao": "Taurodontismo"},
    ).json()["id"]

    resposta = client.patch(
        f"/curation/{ficha.id}/achados/{achado_id}", headers=headers,
        json={"descricao": ""},
    )

    assert resposta.status_code == 422
    # o achado original continua com a descricao antiga, nao foi apagado.
    assert client.get(f"/curation/{ficha.id}/achados/{achado_id}", headers=headers).json()["descricao"] == "Taurodontismo"

    _limpar(db, ficha.id)


# Mudar um achado de OUTRO tipo (com descricao ja preenchida) PARA "outro"
# tambem precisa validar - o merge usa a descricao ja existente, entao so
# falha se ela tambem estiver vazia.
def test_editar_tipo_para_outro_sem_descricao_previa_e_rejeitado(client, criar_usuario, criar_ficha, db):
    _, headers = _curador_autenticado(client, criar_usuario)
    ficha = _ficha_editavel(criar_ficha)
    achado_id = client.post(
        f"/curation/{ficha.id}/achados", headers=headers,
        json={"tipo": "carie_dentina"},
    ).json()["id"]

    resposta = client.patch(
        f"/curation/{ficha.id}/achados/{achado_id}", headers=headers,
        json={"tipo": "outro"},
    )

    assert resposta.status_code == 422

    _limpar(db, ficha.id)


# TESTE 17 (suite completa) e a REGRESSAO OBRIGATORIA (secao 30) sao
# executados via `pytest tests/` no relatorio, nao dentro deste arquivo.
