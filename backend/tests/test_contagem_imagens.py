"""
Contagem de imagens dos paineis (Inicio, Painel administrativo, Relatorios):
o total de imagens tem que ser exatamente a soma das situacoes - cada imagem
ativa cai em UMA situacao (sem ficha, pendente, em analise, segunda opiniao,
aprovada, descartada, baixa qualidade). Imagens desativadas ficam fora.
"""

from app.modules.curations import StatusCuradoria
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token


def _stats(client, token):
    r = client.get("/admin/stats", headers=cabecalho_auth(token))
    assert r.status_code == 200
    return r.json()


def test_total_e_soma_exata_das_situacoes(client, criar_usuario, criar_ficha, criar_referencia):
    admin = criar_usuario(perfil=UserRole.administrador)
    token = obter_token(client, admin.email)
    antes = _stats(client, token)

    criar_referencia()  # sem ficha: aguardando curadoria
    criar_ficha(status=StatusCuradoria.PENDENTE.value)
    criar_ficha(status=StatusCuradoria.EM_ANALISE.value)
    criar_ficha(status=StatusCuradoria.APROVADA.value)
    criar_ficha(status=StatusCuradoria.SEGUNDA_OPINIAO.value)
    criar_ficha(status=StatusCuradoria.DESCARTADA.value)
    criar_ficha(status=StatusCuradoria.BAIXA_QUALIDADE.value)
    criar_ficha(status=StatusCuradoria.APROVADA.value, ativo=False)  # desativada: fora do total
    criar_referencia(ativo=False)

    depois = _stats(client, token)
    img_a, img_d = antes["imagens"], depois["imagens"]

    # a regra principal: total = soma das situacoes (antes e depois)
    for img in (img_a, img_d):
        assert img["total"] == sum(img["por_situacao"].values())
        sit = img["por_situacao"]
        assert img["aguardando_curadoria"] == sit["sem_ficha"] + sit["pendente"] + sit["em_analise"]

    assert img_d["total"] - img_a["total"] == 7
    assert img_d["aguardando_curadoria"] - img_a["aguardando_curadoria"] == 3
    for chave in ("aprovada", "segunda_opiniao", "descartada", "baixa_qualidade"):
        assert img_d["por_situacao"][chave] - img_a["por_situacao"][chave] == 1
    assert img_d["desativadas"] - img_a["desativadas"] == 2

    # campos antigos acompanham a mesma contagem
    assert depois["total_imagens_orthanc"] == img_d["total"]
    assert depois["aguardando_laudo"] == img_d["aguardando_curadoria"]
    assert depois["divergencias_abertas"] == img_d["por_situacao"]["segunda_opiniao"]
