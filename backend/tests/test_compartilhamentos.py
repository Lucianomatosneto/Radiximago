"""
Compartilhamento de imagens anotadas ("Compartilhadas comigo"):
- resposta neutra (nao revela se o e-mail tem conta);
- destinatario ve a imagem e as anotacoes ATUAIS do remetente, so leitura;
- isolamento: terceiros nao veem nem mexem;
- remetente desfaz; destinatario remove do proprio espaco;
- auditoria registrada.
"""

from app.modules.audit_logs import AuditLog
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.compartilhamentos_router import MENSAGEM_NEUTRA
from app.modules.curations import StatusCuradoria
from tests.conftest import cabecalho_auth, obter_token


def _anotar(client, token, curation_id, texto):
    r = client.post(f"/annotations/{curation_id}", json={"texto": texto}, headers=cabecalho_auth(token))
    assert r.status_code == 200
    return r.json()


def test_compartilha_e_destinatario_ve_imagem_e_anotacoes(client, criar_usuario, criar_ficha):
    remetente = criar_usuario()
    destinatario = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    t_dest = obter_token(client, destinatario.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    nota = _anotar(client, t_rem, ficha.id, "Observar a raiz mesial")

    r = client.post(
        f"/shares/{ficha.id}",
        json={"email": destinatario.email.upper(), "mensagem": "Veja esta"},
        headers=cabecalho_auth(t_rem),
    )
    assert r.status_code == 200
    assert r.json()["mensagem"] == MENSAGEM_NEUTRA
    # resposta identica a do e-mail inexistente (nao revela se ha conta)
    assert set(r.json()) == {"mensagem", "aviso_cadastro", "link_cadastro"}

    novas = client.get("/shares/recebidas/novas", headers=cabecalho_auth(t_dest)).json()
    assert novas["quantidade"] == 1

    lista = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()
    assert lista["quantidade"] == 1
    item = lista["itens"][0]
    assert item["curation_id"] == ficha.id
    assert item["mensagem"] == "Veja esta"
    assert item["quantidade_anotacoes"] == 1
    assert item["novo"] is True

    anot = client.get(f"/shares/recebidas/{item['id']}/anotacoes", headers=cabecalho_auth(t_dest)).json()
    assert [a["texto"] for a in anot["itens"]] == ["Observar a raiz mesial"]

    # anotacao ATUAL: o remetente edita e o destinatario ve a nova versao
    client.put(f"/annotations/{nota['id']}", json={"texto": "Texto editado"}, headers=cabecalho_auth(t_rem))
    anot = client.get(f"/shares/recebidas/{item['id']}/anotacoes", headers=cabecalho_auth(t_dest)).json()
    assert [a["texto"] for a in anot["itens"]] == ["Texto editado"]

    client.post("/shares/recebidas/vistas", headers=cabecalho_auth(t_dest))
    assert client.get("/shares/recebidas/novas", headers=cabecalho_auth(t_dest)).json()["quantidade"] == 0


def test_resposta_neutra_para_email_inexistente(client, criar_usuario, criar_ficha):
    remetente = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    ficha = criar_ficha()
    r = client.post(
        f"/shares/{ficha.id}", json={"email": "ninguem-xyz@teste.example"}, headers=cabecalho_auth(t_rem)
    )
    assert r.status_code == 200
    assert r.json()["mensagem"] == MENSAGEM_NEUTRA
    assert r.json()["link_cadastro"].endswith("/solicitar-acesso")
    assert client.get("/shares/enviadas", headers=cabecalho_auth(t_rem)).json()["quantidade"] == 0


def test_nao_compartilha_com_usuario_inativo(client, criar_usuario, criar_ficha):
    remetente = criar_usuario()
    inativo = criar_usuario(ativo=False)
    t_rem = obter_token(client, remetente.email)
    ficha = criar_ficha()
    r = client.post(f"/shares/{ficha.id}", json={"email": inativo.email}, headers=cabecalho_auth(t_rem))
    assert r.json()["mensagem"] == MENSAGEM_NEUTRA
    assert client.get("/shares/enviadas", headers=cabecalho_auth(t_rem)).json()["quantidade"] == 0


def test_nao_compartilha_consigo_mesmo_nem_imagem_nao_aprovada(client, criar_usuario, criar_ficha):
    usuario = criar_usuario()
    outro = criar_usuario()
    token = obter_token(client, usuario.email)
    aprovada = criar_ficha()
    pendente = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    assert client.post(f"/shares/{aprovada.id}", json={"email": usuario.email}, headers=cabecalho_auth(token)).status_code == 400
    assert client.post(f"/shares/{pendente.id}", json={"email": outro.email}, headers=cabecalho_auth(token)).status_code == 404
    assert client.post(f"/shares/{aprovada.id}", json={"email": "sem-arroba"}, headers=cabecalho_auth(token)).status_code == 422


def test_terceiro_nao_ve_anotacoes_nem_remove(client, criar_usuario, criar_ficha):
    remetente = criar_usuario()
    destinatario = criar_usuario()
    intruso = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    t_dest = obter_token(client, destinatario.email)
    t_int = obter_token(client, intruso.email)
    ficha = criar_ficha()
    _anotar(client, t_rem, ficha.id, "privada")
    client.post(f"/shares/{ficha.id}", json={"email": destinatario.email}, headers=cabecalho_auth(t_rem))
    comp_id = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["itens"][0]["id"]

    assert client.get(f"/shares/recebidas/{comp_id}/anotacoes", headers=cabecalho_auth(t_int)).status_code == 404
    assert client.delete(f"/shares/recebidas/{comp_id}", headers=cabecalho_auth(t_int)).status_code == 404
    assert client.delete(f"/shares/enviadas/{comp_id}", headers=cabecalho_auth(t_int)).status_code == 404
    assert client.get("/shares/recebidas", headers=cabecalho_auth(t_int)).json()["quantidade"] == 0
    # o destinatario nao pode desfazer como se fosse o remetente
    assert client.delete(f"/shares/enviadas/{comp_id}", headers=cabecalho_auth(t_dest)).status_code == 404


def test_remetente_desfaz_e_destinatario_remove(client, criar_usuario, criar_ficha, db):
    remetente = criar_usuario()
    destinatario = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    t_dest = obter_token(client, destinatario.email)
    f1 = criar_ficha()
    f2 = criar_ficha()
    client.post(f"/shares/{f1.id}", json={"email": destinatario.email}, headers=cabecalho_auth(t_rem))
    client.post(f"/shares/{f2.id}", json={"email": destinatario.email}, headers=cabecalho_auth(t_rem))
    # compartilhar de novo nao duplica
    client.post(f"/shares/{f1.id}", json={"email": destinatario.email}, headers=cabecalho_auth(t_rem))
    assert client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["quantidade"] == 2

    enviadas = client.get(f"/shares/enviadas?curation_id={f1.id}", headers=cabecalho_auth(t_rem)).json()
    assert enviadas["quantidade"] == 1
    assert client.delete(f"/shares/enviadas/{enviadas['itens'][0]['id']}", headers=cabecalho_auth(t_rem)).status_code == 200

    recebidas = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()
    assert [i["curation_id"] for i in recebidas["itens"]] == [f2.id]
    assert client.delete(f"/shares/recebidas/{recebidas['itens'][0]['id']}", headers=cabecalho_auth(t_dest)).status_code == 200
    assert client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["quantidade"] == 0

    acoes = {a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == remetente.id).all()}
    assert {"compartilhamento_imagem", "compartilhamento_desfeito"} <= acoes
    assert db.query(CompartilhamentoImagem).filter(CompartilhamentoImagem.remetente_id == remetente.id).count() == 0
