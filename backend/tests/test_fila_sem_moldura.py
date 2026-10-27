"""
Inicio da curadoria profissional (20/10/2026): a fila da Curadoria so mostra
imagens SEM MOLDURA (recortada ou sem borda); e o roteiro que zera as
curadorias de teste so apaga quando confirmado.
"""

from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def test_fila_da_curadoria_so_tem_imagens_sem_moldura(client, criar_usuario, criar_referencia, db):
    curador = criar_usuario(perfil=UserRole.curador)
    token = obter_token(client, curador.email)
    refs = {}
    for situacao in ("recortada", "sem_borda", "incerto", "nao_verificado", None):
        ref = criar_referencia()
        ref.enquadramento = situacao
        refs[situacao] = ref.id
    db.commit()

    ids = set()
    skip = 0
    while True:
        r = client.get(f"/curation/pending?limit=200&skip={skip}", headers=cabecalho_auth(token)).json()
        ids |= {i["orthanc_reference_id"] for i in r["itens"]}
        skip += 200
        if skip >= r["total_pendentes"]:
            break
    assert refs["recortada"] in ids and refs["sem_borda"] in ids
    assert refs["incerto"] not in ids and refs["nao_verificado"] not in ids and refs[None] not in ids


def test_zerar_curadorias_so_simula_sem_confirmacao(criar_ficha, db, capsys):
    import zerar_curadorias
    from app.modules.curations import Curation

    ficha = criar_ficha()
    zerar_curadorias.executar(aplicar=False)
    assert "SIMULACAO" in capsys.readouterr().out
    assert db.query(Curation).filter(Curation.id == ficha.id).count() == 1
