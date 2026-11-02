"""
Extra da auditoria do administrador (01/11/2026): "Tentar de novo" no
Download (Visualizador) e no Envio de parecer (Segunda opiniao).

- Download e LEITURA: repete sozinho 2 vezes se o servidor estiver
  reiniciando (502/503/504) ou a rede piscar (lib/repetir.ts) e, se ainda
  falhar, mostra o botao "Tentar de novo".
- Parecer e GRAVACAO: NUNCA repete sozinho (poderia enviar duas vezes); so
  avisa que NAO foi enviado, mantem o texto e oferece o botao.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

FRONT = Path(__file__).resolve().parents[2] / "frontend"

SCRIPT = r"""
const { lerComRepeticao } = await import("file://" + process.argv[2]);
globalThis.setTimeout = (fn) => { fn(); return 0 };  // sem esperar de verdade
async function rodar(respostas) {
  const metodos = [];
  let i = 0;
  globalThis.fetch = async (url, init) => {
    metodos.push(init.method);
    const r = respostas[Math.min(i++, respostas.length - 1)];
    if (r === 'rede') throw new TypeError('Failed to fetch');
    return { status: r };
  };
  try { const r = await lerComRepeticao('http://x/download', { method: 'POST' }); return { status: r.status, chamadas: metodos.length, metodos }; }
  catch { return { status: 'erro', chamadas: metodos.length, metodos }; }
}
console.log(JSON.stringify({
  reinicia_e_volta: await rodar([503, 200]),
  rede_e_volta: await rodar(['rede', 200]),
  sempre_502: await rodar([502]),
  nao_encontrado: await rodar([404]),
}));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="node nao instalado")
def test_leitura_repete_so_quando_o_servidor_falha(tmp_path):
    script = tmp_path / "teste.mjs"
    script.write_text(SCRIPT, encoding="utf-8")
    r = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", str(script), str(FRONT / "src/lib/repetir.ts")],
        capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, r.stderr
    d = json.loads(r.stdout)
    assert d["reinicia_e_volta"] == {"status": 200, "chamadas": 2, "metodos": ["GET", "GET"]}
    assert d["rede_e_volta"]["status"] == 200 and d["rede_e_volta"]["chamadas"] == 2
    assert d["sempre_502"] == {"status": 502, "chamadas": 3, "metodos": ["GET"] * 3}
    assert d["nao_encontrado"]["chamadas"] == 1  # erro do pedido: nao insiste
    # mesmo pedindo POST, sai sempre como GET (nunca repete gravacao)
    assert set(d["sempre_502"]["metodos"]) == {"GET"}


def test_download_usa_repeticao_e_oferece_botao():
    tela = (FRONT / "src/components/VisualizadorSequencial.tsx").read_text(encoding="utf-8")
    trecho = tela[tela.index("async function baixarArquivo"):tela.index("function baixarUnico")]
    assert "lerComRepeticao(" in trecho and "fetch(" not in trecho.replace("lerComRepeticao(", "")
    assert 'data-teste="repetir-download"' in tela


def test_parecer_nao_repete_sozinho_e_oferece_botao():
    tela = (FRONT / "src/app/segunda-opiniao/page.tsx").read_text(encoding="utf-8")
    trecho = tela[tela.index("async function enviarParecer"):tela.index("finally", tela.index("async function enviarParecer"))]
    assert "lerComRepeticao" not in trecho and trecho.count("fetch(") == 1
    assert "setEnvioFalhou(true)" in trecho
    assert 'data-teste="repetir-parecer"' in tela
    for lingua in ("pt", "en"):
        d = json.loads((FRONT / f"messages/{lingua}.json").read_text(encoding="utf-8"))
        assert d["SegundaOpiniao"]["erros"]["enviarServidor"] and d["Visualizador"]["erroBaixarServidor"]
