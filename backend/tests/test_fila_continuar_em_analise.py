"""
FILA: CONTINUAR AS FICHAS QUE O CURADOR JA ABRIU (pedido do Luciano,
23/11/2026: "as tomografias continuam nao aparecendo no sistema para serem
curadas").

Causa: abrir uma imagem na Curadoria ja cria a ficha (em analise). Quem
saia sem aprovar perdia a imagem de vista: a fila so mostrava imagens SEM
ficha. Foi o que aconteceu com as 2 tomografias do acervo.

Regra nova:
- a fila mostra tambem as fichas EM ANDAMENTO (pendente / em analise) do
  PROPRIO curador, marcadas como "em_andamento", e elas contam na
  modalidade;
- abrir de novo devolve a MESMA ficha (antes: 409 "ja possui ficha");
- ficha em andamento de OUTRO curador continua fora da fila e nao pode ser
  aberta por esse caminho (409) - cada um cuida das suas.
Dados inventados.
"""

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _cab(client, usuario):
    from app.main import app
    app.state.limiter.reset()
    return cabecalho_auth(obter_token(client, usuario.email))


def _ficha_na_fila(criar_ficha, db, curador, status=StatusCuradoria.EM_ANALISE.value, tipo="tomografia"):
    ficha = criar_ficha(status=status, tipo_radiografia=tipo)
    ficha.curador_id = curador.id
    ficha.orthanc_reference.enquadramento = "sem_borda"
    ficha.orthanc_reference.tipo_preliminar = tipo
    db.commit()
    return ficha


def _fila(client, cab, tipo=None):
    r = client.get("/curation/pending", headers=cab, params={"limit": 200, **({"tipo": tipo} if tipo else {})})
    assert r.status_code == 200, r.text
    return r.json()


def test_minha_ficha_em_analise_aparece_na_fila_para_continuar(client, criar_usuario, criar_ficha, db):
    eu = criar_usuario(perfil=UserRole.curador)
    ficha = _ficha_na_fila(criar_ficha, db, eu)
    cab = _cab(client, eu)
    fila = _fila(client, cab)
    item = next(i for i in fila["itens"] if i["orthanc_reference_id"] == ficha.orthanc_reference_id)
    assert item["curation_id"] == ficha.id and item["em_andamento"] is True
    assert fila["por_tipo"].get("tomografia", 0) >= 1
    assert any(i["orthanc_reference_id"] == ficha.orthanc_reference_id for i in _fila(client, cab, "tomografia")["itens"])
    # abrir de novo: a mesma ficha, sem erro
    r = client.post(f"/curation/{ficha.orthanc_reference_id}", headers=cab, json={})
    assert r.status_code in (200, 201), r.text
    assert r.json()["curation_id"] == ficha.id


def test_ficha_em_analise_de_outro_curador_nao_aparece(client, criar_usuario, criar_ficha, db):
    dono, outro = criar_usuario(perfil=UserRole.curador), criar_usuario(perfil=UserRole.curador)
    ficha = _ficha_na_fila(criar_ficha, db, dono)
    cab = _cab(client, outro)
    assert all(i["orthanc_reference_id"] != ficha.orthanc_reference_id for i in _fila(client, cab)["itens"])
    assert client.post(f"/curation/{ficha.orthanc_reference_id}", headers=cab, json={}).status_code == 409


def test_ficha_aprovada_nao_volta_para_a_fila(client, criar_usuario, criar_ficha, db):
    eu = criar_usuario(perfil=UserRole.curador)
    ficha = _ficha_na_fila(criar_ficha, db, eu, status=StatusCuradoria.APROVADA.value)
    cab = _cab(client, eu)
    assert all(i["orthanc_reference_id"] != ficha.orthanc_reference_id for i in _fila(client, cab)["itens"])
    assert client.post(f"/curation/{ficha.orthanc_reference_id}", headers=cab, json={}).status_code == 409


def test_imagem_sem_ficha_continua_sem_marca_de_andamento(client, criar_usuario, criar_referencia, db):
    eu = criar_usuario(perfil=UserRole.curador)
    ref = criar_referencia()
    ref.enquadramento = "sem_borda"
    db.commit()
    item = next(i for i in _fila(client, _cab(client, eu))["itens"] if i["orthanc_reference_id"] == ref.id)
    assert item["curation_id"] is None and item["em_andamento"] is False
