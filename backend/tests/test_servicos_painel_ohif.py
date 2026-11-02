"""
B2 da auditoria do administrador (01/11/2026):
- o OHIF aparecia "Instavel" quando o NAVEGADOR nao conseguia testar
  (falso alarme): agora o servidor confere pela rede interna (OHIF_URL);
- o Painel mostra os mesmos servicos da tela Integracoes.
"""

import re
from pathlib import Path

import httpx

from app.core.config import settings
from app.modules import integracoes_router
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

FRONT = Path(__file__).resolve().parents[2] / "frontend/src/app"


class _Resposta:
    def __init__(self, codigo):
        self.status_code = codigo


def test_sem_endereco_interno_fica_para_o_navegador(monkeypatch):
    monkeypatch.setattr(settings, "OHIF_URL", "")
    assert integracoes_router.situacao_ohif() == {"status": "nao_verificado", "codigo": None}


def test_ohif_respondendo_e_online(monkeypatch):
    chamado = {}
    monkeypatch.setattr(settings, "OHIF_URL", "http://radix-ohif/")

    def falso_get(url, **kw):
        chamado["url"] = url
        return _Resposta(200)

    monkeypatch.setattr(integracoes_router.httpx, "get", falso_get)
    assert integracoes_router.situacao_ohif() == {"status": "online", "codigo": 200}
    assert chamado["url"] == "http://radix-ohif/"


def test_ohif_fora_do_ar_e_offline_com_codigo(monkeypatch):
    monkeypatch.setattr(settings, "OHIF_URL", "http://radix-ohif")
    monkeypatch.setattr(integracoes_router.httpx, "get", lambda url, **kw: _Resposta(502))
    assert integracoes_router.situacao_ohif() == {"status": "offline", "codigo": 502}

    def sem_rede(url, **kw):
        raise httpx.ConnectError("recusado")

    monkeypatch.setattr(integracoes_router.httpx, "get", sem_rede)
    assert integracoes_router.situacao_ohif() == {"status": "offline", "codigo": None}


def test_rota_status_inclui_ohif(client, criar_usuario, monkeypatch):
    monkeypatch.setattr(settings, "OHIF_URL", "")
    admin = criar_usuario(perfil=UserRole.administrador)
    r = client.get("/integracoes/status", headers=cabecalho_auth(obter_token(client, admin.email)))
    assert r.status_code == 200
    assert r.json()["ohif"]["status"] == "nao_verificado"


def test_painel_mostra_os_mesmos_servicos_que_integracoes():
    integracoes = (FRONT / "integracoes/page.tsx").read_text(encoding="utf-8")
    painel = (FRONT / "painel-admin/page.tsx").read_text(encoding="utf-8")
    nomes = set(re.findall(r'nome="([^"]+)"', integracoes))
    for nome in nomes:
        assert f"'{nome}'" in painel, nome
    for chave in ("servicoEmail", "servicoArmazenamento"):
        assert chave in painel
    # ninguem mais decide o OHIF so pelo navegador com texto proprio
    assert "avaliarOhif" in integracoes and "avaliarOhif" in painel
