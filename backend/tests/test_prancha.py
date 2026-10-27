"""
Prancha de estudo: imagens empilhadas a esquerda e informacoes a direita,
2 ou 3 por folha, para baixar (PDF/PNG), imprimir e enviar por e-mail.
"""

import io
import zipfile

from PIL import Image

from app.modules import prancha, prancha_router
from app.modules.audit_logs import AuditLog
from tests.conftest import cabecalho_auth, obter_token


def _png(largura=600, altura=400, valor=90) -> bytes:
    saida = io.BytesIO()
    Image.new("L", (largura, altura), valor).save(saida, format="PNG")
    return saida.getvalue()


def _paginas_do_pdf(conteudo: bytes) -> int:
    return conteudo.count(b"/Type /Page\n") or conteudo.count(b"/Type /Page ") or conteudo.count(b"/Type/Page")


# --- desenho ---------------------------------------------------------------
def test_duas_por_folha_imagem_a_esquerda_e_texto_a_direita():
    itens = [
        prancha.ItemPrancha(numero=n, curation_id=n, imagem_png=_png(valor=0),
                            linhas=[prancha.Linha("Achado principal", "Lesão periapical")])
        for n in (1, 2, 3)
    ]
    paginas = prancha.montar_paginas(itens, por_folha=2)
    assert len(paginas) == 2  # 3 imagens, 2 por folha
    pagina = paginas[0]
    assert pagina.size == (prancha.LARGURA, prancha.ALTURA)
    meio = prancha.LARGURA // 2
    altura_linha = (prancha.ALTURA - prancha.RODAPE_ALTURA - prancha.TOPO_CONTEUDO - prancha.VAO_LINHAS) // 2
    y = prancha.TOPO_CONTEUDO + altura_linha // 2
    # esquerda: a radiografia (preta) | direita: o quadro de informacoes (claro)
    assert pagina.getpixel((meio // 2, y)) == (0, 0, 0)
    assert sum(pagina.getpixel((meio + meio // 2, y + 120))) > 600


def test_tres_por_folha_cabem_tres_imagens_empilhadas():
    itens = [prancha.ItemPrancha(numero=n, curation_id=n, imagem_png=_png(valor=0)) for n in range(1, 4)]
    paginas = prancha.montar_paginas(itens, por_folha=3)
    assert len(paginas) == 1
    meio = prancha.LARGURA // 2
    altura_linha = (prancha.ALTURA - prancha.RODAPE_ALTURA - prancha.TOPO_CONTEUDO - 2 * prancha.VAO_LINHAS) // 3
    for k in range(3):
        y = prancha.TOPO_CONTEUDO + k * (altura_linha + prancha.VAO_LINHAS) + altura_linha // 2
        assert pagina_preta(paginas[0], meio // 2, y)


def pagina_preta(pagina, x, y):
    return pagina.getpixel((x, y)) == (0, 0, 0)


def test_sem_informacoes_a_imagem_usa_a_largura_toda():
    itens = [prancha.ItemPrancha(numero=1, curation_id=1, imagem_png=_png(2000, 400, valor=0))]
    pagina = prancha.montar_paginas(itens, por_folha=2, com_informacoes=False)[0]
    y = prancha.TOPO_CONTEUDO + 300
    assert pagina.getpixel((prancha.LARGURA * 3 // 4, y)) == (0, 0, 0)


def test_texto_muito_longo_nao_quebra_a_folha():
    texto = "palavra " * 3000
    itens = [prancha.ItemPrancha(numero=1, curation_id=1, imagem_png=None, linhas=[prancha.Linha("Descrição", texto)])]
    assert prancha.montar_paginas(itens, por_folha=3)  # reduz a letra e corta com "…"


def test_rotulos_em_portugues_e_marcacoes_com_cor():
    class Ficha:
        tipo_radiografia = "periapical"
        qualidade_tecnica = "otima"
        dentes = [11, 21]
        achado_principal = "lesao_periapical"
        alteracoes_observadas = ["carie_dentina"]
        achados_detalhe = None
        descricao_didatica = "Texto didático"

    linhas = prancha.descrever_ficha(Ficha(), [{"achado": "carie"}, {"achado": "outro", "achado_descricao": "Nódulo"}])
    textos = [(l.rotulo, l.valor) for l in linhas]
    assert ("Tipo", "Periapical") in textos and ("Qualidade", "Ótima") in textos
    assert ("Achado principal", "Lesão periapical") in textos
    assert ("Alterações observadas", "Cárie em dentina") in textos
    assert ("Marcação 1", "Cárie") in textos and ("Marcação 2", "Nódulo") in textos
    assert linhas[-1].cor is not None


def test_fonte_com_acentos_esta_no_projeto():
    from PIL import ImageFont

    assert isinstance(prancha._fonte(20), ImageFont.FreeTypeFont)
    assert prancha._fonte(20).getname()[0] == "DejaVu Sans"


# --- rotas -----------------------------------------------------------------
def test_baixar_prancha_em_pdf_registra_auditoria(client, criar_usuario, criar_ficha, monkeypatch, db):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    fichas = [criar_ficha(descricao_didatica=f"prancha-{i}") for i in range(3)]
    monkeypatch.setattr(prancha_router.orthanc_client, "obter_preview_instancia", lambda i: _png())

    r = client.post("/prancha/arquivo", headers=cabecalho_auth(token), json={
        "curation_ids": [f.id for f in fichas], "numeros": [4, 5, 6], "por_folha": 2,
    })
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert "attachment" in r.headers["content-disposition"]
    assert _paginas_do_pdf(r.content) == 2
    registro = db.query(AuditLog).filter(AuditLog.acao == "prancha_gerada", AuditLog.usuario_id == usuario.id).first()
    assert registro and "3 imagem(ns) em 2 folha(s)" in registro.detalhes


def test_baixar_prancha_em_png(client, criar_usuario, criar_ficha, monkeypatch):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    fichas = [criar_ficha(descricao_didatica=f"prancha-png-{i}") for i in range(4)]
    monkeypatch.setattr(prancha_router.orthanc_client, "obter_preview_instancia", lambda i: _png())

    uma = client.post("/prancha/arquivo", headers=cabecalho_auth(token),
                      json={"curation_ids": [fichas[0].id], "formato": "png", "por_folha": 3})
    assert uma.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(uma.content)) as img:
        assert img.size == (prancha.LARGURA, prancha.ALTURA)
    varias = client.post("/prancha/arquivo", headers=cabecalho_auth(token),
                         json={"curation_ids": [f.id for f in fichas], "formato": "png", "por_folha": 3})
    assert varias.headers["content-type"] == "application/zip"
    assert len(zipfile.ZipFile(io.BytesIO(varias.content)).namelist()) == 2


def test_imagem_fora_do_orthanc_sai_como_indisponivel(client, criar_usuario, criar_ficha, monkeypatch):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()

    def falha(i):
        raise RuntimeError("orthanc fora")

    monkeypatch.setattr(prancha_router.orthanc_client, "obter_preview_instancia", falha)
    r = client.post("/prancha/arquivo", headers=cabecalho_auth(token), json={"curation_ids": [ficha.id]})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_pedidos_invalidos_sao_recusados(client, criar_usuario, criar_ficha):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    ficha = criar_ficha()
    h = cabecalho_auth(token)
    assert client.post("/prancha/arquivo", headers=h, json={"curation_ids": []}).status_code == 422
    assert client.post("/prancha/arquivo", headers=h, json={"curation_ids": [ficha.id], "por_folha": 4}).status_code == 422
    assert client.post("/prancha/arquivo", headers=h,
                       json={"curation_ids": [ficha.id], "numeros": [1, 2]}).status_code == 422
    assert client.post("/prancha/arquivo", headers=h,
                       json={"curation_ids": list(range(1, 32))}).status_code == 422
    # ficha que nao existe (ou nao aprovada): 404, sem revelar o motivo
    assert client.post("/prancha/arquivo", headers=h, json={"curation_ids": [99999999]}).status_code == 404


def test_prancha_exige_login(client, criar_ficha):
    ficha = criar_ficha()
    assert client.post("/prancha/arquivo", json={"curation_ids": [ficha.id]}).status_code == 401


def test_prancha_por_email_vai_para_o_proprio_usuario_em_pdf(client, criar_usuario, criar_ficha, monkeypatch, db):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    fichas = [criar_ficha(descricao_didatica=f"prancha-email-{i}") for i in range(2)]
    monkeypatch.setattr(prancha_router.orthanc_client, "obter_preview_instancia", lambda i: _png())
    enviados = []
    monkeypatch.setattr(prancha_router, "enviar_email_prancha", lambda *a: enviados.append(a))

    r = client.post("/prancha/email", headers=cabecalho_auth(token),
                    json={"curation_ids": [f.id for f in fichas], "por_folha": 3})
    assert r.status_code == 200, r.text
    destinatario, _, total, folhas, pdf, nome = enviados[0]
    assert destinatario == usuario.email and total == 2 and folhas == 1
    assert pdf.startswith(b"%PDF") and nome.endswith(".pdf")
    assert db.query(AuditLog).filter(AuditLog.acao == "prancha_enviada_email", AuditLog.usuario_id == usuario.id).count() == 1


def test_prancha_por_email_tem_teto_de_imagens(client, criar_usuario):
    usuario = criar_usuario()
    token = obter_token(client, usuario.email)
    r = client.post("/prancha/email", headers=cabecalho_auth(token), json={"curation_ids": list(range(1, 17))})
    assert r.status_code == 400


def test_email_anexa_pdf_como_documento(monkeypatch):
    from app.core import email as modulo_email

    enviados = []

    class SMTPFalso:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            pass

        def login(self, *a):
            pass

        def sendmail(self, de, para, mensagem):
            enviados.append(mensagem)

    monkeypatch.setattr(modulo_email.settings, "SMTP_HOST", "smtp.teste")
    monkeypatch.setattr(modulo_email.smtplib, "SMTP", SMTPFalso)
    modulo_email.enviar_email_prancha("a@teste.local", "Ana", 2, 1, b"%PDF-1.4 teste", "prancha.pdf")
    assert "Content-Type: application/pdf" in enviados[0]
    assert 'filename="prancha.pdf"' in enviados[0]
