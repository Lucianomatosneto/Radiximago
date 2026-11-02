"""
Extra da auditoria do administrador (01/11/2026): "Enviar por e-mail" (uma
imagem, no Visualizador) e "Enviar as selecionadas" (lote, em Minhas
imagens) agora pedem confirmacao DENTRO da pagina antes de chamar o
servidor - o window.confirm do navegador era aceito sozinho por algumas
ferramentas. Confere que a pergunta vem ANTES do envio e que responder
"nao" sai da funcao sem enviar nada.
"""

import json
import re
from pathlib import Path

FRONT = Path(__file__).resolve().parents[2] / "frontend"


def _funcao(arquivo: str, nome: str) -> str:
    texto = (FRONT / arquivo).read_text(encoding="utf-8")
    inicio = texto.index(f"async function {nome}(")
    return texto[inicio:texto.index("\n  }\n", inicio)]


def test_lote_confirma_antes_de_enviar():
    corpo = _funcao("src/app/minhas-imagens/page.tsx", "enviarSelecionadasPorEmail")
    assert corpo.index("pedirConfirmacao(") < corpo.index("send-email-lote")
    assert "if (!confirmou) return" in corpo


def test_uma_imagem_confirma_antes_de_enviar():
    corpo = _funcao("src/components/VisualizadorSequencial.tsx", "enviarPorEmail")
    assert corpo.index("pedirConfirmacao(") < corpo.index("/send-email")
    assert "if (!confirmou) return" in corpo


def test_nenhum_confirm_nativo_nas_telas_de_envio():
    for arquivo in ("src/app/minhas-imagens/page.tsx", "src/components/VisualizadorSequencial.tsx"):
        texto = (FRONT / arquivo).read_text(encoding="utf-8")
        assert not re.search(r"\b(window\.)?confirm\(", texto), arquivo
        assert "{quadroConfirmacao}" in texto, arquivo


def test_quadro_cancelar_esc_e_fora_respondem_nao():
    quadro = (FRONT / "src/components/useConfirmacao.tsx").read_text(encoding="utf-8")
    assert quadro.count("responder(false)") >= 3  # Cancelar, Esc e clique fora
    assert quadro.count("responder(true)") == 1    # so o botao de confirmar
    assert "autoFocus" in quadro.split('data-acao="cancelar"')[1].split("</button>")[0]


def test_textos_em_portugues_e_ingles():
    for lingua in ("pt", "en"):
        d = json.loads((FRONT / f"messages/{lingua}.json").read_text(encoding="utf-8"))
        for ns, chave in (("MinhasImagens", "confirmarEmailLote"), ("Visualizador", "confirmarEmailUma")):
            assert d[ns][chave] and d[ns]["simEnviar"] and d[ns]["confirmarEmailTitulo"]
