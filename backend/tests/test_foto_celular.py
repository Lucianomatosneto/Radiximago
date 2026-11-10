"""
Fase 1 - FOTO DO NEGATOSCOPIO PELO CELULAR (10/11/2026).
docs/ESPECIFICACAO_FASE1_FOTO_CELULAR.md, secao 7 (testes obrigatorios):
unitarios (conversao), integracao (perfis, destinos, limites, falhas),
janela de 5 minutos e seguranca.

O Orthanc e substituido pelo falso de tests/test_envios_imagens.py.
"""

import io
from datetime import timedelta

import pydicom
import pytest
from PIL import Image, ImageDraw

from app.core.config import settings
from app.modules import envios_router, foto_para_dicom, images_router, janela_foto
from app.modules.audit_logs import AuditLog
from app.modules.curations import Curation
from app.modules.orthanc_references import OrthancReference
from app.modules.texto_na_imagem import ResultadoTexto
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token
from tests.test_envios_imagens import _jpg, orthanc_falso  # noqa: F401 (fixture)

_CABS: dict[int, dict] = {}


def _cab(client, u):
    if u.id not in _CABS:
        from app.main import app
        app.state.limiter.reset()
        _CABS[u.id] = cabecalho_auth(obter_token(client, u.email))
    return _CABS[u.id]


def _jpg_com_gps() -> bytes:
    img = Image.new("RGB", (80, 60), (180, 180, 180))
    exif = Image.Exif()
    exif[0x010F] = "MarcaDoCelular"
    exif[0x8825] = {1: "S", 2: (27.0, 35.0, 0.0), 3: "W", 4: (48.0, 32.0, 0.0)}  # GPS Florianopolis
    saida = io.BytesIO()
    img.save(saida, "JPEG", exif=exif.tobytes())
    return saida.getvalue()


def _janela(client, cab) -> dict:
    r = client.post("/envios/foto/iniciar", headers=cab)
    assert r.status_code == 200, r.text
    return r.json()


def _foto(client, cab, destino="pessoal", comprovante=None, conteudo=None, confirmar=True, **campos):
    comprovante = comprovante or _janela(client, cab)["comprovante"]
    dados = {"destino": destino, "comprovante": comprovante,
             "confirmacao_sem_identificacao": "true" if confirmar else "false",
             **{k: str(v) for k, v in campos.items()}}
    return client.post("/envios/foto", headers=cab, data=dados,
                       files={"arquivo": ("foto.jpg", conteudo or _jpg(), "image/jpeg")})


@pytest.fixture()
def relogio(monkeypatch):
    """Relogio do SERVIDOR controlado pelo teste (o do celular nao conta)."""
    real = janela_foto.agora
    deslocamento = {"valor": timedelta()}
    monkeypatch.setattr(janela_foto, "agora", lambda: real() + deslocamento["valor"])
    return deslocamento


# --- unitarios: conversao ------------------------------------------------------

def test_conversao_gera_secondary_capture_ot_cinza_sem_escala_nem_dados_pessoais():
    a = pydicom.dcmread(io.BytesIO(foto_para_dicom.converter(_jpg_com_gps(), negatoscopio=True)))
    b = pydicom.dcmread(io.BytesIO(foto_para_dicom.converter(_jpg_com_gps(), negatoscopio=True)))
    assert a.SOPClassUID == foto_para_dicom.SECONDARY_CAPTURE and a.Modality == "OT"
    assert a.PhotometricInterpretation == "MONOCHROME2" and a.BitsAllocated == 8 and a.SamplesPerPixel == 1
    assert "PixelSpacing" not in a and "escala" in str(a.ImageComments).lower()
    assert a.SeriesDescription == "Foto de negatoscopio"
    assert {a.SOPInstanceUID, a.StudyInstanceUID, a.SeriesInstanceUID}.isdisjoint(
        {b.SOPInstanceUID, b.StudyInstanceUID, b.SeriesInstanceUID})
    assert str(a.PatientName) == "ANONIMO" and a.PatientID == "ANONIMO"
    bruto = foto_para_dicom.converter(_jpg_com_gps())
    assert b"MarcaDoCelular" not in bruto and b"GPS" not in bruto


# --- integracao: perfis e destinos ------------------------------------------------

def test_cada_perfil_envia_foto_no_destino_permitido(client, criar_usuario, orthanc_falso, db):
    for perfil, destino in ((UserRole.estudante, "pessoal"), (UserRole.professor, "fila"),
                            (UserRole.curador, "fila"), (UserRole.administrador, "pessoal")):
        u = criar_usuario(perfil=perfil)
        r = _foto(client, _cab(client, u), destino)
        assert r.status_code == 200, (perfil, r.text)
        ref = db.get(OrthancReference, r.json()["orthanc_reference_id"])
        assert ref.formato_entrada == "foto" and ref.enviado_por_id == u.id and ref.destino == destino
    assert pydicom.dcmread(io.BytesIO(orthanc_falso[-1])).Modality == "OT"


def test_pesquisador_e_suporte_nao_abrem_janela_nem_enviam(client, criar_usuario, orthanc_falso):
    for perfil in (UserRole.pesquisador, UserRole.suporte):
        cab = _cab(client, criar_usuario(perfil=perfil))
        assert client.post("/envios/foto/iniciar", headers=cab).status_code == 403
        r = client.post("/envios/foto", headers=cab, data={"destino": "pessoal", "comprovante": "x",
                                                           "confirmacao_sem_identificacao": "true"},
                        files={"arquivo": ("f.jpg", _jpg(), "image/jpeg")})
        assert r.status_code == 403


def test_destinatario_precisa_ser_professor_ou_curador_ativo(client, criar_usuario, orthanc_falso, db):
    aluno, colega = criar_usuario(), criar_usuario()
    prof = criar_usuario(perfil=UserRole.professor)
    cab = _cab(client, aluno)
    assert _foto(client, cab, "analise", analista_id=colega.id).status_code == 422
    assert _foto(client, cab, "fila").status_code == 422          # estudante nao vai direto a fila

    # o professor foi desativado DURANTE a janela: recusado no envio
    comprovante = _janela(client, cab)["comprovante"]
    prof.ativo = False
    db.commit()
    assert _foto(client, cab, "analise", comprovante=comprovante, analista_id=prof.id).status_code == 422
    prof.ativo = True
    db.commit()
    r = _foto(client, cab, "analise", comprovante=comprovante, analista_id=prof.id, nota="Lesao?")
    assert r.status_code == 200, r.text
    ref_id = r.json()["orthanc_reference_id"]
    assert ref_id in {i["id"] for i in client.get("/envios/para-analisar", headers=_cab(client, prof)).json()["itens"]}
    acoes = {a for (a,) in db.query(AuditLog.acao).filter(AuditLog.entidade == "orthanc_reference",
                                                          AuditLog.entidade_id == ref_id)}
    assert {"upload_imagem", "foto_recebida", "foto_convertida_dicom", "foto_enviada_analise"} <= acoes
    # o dono pode retirar enquanto esta em analise (decisao de 10/11/2026)
    assert client.delete(f"/envios/{ref_id}", headers=cab).status_code == 200
    assert ref_id not in {i["id"] for i in client.get("/envios/para-analisar", headers=_cab(client, prof)).json()["itens"]}


def test_ficha_da_foto_nasce_com_modalidade_ot(client, criar_usuario, orthanc_falso, db):
    prof, curador = criar_usuario(perfil=UserRole.professor), criar_usuario(perfil=UserRole.curador)
    ref_id = _foto(client, _cab(client, prof), "fila").json()["orthanc_reference_id"]
    r = client.post(f"/curation/{ref_id}", headers=_cab(client, curador), json={"tipo_radiografia": "periapical"})
    assert r.status_code in (200, 201), r.text
    ficha = db.query(Curation).filter(Curation.orthanc_reference_id == ref_id).one()
    assert ficha.modalidade == "OT"
    # limpeza (o historico da ficha e protegido; so o teste desliga o gatilho)
    from sqlalchemy import text
    db.rollback()
    db.execute(text("SET LOCAL session_replication_role = replica"))
    db.execute(text("DELETE FROM curation_history WHERE curation_id = :i"), {"i": ficha.id})
    db.execute(text("DELETE FROM curations WHERE id = :i"), {"i": ficha.id})
    db.commit()


def test_envio_comum_nao_aceita_mais_foto(client, criar_usuario, orthanc_falso):
    cab = _cab(client, criar_usuario())
    r = client.post("/envios", headers=cab, data={"destino": "pessoal"},
                    files={"arquivo": ("foto.jpg", _jpg(), "image/jpeg")})
    assert r.status_code == 422 and "Foto" in r.json()["detail"]


def test_sem_confirmacao_e_recusado_sem_gastar_a_janela(client, criar_usuario, orthanc_falso):
    cab = _cab(client, criar_usuario())
    comprovante = _janela(client, cab)["comprovante"]
    assert _foto(client, cab, comprovante=comprovante, confirmar=False).status_code == 422
    assert _foto(client, cab, comprovante=comprovante).status_code == 200


def test_arquivo_grande_ou_de_outro_tipo_e_recusado_e_a_janela_volta(client, criar_usuario, orthanc_falso,
                                                                     monkeypatch, db):
    u = criar_usuario()
    cab = _cab(client, u)
    comprovante = _janela(client, cab)["comprovante"]
    monkeypatch.setattr(settings, "FOTO_TAMANHO_MAX_MB", 1)
    grande = b"\xff\xd8\xff" + b"0" * (1024 * 1024 + 10)
    assert _foto(client, cab, comprovante=comprovante, conteudo=grande).status_code == 413
    html = b"<html><script>alert(1)</script></html>"
    assert _foto(client, cab, comprovante=comprovante, conteudo=html).status_code == 422
    dicom = foto_para_dicom.converter(_jpg())
    assert _foto(client, cab, comprovante=comprovante, conteudo=dicom).status_code == 422
    # depois das recusas pelo ARQUIVO, a mesma janela ainda vale
    assert _foto(client, cab, comprovante=comprovante).status_code == 200
    motivos = {d for (d,) in db.query(AuditLog.detalhes).filter(AuditLog.usuario_id == u.id,
                                                                  AuditLog.acao == "foto_recusada")}
    assert {"motivo=arquivo_grande", "motivo=arquivo_invalido"} <= motivos


def test_limite_de_janelas_por_hora(client, criar_usuario):
    cab = _cab(client, criar_usuario())
    codigos = [client.post("/envios/foto/iniciar", headers=cab).status_code for _ in range(31)]
    assert codigos[:30] == [200] * 30 and codigos[30] == 429


def test_falha_do_orthanc_nao_deixa_registro_pela_metade(client, criar_usuario, orthanc_falso, monkeypatch, db):
    import httpx

    u = criar_usuario()
    cab = _cab(client, u)

    def falhar(conteudo):
        raise httpx.ConnectError("Orthanc fora do ar")

    monkeypatch.setattr(images_router.orthanc_client, "enviar_instancia", falhar)
    comprovante = _janela(client, cab)["comprovante"]
    assert _foto(client, cab, comprovante=comprovante).status_code == 502
    assert db.query(OrthancReference).filter(OrthancReference.enviado_por_id == u.id).count() == 0
    monkeypatch.undo()
    assert _foto(client, cab, comprovante=comprovante).status_code in (200, 502)  # janela liberada


def test_registro_que_falha_apaga_a_versao_anonimizada_do_orthanc(monkeypatch, db):
    """_registrar_referencia_se_nova: se o banco falhar, a copia anonimizada nao fica orfa."""
    apagadas = []
    monkeypatch.setattr(images_router, "_determinar_origem", lambda oid: "externa")
    monkeypatch.setattr(images_router, "_anonimizar_e_excluir_original",
                        lambda oid: ("anon-orfa", ResultadoTexto("sem_texto"), type("R", (), {"situacao": "sem_borda"})()))

    def detalhes(oid):
        raise RuntimeError("banco/Orthanc caiu no meio")

    monkeypatch.setattr(images_router.orthanc_client, "obter_detalhes_instancia", detalhes)
    monkeypatch.setattr(images_router.orthanc_client, "excluir_instancia", apagadas.append)
    with pytest.raises(RuntimeError):
        images_router._registrar_referencia_se_nova(db, "original-x")
    assert apagadas == ["anon-orfa"]


# --- janela de 5 minutos -------------------------------------------------------------

def test_janela_aos_4_59_aceita_e_aos_5_31_recusada(client, criar_usuario, orthanc_falso, relogio):
    cab = _cab(client, criar_usuario())
    dados = _janela(client, cab)
    assert dados["duracao_segundos"] == settings.FOTO_JANELA_MINUTOS * 60
    relogio["valor"] = timedelta(minutes=4, seconds=59)
    assert _foto(client, cab, comprovante=dados["comprovante"]).status_code == 200

    relogio["valor"] = timedelta()
    outra = _janela(client, cab)["comprovante"]
    relogio["valor"] = timedelta(minutes=5, seconds=31)
    r = _foto(client, cab, comprovante=outra)
    assert r.status_code == 410 and "Comece de novo" in r.json()["detail"]


def test_tolerancia_de_rede_de_30_segundos(client, criar_usuario, orthanc_falso, relogio):
    cab = _cab(client, criar_usuario())
    comprovante = _janela(client, cab)["comprovante"]
    relogio["valor"] = timedelta(minutes=5, seconds=settings.FOTO_JANELA_TOLERANCIA_SEGUNDOS - 2)
    assert _foto(client, cab, comprovante=comprovante).status_code == 200


def test_comprovante_vencido_pela_assinatura(client, criar_usuario, orthanc_falso, relogio):
    cab = _cab(client, criar_usuario())
    relogio["valor"] = -timedelta(minutes=10)   # aberto ha 10 minutos (no relogio do servidor)
    comprovante = _janela(client, cab)["comprovante"]
    relogio["valor"] = timedelta()
    assert _foto(client, cab, comprovante=comprovante).status_code == 410


def test_comprovante_reutilizado_de_outro_usuario_ou_substituido(client, criar_usuario, orthanc_falso, db):
    a, b = criar_usuario(), criar_usuario()
    cab_a, cab_b = _cab(client, a), _cab(client, b)
    comprovante = _janela(client, cab_a)["comprovante"]
    assert _foto(client, cab_b, comprovante=comprovante).status_code == 422      # de outra pessoa
    assert _foto(client, cab_a, comprovante=comprovante).status_code == 200
    assert _foto(client, cab_a, comprovante=comprovante).status_code == 409      # ja usado

    primeira = _janela(client, cab_a)["comprovante"]
    segunda = _janela(client, cab_a)["comprovante"]                              # cancela a primeira
    assert _foto(client, cab_a, comprovante=primeira).status_code == 409
    assert _foto(client, cab_a, comprovante=segunda).status_code == 200
    assert _foto(client, cab_a, comprovante="nao-e-um-comprovante").status_code == 422
    motivos = {d for (d,) in db.query(AuditLog.detalhes).filter(AuditLog.usuario_id.in_([a.id, b.id]),
                                                                  AuditLog.acao == "foto_recusada")}
    assert {"motivo=comprovante_de_outro_usuario", "motivo=comprovante_reutilizado",
            "motivo=janela_substituida", "motivo=comprovante_invalido"} <= motivos
    assert db.query(AuditLog).filter(AuditLog.usuario_id == a.id, AuditLog.acao == "foto_janela_aberta").count() == 3


def test_hora_do_celular_nao_muda_nada(client, criar_usuario, orthanc_falso, relogio):
    cab = _cab(client, criar_usuario())
    dados = _janela(client, cab)
    relogio["valor"] = timedelta(minutes=6)
    # o celular "diz" que ainda e cedo: campos e cabecalhos de hora sao ignorados
    r = client.post("/envios/foto", headers={**cab, "Date": "Mon, 01 Jan 2024 00:00:00 GMT"},
                    data={"destino": "pessoal", "comprovante": dados["comprovante"],
                          "confirmacao_sem_identificacao": "true", "agora": dados["agora_servidor"],
                          "expira_em": "2099-01-01T00:00:00+00:00"},
                    files={"arquivo": ("foto.jpg", _jpg(), "image/jpeg")})
    assert r.status_code == 410


def test_pagina_recarregada_retoma_a_mesma_janela(client, criar_usuario, orthanc_falso):
    cab = _cab(client, criar_usuario())
    assert client.get("/envios/foto/janela", headers=cab).json() == {"aberta": False}
    aberta = _janela(client, cab)
    retomada = client.get("/envios/foto/janela", headers=cab).json()
    assert retomada["aberta"] is True and retomada["expira_em"] == aberta["expira_em"]
    assert _foto(client, cab, comprovante=retomada["comprovante"]).status_code == 200
    assert client.get("/envios/foto/janela", headers=cab).json() == {"aberta": False}
    assert _foto(client, cab, comprovante=aberta["comprovante"]).status_code == 409   # mesma janela, ja usada


def test_comprovante_da_janela_nao_abre_sessao(client, criar_usuario):
    cab = _cab(client, criar_usuario())
    comprovante = _janela(client, cab)["comprovante"]
    assert client.get("/envios/meus", headers={"Authorization": f"Bearer {comprovante}"}).status_code == 401


# --- seguranca ---------------------------------------------------------------------

def test_imagem_gigante_e_gps_e_campos_escondidos(client, criar_usuario, orthanc_falso, db):
    u = criar_usuario()
    cab = _cab(client, u)
    bomba = io.BytesIO()
    Image.new("L", (8000, 6000)).save(bomba, "PNG")            # 48 megapixels, arquivo pequeno
    r = _foto(client, cab, conteudo=bomba.getvalue())
    assert r.status_code == 422 and "megapixels" in r.json()["detail"]

    outro = criar_usuario(perfil=UserRole.administrador)
    r = _foto(client, cab, conteudo=_jpg_com_gps(), enviado_por_id=outro.id, formato_entrada="dicom",
              ativo="false", destino_real="fila")
    assert r.status_code == 200, r.text
    ref = db.get(OrthancReference, r.json()["orthanc_reference_id"])
    assert ref.enviado_por_id == u.id and ref.formato_entrada == "foto" and ref.destino == "pessoal" and ref.ativo
    enviado = orthanc_falso[-1]
    assert b"MarcaDoCelular" not in enviado and b"GPS" not in enviado


def test_estudante_nao_abre_foto_de_outro_estudante(client, criar_usuario, orthanc_falso):
    a, b = criar_usuario(), criar_usuario()
    ref_id = _foto(client, _cab(client, a)).json()["orthanc_reference_id"]
    assert client.get(f"/envios/{ref_id}/preview", headers=_cab(client, a)).status_code == 200
    assert client.get(f"/envios/{ref_id}/preview", headers=_cab(client, b)).status_code == 404
    assert client.delete(f"/envios/{ref_id}", headers=_cab(client, b)).status_code == 404


def test_texto_na_foto_e_tarjado_antes_do_orthanc(client, criar_usuario, orthanc_falso, monkeypatch, db):
    from app.modules import texto_na_imagem

    vistos = []
    original = texto_na_imagem.tarjar_texto

    def espiar(dicom):
        vistos.append(len(orthanc_falso))   # quantos arquivos o Orthanc ja tinha recebido
        return dicom, ResultadoTexto("tarjado", regioes=2)

    monkeypatch.setattr(texto_na_imagem, "tarjar_texto", espiar)
    r = _foto(client, _cab(client, criar_usuario()))
    assert r.status_code == 200
    assert vistos and vistos[0] == 0                              # leu ANTES de gravar no Orthanc
    ref = db.get(OrthancReference, r.json()["orthanc_reference_id"])
    assert ref.texto_na_imagem == "tarjado" and ref.texto_regioes >= 2
    monkeypatch.setattr(texto_na_imagem, "tarjar_texto", original)


def test_ocr_real_reage_a_nome_escrito_na_foto():
    """Com o Tesseract instalado, um nome grande escrito na foto e coberto."""
    import shutil

    if not shutil.which("tesseract"):
        pytest.skip("Tesseract nao instalado neste ambiente")
    from app.modules.texto_na_imagem import tarjar_texto

    img = Image.new("L", (900, 400), 40)
    desenho = ImageDraw.Draw(img)
    try:
        from PIL import ImageFont
        fonte = ImageFont.load_default(size=56)
    except TypeError:
        pytest.skip("Pillow sem fonte escalavel")
    desenho.text((40, 160), "PACIENTE JOAO SILVA", fill=230, font=fonte)
    saida = io.BytesIO()
    img.save(saida, "PNG")
    _, resultado = tarjar_texto(foto_para_dicom.converter(saida.getvalue()))
    assert resultado.situacao == "tarjado"


def test_telas_e_rotas_da_foto():
    from pathlib import Path

    front = Path(__file__).resolve().parents[2] / "frontend/src"
    tela = (front / "components/envios/EnvioFotoCelular.tsx").read_text(encoding="utf-8")
    assert "/envios/foto/iniciar" in tela and "confirmacao_sem_identificacao" in tela
    assert "/envios/foto/janela" in tela and "sessionStorage" not in tela   # quem lembra a janela e o servidor
    editor = (front / "components/envios/EditorFoto.tsx").read_text(encoding="utf-8")
    assert "toBlob" in editor and "image/jpeg" in editor and "2048" in editor
    assert envios_router.router.url_path_for("enviar_foto") == "/envios/foto"
