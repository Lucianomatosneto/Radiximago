#!/usr/bin/env python3
"""
Consolida os relatórios das ferramentas em UM resumo em Markdown.

Uso:  python consolidar.py <pasta_com_artefatos> <arquivo_de_saida.md> [commit] [data]

Procura, dentro da pasta (em qualquer subpasta), os arquivos gerados pelos workflows:
  relatorio-pytest*.xml, relatorio-vitest.xml, ruff.json, mypy.txt, eslint.json,
  gitleaks.json, pip-audit.json, npm-audit.json, semgrep.json, k6-resumo.json,
  lighthouse-login.report.json.
Só LÊ. Nunca imprime valores de segredos (o Gitleaks já vem com --redact).
Ferramenta sem relatório aparece como "sem relatório" (nunca como aprovada).
"""
import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path


def achar(raiz: Path, padrao: str):
    return sorted(raiz.rglob(padrao))


def json_de(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def junit(p: Path):
    try:
        s = ET.parse(p).getroot()
        s = s if s.tag == "testsuite" else s[0]
        t, f, e, k = (int(s.get(x, 0)) for x in ("tests", "failures", "errors", "skipped"))
        return t, t - f - e - k, f + e, k
    except Exception:
        return None


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    raiz, saida = Path(sys.argv[1]), Path(sys.argv[2])
    commit = sys.argv[3] if len(sys.argv) > 3 else "desconhecido"
    data = sys.argv[4] if len(sys.argv) > 4 else ""
    L = [f"# Auditoria automática — {data}", "", f"Commit analisado: `{commit}`", ""]

    L += ["## Testes", "", "| Suíte | Executados | Aprovados | Reprovados | Ignorados |", "|---|---|---|---|---|"]
    for padrao, nome in (("relatorio-pytest.xml", "Backend (suíte do projeto)"), ("relatorio-pytest-auditoria.xml", "Auditoria da API"), ("relatorio-vitest.xml", "Frontend (Vitest)")):
        arqs = achar(raiz, padrao)
        r = junit(arqs[0]) if arqs else None
        L.append(f"| {nome} | " + (" | ".join(map(str, r)) if r else "sem relatório | | | ") + " |")
    L.append("")

    L += ["## Segurança", ""]
    arq = achar(raiz, "gitleaks.json")
    g = json_de(arq[0]) if arq else None
    L.append(f"- Gitleaks (segredos no histórico): {len(g)} achado(s)" if isinstance(g, list) else "- Gitleaks: sem relatório")
    arq = achar(raiz, "pip-audit.json")
    p = json_de(arq[0]) if arq else None
    if p:
        pk = Counter()
        for d in p.get("dependencies", []):
            if d.get("vulns"):
                pk[f"{d['name']} {d['version']}"] += len(d["vulns"])
        L.append(f"- pip-audit: {sum(pk.values())} vulnerabilidade(s) em {len(pk)} pacote(s)" + (": " + ", ".join(f"{k} ({v})" for k, v in pk.most_common(5)) if pk else ""))
    else:
        L.append("- pip-audit: sem relatório")
    arq = achar(raiz, "npm-audit.json")
    n = json_de(arq[0]) if arq else None
    L.append(f"- npm audit: {n.get('metadata', {}).get('vulnerabilities', {})}" if n else "- npm audit: sem relatório")
    arq = achar(raiz, "semgrep.json")
    s = json_de(arq[0]) if arq else None
    if s:
        sev = Counter(r.get("extra", {}).get("severity", "?") for r in s.get("results", []))
        L.append(f"- Semgrep: {len(s.get('results', []))} achado(s) {dict(sev)}")
    else:
        L.append("- Semgrep: sem relatório")
    L.append("")

    L += ["## Qualidade", ""]
    arq = achar(raiz, "ruff.json")
    r = json_de(arq[0]) if arq else None
    L.append(f"- Ruff: {len(r)} ocorrência(s)" if isinstance(r, list) else "- Ruff: sem relatório")
    arq = achar(raiz, "mypy.txt")
    L.append("- Mypy: " + (arq[0].read_text(encoding='utf-8', errors='replace').strip().splitlines()[-1] if arq and arq[0].read_text().strip() else "sem relatório"))
    arq = achar(raiz, "eslint.json")
    e = json_de(arq[0]) if arq else None
    if e:
        L.append(f"- ESLint: {sum(m['severity'] == 2 for f in e for m in f['messages'])} erro(s), {sum(m['severity'] == 1 for f in e for m in f['messages'])} aviso(s)")
    else:
        L.append("- ESLint: sem relatório")
    L.append("")

    L += ["## Desempenho", ""]
    arq = achar(raiz, "k6-resumo.json")
    k = json_de(arq[0]) if arq else None
    if k:
        m = k["metrics"]
        L.append(f"- k6: p95 = {m['http_req_duration']['p(95)']:.1f} ms; falhas = {m['http_req_failed']['value'] * 100:.2f}%")
    else:
        L.append("- k6: sem relatório")
    arq = achar(raiz, "lighthouse-login.report.json")
    lh = json_de(arq[0]) if arq else None
    if lh:
        L.append("- Lighthouse (login): " + ", ".join(f"{v['title']} {round((v['score'] or 0) * 100)}" for v in lh["categories"].values()))
    else:
        L.append("- Lighthouse: sem relatório")
    L += ["", "> Resultados automáticos. Problemas só são considerados resolvidos após reteste na Auditoria.", ""]
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text("\n".join(L), encoding="utf-8")
    print(f"Resumo gravado em {saida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
