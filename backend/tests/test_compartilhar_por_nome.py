"""
COMPARTILHAR ESCOLHENDO A PESSOA PELO NOME (pedido do video, 22/11/2026).

O Luciano digitou "arthur" no Compartilhar e nada aconteceu: a caixa so
aceitava e-mail. Agora a tela usa a mesma busca de pessoas da prancha
(/prancha/pessoas: nome, e-mail mascarado) e manda o id da pessoa escolhida.
- com usuario_id: compartilha com essa pessoa (ativa, nao bloqueada, nao excluida);
- e-mail continua funcionando como antes (resposta neutra);
- precisa de um dos dois; os dois juntos, ou nenhum: 422;
- consigo mesmo: 400; pessoa inexistente ou inativa: resposta neutra, nada gravado;
- auditoria igual a do e-mail (so ids).
Dados inventados.
"""

from app.modules.audit_logs import AuditLog
from app.modules.compartilhamentos_router import MENSAGEM_NEUTRA
from tests.conftest import cabecalho_auth, obter_token


def test_compartilha_pelo_id_da_pessoa_escolhida(client, criar_usuario, criar_ficha, db):
    remetente = criar_usuario()
    destinatario = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    ficha = criar_ficha()
    r = client.post(f"/shares/{ficha.id}", json={"usuario_id": destinatario.id, "mensagem": "Veja"},
                    headers=cabecalho_auth(t_rem))
    assert r.status_code == 200 and r.json()["mensagem"] == MENSAGEM_NEUTRA
    t_dest = obter_token(client, destinatario.email)
    lista = client.get("/shares/recebidas", headers=cabecalho_auth(t_dest)).json()
    assert lista["quantidade"] == 1 and lista["itens"][0]["mensagem"] == "Veja"
    assert db.query(AuditLog).filter(AuditLog.acao == "compartilhamento_imagem",
                                     AuditLog.detalhes == f"destinatario_id={destinatario.id}").count() == 1


def test_pessoa_inativa_ou_inexistente_nao_recebe(client, criar_usuario, criar_ficha):
    remetente = criar_usuario()
    inativo = criar_usuario(ativo=False)
    t_rem = obter_token(client, remetente.email)
    ficha = criar_ficha()
    for alvo in (inativo.id, 999999):
        r = client.post(f"/shares/{ficha.id}", json={"usuario_id": alvo}, headers=cabecalho_auth(t_rem))
        assert r.status_code == 200 and r.json()["mensagem"] == MENSAGEM_NEUTRA
    assert client.get("/shares/enviadas", headers=cabecalho_auth(t_rem)).json()["quantidade"] == 0


def test_precisa_de_email_ou_pessoa_e_nao_os_dois(client, criar_usuario, criar_ficha):
    remetente = criar_usuario()
    outro = criar_usuario()
    t_rem = obter_token(client, remetente.email)
    ficha = criar_ficha()
    assert client.post(f"/shares/{ficha.id}", json={}, headers=cabecalho_auth(t_rem)).status_code == 422
    assert client.post(f"/shares/{ficha.id}", json={"email": outro.email, "usuario_id": outro.id},
                       headers=cabecalho_auth(t_rem)).status_code == 422


def test_nao_compartilha_consigo_mesmo_pelo_id(client, criar_usuario, criar_ficha):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()
    r = client.post(f"/shares/{ficha.id}", json={"usuario_id": usuario.id}, headers=cabecalho_auth(token))
    assert r.status_code == 400
