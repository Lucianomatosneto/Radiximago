"""
Decisao de 02/11/2026 (teste de permissoes por perfil):
- SUPORTE nao faz curadoria: so le (fichas, fila, indicadores); qualquer
  gravacao (aprovar, descartar, editar, achados, vocabulario, macros, voz)
  e recusada com 403.
- ADMINISTRADOR supervisiona a fila e os tratamentos das pastas de pacientes
  (etapa, aluno, professor, datas) SEM ver dados do paciente, e cada consulta
  fica na auditoria.
"""

import io
import json

import pytest
from PIL import Image

from app.core.config import settings
from app.main import app
from app.modules.audit_logs import AuditLog
from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth
from tests.conftest import obter_token as _obter_token


def obter_token(client, email):
    app.state.limiter.reset()
    return _obter_token(client, email)


@pytest.fixture(autouse=True)
def pasta_temporaria(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CASOS_PASTA", str(tmp_path / "dados_clinicos"))
    yield


ESCRITAS_CURADORIA = [
    ("post", "/curation/{id}/approve", {"anonimizacao_validada": True}),
    ("post", "/curation/{id}/discard", {"motivo": "teste"}),
    ("post", "/curation/{id}/reabrir", {}),
    ("patch", "/curation/{id}", {}),
    ("post", "/curation/{id}/request-review", {}),
    ("post", "/curation/{id}/achados", {}),
    ("post", "/vocabulario/termos", {}),
    ("post", "/macros", {}),
]


@pytest.mark.parametrize("metodo,rota,corpo", ESCRITAS_CURADORIA)
def test_suporte_nao_grava_na_curadoria(client, criar_usuario, criar_ficha, metodo, rota, corpo):
    suporte = criar_usuario(perfil=UserRole.suporte)
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    h = cabecalho_auth(obter_token(client, suporte.email))
    r = getattr(client, metodo)(rota.format(id=ficha.id), headers=h, json=corpo)
    assert r.status_code == 403


@pytest.mark.parametrize("rota", ["/curation/pending", "/curation/reviews/pending", "/vocabulario", "/macros"])
def test_suporte_continua_lendo_a_curadoria(client, criar_usuario, rota):
    suporte = criar_usuario(perfil=UserRole.suporte)
    h = cabecalho_auth(obter_token(client, suporte.email))
    assert client.get(rota, headers=h).status_code == 200


def test_curador_e_admin_continuam_gravando(client, criar_usuario, criar_ficha):
    for perfil in (UserRole.curador, UserRole.administrador):
        u = criar_usuario(perfil=perfil)
        ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
        h = cabecalho_auth(obter_token(client, u.email))
        r = client.post(f"/curation/{ficha.id}/discard", headers=h, json={"motivo": "baixa qualidade"})
        assert r.status_code == 200


def _foto():
    saida = io.BytesIO()
    Image.new("RGB", (800, 600), (200, 200, 200)).save(saida, format="JPEG")
    return saida.getvalue()


def test_admin_supervisiona_fila_sem_dados_do_paciente(client, criar_usuario, db):
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    admin = criar_usuario(perfil=UserRole.administrador)
    h_al = cabecalho_auth(obter_token(client, aluno.email))
    h_pr = cabecalho_auth(obter_token(client, professor.email))
    h_cu = cabecalho_auth(obter_token(client, curador.email))
    h_ad = cabecalho_auth(obter_token(client, admin.email))

    dados = {
        "paciente": {"nome": "Maria Segredo da Silva", "nascimento": "1990-05-20", "genero": "feminino",
                     "contato": "48 99999-1111", "prontuario": "PR-123"},
        "modalidade": "periapical", "descricao": "Dor no 36, texto livre sensivel.",
        "professor_id": professor.id, "fotos": [{"dentes": [36], "observacao": "f"}],
    }
    arquivos = [("fotos", ("f.jpg", _foto(), "image/jpeg")), ("termo", ("t.jpg", _foto(), "image/jpeg"))]
    cid = client.post("/casos", headers=h_al, data={"dados": json.dumps(dados)}, files=arquivos).json()["id"]
    assert client.post(f"/casos/{cid}/encaminhar-curador", headers=h_pr, json={}).status_code == 200
    assert client.post(f"/casos/{cid}/classificar", headers=h_cu, json={"tratamentos": ["endodontia"]}).status_code == 200

    r = client.get("/casos/fila", headers=h_ad)
    assert r.status_code == 200
    linha = next(c for c in r.json()["casos"] if c["id"] == cid)
    assert linha["etapa"] == "na_fila" and linha["aluno"] == aluno.nome
    texto = json.dumps(r.json(), ensure_ascii=False)
    for proibido in ("Maria Segredo", "99999-1111", "PR-123", "texto livre sensivel"):
        assert proibido not in texto
    assert linha["imagens"] == [] and linha["paciente"]["contato"] is None

    # busca por nome de paciente nao vira "oraculo" para o administrador
    assert client.get("/casos/fila?busca=maria", headers=h_ad).status_code == 422

    # a pasta em si (nome, fotos, termo) continua fechada ao administrador
    assert client.get(f"/casos/{cid}", headers=h_ad).status_code == 404
    assert client.get(f"/casos/{cid}/revisoes", headers=h_ad).status_code in (403, 404)
    assert client.post(f"/casos/{cid}/classificar", headers=h_ad, json={"tratamentos": ["endodontia"]}).status_code == 403

    # tratamentos: sem nome e sem contato
    assert client.get("/casos/tratamentos", headers=h_ad).status_code == 200
    # consulta fica na auditoria
    acoes = {a.acao for a in db.query(AuditLog).filter(AuditLog.usuario_id == admin.id)}
    assert {"caso_fila_supervisao", "caso_tratamentos_supervisao"} <= acoes

    # estudante e suporte continuam sem acesso
    suporte = criar_usuario(perfil=UserRole.suporte)
    h_su = cabecalho_auth(obter_token(client, suporte.email))
    assert client.get("/casos/fila", headers=h_su).status_code == 403
    assert client.get("/casos/fila", headers=h_al).status_code == 403


# --- Aprovacao so com os campos minimos (decisao de 02/11/2026) ---------------

def test_aprovacao_exige_campos_minimos_no_servidor(client, criar_usuario, criar_ficha, db):
    from tests.conftest import completar_ficha

    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, curador.email))
    ficha = criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    ficha.descricao_didatica = None
    db.commit()

    r = client.post(f"/curation/{ficha.id}/approve", headers=h, json={"anonimizacao_validada": True})
    assert r.status_code == 422
    detalhe = r.json()["detail"]
    for falta in ("dente ou região", "achado", "qualidade técnica", "descrição didática"):
        assert falta in detalhe
    assert "tipo de radiografia" not in detalhe  # esse a ficha ja tem

    db.expire_all()
    negadas = db.query(AuditLog).filter(AuditLog.acao == "aprovacao", AuditLog.resultado == "negado",
                                        AuditLog.entidade_id == ficha.id).count()
    assert negadas == 1
    # a imagem continua fora da busca dos estudantes
    estudante = criar_usuario(perfil=UserRole.estudante)
    he = cabecalho_auth(obter_token(client, estudante.email))
    ids = {i["curation_id"] for i in client.get("/search", headers=he, params={"limit": 200}).json()["itens"]}
    assert ficha.id not in ids

    completar_ficha(db, ficha)
    assert client.post(f"/curation/{ficha.id}/approve", headers=h, json={"anonimizacao_validada": True}).status_code == 200


# --- Administrador abre a pasta so com justificativa (somente leitura) ---------

def test_admin_abre_pasta_so_com_justificativa_e_somente_leitura(client, criar_usuario, db):
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    admin = criar_usuario(perfil=UserRole.administrador)
    h_al = cabecalho_auth(obter_token(client, aluno.email))
    h_ad = cabecalho_auth(obter_token(client, admin.email))
    h_pr = cabecalho_auth(obter_token(client, professor.email))
    dados = {
        "paciente": {"nome": "Maria Segredo da Silva", "nascimento": "1990-05-20", "genero": "feminino",
                     "contato": "48 99999-1111"},
        "modalidade": "periapical", "descricao": "Dor no 36.",
        "professor_id": professor.id, "fotos": [{"dentes": [36], "observacao": "f"}],
    }
    arquivos = [("fotos", ("f.jpg", _foto(), "image/jpeg")), ("termo", ("t.jpg", _foto(), "image/jpeg"))]
    cid = client.post("/casos", headers=h_al, data={"dados": json.dumps(dados)}, files=arquivos).json()["id"]

    # sem justificativa: pasta e fotos fechadas
    assert client.get(f"/casos/{cid}", headers=h_ad).status_code == 404
    assert client.get(f"/casos/{cid}/imagens/1", headers=h_ad).status_code == 404

    # justificativa curta ou vazia e recusada; so o administrador justifica
    assert client.post(f"/casos/{cid}/justificar-acesso", headers=h_ad, json={"motivo": "curto"}).status_code == 422
    assert client.post(f"/casos/{cid}/justificar-acesso", headers=h_pr, json={"motivo": "motivo qualquer longo"}).status_code == 403
    assert client.post("/casos/999999999/justificar-acesso", headers=h_ad, json={"motivo": "motivo qualquer longo"}).status_code == 404

    r = client.post(f"/casos/{cid}/justificar-acesso", headers=h_ad, json={"motivo": "Conferir fila parada ha 10 dias"})
    assert r.status_code == 200 and r.json()["valido_por_minutos"] == 30

    # com justificativa: le a pasta (so leitura)
    r = client.get(f"/casos/{cid}", headers=h_ad)
    assert r.status_code == 200
    # pasta aberta com justificativa mostra imagens e descricao (so as LISTAS sao mascaradas)
    assert len(r.json()["imagens"]) == 1 and r.json()["descricao"] == "Dor no 36."
    assert client.get(f"/casos/{cid}/revisoes", headers=h_ad).status_code == 200
    assert client.patch(f"/casos/{cid}/paciente", headers=h_ad, json={"observacoes": "x"}).status_code == 403
    assert client.post(f"/casos/{cid}/compartilhar", headers=h_ad, json={"para_id": professor.id}).status_code == 403
    assert client.post(f"/casos/{cid}/concluir", headers=h_ad, json={}).status_code == 403
    assert client.get(f"/casos/{cid}/imagens/1?baixar=true", headers=h_ad).status_code == 403

    # a justificativa vale so para ESSA pasta
    outro = client.post("/casos", headers=h_al, data={"dados": json.dumps(dados)},
                        files=[("fotos", ("f.jpg", _foto(), "image/jpeg")), ("termo", ("t.jpg", _foto(), "image/jpeg"))]).json()["id"]
    assert client.get(f"/casos/{outro}", headers=h_ad).status_code == 404

    # auditoria: motivo e abertura registrados
    acoes = {(a.acao, a.entidade_id) for a in db.query(AuditLog).filter(AuditLog.usuario_id == admin.id)}
    assert ("caso_acesso_justificado", cid) in acoes and ("caso_visualizado", cid) in acoes
    motivo = db.query(AuditLog).filter(AuditLog.acao == "caso_acesso_justificado", AuditLog.entidade_id == cid).one().detalhes
    assert "fila parada" in motivo


# --- Curador so acrescenta observacoes; identificacao e do aluno/professor ------

def test_curador_so_acrescenta_observacoes_na_pasta(client, criar_usuario, db):
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    h_al = cabecalho_auth(obter_token(client, aluno.email))
    h_pr = cabecalho_auth(obter_token(client, professor.email))
    h_cu = cabecalho_auth(obter_token(client, curador.email))
    dados = {
        "paciente": {"nome": "Maria Segredo da Silva", "nascimento": "1990-05-20", "genero": "feminino",
                     "contato": "48 99999-1111"},
        "modalidade": "periapical", "descricao": "Dor no 36.",
        "professor_id": professor.id, "fotos": [{"dentes": [36], "observacao": "f"}],
    }
    arquivos = [("fotos", ("f.jpg", _foto(), "image/jpeg")), ("termo", ("t.jpg", _foto(), "image/jpeg"))]
    cid = client.post("/casos", headers=h_al, data={"dados": json.dumps(dados)}, files=arquivos).json()["id"]

    pode = client.get(f"/casos/{cid}", headers=h_cu).json()["pode"]
    assert pode["editar_paciente"] is True and pode["editar_dados_completos"] is False

    # curador NAO altera identificacao nem descricao
    for corpo in ({"nome": "Outro Nome"}, {"contato": "48 90000-0000"}, {"descricao": "Nova descricao"},
                  {"nome": "Outro Nome", "observacoes": "x"}):
        assert client.patch(f"/casos/{cid}/paciente", headers=h_cu, json=corpo).status_code == 403
    # ... mas acrescenta observacoes
    r = client.patch(f"/casos/{cid}/paciente", headers=h_cu, json={"observacoes": "Radiografia com sobreposicao."})
    assert r.status_code == 200 and r.json()["mudados"] == ["observacoes"]
    negadas = db.query(AuditLog).filter(AuditLog.usuario_id == curador.id, AuditLog.resultado == "negado").count()
    assert negadas == 4

    # aluno e professor continuam editando tudo
    assert client.get(f"/casos/{cid}", headers=h_al).json()["pode"]["editar_dados_completos"] is True
    assert client.patch(f"/casos/{cid}/paciente", headers=h_al, json={"contato": "48 98888-0000"}).status_code == 200
    assert client.patch(f"/casos/{cid}/paciente", headers=h_pr, json={"descricao": "Dor no 36, ha 3 dias."}).status_code == 200


# --- Script de limpeza dos dados DEMO -----------------------------------------

def test_limpeza_demo_simula_apaga_so_o_demo_e_preserva_auditoria(client, criar_usuario, db):
    import uuid

    from app.modules import casos_arquivos
    from app.modules.casos import CasoClinico, CasoImagem
    from scripts.limpar_dados_demo import ACAO_AUDITORIA, executar, planejar

    professor = criar_usuario(perfil=UserRole.professor)
    aluno_demo = criar_usuario()
    aluno_demo.email = f"demo-{uuid.uuid4().hex[:8]}@radiximago.example.com"
    aluno_real = criar_usuario()
    db.commit()
    h_demo = cabecalho_auth(obter_token(client, aluno_demo.email))
    h_real = cabecalho_auth(obter_token(client, aluno_real.email))

    def nova_pasta(headers, nome):
        dados = {"paciente": {"nome": nome, "nascimento": "1990-05-20", "genero": "feminino", "contato": "48 90000-0000"},
                 "modalidade": "periapical", "descricao": "Pasta de teste.",
                 "professor_id": professor.id, "fotos": [{"dentes": [36], "observacao": "f"}]}
        arquivos = [("fotos", ("f.jpg", _foto(), "image/jpeg")), ("termo", ("t.jpg", _foto(), "image/jpeg"))]
        r = client.post("/casos", headers=headers, data={"dados": json.dumps(dados)}, files=arquivos)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    demo_id = nova_pasta(h_demo, "Paciente Ficticio da Demo")
    real_id = nova_pasta(h_real, "Maria da Silva")
    nomes_arquivos = [n for i in db.query(CasoImagem).filter(CasoImagem.caso_id == demo_id).all() for n in (i.arquivo, i.miniatura)]
    assert nomes_arquivos and all((casos_arquivos.pasta_casos() / n).exists() for n in nomes_arquivos)

    # SIMULACAO: levanta o plano e nao muda nada
    plano = planejar(db)
    assert aluno_demo.id in [u.id for u in plano["usuarios"]] and aluno_real.id not in [u.id for u in plano["usuarios"]]
    assert demo_id in [c.id for c in plano["casos"]] and real_id not in [c.id for c in plano["casos"]]
    db.refresh(aluno_demo)
    assert aluno_demo.excluido is False and db.get(CasoClinico, demo_id) is not None

    # pasta extra pedida pelo numero entra no plano; numero inexistente e avisado
    extra = planejar(db, [real_id, 987654321])
    assert real_id in [c.id for c in extra["casos"]] and extra["pastas_inexistentes"] == [987654321]

    # EXECUTAR: apaga so a pasta demo (com os arquivos do disco) e exclui o usuario demo
    antes = db.query(AuditLog).filter(AuditLog.usuario_id == aluno_demo.id).count()
    assert antes >= 1
    resumo = executar(db, plano)
    assert resumo["pastas"] >= 1 and resumo["arquivos"] >= len(nomes_arquivos)
    db.expire_all()
    assert db.get(CasoClinico, demo_id) is None
    assert db.get(CasoClinico, real_id) is not None
    assert not any((casos_arquivos.pasta_casos() / n).exists() for n in nomes_arquivos)
    aluno_demo = db.get(type(aluno_demo), aluno_demo.id)
    assert aluno_demo.excluido is True and aluno_demo.ativo is False and aluno_demo.excluido_em is not None
    # a auditoria continua inteira e a propria limpeza fica registrada
    assert db.query(AuditLog).filter(AuditLog.usuario_id == aluno_demo.id).count() >= antes
    linha = db.query(AuditLog).filter(AuditLog.acao == ACAO_AUDITORIA).order_by(AuditLog.id.desc()).first()
    assert linha is not None and "pastas=" in linha.detalhes

    # arruma o que o teste criou (a limpeza nao apaga a pasta "real"). A linha de auditoria da
    # propria limpeza FICA: o banco proibe apagar auditoria (ASVS 16.4.2) - e isso e o desejado.
    for i in db.query(CasoImagem).filter(CasoImagem.caso_id == real_id).all():
        casos_arquivos.apagar(i.arquivo)
        casos_arquivos.apagar(i.miniatura)
