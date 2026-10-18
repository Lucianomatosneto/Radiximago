"""
Gera a lista de componentes do Radix Imago (SBOM - "Software Bill of
Materials", o "rotulo de ingredientes" do software) no formato padrao
CycloneDX 1.5 - OWASP ASVS 15.1.2.

Inclui TODOS os componentes, nao so os escolhidos diretamente:
- backend e servico de voz: o pip calcula as dependencias completas a partir
  do requirements.txt sem instalar nada (pip install --dry-run --report);
- telas (frontend): lidas do package-lock.json (lista completa e travada).

Uso (na pasta do projeto, com internet para o pip consultar o PyPI):
    python scripts/gerar_sbom.py
Saida: docs/sbom/radix-imago-sbom.cdx.json
Quando rodar: a cada mudanca de biblioteca e antes de cada entrega
(mesma rotina do pip-audit/npm audit - docs/SEGURANCA.md, secao 7).
"""

import datetime
import json
import subprocess
import sys
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def componentes_python(requirements: Path, grupo: str) -> list[dict]:
    saida = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--dry-run", "--ignore-installed", "--quiet",
         "--report", "-", "-r", str(requirements)],
        capture_output=True, text=True, check=True,
    )
    relatorio = json.loads(saida.stdout)
    diretos = {
        linha.split("==")[0].split("[")[0].strip().lower().replace("_", "-")
        for linha in requirements.read_text(encoding="utf-8").splitlines()
        if linha.strip() and not linha.lstrip().startswith("#")
    }
    itens = []
    for item in relatorio["install"]:
        nome, versao = item["metadata"]["name"], item["metadata"]["version"]
        chave = nome.lower().replace("_", "-")
        itens.append({
            "type": "library", "name": nome, "version": versao,
            "purl": f"pkg:pypi/{chave}@{versao}",
            "properties": [
                {"name": "radix:parte", "value": grupo},
                {"name": "radix:dependencia", "value": "direta" if chave in diretos else "indireta"},
            ],
        })
    return itens


def componentes_npm(lock: Path) -> list[dict]:
    dados = json.loads(lock.read_text(encoding="utf-8"))
    raiz = dados["packages"].get("", {})
    diretos = set(raiz.get("dependencies", {})) | set(raiz.get("devDependencies", {}))
    itens = []
    for caminho, pacote in sorted(dados["packages"].items()):
        if not caminho or "version" not in pacote:
            continue
        nome = caminho.split("node_modules/")[-1]
        purl_nome = nome.replace("@", "%40", 1) if nome.startswith("@") else nome
        itens.append({
            "type": "library", "name": nome, "version": pacote["version"],
            "purl": f"pkg:npm/{purl_nome}@{pacote['version']}",
            "properties": [
                {"name": "radix:parte", "value": "frontend"},
                {"name": "radix:dependencia", "value": "direta" if nome in diretos and caminho.count("node_modules/") == 1 else "indireta"},
                {"name": "radix:uso", "value": "so-montagem" if pacote.get("dev") else "producao"},
            ],
        })
    return itens


def main() -> None:
    componentes = (
        componentes_python(RAIZ / "backend" / "requirements.txt", "backend")
        + componentes_python(RAIZ / "whisper" / "requirements.txt", "voz")
        + componentes_npm(RAIZ / "frontend" / "package-lock.json")
    )
    # o mesmo pacote/versao pode aparecer em varios lugares do package-lock:
    # entra uma vez so, com identificador unico (bom-ref)
    unicos: dict[str, dict] = {}
    for c in componentes:
        chave = c["purl"] + "|" + c["properties"][0]["value"]
        if chave in unicos:
            if c["properties"][1]["value"] == "direta":
                unicos[chave]["properties"][1]["value"] = "direta"
            continue
        c["bom-ref"] = chave
        unicos[chave] = c
    componentes = list(unicos.values())
    sbom = {
        "bomFormat": "CycloneDX", "specVersion": "1.5", "version": 1,
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "metadata": {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
            "component": {"type": "application", "name": "Radix Imago", "version": "redesign-ui"},
            "properties": [{"name": "radix:servicos-externos-em-imagens-docker",
                            "value": "postgres:16, orthancteam/orthanc:latest, nginx:alpine, ohif/app:v3.9.2 (ver docker-compose.yml)"}],
        },
        "components": componentes,
    }
    destino = RAIZ / "docs" / "sbom" / "radix-imago-sbom.cdx.json"
    destino.write_text(json.dumps(sbom, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    por_parte: dict[str, int] = {}
    for c in componentes:
        parte = c["properties"][0]["value"]
        por_parte[parte] = por_parte.get(parte, 0) + 1
    print(f"SBOM gravado em {destino.relative_to(RAIZ)}: {len(componentes)} componentes {por_parte}")


if __name__ == "__main__":
    main()
