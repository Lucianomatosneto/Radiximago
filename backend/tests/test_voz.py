"""
Curadoria por voz (rota do backend): so curadoria, repassa ao servico
local, nao guarda o audio, registra na auditoria e trata o servico fora do ar.
"""

import httpx

from app.modules import voz_router
from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


class RespostaFalsa:
    def __init__(self, status, dados):
        self.status_code = status
        self._dados = dados

    def json(self):
        return self._dados

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("erro", request=None, response=None)


def test_transcreve_repassando_ao_servico_local(client, criar_usuario, db, monkeypatch):
    curador = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, curador.email)
    enviado = {}

    def post_falso(url, files=None, data=None, timeout=None):
        enviado.update(url=url, files=files, data=data)
        return RespostaFalsa(200, {"texto": "Periapical, dente 36.", "duracao_s": 2.5, "processamento_s": 1.1, "modelo": "small"})

    monkeypatch.setattr(voz_router.httpx, "post", post_falso)
    r = client.post(
        "/voz/transcrever",
        files={"arquivo": ("trecho.webm", b"audio-falso", "audio/webm;codecs=opus")},
        headers=cabecalho_auth(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["texto"] == "Periapical, dente 36."
    assert enviado["url"].endswith("/transcrever")
    assert "Periapical" in enviado["data"]["prompt"]
    assert enviado["data"]["rapido"] == "0"
    # escuta continua: trecho curto pede o modo rapido ao Whisper
    r = client.post(
        "/voz/transcrever",
        files={"arquivo": ("trecho.webm", b"audio-falso", "audio/webm")},
        data={"rapido": "true"},
        headers=cabecalho_auth(token),
    )
    assert r.status_code == 200, r.text
    assert enviado["data"]["rapido"] == "1"
    auditoria = db.query(AuditLog).filter(AuditLog.usuario_id == curador.id, AuditLog.acao == "transcricao_voz").all()
    assert len(auditoria) == 2 and "Periapical" not in (auditoria[0].detalhes or "")


def test_voz_so_para_curadoria_e_valida_arquivo(client, criar_usuario, monkeypatch):
    estudante = criar_usuario()
    curador = criar_usuario(perfil=UserRole.curador)
    t_est = obter_token(client, estudante.email)
    t_cur = obter_token(client, curador.email)
    arquivo = {"arquivo": ("a.webm", b"x", "audio/webm")}
    assert client.post("/voz/transcrever", files=arquivo, headers=cabecalho_auth(t_est)).status_code == 403
    assert client.post("/voz/transcrever", files={"arquivo": ("a.txt", b"x", "text/plain")}, headers=cabecalho_auth(t_cur)).status_code == 415
    assert client.post("/voz/transcrever", files={"arquivo": ("a.webm", b"", "audio/webm")}, headers=cabecalho_auth(t_cur)).status_code == 400


def test_servico_de_voz_fora_do_ar(client, criar_usuario, monkeypatch):
    curador = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, curador.email)

    def falha(*a, **k):
        raise httpx.ConnectError("sem conexao")

    monkeypatch.setattr(voz_router.httpx, "post", falha)
    monkeypatch.setattr(voz_router.httpx, "get", falha)
    r = client.post("/voz/transcrever", files={"arquivo": ("a.webm", b"x", "audio/webm")}, headers=cabecalho_auth(token))
    assert r.status_code == 503
    assert client.get("/voz/saude", headers=cabecalho_auth(token)).json() == {"disponivel": False}
