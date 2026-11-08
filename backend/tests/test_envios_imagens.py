"""
Etapa B da separacao Radix Imago / Radix Clinica (08/11/2026): todos os
perfis enviam imagens. Estudante: "so para mim" ou "enviar para analise"
(SO para o professor/curador escolhido, que poe na fila ou devolve).
Professor e curador: fila de curadoria. So o curador publica no banco geral.
O Orthanc e substituido por um falso (os testes nao dependem dele).
"""

import io
import uuid

import pydicom
import pytest
from PIL import Image

from app.modules import envios_router, foto_para_dicom, images_router
from app.modules.audit_logs import AuditLog
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _jpg(com_exif: bool = True) -> bytes:
    img = Image.new("RGB", (64, 48), (200, 200, 200))
    saida = io.BytesIO()
    if com_exif:
        exif = Image.Exif()
        exif[0x010F] = "MarcaDoCelular"      # Make
        exif[0x0132] = "2026:11:08 10:00:00"  # DateTime
        img.save(saida, "JPEG", exif=exif.tobytes())
    else:
        img.save(saida, "JPEG")
    return saida.getvalue()


@pytest.fixture()
def orthanc_falso(monkeypatch, db):
    recebidos: list[bytes] = []
    criadas: list[int] = []

    def enviar(conteudo):
        recebidos.append(conteudo)
        return {"ID": uuid.uuid4().hex}

    def registrar(sessao, orthanc_id):
        ref = OrthancReference(orthanc_id=f"anon-{orthanc_id}", resource_type="instance",
                               anonimizacao_status="concluida", enquadramento="sem_borda",
                               study_instance_uid=f"1.2.{uuid.uuid4().int % 10**12}")
        sessao.add(ref)
        sessao.commit()
        criadas.append(ref.id)
        return ref, True

    monkeypatch.setattr(images_router.orthanc_client, "enviar_instancia", enviar)
    monkeypatch.setattr(images_router, "_registrar_referencia_se_nova", registrar)
    monkeypatch.setattr(envios_router.orthanc_client, "obter_preview_instancia", lambda oid: b"PNG")
    yield recebidos
    for rid in criadas:
        ref = db.get(OrthancReference, rid)
        if ref:
            db.delete(ref)
    db.commit()


def _enviar(client, cab, destino, conteudo=None, **campos):
    dados = {"destino": destino, **{k: str(v) for k, v in campos.items()}}
    return client.post("/envios", headers=cab, data=dados,
                       files={"arquivo": ("foto.jpg", conteudo or _jpg(), "image/jpeg")})


def test_foto_vira_dicom_sem_metadados_do_celular():
    convertido = foto_para_dicom.converter(_jpg())
    ds = pydicom.dcmread(io.BytesIO(convertido))
    assert ds.SOPClassUID == foto_para_dicom.SECONDARY_CAPTURE
    assert str(ds.PatientName) == "ANONIMO" and ds.Rows == 48 and ds.Columns == 64
    assert b"MarcaDoCelular" not in convertido and b"2026:11:08" not in convertido
    with pytest.raises(foto_para_dicom.FotoInvalida):
        foto_para_dicom.converter(b"\xff\xd8\xff" + b"lixo")


def test_estudante_so_para_mim_nao_entra_na_fila_nem_para_o_curador(client, criar_usuario, orthanc_falso, db):
    aluno = criar_usuario()
    curador = criar_usuario(perfil=UserRole.curador)
    cab_aluno = cabecalho_auth(obter_token(client, aluno.email))
    cab_cur = cabecalho_auth(obter_token(client, curador.email))
    antes = client.get("/curation/pending", headers=cab_cur).json()["total_pendentes"]

    r = _enviar(client, cab_aluno, "pessoal")
    assert r.status_code == 200, r.text
    assert r.json()["foto_convertida"] is True
    ref_id = r.json()["orthanc_reference_id"]
    assert pydicom.dcmread(io.BytesIO(orthanc_falso[0])).Modality == "OT"

    meus = client.get("/envios/meus", headers=cab_aluno).json()["itens"]
    assert [i["situacao"] for i in meus if i["id"] == ref_id] == ["so_para_mim"]
    assert client.get("/curation/pending", headers=cab_cur).json()["total_pendentes"] == antes
    assert ref_id not in {i["id"] for i in client.get("/images/", headers=cab_cur).json()}
    assert client.get(f"/curation/{ref_id}/preview", headers=cab_cur).status_code == 404
    assert client.get(f"/envios/{ref_id}/preview", headers=cab_aluno).status_code == 200
    assert client.get(f"/envios/{ref_id}/preview", headers=cab_cur).status_code == 404
    # o curador nao consegue fazer ficha de uma imagem pessoal
    assert client.post(f"/curation/{ref_id}", headers=cab_cur, json={}).status_code in (409, 422)


def test_estudante_nao_manda_direto_para_a_fila(client, criar_usuario, orthanc_falso):
    aluno = criar_usuario()
    cab = cabecalho_auth(obter_token(client, aluno.email))
    assert _enviar(client, cab, "fila").status_code == 422
    # analise exige um professor ou curador de verdade
    outro_aluno = criar_usuario()
    assert _enviar(client, cab, "analise", analista_id=outro_aluno.id).status_code == 422
    assert _enviar(client, cab, "analise").status_code == 422


def test_analise_vai_so_para_a_pessoa_escolhida_que_poe_na_fila_ou_devolve(client, criar_usuario, orthanc_falso, db):
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    outro_prof = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    cab_aluno = cabecalho_auth(obter_token(client, aluno.email))
    cab_prof = cabecalho_auth(obter_token(client, professor.email))
    cab_outro = cabecalho_auth(obter_token(client, outro_prof.email))
    cab_cur = cabecalho_auth(obter_token(client, curador.email))

    nomes = {p["id"] for p in client.get("/envios/analistas", headers=cab_aluno).json()["pessoas"]}
    assert {professor.id, curador.id} <= nomes and aluno.id not in nomes

    r = _enviar(client, cab_aluno, "analise", analista_id=professor.id, nota="Isto e uma lesao?")
    assert r.status_code == 200, r.text
    ref_id = r.json()["orthanc_reference_id"]
    lista = client.get("/envios/para-analisar", headers=cab_prof).json()["itens"]
    assert [i["analise_nota"] for i in lista if i["id"] == ref_id] == ["Isto e uma lesao?"]
    assert ref_id not in {i["id"] for i in client.get("/envios/para-analisar", headers=cab_outro).json()["itens"]}
    assert client.get(f"/envios/{ref_id}/preview", headers=cab_prof).status_code == 200
    assert client.get(f"/envios/{ref_id}/preview", headers=cab_outro).status_code == 404

    # outro professor nao decide; devolver exige recado
    assert client.post(f"/envios/{ref_id}/decidir", headers=cab_outro, json={"acao": "fila"}).status_code == 404
    assert client.post(f"/envios/{ref_id}/decidir", headers=cab_prof, json={"acao": "devolver"}).status_code == 422
    assert client.post(f"/envios/{ref_id}/decidir", headers=cab_prof,
                       json={"acao": "devolver", "nota": "Foto tremida, tire de novo"}).status_code == 200
    item = [i for i in client.get("/envios/meus", headers=cab_aluno).json()["itens"] if i["id"] == ref_id][0]
    assert item["situacao"] == "devolvida" and item["devolucao_nota"] == "Foto tremida, tire de novo"

    # o aluno manda de novo; agora o professor poe na fila e o curador ve
    assert client.post(f"/envios/{ref_id}/analise", headers=cab_aluno,
                       json={"analista_id": professor.id}).status_code == 200
    assert client.post(f"/envios/{ref_id}/decidir", headers=cab_prof, json={"acao": "fila"}).status_code == 200
    pendentes = client.get("/curation/pending?limit=200", headers=cab_cur).json()["itens"]
    assert ref_id in {p["orthanc_reference_id"] for p in pendentes}
    assert client.delete(f"/envios/{ref_id}", headers=cab_aluno).status_code == 409  # ja na fila

    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade_id == ref_id,
                                                          AuditLog.entidade == "orthanc_reference")}
    assert {"upload_imagem", "foto_convertida_dicom", "imagem_enviada_analise",
            "imagem_analise_devolvida", "imagem_analise_para_fila"} <= acoes


def test_professor_envia_para_a_fila_e_dono_retira_imagem_pessoal(client, criar_usuario, orthanc_falso):
    professor = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    cab_prof = cabecalho_auth(obter_token(client, professor.email))
    cab_cur = cabecalho_auth(obter_token(client, curador.email))
    na_fila = _enviar(client, cab_prof, "fila").json()["orthanc_reference_id"]
    pendentes = client.get("/curation/pending?limit=200", headers=cab_cur).json()["itens"]
    assert na_fila in {p["orthanc_reference_id"] for p in pendentes}
    assert _enviar(client, cab_prof, "analise", analista_id=curador.id).status_code == 422

    pessoal = _enviar(client, cab_prof, "pessoal").json()["orthanc_reference_id"]
    assert client.delete(f"/envios/{pessoal}", headers=cab_cur).status_code == 404  # nao e dono
    assert client.delete(f"/envios/{pessoal}", headers=cab_prof).status_code == 200
    assert pessoal not in {i["id"] for i in client.get("/envios/meus", headers=cab_prof).json()["itens"]}


def test_pesquisador_e_suporte_nao_enviam(client, criar_usuario, orthanc_falso):
    for perfil in (UserRole.pesquisador, UserRole.suporte):
        u = criar_usuario(perfil=perfil)
        assert _enviar(client, cabecalho_auth(obter_token(client, u.email)), "pessoal").status_code == 403


def test_telas_enviar_imagem_camera_e_listas():
    from pathlib import Path

    front = Path(__file__).resolve().parents[2] / "frontend/src"
    tela = (front / "app/enviar-imagem/page.tsx").read_text(encoding="utf-8")
    assert 'capture="environment"' in tela          # camera de tras do celular
    assert "fetch(`${API}/envios`" in tela
    assert "['pessoal', 'analise']" in tela and "['fila', 'pessoal']" in tela
    menu = (front / "components/Sidebar.tsx").read_text(encoding="utf-8")
    assert "href: '/enviar-imagem'" in menu
    assert '<SecaoEnvios modo="meus" />' in (front / "app/minhas-imagens/page.tsx").read_text(encoding="utf-8")
    assert '<SecaoEnvios modo="analisar" />' in (front / "app/compartilhadas-comigo/page.tsx").read_text(encoding="utf-8")
