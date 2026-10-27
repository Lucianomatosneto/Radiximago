"""
Compartilhamento de imagens anotadas ("Compartilhadas comigo"):
- resposta neutra (nao revela se o e-mail tem conta);
- destinatario ve a imagem e SO o recado do compartilhamento (as "Minhas
  anotacoes" de quem enviou sao privadas - 27/10/2026);
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

    # PRIVACIDADE: so o recado chega; a anotacao pessoal do remetente nao
    anot = client.get(f"/shares/recebidas/{item['id']}/anotacoes", headers=cabecalho_auth(t_dest)).json()
    assert anot["itens"] == [] and anot["mensagem"] == "Veja esta"
    client.put(f"/annotations/{nota['id']}", json={"texto": "Texto editado"}, headers=cabecalho_auth(t_rem))
    anot = client.get(f"/shares/recebidas/{item['id']}/anotacoes", headers=cabecalho_auth(t_dest)).json()
    assert anot["itens"] == []
    assert "Texto editado" not in str(client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json())

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


def _compartilhar(client, t_rem, ficha_id, destinatario):
    client.post(f"/shares/{ficha_id}", json={"email": destinatario.email}, headers=cabecalho_auth(t_rem))


def test_minhas_anotacoes_nao_vao_no_compartilhamento(client, criar_usuario, criar_ficha):
    """27/10/2026: as anotacoes pessoais de quem compartilha continuam so dele."""
    remetente = criar_usuario()
    destinatario = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    t_dest = obter_token(client, destinatario.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    _anotar(client, t_rem, ficha.id, "Primeira")
    _anotar(client, t_rem, ficha.id, "Segunda")
    _compartilhar(client, t_rem, ficha.id, destinatario)
    item = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["itens"][0]
    assert item["quantidade_anotacoes"] == 0
    url = f"/shares/recebidas/{item['id']}/anotacoes"
    assert client.get(url, headers=cabecalho_auth(t_dest)).json()["itens"] == []
    # nem "reexibir" mostra as anotacoes pessoais
    client.post(f"{url}/reexibir", headers=cabecalho_auth(t_dest))
    assert client.get(url, headers=cabecalho_auth(t_dest)).json()["itens"] == []
    # para quem escreveu, continuam la
    minhas = client.get(f"/annotations/{ficha.id}", headers=cabecalho_auth(t_rem)).json()["itens"]
    assert {a["texto"] for a in minhas} == {"Primeira", "Segunda"}


def test_ocultar_anotacoes_isolado_e_so_ids_do_remetente(client, criar_usuario, criar_ficha):
    remetente = criar_usuario()
    destinatario = criar_usuario()
    terceiro = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    t_dest = obter_token(client, destinatario.email)
    t_ter = obter_token(client, terceiro.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    _anotar(client, t_rem, ficha.id, "Do remetente")
    alheia = _anotar(client, t_ter, ficha.id, "Do terceiro")
    _compartilhar(client, t_rem, ficha.id, destinatario)
    comp_id = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["itens"][0]["id"]

    # terceiro nao mexe no compartilhamento dos outros
    r = client.post(f"/shares/recebidas/{comp_id}/anotacoes/ocultar", json={}, headers=cabecalho_auth(t_ter))
    assert r.status_code == 404
    # id de anotacao que nao e do remetente e ignorado
    r = client.post(
        f"/shares/recebidas/{comp_id}/anotacoes/ocultar", json={"ids": [alheia["id"]]}, headers=cabecalho_auth(t_dest)
    )
    assert r.json()["ocultas"] == 0


def test_destinatario_apaga_recado_so_da_propria_visao(client, criar_usuario, criar_ficha, db):
    remetente = criar_usuario()
    destinatario = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    t_dest = obter_token(client, destinatario.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    client.post(f"/shares/{ficha.id}", json={"email": destinatario.email, "mensagem": "favor avaliar"}, headers=cabecalho_auth(t_rem))
    comp_id = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["itens"][0]["id"]
    url = f"/shares/recebidas/{comp_id}/anotacoes"

    r = client.post(f"{url}/ocultar", json={"mensagem": True}, headers=cabecalho_auth(t_dest))
    assert r.status_code == 200
    assert client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["itens"][0]["mensagem"] is None
    anot = client.get(url, headers=cabecalho_auth(t_dest)).json()
    assert anot["mensagem"] is None and anot["ocultas"] == 1
    # o recado continua guardado (nao foi apagado do banco)
    assert db.get(CompartilhamentoImagem, comp_id).mensagem == "favor avaliar"

    # mostrar de novo
    client.post(f"{url}/reexibir", headers=cabecalho_auth(t_dest))
    assert client.get(url, headers=cabecalho_auth(t_dest)).json()["mensagem"] == "favor avaliar"

    # recado NOVO do remetente volta a aparecer mesmo depois de apagado
    client.post(f"{url}/ocultar", json={"mensagem": True}, headers=cabecalho_auth(t_dest))
    client.post(f"/shares/{ficha.id}", json={"email": destinatario.email, "mensagem": "veja de novo"}, headers=cabecalho_auth(t_rem))
    assert client.get(url, headers=cabecalho_auth(t_dest)).json()["mensagem"] == "veja de novo"


def test_responder_a_quem_enviou_sem_email(client, criar_usuario, criar_ficha, db):
    remetente = criar_usuario()
    destinatario = criar_usuario()
    terceiro = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    t_dest = obter_token(client, destinatario.email)
    t_ter = obter_token(client, terceiro.email)
    ficha = criar_ficha(status=StatusCuradoria.APROVADA.value)
    client.post(f"/shares/{ficha.id}", json={"email": destinatario.email, "mensagem": "favor avaliar"}, headers=cabecalho_auth(t_rem))
    comp_id = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()["itens"][0]["id"]
    _anotar(client, t_dest, ficha.id, "Avaliei: lesao periapical")

    # vazio nao vale; terceiro nao responde pelo outro
    assert client.post(f"/shares/recebidas/{comp_id}/responder", json={"mensagem": "  "}, headers=cabecalho_auth(t_dest)).status_code == 422
    assert client.post(f"/shares/recebidas/{comp_id}/responder", json={"mensagem": "oi"}, headers=cabecalho_auth(t_ter)).status_code == 404

    r = client.post(f"/shares/recebidas/{comp_id}/responder", json={"mensagem": "Avaliado, veja minha nota"}, headers=cabecalho_auth(t_dest))
    assert r.status_code == 200

    # quem enviou recebe a resposta em "Compartilhadas comigo" (so o recado; a anotacao pessoal fica com quem a escreveu)
    recebidas = client.get("/shares/recebidas", headers=cabecalho_auth(t_rem)).json()["itens"]
    assert len(recebidas) == 1
    resp = recebidas[0]
    assert resp["curation_id"] == ficha.id and resp["mensagem"] == "Avaliado, veja minha nota" and resp["novo"] is True
    notas = client.get(f"/shares/recebidas/{resp['id']}/anotacoes", headers=cabecalho_auth(t_rem)).json()["itens"]
    assert notas == []
    assert db.query(AuditLog).filter(AuditLog.acao == "resposta_compartilhamento").count() == 1
