"""
A API devolve so os campos necessarios (OWASP ASVS 15.3.1).

Varredura automatica: com cada perfil, chama TODAS as rotas de leitura (GET)
do sistema e procura nas respostas:
- campos que nunca podem sair do servidor, para ninguem (resumo da senha,
  codigos de redefinicao/confirmacao, identificador interno da sessao);
- para quem nao e da curadoria (estudante, professor, pesquisador): as
  observacoes internas da ficha e o e-mail de outros usuarios.
Rotas que dependem do Orthanc de verdade (imagens, miniaturas, DICOM) e o
microfone ficam de fora: devolvem imagem, nao dados de usuario.
"""

import json
import re

import pytest

from app.main import app
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

CAMPOS_PROIBIDOS = {
    "senha_hash", "reset_token", "reset_token_expira_em",
    "token_confirmacao_hash", "token_confirmacao_expira_em", "jti",
}
ROTAS_FORA = re.compile(r"preview|thumbnail|miniatura|download|dicom|wado|orthanc|visualizador|voz|/docs|/redoc|openapi")
SEGREDO_INTERNO = "SEGREDO-INTERNO-DA-CURADORIA-7731"


def _chaves(obj, achadas=None):
    achadas = set() if achadas is None else achadas
    if isinstance(obj, dict):
        for k, v in obj.items():
            achadas.add(k)
            _chaves(v, achadas)
    elif isinstance(obj, list):
        for v in obj:
            _chaves(v, achadas)
    return achadas


def _rotas_get(valores_de_id):
    """Todas as rotas GET do contrato oficial da API (OpenAPI)."""
    for modelo, operacoes in app.openapi()["paths"].items():
        if "get" not in operacoes or ROTAS_FORA.search(modelo):
            continue
        yield modelo, re.sub(r"\{[^}]+\}", str(valores_de_id), modelo)


@pytest.mark.parametrize("perfil", [UserRole.estudante, UserRole.professor, UserRole.curador, UserRole.administrador])
def test_nenhuma_rota_de_leitura_expoe_dados_que_nao_devia(client, criar_usuario, criar_ficha, db, perfil):
    outro = criar_usuario(perfil=UserRole.curador)  # e-mail que estudante nao deve ver
    ficha = criar_ficha(descricao_didatica="Descricao para o ensino")
    ficha.observacoes_internas = SEGREDO_INTERNO
    ficha.curador_id = outro.id
    db.commit()
    usuario = criar_usuario(perfil=perfil)
    client.cookies.clear()
    cab = cabecalho_auth(obter_token(client, usuario.email))
    da_curadoria = perfil in (UserRole.curador, UserRole.administrador)

    chamadas = 0
    viu_ficha = viu_segredo = False
    for modelo, caminho in _rotas_get(ficha.id):
        r = client.get(caminho, headers=cab)
        if not r.headers.get("content-type", "").startswith("application/json"):
            continue
        chamadas += 1
        texto = r.text
        corpo = json.loads(texto) if texto else None
        viu_ficha |= "Descricao para o ensino" in texto
        viu_segredo |= SEGREDO_INTERNO in texto
        vazados = _chaves(corpo) & CAMPOS_PROIBIDOS
        assert not vazados, f"{perfil.value} GET {modelo}: campos proibidos {vazados}"
        if not da_curadoria:
            assert SEGREDO_INTERNO not in texto, f"{perfil.value} GET {modelo}: observacoes internas expostas"
            assert outro.email not in texto, f"{perfil.value} GET {modelo}: e-mail de outro usuario exposto"
    assert chamadas >= 20, f"varredura cobriu poucas rotas ({chamadas})"
    # controles positivos: a varredura de fato chegou nos dados da ficha
    assert viu_ficha, f"{perfil.value}: nenhuma rota devolveu a ficha aprovada (varredura cega?)"
    if da_curadoria:
        assert viu_segredo, "curadoria deveria ver as observacoes internas (controle positivo)"
    print(f"{perfil.value}: {chamadas} rotas GET verificadas")
    client.cookies.clear()
