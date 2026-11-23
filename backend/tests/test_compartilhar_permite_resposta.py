"""
RESPONDER SO SE QUEM ENVIOU PERMITIR (pedido do video, 22/11/2026).

Em Compartilhadas comigo, "responder a quem enviou" passa a depender de quem
compartilhou: ao compartilhar, marca "Permitir que a pessoa responda".
- compartilhar sem marcar: quem recebe nao consegue responder (403) e a
  lista diz permite_resposta = false;
- marcando: responde normalmente; a resposta (que volta como um
  compartilhamento novo) tambem permite resposta, para a conversa seguir;
- compartilhamentos antigos (antes da mudanca) continuam permitindo.
Dados inventados.
"""

from app.modules.compartilhamentos import CompartilhamentoImagem
from tests.conftest import cabecalho_auth, obter_token


def _recebida(client, cab):
    return client.get("/shares/recebidas", headers=cab).json()["itens"][0]


def test_sem_permitir_quem_recebe_nao_responde(client, criar_usuario, criar_ficha):
    rem, dest = criar_usuario(), criar_usuario()
    c_rem, c_dest = cabecalho_auth(obter_token(client, rem.email)), cabecalho_auth(obter_token(client, dest.email))
    ficha = criar_ficha()
    client.post(f"/shares/{ficha.id}", headers=c_rem, json={"email": dest.email})
    item = _recebida(client, c_dest)
    assert item["permite_resposta"] is False
    r = client.post(f"/shares/recebidas/{item['id']}/responder", headers=c_dest, json={"mensagem": "Oi"})
    assert r.status_code == 403


def test_permitindo_responde_e_a_conversa_segue(client, criar_usuario, criar_ficha):
    rem, dest = criar_usuario(), criar_usuario()
    c_rem, c_dest = cabecalho_auth(obter_token(client, rem.email)), cabecalho_auth(obter_token(client, dest.email))
    ficha = criar_ficha()
    client.post(f"/shares/{ficha.id}", headers=c_rem, json={"email": dest.email, "permite_resposta": True})
    item = _recebida(client, c_dest)
    assert item["permite_resposta"] is True
    assert client.post(f"/shares/recebidas/{item['id']}/responder", headers=c_dest, json={"mensagem": "Oi"}).status_code == 200
    volta = _recebida(client, c_rem)
    assert volta["permite_resposta"] is True


def test_compartilhamentos_antigos_continuam_permitindo(db):
    coluna = CompartilhamentoImagem.__table__.c.permite_resposta
    assert coluna.server_default is not None and "true" in str(coluna.server_default.arg).lower()
