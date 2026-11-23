"""
MINHAS IMAGENS: FILTRO POR TIPO NAS IMAGENS ENVIADAS POR MIM (pedido do
video, 22/11/2026).

Para a tela filtrar "so periapicais", "so tomografias"..., cada item de
/envios/meus informa `tipo_radiografia`:
- se ja existe ficha de curadoria (qualquer situacao), o tipo da ficha;
- se nao tem ficha e e um volume (tomografia), "tomografia";
- sem ficha e sem volume: null (a tela mostra so em "Todos").
Dados inventados.
"""

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _meus(client, usuario):
    cab = cabecalho_auth(obter_token(client, usuario.email))
    return {i["id"]: i for i in client.get("/envios/meus", headers=cab).json()["itens"]}


def test_tipo_vem_da_ficha_do_volume_ou_fica_vazio(client, criar_usuario, criar_ficha, db):
    dono = criar_usuario(perfil=UserRole.professor)
    com_ficha = criar_ficha(status=StatusCuradoria.PENDENTE.value, tipo_radiografia="interproximal")
    volume = criar_ficha(status=StatusCuradoria.PENDENTE.value)
    sem_nada = criar_ficha(status=StatusCuradoria.PENDENTE.value)
    for ficha in (com_ficha, volume, sem_nada):
        ficha.orthanc_reference.enviado_por_id = dono.id
    volume.orthanc_reference.em_volume = True
    ref_volume = volume.orthanc_reference
    ref_sem_nada = sem_nada.orthanc_reference
    db.delete(volume)
    db.delete(sem_nada)
    db.commit()

    itens = _meus(client, dono)
    assert itens[com_ficha.orthanc_reference_id]["tipo_radiografia"] == "interproximal"
    assert itens[ref_volume.id]["tipo_radiografia"] == "tomografia"
    assert itens[ref_sem_nada.id]["tipo_radiografia"] is None
