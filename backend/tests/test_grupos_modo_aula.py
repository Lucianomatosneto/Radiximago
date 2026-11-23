"""
GRUPOS - ETAPA 3 (17/11/2026): "modo aula", envio de imagem curada ao grupo e
comentarios.

Regras conferidas aqui:
- so o DONO do grupo envia, e so imagem APROVADA e ATIVA (a mesma regra do
  compartilhamento);
- as marcacoes e os destaques do envio sao do envio: a FICHA OFICIAL nao muda
  (D3); os destaques precisam ser alteracoes que a ficha tem;
- so quem PARTICIPA do grupo ve as imagens enviadas; quem sai perde o acesso;
- o dono escolhe, em cada envio, se os participantes podem comentar, e pode
  mudar a qualquer momento (desligado: a conversa continua visivel, mas nao
  entram comentarios novos);
- comentario e PARTICULAR (D4): cada participante ve so a propria conversa
  com o dono; o dono ve todas e responde;
- o participante apaga os proprios comentarios;
- a auditoria registra as acoes sem o texto dos comentarios.
Dados inventados.
"""

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.grupos import GrupoEnvio
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

MARCACAO_OFICIAL = {"id": "m1", "tipo": "oval", "x": 0.1, "y": 0.1, "largura": 0.2, "altura": 0.2, "achado": "carie"}
MARCACAO_AULA = {"id": "a1", "tipo": "seta", "x1": 0.5, "y1": 0.5, "x2": 0.6, "y2": 0.6}


@pytest.fixture()
def limpar_grupos(db):
    criados: list[int] = []
    yield criados
    for gid in criados:
        g = db.get(GrupoEnvio, gid)
        if g:
            db.delete(g)
    db.commit()


_CABS: dict[int, dict] = {}


def _cab(client, u):
    if u.id not in _CABS:
        from app.main import app
        app.state.limiter.reset()
        _CABS[u.id] = cabecalho_auth(obter_token(client, u.email))
    return _CABS[u.id]


def _ficha(criar_ficha, db, status=StatusCuradoria.APROVADA.value, ativo=True):
    ficha = criar_ficha(status=status, ativo=ativo)
    ficha.marcacoes = [MARCACAO_OFICIAL]
    ficha.alteracoes_observadas = ["carie_dentina", "lesao_periapical"]
    db.commit()
    return ficha


def _grupo_com(client, limpar, dono, participantes) -> int:
    """Grupo do dono com os participantes ja dentro (convite aceito)."""
    r = client.post("/grupos", headers=_cab(client, dono), json={"nome": f"Aula {dono.id}",
                                                                   "membros_ids": [p.id for p in participantes]})
    assert r.status_code == 200, r.text
    gid = r.json()["id"]
    limpar.append(gid)
    for p in participantes:
        convite = next(c for c in client.get("/grupos/convites-recebidos", headers=_cab(client, p)).json()["convites"]
                       if c["grupo"]["id"] == gid)
        assert client.post(f"/grupos/convites-recebidos/{convite['id']}/aceitar", headers=_cab(client, p)).status_code == 200
    return gid


def _enviar(client, dono, gid, ficha, **extra):
    corpo = {"curation_id": ficha.id, "mensagem": "Observem a radiolucidez.", "permite_comentar": True,
             "marcacoes": [MARCACAO_AULA], "destaques": ["lesao_periapical"], **extra}
    return client.post(f"/grupos/{gid}/envios", headers=_cab(client, dono), json=corpo)


def _envios(client, quem, gid):
    return client.get(f"/grupos/participo/{gid}/envios", headers=_cab(client, quem))


def _acoes(db, gid) -> set[str]:
    return {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade == "grupo_envio", AuditLog.entidade_id == gid)}


# --- modo aula e envio ----------------------------------------------------

def test_modo_aula_parte_da_ficha_oficial_e_o_envio_nao_muda_a_ficha(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [aluno])

    base = client.get(f"/grupos/aula/imagem/{ficha.id}", headers=_cab(client, prof))
    assert base.status_code == 200, base.text
    assert base.json()["marcacoes"] == [MARCACAO_OFICIAL]
    assert base.json()["alteracoes_observadas"] == ["carie_dentina", "lesao_periapical"]

    r = _enviar(client, prof, gid, ficha)
    assert r.status_code == 200, r.text
    db.refresh(ficha)
    assert ficha.marcacoes == [MARCACAO_OFICIAL]                 # a ficha oficial nao mudou (D3)

    itens = _envios(client, aluno, gid).json()["envios"]
    assert len(itens) == 1
    envio = itens[0]
    assert envio["curation_id"] == ficha.id and envio["remetente"] == prof.nome
    assert envio["mensagem"] == "Observem a radiolucidez." and envio["permite_comentar"] is True
    assert envio["marcacoes"][0]["tipo"] == "seta" and envio["destaques"] == ["lesao_periapical"]
    assert envio["comentarios"] == []
    assert "grupo_imagem_enviada" in _acoes(db, gid)

    # a mesma imagem duas vezes no mesmo grupo: avisa
    assert _enviar(client, prof, gid, ficha).status_code == 409


def test_envio_sem_marcacoes_usa_as_oficiais(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof, aluno = criar_usuario(perfil=UserRole.pesquisador), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [aluno])
    r = client.post(f"/grupos/{gid}/envios", headers=_cab(client, prof), json={"curation_id": ficha.id})
    assert r.status_code == 200, r.text
    envio = _envios(client, aluno, gid).json()["envios"][0]
    assert envio["marcacoes"] == [MARCACAO_OFICIAL] and envio["destaques"] == [] and envio["permite_comentar"] is False


@pytest.mark.parametrize("situacao", ["pendente", "inativa"])
def test_so_imagem_aprovada_e_ativa(client, criar_usuario, criar_ficha, limpar_grupos, db, situacao):
    prof = criar_usuario(perfil=UserRole.professor)
    ficha = (_ficha(criar_ficha, db, status=StatusCuradoria.PENDENTE.value) if situacao == "pendente"
             else _ficha(criar_ficha, db, ativo=False))
    gid = _grupo_com(client, limpar_grupos, prof, [])
    assert client.get(f"/grupos/aula/imagem/{ficha.id}", headers=_cab(client, prof)).status_code == 404
    assert _enviar(client, prof, gid, ficha).status_code == 404


def test_entradas_invalidas_sao_recusadas(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [])
    # destaque que a ficha nao tem
    assert _enviar(client, prof, gid, ficha, destaques=["fratura_radicular"]).status_code == 422
    # marcacao fora da imagem
    assert _enviar(client, prof, gid, ficha, marcacoes=[{**MARCACAO_AULA, "x2": 2}]).status_code == 422
    # mensagem longa demais
    assert _enviar(client, prof, gid, ficha, mensagem="x" * 1001).status_code == 422


def test_ficha_que_deixa_de_ser_aprovada_some_do_grupo(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [aluno])
    _enviar(client, prof, gid, ficha)
    ficha.status = StatusCuradoria.PENDENTE.value
    db.commit()
    assert _envios(client, aluno, gid).json()["envios"] == []


# --- quem ve e quem mexe --------------------------------------------------

def test_so_participantes_veem_e_so_o_dono_envia(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof, outro_prof = criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.professor)
    aluno, fora = criar_usuario(), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [aluno])
    envio_id = _enviar(client, prof, gid, ficha).json()["id"]

    assert _envios(client, fora, gid).status_code == 404
    assert _envios(client, outro_prof, gid).status_code == 404
    # so o dono envia, muda a chave, retira e ve as conversas
    assert _enviar(client, outro_prof, gid, ficha).status_code == 404
    assert _enviar(client, aluno, gid, ficha).status_code == 403
    alheio = _cab(client, outro_prof)
    assert client.patch(f"/grupos/{gid}/envios/{envio_id}", headers=alheio, json={"permite_comentar": False}).status_code == 404
    assert client.delete(f"/grupos/{gid}/envios/{envio_id}", headers=alheio).status_code == 404
    assert client.get(f"/grupos/{gid}/envios/{envio_id}/conversas", headers=alheio).status_code == 404
    assert client.get(f"/grupos/{gid}/envios", headers=alheio).json()["envios"] == []

    # quem sai do grupo perde o acesso na hora
    assert client.delete(f"/grupos/participo/{gid}", headers=_cab(client, aluno)).status_code == 200
    assert _envios(client, aluno, gid).status_code == 404


def test_dono_lista_retira_envio(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [aluno])
    envio_id = _enviar(client, prof, gid, ficha).json()["id"]
    lista = client.get(f"/grupos/{gid}/envios", headers=_cab(client, prof)).json()["envios"]
    assert [(e["id"], e["curation_id"], e["comentarios"]) for e in lista] == [(envio_id, ficha.id, 0)]
    assert client.delete(f"/grupos/{gid}/envios/{envio_id}", headers=_cab(client, prof)).status_code == 200
    assert _envios(client, aluno, gid).json()["envios"] == []
    assert "grupo_imagem_retirada" in _acoes(db, gid)


# --- comentarios ----------------------------------------------------------

def test_comentarios_sao_particulares_entre_participante_e_dono(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [a1, a2])
    envio_id = _enviar(client, prof, gid, ficha).json()["id"]
    caminho = f"/grupos/participo/{gid}/envios/{envio_id}/comentarios"

    assert client.post(caminho, headers=_cab(client, a1), json={"texto": "Seria o ápice do 36?"}).status_code == 200
    assert client.post(caminho, headers=_cab(client, a2), json={"texto": "Texto do segundo aluno"}).status_code == 200

    conversa_a1 = _envios(client, a1, gid).json()["envios"][0]["comentarios"]
    assert [(c["autor"], c["texto"]) for c in conversa_a1] == [("eu", "Seria o ápice do 36?")]   # nao ve o colega (D4)

    conversas = client.get(f"/grupos/{gid}/envios/{envio_id}/conversas", headers=_cab(client, prof)).json()["conversas"]
    assert {c["participante"]["id"] for c in conversas} == {a1.id, a2.id}
    r = client.post(f"/grupos/{gid}/envios/{envio_id}/conversas/{a1.id}", headers=_cab(client, prof),
                    json={"texto": "Isso, muito bem."})
    assert r.status_code == 200, r.text

    conversa_a1 = _envios(client, a1, gid).json()["envios"][0]["comentarios"]
    assert [(c["autor"], c["texto"]) for c in conversa_a1] == [("eu", "Seria o ápice do 36?"), ("dono", "Isso, muito bem.")]
    conversa_a2 = _envios(client, a2, gid).json()["envios"][0]["comentarios"]
    assert [c["texto"] for c in conversa_a2] == ["Texto do segundo aluno"]
    assert client.get(f"/grupos/{gid}/envios", headers=_cab(client, prof)).json()["envios"][0]["comentarios"] == 3

    # o dono so responde a quem participa do grupo
    fora = criar_usuario()
    assert client.post(f"/grupos/{gid}/envios/{envio_id}/conversas/{fora.id}", headers=_cab(client, prof),
                       json={"texto": "oi"}).status_code == 404
    # a auditoria registra sem o texto
    detalhes = " ".join(d or "" for (d,) in db.query(AuditLog.detalhes).filter(AuditLog.entidade_id == gid,
                                                                               AuditLog.entidade == "grupo_envio"))
    assert "ápice" not in detalhes and "muito bem" not in detalhes
    assert {"grupo_comentario_enviado", "grupo_comentario_respondido"} <= _acoes(db, gid)


def test_chave_de_comentarios_liga_e_desliga(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [aluno])
    envio_id = _enviar(client, prof, gid, ficha).json()["id"]
    caminho = f"/grupos/participo/{gid}/envios/{envio_id}/comentarios"
    client.post(caminho, headers=_cab(client, aluno), json={"texto": "Primeiro"})

    r = client.patch(f"/grupos/{gid}/envios/{envio_id}", headers=_cab(client, prof), json={"permite_comentar": False})
    assert r.status_code == 200 and r.json()["permite_comentar"] is False
    assert client.post(caminho, headers=_cab(client, aluno), json={"texto": "Segundo"}).status_code == 403
    envio = _envios(client, aluno, gid).json()["envios"][0]
    assert envio["permite_comentar"] is False and [c["texto"] for c in envio["comentarios"]] == ["Primeiro"]

    client.patch(f"/grupos/{gid}/envios/{envio_id}", headers=_cab(client, prof), json={"permite_comentar": True})
    assert client.post(caminho, headers=_cab(client, aluno), json={"texto": "Terceiro"}).status_code == 200
    assert {"grupo_comentarios_desligados", "grupo_comentarios_ligados"} <= _acoes(db, gid)


def test_participante_apaga_so_os_proprios_comentarios(client, criar_usuario, criar_ficha, limpar_grupos, db):
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [a1, a2])
    envio_id = _enviar(client, prof, gid, ficha).json()["id"]
    caminho = f"/grupos/participo/{gid}/envios/{envio_id}/comentarios"
    meu = client.post(caminho, headers=_cab(client, a1), json={"texto": "Meu"}).json()["id"]
    client.post(f"/grupos/{gid}/envios/{envio_id}/conversas/{a1.id}", headers=_cab(client, prof), json={"texto": "Resposta"})
    resposta = [c for c in _envios(client, a1, gid).json()["envios"][0]["comentarios"] if c["autor"] == "dono"][0]["id"]

    assert client.delete(f"{caminho}/{meu}", headers=_cab(client, a2)).status_code == 404       # de outra pessoa
    assert client.delete(f"{caminho}/{resposta}", headers=_cab(client, a1)).status_code == 404  # a resposta do dono
    assert client.delete(f"{caminho}/{meu}", headers=_cab(client, a1)).status_code == 200
    assert [c["texto"] for c in _envios(client, a1, gid).json()["envios"][0]["comentarios"]] == ["Resposta"]


@pytest.mark.parametrize("texto", ["", "   ", "x" * 501])
def test_comentario_vazio_ou_longo_demais(client, criar_usuario, criar_ficha, limpar_grupos, db, texto):
    prof, aluno = criar_usuario(perfil=UserRole.professor), criar_usuario()
    ficha = _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [aluno])
    envio_id = _enviar(client, prof, gid, ficha).json()["id"]
    r = client.post(f"/grupos/participo/{gid}/envios/{envio_id}/comentarios", headers=_cab(client, aluno), json={"texto": texto})
    assert r.status_code == 422


# --- aviso de imagem nova (17/11/2026) ------------------------------------

def test_imagem_nova_conta_ate_a_pessoa_abrir_as_imagens_do_grupo(client, criar_usuario, criar_ficha, limpar_grupos, db):
    """O menu e a tela "Meus grupos" mostram quantas imagens chegaram desde a
    ultima vez que a pessoa abriu as imagens do grupo."""
    prof = criar_usuario(perfil=UserRole.professor)
    a1, a2 = criar_usuario(), criar_usuario()
    f1, f2 = _ficha(criar_ficha, db), _ficha(criar_ficha, db)
    gid = _grupo_com(client, limpar_grupos, prof, [a1, a2])
    _enviar(client, prof, gid, f1)
    _enviar(client, prof, gid, f2)

    pend = client.get("/grupos/pendencias", headers=_cab(client, a1)).json()
    assert pend["imagens_novas"] == 2
    participo = client.get("/grupos/participo", headers=_cab(client, a1)).json()["grupos"]
    assert [(g["id"], g["imagens_novas"]) for g in participo] == [(gid, 2)]

    # abrir as imagens: cada uma vem marcada como nova; depois, o contador zera
    envios = _envios(client, a1, gid).json()["envios"]
    assert [e["nova"] for e in envios] == [True, True]
    assert client.get("/grupos/pendencias", headers=_cab(client, a1)).json()["imagens_novas"] == 0
    assert [e["nova"] for e in _envios(client, a1, gid).json()["envios"]] == [False, False]
    # a outra pessoa continua com as dela
    assert client.get("/grupos/pendencias", headers=_cab(client, a2)).json()["imagens_novas"] == 2

    # imagem que deixa de estar aprovada nao conta
    f2.status = StatusCuradoria.PENDENTE.value
    db.commit()
    assert client.get("/grupos/pendencias", headers=_cab(client, a2)).json()["imagens_novas"] == 1
    # o dono nao recebe aviso das proprias imagens
    assert client.get("/grupos/pendencias", headers=_cab(client, prof)).json()["imagens_novas"] == 0
