"""
Bloco D (OWASP ASVS 3.5.5 e 3.4.6, 12/11/2026): o visualizador OHIF so
confia nas telas do Radix.

- A origem confiavel das mensagens (postMessage) vem da CONFIGURACAO
  (RADIX_ORIGEM_CONFIAVEL), nunca do document.referrer (que e de quem
  colocou o OHIF em moldura - qualquer site poderia).
- O nginx do OHIF responde "Content-Security-Policy: frame-ancestors
  <origem do Radix>": so as telas do Radix podem mostrar o OHIF em moldura.

O teste roda o mesmo script do container (ohif/gerar-config.sh) sobre uma
copia do default.conf.template da imagem ohif/app:v3.9.2 e, se houver nginx
na maquina, liga um nginx de verdade e confere o cabecalho na resposta.
"""

import os
import re
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / "ohif" / "gerar-config.sh"
TEMPLATE_JS = RAIZ / "ohif" / "app-config.template.js"
TEMPLATE_NGINX = Path(__file__).parent / "dados" / "ohif_default.conf.template"
ORIGEM = "https://app.radiximago.com.br"


def _gerar(tmp_path: Path, origem: str = ORIGEM, porta: str = "80") -> subprocess.CompletedProcess:
    env = {
        **os.environ,
        "RADIX_ORIGEM_CONFIAVEL": origem,
        "PORT": porta,
        "TEMPLATE_APP_CONFIG": str(TEMPLATE_JS),
        "SAIDA_APP_CONFIG": str(tmp_path / "app-config.js"),
        "TEMPLATE_NGINX": str(TEMPLATE_NGINX),
        "SAIDA_NGINX": str(tmp_path / "default.conf"),
    }
    return subprocess.run(["sh", str(SCRIPT)], env=env, capture_output=True, text=True)


def _blocos_location(conf: str) -> list[str]:
    """Conteudo de cada bloco 'location ... {' de varias linhas (conta as chaves)."""
    blocos = []
    for m in re.finditer(r"^[ \t]*location[^{\n]*\{[ \t]*$", conf, re.M):
        nivel, i = 1, m.end()
        while nivel and i < len(conf):
            nivel += {"{": 1, "}": -1}.get(conf[i], 0)
            i += 1
        blocos.append(conf[m.end():i - 1])
    return blocos


def test_template_nao_confia_no_referrer():
    js = TEMPLATE_JS.read_text(encoding="utf-8")
    assert "document.referrer" not in js and "referrer" not in js
    assert js.count("var origemRadix = '__RADIX_ORIGEM_CONFIAVEL__';") == 2


def test_app_config_gerado_tem_a_origem_da_configuracao(tmp_path):
    r = _gerar(tmp_path)
    assert r.returncode == 0, r.stderr
    js = (tmp_path / "app-config.js").read_text(encoding="utf-8")
    assert "__RADIX_ORIGEM_CONFIAVEL__" not in js and "referrer" not in js
    assert js.count(f"var origemRadix = '{ORIGEM}';") == 2
    # mensagens recebidas so dessa origem
    assert "if (ev.origin !== origemRadix) return;" in js


def test_nginx_gerado_tem_frame_ancestors_em_todos_os_blocos(tmp_path):
    r = _gerar(tmp_path)
    assert r.returncode == 0, r.stderr
    conf = (tmp_path / "default.conf").read_text(encoding="utf-8")
    csp = f'add_header Content-Security-Policy "frame-ancestors {ORIGEM}" always;'
    # no servidor (blocos sem add_header proprio, como os da portaria das imagens):
    # linha com 2 espacos, fora de qualquer bloco location
    assert f"\n  {csp}\n" in conf
    # e dentro de cada bloco de varias linhas: o "location /" da imagem tem
    # add_header proprio e, no nginx, ignoraria o do servidor
    blocos = _blocos_location(conf)
    assert len(blocos) >= 2
    for bloco in blocos:
        assert csp in bloco, bloco
    assert "listen 80 default_server" in conf and "${PORT}" not in conf
    assert "include /etc/nginx/radix-dicomweb.conf;" in conf
    assert 'location = /app-config.js { root /usr/share/nginx/html; add_header Cache-Control "no-store"; }' in conf
    # X-Frame-Options so sabe DENY/SAMEORIGIN e bloquearia as telas (outra origem)
    assert "X-Frame-Options" not in conf


@pytest.mark.parametrize("origem", [
    "https://app.radiximago.com.br/",            # com barra
    "https://app.radiximago.com.br/telas",       # com caminho
    "javascript:alert(1)",
    "https://a.com\"; add_header X y",           # tentativa de injetar no nginx
    "https://a.com' + alert(1) + '",            # tentativa de injetar no JavaScript
    "ftp://app.radiximago.com.br",
])
def test_origem_invalida_impede_de_ligar(tmp_path, origem):
    r = _gerar(tmp_path, origem=origem)
    assert r.returncode != 0
    assert "RADIX_ORIGEM_CONFIAVEL invalida" in r.stderr
    assert not (tmp_path / "app-config.js").exists()


def test_origem_vazia_usa_a_das_telas_locais(tmp_path):
    r = _gerar(tmp_path, origem="")
    assert r.returncode == 0, r.stderr
    assert "frame-ancestors http://localhost:3000" in (tmp_path / "default.conf").read_text(encoding="utf-8")


def test_porta_invalida_impede_de_ligar(tmp_path):
    r = _gerar(tmp_path, porta="80; daemon on")
    assert r.returncode != 0


def test_compose_usa_o_script_e_a_variavel():
    compose = (RAIZ / "docker-compose.yml").read_text(encoding="utf-8")
    assert "./ohif/gerar-config.sh:/usr/src/radix-gerar-config.sh:ro" in compose
    assert "RADIX_ORIGEM_CONFIAVEL=${RADIX_ORIGEM_CONFIAVEL:-http://localhost:3000}" in compose
    prod = (RAIZ / "docker-compose.prod.yml").read_text(encoding="utf-8")
    assert "RADIX_ORIGEM_CONFIAVEL=https://app.radiximago.com.br" in prod


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.skipif(not shutil.which("nginx"), reason="nginx nao instalado nesta maquina")
def test_nginx_de_verdade_responde_com_frame_ancestors(tmp_path):
    porta = _porta_livre()
    r = _gerar(tmp_path, porta=str(porta))
    assert r.returncode == 0, r.stderr
    html = tmp_path / "html"
    html.mkdir()
    (html / "index.html").write_text("<!doctype html><title>OHIF</title>", encoding="utf-8")
    (html / "50x.html").write_text("erro", encoding="utf-8")
    shutil.copy(tmp_path / "app-config.js", html / "app-config.js")
    conf = (tmp_path / "default.conf").read_text(encoding="utf-8")
    conf = conf.replace("/usr/share/nginx/html", str(html))
    conf = conf.replace("/etc/nginx/radix-dicomweb.conf", str(RAIZ / "ohif" / "radix-dicomweb.conf"))
    conf = conf.replace(f"listen [::]:{porta} default_server;", "")       # sem IPv6 no teste
    (tmp_path / "default.conf").write_text(conf, encoding="utf-8")
    principal = tmp_path / "nginx.conf"
    # rodando como root (container de testes), os processos do nginx tambem
    # precisam ser root para ler a pasta temporaria do teste
    usuario = "user root;\n" if hasattr(os, "geteuid") and os.geteuid() == 0 else ""
    principal.write_text(
        f"{usuario}pid {tmp_path}/nginx.pid;\nerror_log {tmp_path}/erro.log;\nevents {{}}\n"
        f"http {{ access_log off; client_body_temp_path {tmp_path}/tmp; proxy_temp_path {tmp_path}/tmp;"
        f" fastcgi_temp_path {tmp_path}/tmp; uwsgi_temp_path {tmp_path}/tmp; scgi_temp_path {tmp_path}/tmp;"
        f" include {tmp_path}/default.conf; }}\n",
        encoding="utf-8",
    )
    (tmp_path / "tmp").mkdir()
    teste = subprocess.run(["nginx", "-t", "-c", str(principal), "-p", str(tmp_path)], capture_output=True, text=True)
    assert teste.returncode == 0, teste.stderr
    processo = subprocess.Popen(["nginx", "-c", str(principal), "-p", str(tmp_path), "-g", "daemon off;"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        resposta = None
        for _ in range(50):
            try:
                resposta = urllib.request.urlopen(f"http://127.0.0.1:{porta}/", timeout=2)
                break
            except urllib.error.HTTPError:
                raise                                   # respondeu com erro: o teste deve falhar
            except OSError:
                time.sleep(0.1)
        assert resposta is not None, "nginx nao respondeu"
        assert resposta.headers["Content-Security-Policy"] == f"frame-ancestors {ORIGEM}"
        assert resposta.headers.get("X-Frame-Options") is None
        # pagina de erro e a rota de tela do OHIF (try_files) tambem protegidas
        tela = urllib.request.urlopen(f"http://127.0.0.1:{porta}/viewer?StudyInstanceUIDs=1", timeout=2)
        assert tela.headers["Content-Security-Policy"] == f"frame-ancestors {ORIGEM}"
        js = urllib.request.urlopen(f"http://127.0.0.1:{porta}/app-config.js", timeout=2)
        assert js.headers["Cache-Control"] == "no-store"
        assert f"var origemRadix = '{ORIGEM}';" in js.read().decode("utf-8")
    finally:
        processo.terminate()
        processo.wait(timeout=10)
