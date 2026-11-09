"""
08/11/2026 - informacoes adicionais e anexos da curadoria (pedido do Luciano):
texto livre + imagens anexadas pelo curador. NAO entram na Pesquisa
avancada; so aparecem para quem abre a imagem curada (aprovada).
"""

import io

import pytest
from PIL import Image

from app.core.config import settings
from app.modules.anexos_curadoria import AnexoCuradoria
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _jpeg_com_exif() -> bytes:
    im = Image.new("RGB", (64, 48), (200, 50, 50))
    exif = Image.Exif()
    exif[0x010F] = "MarcaDoCelular"  # Make
    b = io.BytesIO()
    im.save(b, format="JPEG", exif=exif)
    return b.getvalue()


@pytest.fixture()
def pasta(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ANEXOS_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture()
def limpar(db):
    ids = []
    yield ids
    db.query(AnexoCuradoria).filter(AnexoCuradoria.curation_id.in_(ids)).delete(synchronize_session=False)
    db.commit()


def test_anexo_entra_sem_metadados_e_so_aparece_na_imagem_aprovada(client, criar_usuario, criar_ficha, db, pasta, limpar):
    curador, aluno, suporte = (criar_usuario(perfil=UserRole.curador), criar_usuario(),
                               criar_usuario(perfil=UserRole.suporte))
    hc = cabecalho_auth(obter_token(client, curador.email))
    ha = cabecalho_auth(obter_token(client, aluno.email))
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value, descricao_didatica="anexos-teste")
    limpar.append(ficha.id)

    # texto adicional e salvo na ficha
    r = client.patch(f"/curation/{ficha.id}", headers=hc, json={"informacoes_adicionais": "  Caso xilofonetico visto na aula  "})
    assert r.status_code == 200 and r.json()["informacoes_adicionais"] == "Caso xilofonetico visto na aula"

    r = client.post(f"/curation/{ficha.id}/anexos", headers=hc,
                    files={"arquivo": ("../../foto <paciente>.jpg", _jpeg_com_exif(), "image/jpeg")})
    assert r.status_code == 200, r.text
    anexo = r.json()
    assert "/" not in anexo["nome"] and "<" not in anexo["nome"]
    gravado = next(pasta.iterdir()).read_bytes()
    assert b"MarcaDoCelular" not in gravado   # EXIF ficou para tras

    # arquivo que nao e imagem, e suporte/aluno nao anexam
    assert client.post(f"/curation/{ficha.id}/anexos", headers=hc,
                       files={"arquivo": ("x.jpg", b"isto nao e imagem", "image/jpeg")}).status_code == 422
    hs = cabecalho_auth(obter_token(client, suporte.email))
    assert client.post(f"/curation/{ficha.id}/anexos", headers=hs,
                       files={"arquivo": ("a.jpg", _jpeg_com_exif(), "image/jpeg")}).status_code == 403
    assert client.post(f"/curation/{ficha.id}/anexos", headers=ha,
                       files={"arquivo": ("a.jpg", _jpeg_com_exif(), "image/jpeg")}).status_code == 403

    # o suporte LE na curadoria; o aluno nao ve antes de aprovar
    assert client.get(f"/curation/{ficha.id}/anexos", headers=hs).json()["anexos"][0]["id"] == anexo["id"]
    assert client.get(f"/search/{ficha.id}/anexos", headers=ha).status_code == 404

    ficha.status = StatusCuradoria.APROVADA.value
    db.commit()
    dados = client.get(f"/search/{ficha.id}/anexos", headers=ha).json()
    assert dados["informacoes_adicionais"] == "Caso xilofonetico visto na aula" and len(dados["anexos"]) == 1
    arq = client.get(f"/search/{ficha.id}/anexos/{anexo['id']}/arquivo", headers=ha)
    assert arq.status_code == 200 and arq.headers["content-type"] == "image/jpeg"

    # a Pesquisa avancada NAO procura no texto adicional
    r = client.get("/search", headers=ha, params={"texto": "xilofonetico", "limit": 200})
    assert r.status_code == 200, r.text
    assert ficha.id not in {i["curation_id"] for i in r.json()["itens"]}
    item = next(i for i in client.get("/search", headers=ha, params={"limit": 200}).json()["itens"] if i["curation_id"] == ficha.id)
    assert item["total_anexos"] == 1 and item["tem_informacoes_adicionais"] is True

    # remover apaga o arquivo e fica na auditoria
    assert client.delete(f"/curation/{ficha.id}/anexos/{anexo['id']}", headers=hc).status_code == 200
    assert list(pasta.iterdir()) == []
    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.usuario_id == curador.id)}
    assert {"anexo_curadoria_adicionado", "anexo_curadoria_removido"} <= acoes


def test_limite_de_anexos_por_ficha(client, criar_usuario, criar_ficha, pasta, limpar, monkeypatch):
    from app.modules import anexos_curadoria
    monkeypatch.setattr(anexos_curadoria, "MAX_ANEXOS", 1)
    h = cabecalho_auth(obter_token(client, criar_usuario(perfil=UserRole.curador).email))
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    limpar.append(ficha.id)
    png = io.BytesIO()
    Image.new("RGB", (10, 10)).save(png, format="PNG")
    arq = {"arquivo": ("a.png", png.getvalue(), "image/png")}
    assert client.post(f"/curation/{ficha.id}/anexos", headers=h, files=arq).status_code == 200
    assert client.post(f"/curation/{ficha.id}/anexos", headers=h, files=arq).status_code == 422
