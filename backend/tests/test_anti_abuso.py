"""
Limites anti-abuso (OWASP ASVS 2.1.3, 2.3.2, 2.4.1 e 15.2.2 -
docs/REGRAS_DE_NEGOCIO.md, secao 3; app/core/rate_limit.py).

Os pedidos contra fichas NAO aprovadas respondem 404, mas contam no limite
do mesmo jeito (o limite e conferido antes da rota) - assim os testes nao
precisam do Orthanc de verdade.
"""

import pytest
from fastapi import HTTPException

from app.core import rate_limit
from app.modules import search_router
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _numero(limite: str) -> int:
    return int(limite.split("/")[0])


def test_2_3_2_envio_de_uma_imagem_por_email_tem_limite(client, criar_usuario, criar_ficha):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    for _ in range(_numero(rate_limit.LIMITE_EMAIL_IMAGEM)):
        assert client.post(f"/search/{ficha.id}/send-email", headers=cabecalho_auth(token)).status_code == 404
    r = client.post(f"/search/{ficha.id}/send-email", headers=cabecalho_auth(token))
    assert r.status_code == 429
    assert r.json()["detail"] == rate_limit.MENSAGEM_LIMITE  # mensagem em portugues, no campo que a tela le


def test_2_3_2_limite_e_por_conta_nao_por_endereco(client, criar_usuario, criar_ficha):
    """Turma atras do mesmo endereco de rede (NAT da UFSC): um colega nao gasta o limite do outro."""
    primeiro, segundo = criar_usuario(), criar_usuario()
    t1, t2 = obter_token(client, primeiro.email), obter_token(client, segundo.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    for _ in range(_numero(rate_limit.LIMITE_EMAIL_IMAGEM) + 1):
        client.post(f"/search/{ficha.id}/send-email", headers=cabecalho_auth(t1))
    assert client.post(f"/search/{ficha.id}/send-email", headers=cabecalho_auth(t1)).status_code == 429
    assert client.post(f"/search/{ficha.id}/send-email", headers=cabecalho_auth(t2)).status_code == 404


def test_2_3_2_email_em_lote_tem_teto_de_imagens_e_de_frequencia(client, criar_usuario, criar_ficha):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    muitas = list(range(1, rate_limit.MAX_IMAGENS_EMAIL_LOTE + 2))
    r = client.post("/search/send-email-lote", json={"curation_ids": muitas}, headers=cabecalho_auth(token))
    assert r.status_code == 422

    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    for _ in range(_numero(rate_limit.LIMITE_EMAIL_LOTE)):
        r = client.post("/search/send-email-lote", json={"curation_ids": [ficha.id]}, headers=cabecalho_auth(token))
        assert r.status_code == 404
    r = client.post("/search/send-email-lote", json={"curation_ids": [ficha.id]}, headers=cabecalho_auth(token))
    assert r.status_code == 429


def test_15_2_2_downloads_zip_dividem_o_mesmo_limite(client, criar_usuario, criar_ficha):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    total = _numero(rate_limit.LIMITE_DOWNLOAD_ZIP)
    for i in range(total):
        tipo = "imagens" if i % 2 else "dicom"
        assert client.get(f"/search/{ficha.id}/download/{tipo}.zip", headers=cabecalho_auth(token)).status_code == 404
    assert client.get(f"/search/{ficha.id}/download/imagens.zip", headers=cabecalho_auth(token)).status_code == 429
    assert client.get(f"/search/{ficha.id}/download/dicom.zip", headers=cabecalho_auth(token)).status_code == 429


def test_15_2_2_zip_de_imagens_recusa_serie_grande_demais(client, criar_usuario, criar_ficha, monkeypatch):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()
    cortes = [f"corte-{i}" for i in range(rate_limit.MAX_CORTES_ZIP_PNG + 1)]
    monkeypatch.setattr(search_router, "_instancias_do_estudo_da_ficha", lambda f: ("estudo", cortes))
    renderizados = []
    monkeypatch.setattr(search_router.orthanc_client, "obter_preview_instancia", lambda i: renderizados.append(i) or b"png")
    r = client.get(f"/search/{ficha.id}/download/imagens.zip", headers=cabecalho_auth(token))
    assert r.status_code == 422 and "DICOM" in r.json()["detail"]
    assert renderizados == []  # recusou ANTES de gastar o servidor


def test_15_2_2_no_maximo_dois_zips_montados_ao_mesmo_tempo():
    vagas = [rate_limit.VagaDeTrabalhoPesado() for _ in range(rate_limit.MAX_ZIPS_SIMULTANEOS)]
    for vaga in vagas:
        vaga.__enter__()
    try:
        with pytest.raises(HTTPException) as erro:
            with rate_limit.VagaDeTrabalhoPesado():
                pass
        assert erro.value.status_code == 503
    finally:
        for vaga in vagas:
            vaga.__exit__(None, None, None)
    with rate_limit.VagaDeTrabalhoPesado():  # vagas devolvidas: volta a aceitar
        pass


def test_15_2_2_upload_dicom_tem_limite(client, criar_usuario):
    professor = criar_usuario(perfil=UserRole.professor)
    token = obter_token(client, professor.email)
    rate_limit.limiter.reset()
    # arquivo vazio: recusado pela rota, mas conta no limite
    for _ in range(_numero(rate_limit.LIMITE_UPLOAD_DICOM)):
        client.post("/images/upload", files={"arquivo": ("a.dcm", b"", "application/dicom")}, headers=cabecalho_auth(token))
    r = client.post("/images/upload", files={"arquivo": ("a.dcm", b"", "application/dicom")}, headers=cabecalho_auth(token))
    assert r.status_code == 429


def test_2_4_1_limite_geral_em_todas_as_rotas(client, criar_usuario):
    """Robo varrendo o sistema: rota comum (sem limite proprio) tambem e barrada."""
    usuario, colega = criar_usuario(), criar_usuario()
    token, token_colega = obter_token(client, usuario.email), obter_token(client, colega.email)
    for _ in range(_numero(rate_limit.LIMITE_GERAL)):
        assert client.get("/auth/me", headers=cabecalho_auth(token)).status_code == 200
    r = client.get("/auth/me", headers=cabecalho_auth(token))
    assert r.status_code == 429 and r.json()["detail"] == rate_limit.MENSAGEM_LIMITE
    assert client.get("/auth/me", headers=cabecalho_auth(token_colega)).status_code == 200


def test_2_4_1_portaria_das_imagens_e_saude_fora_do_limite_geral(client, criar_usuario, monkeypatch):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    monkeypatch.setattr(rate_limit, "_ITEM_GERAL", rate_limit.parse("3/minute"))
    for _ in range(5):
        assert client.get("/health").status_code == 200
        assert client.get("/visualizador/autorizar", headers=cabecalho_auth(token)).status_code != 429
    for _ in range(3):
        client.get("/auth/me", headers=cabecalho_auth(token))
    assert client.get("/auth/me", headers=cabecalho_auth(token)).status_code == 429


def test_2_4_1_tela_recebe_a_mensagem_do_429(client, criar_usuario, monkeypatch):
    """O 429 do limite geral sai com permissao de CORS: a tela mostra a mensagem, nao "erro de rede"."""
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    monkeypatch.setattr(rate_limit, "_ITEM_GERAL", rate_limit.parse("1/minute"))
    origem = rate_limit_origem()
    client.get("/auth/me", headers=cabecalho_auth(token))
    r = client.get("/auth/me", headers={**cabecalho_auth(token), "Origin": origem})
    assert r.status_code == 429
    assert r.headers["access-control-allow-origin"] == origem
    assert r.headers["x-content-type-options"] == "nosniff"  # cabecalhos de protecao tambem no 429
    r = client.get("/auth/me", headers={**cabecalho_auth(token), "Origin": "https://site-atacante.example"})
    assert "access-control-allow-origin" not in r.headers


def rate_limit_origem() -> str:
    from app.core.cabecalhos import ORIGENS_PERMITIDAS

    return ORIGENS_PERMITIDAS[0]
