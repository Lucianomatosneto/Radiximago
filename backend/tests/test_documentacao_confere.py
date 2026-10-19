"""
A documentacao de seguranca (pasta docs/) confere com o codigo.

ASVS pede documentos (regras, limites, inventarios). Documento desatualizado
e defeito: este teste quebra se o codigo mudar e o documento nao
acompanhar (ou vice-versa). Cobre os numeros e listas que mais mudam.
"""

import ast
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DOCS = RAIZ / "docs"
APP = RAIZ / "backend" / "app"


def _doc(nome: str) -> str:
    return (DOCS / nome).read_text(encoding="utf-8")


def _codigo() -> str:
    return "\n".join(p.read_text(encoding="utf-8-sig") for p in APP.rglob("*.py"))


def test_documentos_do_grupo_1_existem():
    for nome in ("SEGURANCA.md", "DADOS_E_PRIVACIDADE.md", "REGRAS_DE_NEGOCIO.md",
                 "CRIPTOGRAFIA.md", "COMUNICACOES.md", "REGISTROS.md"):
        assert (DOCS / nome).is_file(), nome
        assert (DOCS / "SEGURANCA.md").read_text(encoding="utf-8").count(nome) >= (0 if nome == "SEGURANCA.md" else 1)


def test_limites_de_frequencia_documentados_sao_os_do_codigo():
    """Cada limite @limiter.limit("N/minute") do codigo aparece na tabela de REGRAS_DE_NEGOCIO.md."""
    limites = set(re.findall(r'@limiter\.limit\("(\d+)/minute"\)', _codigo()))
    doc = _doc("REGRAS_DE_NEGOCIO.md")
    for n in limites:
        assert re.search(rf"\b{n} (por minuto|trechos por minuto)", doc), f"limite {n}/min nao documentado"


def test_limites_anti_abuso_documentados_sao_os_do_codigo():
    """Cada constante de app/core/rate_limit.py aparece em REGRAS_DE_NEGOCIO.md (grupo 4 do Nivel 2)."""
    from app.core import rate_limit as rl

    doc = _doc("REGRAS_DE_NEGOCIO.md")
    unidades = {"minute": "por minuto", "hour": "por hora"}
    for nome in dir(rl):
        if nome.startswith("LIMITE_"):
            numero, unidade = getattr(rl, nome).split("/")
            assert re.search(rf"\b{numero} {unidades[unidade]}", doc), f"{nome} nao documentado"
    for nome, texto in (("MAX_IMAGENS_EMAIL_LOTE", "imagens por e-mail"), ("MAX_CORTES_ZIP_PNG", "cortes"),
                        ("MAX_ZIPS_SIMULTANEOS", "ao mesmo tempo")):
        valor = f"{getattr(rl, nome):,}".replace(",", ".")
        assert re.search(rf"\b{re.escape(valor)} {texto}", doc), f"{nome}={valor} nao documentado"


def test_prazos_e_custos_documentados_sao_os_do_codigo():
    from app.core.config import JWT_CHAVE_MIN_BYTES, settings
    from app.core.security import BCRYPT_CUSTO
    from app.modules.auth import CONFIRMACAO_VALIDADE_HORAS, RESET_TOKEN_VALIDADE_MINUTOS
    from app.modules.sessoes import DIAS_GUARDAR_SESSOES

    dados, cripto = _doc("DADOS_E_PRIVACIDADE.md"), _doc("CRIPTOGRAFIA.md")
    assert f"{RESET_TOKEN_VALIDADE_MINUTOS} min" in dados
    assert f"{DIAS_GUARDAR_SESSOES} dias" in dados
    assert f"bcrypt, custo {BCRYPT_CUSTO}" in dados and f"custo {BCRYPT_CUSTO}" in cripto
    assert f"{JWT_CHAVE_MIN_BYTES} bytes" in cripto
    assert f"{CONFIRMACAO_VALIDADE_HORAS} h" in _doc("REGRAS_DE_NEGOCIO.md")
    assert f"{settings.MAX_UPLOAD_SIZE_MB} MB" in _doc("SEGURANCA.md")
    assert f"({settings.ANONIMIZACAO_AUTOMATICA_SEGUNDOS} s)" in dados


def test_toda_acao_de_auditoria_do_codigo_esta_no_inventario_de_registros():
    """Acoes literais (acao="...") gravadas na auditoria aparecem em REGISTROS.md."""
    acoes = set()
    for arquivo in APP.rglob("*.py"):
        arvore = ast.parse(arquivo.read_text(encoding="utf-8-sig"))
        for no in ast.walk(arvore):
            if not isinstance(no, ast.Call):
                continue
            funcao = getattr(no.func, "id", getattr(no.func, "attr", ""))
            if funcao not in ("AuditLog", "_auditar", "_registrar_auditoria", "_registrar_historico", "_registrar_evento"):
                continue
            for kw in no.keywords:
                if kw.arg == "acao" and isinstance(kw.value, ast.Constant):
                    acoes.add(kw.value.value)
            # funcoes auxiliares: (db, usuario_id, acao, ...) - a acao e o 3o argumento
            posicao = 0 if funcao == "_registrar_evento" else 2  # onde fica a acao nos argumentos
            if funcao != "AuditLog" and len(no.args) > posicao and isinstance(no.args[posicao], ast.Constant) \
                    and isinstance(no.args[posicao].value, str):
                acoes.add(no.args[posicao].value)
    # acoes escolhidas em tempo de execucao pelo registro de seguranca
    from app.core.registro_seguranca import ACOES_REGISTRADAS
    acoes.update(ACOES_REGISTRADAS)
    doc = _doc("REGISTROS.md")
    faltando = sorted(a for a in acoes if f"`{a}`" not in doc)
    assert not faltando, f"acoes de auditoria sem documentacao: {faltando}"


def test_perfis_documentados_sao_os_do_sistema():
    from app.modules.users import UserRole
    doc = _doc("DADOS_E_PRIVACIDADE.md")
    for perfil in UserRole:
        assert perfil.value in doc, perfil.value


def test_sbom_lista_todas_as_dependencias_diretas():
    sbom = json.loads((DOCS / "sbom" / "radix-imago-sbom.cdx.json").read_text(encoding="utf-8"))
    nomes = {(c["properties"][0]["value"], c["name"].lower().replace("_", "-")) for c in sbom["components"]}
    for parte, req in (("backend", RAIZ / "backend" / "requirements.txt"), ("voz", RAIZ / "whisper" / "requirements.txt")):
        for linha in req.read_text(encoding="utf-8").splitlines():
            if linha.strip() and not linha.lstrip().startswith("#"):
                nome = linha.split("==")[0].split("[")[0].strip().lower().replace("_", "-")
                assert (parte, nome) in nomes, f"{nome} ({parte}) fora do SBOM - rode scripts/gerar_sbom.py"
    pacote = json.loads((RAIZ / "frontend" / "package.json").read_text(encoding="utf-8"))
    for nome in {**pacote.get("dependencies", {}), **pacote.get("devDependencies", {})}:
        assert ("frontend", nome.lower()) in nomes, f"{nome} (frontend) fora do SBOM"
