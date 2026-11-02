"""
Pastas de pacientes (Etapas 2 a 4 - 31/10/2026):
- aluno cria a pasta (fotos + termo + ficha); fotos CIFRADAS no disco e
  sem metadados (EXIF/GPS); campos obrigatorios e termo exigidos;
- so aluno autor, aluno do tratamento, professores e curadores veem;
  pesquisador/administrador/outro aluno: 404; tudo na auditoria;
- revisao do professor cria versoes (historico), aluno ve "corrigida";
- compartilhar so com professor/curador; e-mail so com link;
- fila: encaminhar ao curador -> classificar -> fila com filtro por
  tratamento -> encaminhar ao aluno (sai da fila) -> meus tratamentos ->
  concluir; lista de alunos e pacientes com busca; registro de acessos.
"""

import io
import json
from datetime import date

import pytest
from PIL import Image

from app.core.config import settings
from app.modules import casos_arquivos
from app.modules.audit_logs import AuditLog
from app.modules.casos import CasoImagem
from app.modules.users import UserRole
from app.main import app
from tests.conftest import cabecalho_auth
from tests.conftest import obter_token as _obter_token


def obter_token(client, email):
    # varios logins seguidos no mesmo teste: zera o limite de tentativas (5/min)
    app.state.limiter.reset()
    return _obter_token(client, email)


@pytest.fixture(autouse=True)
def pasta_temporaria(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CASOS_PASTA", str(tmp_path / "dados_clinicos"))
    yield


def _foto(cor=(200, 200, 200), gps=False, tamanho=(800, 600)) -> bytes:
    img = Image.new("RGB", tamanho, cor)
    saida = io.BytesIO()
    if gps:
        exif = Image.Exif()
        exif[0x010F] = "MarcaDoCelular"          # Make
        exif[0x0110] = "ModeloSecreto"           # Model
        exif[0x8825] = {1: "S", 2: (27.0, 35.0, 0.0)}  # GPSInfo
        img.save(saida, format="JPEG", exif=exif)
    else:
        img.save(saida, format="JPEG")
    return saida.getvalue()


def _dados(professor_id=None, n_fotos=2, **extra):
    dados = {
        "paciente": {"nome": "Maria  da Silva Teste", "nascimento": "1990-05-20", "genero": "feminino",
                     "contato": "48 99999-1111", "prontuario": "PR-123"},
        "modalidade": "periapical",
        "descricao": "Dor no 36, suspeita de cárie profunda.",
        "professor_id": professor_id,
        "fotos": [{"dentes": [36], "observacao": f"foto {i + 1}"} for i in range(n_fotos)],
    }
    dados.update(extra)
    return dados


def _criar(client, h, dados, n_fotos=2, termo=True, gps=False):
    arquivos = [("fotos", (f"f{i}.jpg", _foto(gps=gps), "image/jpeg")) for i in range(n_fotos)]
    if termo:
        arquivos.append(("termo", ("termo.jpg", _foto((255, 255, 255)), "image/jpeg")))
    return client.post("/casos", headers=h, data={"dados": json.dumps(dados)}, files=arquivos)


def test_criacao_cifrada_sem_metadados_e_permissoes(client, criar_usuario, db):
    aluno = criar_usuario()
    outro_aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    pesquisador = criar_usuario(perfil=UserRole.pesquisador)
    admin = criar_usuario(perfil=UserRole.administrador)
    h = {u.id: cabecalho_auth(obter_token(client, u.email)) for u in (aluno, outro_aluno, professor, curador, pesquisador, admin)}

    opcoes = client.get("/casos/opcoes", headers=h[aluno.id]).json()
    assert {"id": professor.id, "nome": professor.nome} in opcoes["professores"]

    r = _criar(client, h[aluno.id], _dados(professor.id), gps=True)
    assert r.status_code == 200, r.text
    caso = r.json()
    assert caso["paciente"]["nome"] == "Maria da Silva Teste" and caso["etapa"] == "enviado"
    assert len(caso["imagens"]) == 2 and caso["imagens"][0]["dentes"] == [36]

    # no disco: cifrado (nao e JPEG) e a foto servida nao tem EXIF
    imgs = db.query(CasoImagem).filter(CasoImagem.caso_id == caso["id"]).all()
    assert len(imgs) == 3 and sum(i.tipo == "termo" for i in imgs) == 1
    bruto = (casos_arquivos.pasta_casos() / imgs[0].arquivo).read_bytes()
    assert not bruto.startswith(b"\xff\xd8") and b"ModeloSecreto" not in bruto
    foto = client.get(f"/casos/{caso['id']}/imagens/{imgs[0].id}", headers=h[aluno.id])
    assert foto.status_code == 200 and foto.headers["content-type"] == "image/jpeg"
    assert "no-store" in foto.headers["cache-control"]
    servida = Image.open(io.BytesIO(foto.content))
    assert not servida.getexif() and b"ModeloSecreto" not in foto.content

    # quem ve e quem nao ve
    for quem in (aluno, professor, curador):
        assert client.get(f"/casos/{caso['id']}", headers=h[quem.id]).status_code == 200
    for quem in (outro_aluno, pesquisador, admin):
        assert client.get(f"/casos/{caso['id']}", headers=h[quem.id]).status_code == 404
        assert client.get(f"/casos/{caso['id']}/imagens/{imgs[0].id}", headers=h[quem.id]).status_code == 404
    # foto de outra pasta pelo id certo da imagem: 404
    r2 = _criar(client, h[outro_aluno.id], _dados(None))
    assert client.get(f"/casos/{caso['id']}/imagens/{r2.json()['imagens'][0]['id']}", headers=h[aluno.id]).status_code == 404

    # minhas pastas e recebidos do professor
    assert [c["id"] for c in client.get("/casos/minhas", headers=h[aluno.id]).json()["casos"]] == [caso["id"]]
    recebidos = client.get("/casos/recebidos", headers=h[professor.id]).json()["casos"]
    assert [c["id"] for c in recebidos] == [caso["id"]]
    assert client.get("/casos/recebidos", headers=h[aluno.id]).status_code == 403

    acoes = [a.acao for a in db.query(AuditLog).filter(AuditLog.entidade == "caso", AuditLog.entidade_id == caso["id"])]
    assert "caso_criado" in acoes and "caso_visualizado" in acoes and "caso_acesso_negado" in acoes


def test_validacoes_do_envio(client, criar_usuario):
    aluno = criar_usuario()
    pesquisador = criar_usuario(perfil=UserRole.pesquisador)
    curador = criar_usuario(perfil=UserRole.curador)
    h = cabecalho_auth(obter_token(client, aluno.email))
    assert _criar(client, h, _dados(), termo=False).status_code == 422  # termo obrigatorio
    sem_nome = _dados()
    sem_nome["paciente"]["nome"] = "  "
    assert _criar(client, h, sem_nome).status_code == 422
    futuro = _dados()
    futuro["paciente"]["nascimento"] = date(date.today().year + 1, 1, 1).isoformat()
    assert _criar(client, h, futuro).status_code == 422
    assert _criar(client, h, _dados(modalidade="ressonancia")).status_code == 422
    assert _criar(client, h, _dados(professor_id=curador.id)).status_code == 422  # tem que ser professor
    dente_ruim = _dados()
    dente_ruim["fotos"][0]["dentes"] = [99]
    assert _criar(client, h, dente_ruim).status_code == 422
    assert _criar(client, h, _dados(n_fotos=3), n_fotos=2).status_code == 422  # info nao confere
    arquivos = [("fotos", ("x.jpg", b"isto nao e imagem", "image/jpeg")), ("termo", ("t.jpg", _foto(), "image/jpeg"))]
    r = client.post("/casos", headers=h, data={"dados": json.dumps(_dados(n_fotos=1))}, files=arquivos)
    assert r.status_code == 422 and "foto" in r.json()["detail"].lower()
    h_pesq = cabecalho_auth(obter_token(client, pesquisador.email))
    assert _criar(client, h_pesq, _dados()).status_code == 403


def test_revisao_versoes_compartilhar_e_link(client, criar_usuario, db, monkeypatch):
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    professor2 = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    h_al = cabecalho_auth(obter_token(client, aluno.email))
    h_pr = cabecalho_auth(obter_token(client, professor.email))
    h_pr2 = cabecalho_auth(obter_token(client, professor2.email))
    caso = _criar(client, h_al, _dados(professor.id)).json()
    img = str(caso["imagens"][0]["id"])

    assert client.post(f"/casos/{caso['id']}/revisoes", headers=h_al, json={"comentario": "x"}).status_code == 403
    assert client.post(f"/casos/{caso['id']}/revisoes", headers=h_pr, json={}).status_code == 422
    assert client.post(f"/casos/{caso['id']}/revisoes", headers=h_pr, json={"anotacoes": {"999999": {"texto": "x"}}}).status_code == 422
    marca = {"id": "m1", "tipo": "oval", "x": 0.1, "y": 0.1, "largura": 0.2, "altura": 0.2}
    r = client.post(f"/casos/{caso['id']}/revisoes", headers=h_pr,
                    json={"comentario": "Rever o 36", "anotacoes": {img: {"texto": "Lesão na distal", "marcacoes": [marca]}}})
    assert r.status_code == 200 and r.json()["versao"] == 1
    # aluno ve "corrigida" ate abrir a pasta
    assert client.get("/casos/minhas", headers=h_al).json()["casos"][0]["corrigida"] is True
    det = client.get(f"/casos/{caso['id']}", headers=h_al).json()
    assert det["revisao"]["anotacoes"][img]["texto"] == "Lesão na distal"
    assert det["revisao"]["autor"] == professor.nome
    assert client.get("/casos/minhas", headers=h_al).json()["casos"][0]["corrigida"] is False
    # editar depois do envio = versao nova, a anterior fica
    client.post(f"/casos/{caso['id']}/revisoes", headers=h_pr, json={"anotacoes": {img: {"texto": "Lesão na mesial"}}})
    versoes = client.get(f"/casos/{caso['id']}/revisoes", headers=h_al).json()["revisoes"]
    assert [v["versao"] for v in versoes] == [2, 1] and versoes[1]["anotacoes"][img]["texto"] == "Lesão na distal"

    # dados do paciente corrigidos pelo professor (historico diz o campo, nao o valor)
    r = client.patch(f"/casos/{caso['id']}/paciente", headers=h_pr, json={"contato": "48 3333-0000", "nome": "Maria S. Teste"})
    assert sorted(r.json()["mudados"]) == ["contato", "nome"]
    hist = client.get(f"/casos/{caso['id']}", headers=h_al).json()["historico"]
    assert any(x["acao"] == "dados_alterados" and x["detalhes"] == "nome, contato" and x["quem"] == professor.nome for x in hist)

    # compartilhar: so professor/curador
    assert client.post(f"/casos/{caso['id']}/compartilhar", headers=h_pr, json={"para_id": aluno.id}).status_code == 422
    assert client.post(f"/casos/{caso['id']}/compartilhar", headers=h_pr, json={"para_id": professor2.id}).status_code == 200
    assert client.get("/casos/recebidos/novos", headers=h_pr2).json()["quantidade"] == 1
    assert [c["id"] for c in client.get("/casos/recebidos", headers=h_pr2).json()["casos"]] == [caso["id"]]
    client.get(f"/casos/{caso['id']}", headers=h_pr2)
    assert client.get("/casos/recebidos/novos", headers=h_pr2).json()["quantidade"] == 0

    # e-mail so com o link, sem dados do paciente
    enviados = []
    monkeypatch.setattr("app.modules.casos_router.enviar_email", lambda para, assunto, corpo: enviados.append((para, assunto, corpo)))
    r = client.post(f"/casos/{caso['id']}/enviar-link", headers=h_pr, json={"para_id": curador.id})
    assert r.status_code == 200 and enviados[0][0] == curador.email
    assert "Maria" not in enviados[0][1] + enviados[0][2] and f"/casos/{caso['id']}" in enviados[0][2]
    pesquisador = criar_usuario(perfil=UserRole.pesquisador)
    assert client.post(f"/casos/{caso['id']}/enviar-link", headers=h_pr, json={"para_id": pesquisador.id}).status_code == 422


def test_fila_de_tratamento_completa(client, criar_usuario, db):
    aluno = criar_usuario()
    aluno_trat = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    admin = criar_usuario(perfil=UserRole.administrador)
    h_al = cabecalho_auth(obter_token(client, aluno.email))
    h_at = cabecalho_auth(obter_token(client, aluno_trat.email))
    h_pr = cabecalho_auth(obter_token(client, professor.email))
    h_cu = cabecalho_auth(obter_token(client, curador.email))
    h_ad = cabecalho_auth(obter_token(client, admin.email))
    caso = _criar(client, h_al, _dados(professor.id)).json()
    cid = caso["id"]

    assert client.post(f"/casos/{cid}/classificar", headers=h_cu, json={"tratamentos": ["endodontia"]}).status_code == 409
    assert client.post(f"/casos/{cid}/encaminhar-curador", headers=h_al, json={}).status_code == 403
    assert client.post(f"/casos/{cid}/encaminhar-curador", headers=h_pr, json={"nota": "Paciente com dor"}).status_code == 200
    assert client.post(f"/casos/{cid}/encaminhar-curador", headers=h_pr, json={}).status_code == 409
    fila_cur = client.get("/casos/fila?etapa=aguardando_classificacao", headers=h_cu).json()["casos"]
    assert cid in [c["id"] for c in fila_cur]
    # so curador classifica; precisa de ao menos um tratamento
    assert client.post(f"/casos/{cid}/classificar", headers=h_pr, json={"tratamentos": ["endodontia"]}).status_code == 403
    assert client.post(f"/casos/{cid}/classificar", headers=h_cu, json={"tratamentos": []}).status_code == 422
    assert client.post(f"/casos/{cid}/encaminhar-aluno", headers=h_pr,
                       json={"aluno_id": aluno_trat.id, "tratamento": "endodontia"}).status_code == 409
    r = client.post(f"/casos/{cid}/classificar", headers=h_cu, json={"tratamentos": ["endodontia", "dentistica"]})
    assert r.status_code == 200 and r.json()["etapa"] == "na_fila"

    # busca do professor por tipo de tratamento
    assert cid in [c["id"] for c in client.get("/casos/fila?tratamento=endodontia", headers=h_pr).json()["casos"]]
    assert cid not in [c["id"] for c in client.get("/casos/fila?tratamento=protese", headers=h_pr).json()["casos"]]
    assert cid in [c["id"] for c in client.get("/casos/fila?busca=silva", headers=h_pr).json()["casos"]]
    assert client.get("/casos/fila", headers=h_al).status_code == 403
    assert client.get(f"/casos/{cid}", headers=h_at).status_code == 404  # ainda nao e dele

    # 01/11/2026: com caso_id, so os alunos que podem abrir a pasta (o autor, aqui)
    da_pasta = client.get(f"/casos/pessoas?perfil=estudante&caso_id={cid}", headers=h_pr).json()["pessoas"]
    assert [p["id"] for p in da_pasta] == [aluno.id]
    alunos = client.get("/casos/pessoas?perfil=estudante", headers=h_pr).json()["pessoas"]
    assert {"id": aluno_trat.id, "nome": aluno_trat.nome, "perfil": "estudante"} in alunos
    assert all("email" not in p for p in alunos)
    assert client.post(f"/casos/{cid}/encaminhar-aluno", headers=h_pr,
                       json={"aluno_id": professor.id, "tratamento": "endodontia"}).status_code == 422
    r = client.post(f"/casos/{cid}/encaminhar-aluno", headers=h_pr, json={"aluno_id": aluno_trat.id, "tratamento": "endodontia"})
    assert r.status_code == 200 and r.json()["etapa"] == "em_tratamento"
    assert cid not in [c["id"] for c in client.get("/casos/fila", headers=h_pr).json()["casos"]]  # saiu da fila

    meus = client.get("/casos/meus-tratamentos", headers=h_at).json()["casos"]
    assert [c["id"] for c in meus] == [cid] and meus[0]["tratamento_escolhido"] == "endodontia"
    assert client.get(f"/casos/{cid}", headers=h_at).status_code == 200

    # alunos e pacientes: busca por aluno ou por paciente
    lista = client.get(f"/casos/tratamentos?busca={aluno_trat.nome[:10]}", headers=h_pr).json()["tratamentos"]
    assert any(t["id"] == cid and t["aluno"] == aluno_trat.nome for t in lista)
    lista = client.get("/casos/tratamentos?busca=maria da silva", headers=h_cu).json()["tratamentos"]
    assert any(t["id"] == cid and t["encaminhado_por"] == professor.nome for t in lista)
    assert client.get("/casos/tratamentos", headers=h_al).status_code == 403

    assert client.post(f"/casos/{cid}/concluir", headers=h_al, json={}).status_code == 403
    assert client.post(f"/casos/{cid}/concluir", headers=h_at).status_code == 200
    assert client.post(f"/casos/{cid}/concluir", headers=h_at).status_code == 409

    # registro de acessos: admin ve, sem nome do paciente; aluno nao
    reg = client.get(f"/casos/{cid}/acessos", headers=h_ad)
    assert reg.status_code == 200 and "Maria" not in reg.text
    assert any(a["acao"] == "caso_visualizado" and a["quem"] == aluno_trat.nome for a in reg.json()["acessos"])
    assert client.get("/casos/registro-acessos", headers=h_al).status_code == 403
    assert client.get("/casos/registro-acessos", headers=h_pr).status_code == 200
    hist = [x["acao"] for x in client.get(f"/casos/{cid}", headers=h_pr).json()["historico"]]
    assert hist == ["pasta_enviada", "encaminhada_curador", "classificada", "encaminhada_aluno", "tratamento_concluido"]

    # 01/11/2026 (QA item 3): desfazer o "concluido" - so professor/curador,
    # volta para "em tratamento" com o mesmo aluno, fica no historico
    assert client.get(f"/casos/{cid}", headers=h_pr).json()["pode"]["reabrir_tratamento"] is True
    assert client.get(f"/casos/{cid}", headers=h_at).json()["pode"]["reabrir_tratamento"] is False
    assert client.post(f"/casos/{cid}/reabrir-tratamento", headers=h_at, json={}).status_code == 403
    r = client.post(f"/casos/{cid}/reabrir-tratamento", headers=h_cu, json={"nota": "Faltou o retorno"})
    assert r.status_code == 200 and r.json()["etapa"] == "em_tratamento"
    assert client.post(f"/casos/{cid}/reabrir-tratamento", headers=h_cu, json={}).status_code == 409
    assert [c["id"] for c in client.get("/casos/meus-tratamentos", headers=h_at).json()["casos"]] == [cid]
    detalhe = client.get(f"/casos/{cid}", headers=h_pr).json()
    assert detalhe["historico"][-1]["acao"] == "tratamento_reaberto"
    assert client.post(f"/casos/{cid}/concluir", headers=h_at, json={"nota": "Alta"}).status_code == 200


def test_curadoria_geral_pode_ser_editada_depois_do_envio(client, criar_usuario, criar_ficha, db):
    from app.modules.curations import CurationHistory

    curador = criar_usuario(perfil=UserRole.curador)
    estudante = criar_usuario()
    h_cu = cabecalho_auth(obter_token(client, curador.email))
    h_es = cabecalho_auth(obter_token(client, estudante.email))
    ficha = criar_ficha()  # aprovada
    assert client.post(f"/curation/{ficha.id}/reabrir", headers=h_es).status_code == 403
    r = client.post(f"/curation/{ficha.id}/reabrir", headers=h_cu)
    assert r.status_code == 200 and r.json()["status"] == "em_analise"
    assert client.post(f"/curation/{ficha.id}/reabrir", headers=h_cu).status_code == 409
    # agora pode editar
    assert client.patch(f"/curation/{ficha.id}", headers=h_cu, json={"descricao_didatica": "Corrigida depois do envio"}).status_code == 200
    hist = db.query(CurationHistory).filter(CurationHistory.curation_id == ficha.id).all()
    assert any(h.acao == "reabertura_edicao" and h.status_anterior == "aprovada" for h in hist)


def test_m6_abrir_a_pasta_duas_vezes_seguidas_grava_uma_vez(client, criar_usuario, db):
    """M6 (01/11/2026): "abriu a pasta" aparecia 2x no mesmo segundo."""
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    h_al = cabecalho_auth(obter_token(client, aluno.email))
    h_pr = cabecalho_auth(obter_token(client, professor.email))
    cid = _criar(client, h_al, _dados(professor.id)).json()["id"]
    for _ in range(3):
        assert client.get(f"/casos/{cid}", headers=h_pr).status_code == 200
    vezes = db.query(AuditLog).filter(AuditLog.acao == "caso_visualizado", AuditLog.entidade_id == cid,
                                      AuditLog.usuario_id == professor.id).count()
    assert vezes == 1


def test_m6_endereco_real_repassado_pelos_intermediarios():
    """O Nginx do visualizador repassa o endereco de quem pediu, e no servidor
    e no tunel a API confia no endereco informado pelo Caddy/Cloudflare."""
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2]
    nginx = (raiz / "orthanc" / "cors-proxy.conf.template").read_text(encoding="utf-8")
    bloco = nginx.split("location = /_radix_autorizar", 1)[1].split("}", 1)[0]
    assert "X-Forwarded-For" in bloco
    for arquivo in ("docker-compose.prod.yml", "docker-compose.tunel.yml"):
        assert "FORWARDED_ALLOW_IPS" in (raiz / arquivo).read_text(encoding="utf-8"), arquivo


def test_deixar_de_compartilhar(client, criar_usuario, db):
    """Extra da auditoria do administrador (01/11/2026): desfazer o compartilhamento."""
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    professor2 = criar_usuario(perfil=UserRole.professor)
    professor3 = criar_usuario(perfil=UserRole.professor)
    curador = criar_usuario(perfil=UserRole.curador)
    h_al = cabecalho_auth(obter_token(client, aluno.email))
    h_pr = cabecalho_auth(obter_token(client, professor.email))
    h_pr2 = cabecalho_auth(obter_token(client, professor2.email))
    h_pr3 = cabecalho_auth(obter_token(client, professor3.email))
    h_cu = cabecalho_auth(obter_token(client, curador.email))
    caso = _criar(client, h_al, _dados(professor.id)).json()
    url = f"/casos/{caso['id']}/compartilhar"
    assert client.post(url, headers=h_pr, json={"para_id": professor2.id}).status_code == 200

    # a tela recebe quem pode desfazer
    det = client.get(f"/casos/{caso['id']}", headers=h_pr).json()
    assert det["compartilhamentos"] == [{"para_id": professor2.id, "nome": professor2.nome, "pode_remover": True}]
    assert client.get(f"/casos/{caso['id']}", headers=h_pr3).json()["compartilhamentos"][0]["pode_remover"] is False
    assert client.get(f"/casos/{caso['id']}", headers=h_al).json()["compartilhamentos"][0]["pode_remover"] is False

    assert any(c["id"] == caso["id"] for c in client.get("/casos/recebidos", headers=h_pr2).json()["casos"])
    # aluno e professor que nao participou: nao podem
    assert client.delete(f"{url}/{professor2.id}", headers=h_al).status_code == 403
    assert client.delete(f"{url}/{professor2.id}", headers=h_pr3).status_code == 403
    # quem compartilhou pode; some de "Compartilhadas comigo" de quem recebeu
    assert client.delete(f"{url}/{professor2.id}", headers=h_pr).status_code == 200
    assert all(c["id"] != caso["id"] for c in client.get("/casos/recebidos", headers=h_pr2).json()["casos"])
    assert client.delete(f"{url}/{professor2.id}", headers=h_pr).status_code == 404  # ja desfeito
    # quem recebeu tira da propria lista; curador tambem pode desfazer
    client.post(url, headers=h_pr, json={"para_id": professor2.id})
    assert client.delete(f"{url}/{professor2.id}", headers=h_pr2).status_code == 200
    client.post(url, headers=h_pr, json={"para_id": professor2.id})
    assert client.delete(f"{url}/{professor2.id}", headers=h_cu).status_code == 200

    # historico e auditoria (nada da pasta e apagado)
    det = client.get(f"/casos/{caso['id']}", headers=h_pr).json()
    assert det["compartilhamentos"] == []
    assert sum(1 for h in det["historico"] if h["acao"] == "compartilhamento_removido") == 3
    assert db.query(AuditLog).filter(AuditLog.acao == "caso_compartilhamento_removido",
                                     AuditLog.entidade_id == caso["id"]).count() == 3


def test_impressao_da_pasta_fica_na_auditoria_e_administrador_nao_imprime(client, criar_usuario, db):
    """02/11/2026: imprimir / salvar em PDF leva dados do paciente para fora do sistema."""
    aluno = criar_usuario()
    professor = criar_usuario(perfil=UserRole.professor)
    pesquisador = criar_usuario(perfil=UserRole.pesquisador)
    admin = criar_usuario(perfil=UserRole.administrador)
    h_aluno = cabecalho_auth(obter_token(client, aluno.email))
    caso_id = _criar(client, h_aluno, _dados(professor_id=professor.id)).json()["id"]

    h_prof = cabecalho_auth(obter_token(client, professor.email))
    assert client.post(f"/casos/{caso_id}/impressao", headers=h_prof).status_code == 200
    registro = db.query(AuditLog).filter(AuditLog.acao == "caso_impresso", AuditLog.entidade_id == caso_id).all()
    assert len(registro) == 1 and registro[0].usuario_id == professor.id and registro[0].resultado == "sucesso"
    # a trilha nunca guarda o nome do paciente
    assert "Maria" not in (registro[0].detalhes or "")

    # quem nao ve a pasta: 404 (e nada de impressao registrada)
    h_pesq = cabecalho_auth(obter_token(client, pesquisador.email))
    assert client.post(f"/casos/{caso_id}/impressao", headers=h_pesq).status_code == 404
    # administrador so le: 403, sem registro de impressao
    h_admin = cabecalho_auth(obter_token(client, admin.email))
    assert client.post(f"/casos/{caso_id}/impressao", headers=h_admin).status_code == 403
    db.expire_all()
    assert db.query(AuditLog).filter(AuditLog.acao == "caso_impresso", AuditLog.entidade_id == caso_id).count() == 1
