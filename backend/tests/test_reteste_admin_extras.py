"""
Reteste da auditoria do administrador (01/11/2026, noite) - acertos pedidos:
- Banco de imagens: faltava o cartao de Tomografia (a soma dos tipos nao
  fechava com o total);
- Painel: texto sem codigo interno ("erro_inesperado") e sem ".." no fim;
- Alertas: "nao cadastrado" -> "não cadastrado" (novos registros gravam com
  acento; os antigos, selados, sao corrigidos so na hora de mostrar);
- Usuarios: a pagina nao pode ficar mais larga que a tela; o cartao de
  Solicitacoes leva ate a lista quando ha pedidos;
- Imagens recebidas: buscar "61" traz a nº 61 primeiro; cartao de envio
  legivel no tema claro.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from app.modules.curations import TipoRadiografia

FRONT = Path(__file__).resolve().parents[2] / "frontend"
BACKEND = Path(__file__).resolve().parents[1]


def _ler(caminho: str) -> str:
    return (FRONT / caminho).read_text(encoding="utf-8")


def test_banco_de_imagens_tem_cartao_para_cada_tipo():
    grade = _ler("src/components/GradeCategoriasImagens.tsx")
    valores = set(re.findall(r"parametro: 'tipo_radiografia',\s*valor: '([a-z_]+)'", grade))
    assert valores == {t.value for t in TipoRadiografia}
    for lingua in ("pt", "en"):
        assert json.loads(_ler(f"messages/{lingua}.json"))["GradeCategorias"]["categorias"]["tomografias"]


def test_painel_sem_codigo_interno_e_sem_ponto_duplo():
    for lingua in ("pt", "en"):
        texto = json.loads(_ler(f"messages/{lingua}.json"))["PainelAdmin"]["erros24hDetalhe"]
        assert "erro_inesperado" not in texto
    painel = _ler("src/app/painel-admin/page.tsx")
    # sem o ponto final do registro (desde 12/11/2026 por aparaFim, sem regex lenta)
    assert "aparaFim(stats.ultima_falha_email.detalhes ?? '', '.', true)" in painel
    assert "detalhesLegiveis(alerta.detalhes)" in painel


def test_login_com_email_desconhecido_grava_com_acento():
    codigo = (BACKEND / "app/modules/auth.py").read_text(encoding="utf-8")
    assert "e-mail não cadastrado" in codigo and "e-mail nao cadastrado" not in codigo


@pytest.mark.skipif(not shutil.which("node"), reason="node nao instalado")
def test_registro_antigo_sem_acento_aparece_corrigido(tmp_path):
    script = tmp_path / "t.mjs"
    script.write_text(
        "const m = await import('file://' + process.argv[2]);"
        "console.log(m.detalhesLegiveis('Tentativa de login com e-mail nao cadastrado: x@y.z'));",
        encoding="utf-8",
    )
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(script),
                        str(FRONT / "src/lib/acoesAuditoria.ts")], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "Tentativa de login com e-mail não cadastrado: x@y.z"


def test_usuarios_nao_alarga_a_pagina_e_cartao_de_solicitacoes():
    tela = _ler("src/app/usuarios/page.tsx")
    assert 'className="flex min-w-0 flex-1 flex-col"' in tela
    assert 'id="solicitacoes-pendentes"' in tela
    assert "getElementById('solicitacoes-pendentes')" in tela


def test_imagens_busca_numero_exato_primeiro_e_cartao_legivel():
    tela = _ler("src/app/imagens/page.tsx")
    assert "function numeroBuscado" in tela and "imagensFiltradas.sort(" in tela
    secao = tela[tela.index("{t('enviarTitulo')}") - 400:tela.index("{t('enviarTitulo')}")]
    assert "from-emerald-50" in secao and "dark:from-emerald-950/50" in secao


def test_cartao_de_envio_usa_cores_de_texto_do_tema():
    """slate-700 e a cor de BORDA no tema claro (globals.css): texto sumia (contraste 1,39)."""
    tela = _ler("src/app/imagens/page.tsx")
    inicio = tela.index("{t('enviarTitulo')}")
    secao = tela[inicio:tela.index("</section>", inicio)]
    assert "text-slate-700" not in secao and "text-slate-800" not in secao
    assert "text-ink-2" in secao
    css = _ler("src/app/globals.css")
    assert "--color-slate-700: rgb(var(--rgb-base-border))" in css  # o motivo da regra


def test_cartoes_de_usuarios_nao_estouram_a_borda():
    assert "2xl:grid-cols-6" in _ler("src/app/usuarios/page.tsx")
    assert "[overflow-wrap:anywhere]" in _ler("src/components/DashboardCard.tsx")
