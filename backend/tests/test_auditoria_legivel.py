"""
Auditoria legivel (01/11/2026 - auditoria do administrador, M3).

- toda acao documentada em docs/REGISTROS.md tem rotulo em portugues na tela
  (frontend/src/lib/acoesAuditoria.ts) - nada de codigo cru;
- "agrupar repetidos": registros IGUAIS no mesmo segundo viram uma linha com
  "N vezes" (so na leitura - todos continuam gravados);
- o filtro de acoes fica completo (GET /admin/audit-logs/acoes).
"""

import re
from pathlib import Path

from app.modules.audit_logs import AuditLog
from app.modules.users import UserRole
from tests.conftest import cabecalho_auth, obter_token

RAIZ = Path(__file__).resolve().parents[2]
NAO_SAO_ACOES = {"banco_desatualizado", "reabertura_edicao"}  # detalhe de erro / historico da ficha


def _acoes_documentadas() -> set[str]:
    texto = (RAIZ / "docs" / "REGISTROS.md").read_text(encoding="utf-8")
    secao = texto.split("| Grupo | Ações (`acao`) |", 1)[1].split("\n\n", 1)[0]
    acoes = set()
    for linha in secao.splitlines():
        celulas = linha.split("|")
        if len(celulas) > 2:
            acoes |= set(re.findall(r"`([a-z_]+)`", celulas[2]))
    return acoes - NAO_SAO_ACOES


def test_toda_acao_documentada_tem_rotulo_na_tela():
    catalogo = (RAIZ / "frontend" / "src" / "lib" / "acoesAuditoria.ts").read_text(encoding="utf-8")
    rotuladas = set(re.findall(r"a\('([a-z_]+)'", catalogo))
    faltando = _acoes_documentadas() - rotuladas
    assert not faltando, f"acoes sem rotulo na Auditoria: {sorted(faltando)}"


def test_agrupar_repetidos_no_mesmo_segundo(client, db, criar_usuario):
    admin = criar_usuario(perfil=UserRole.administrador)
    cab = cabecalho_auth(obter_token(client, admin.email))
    for _ in range(7):
        db.add(AuditLog(usuario_id=admin.id, acao="teste_repetido", entidade="pedido", resultado="negado",
                        detalhes="GET /x -> 403", rota="GET /x"))
    db.commit()
    soltos = client.get("/admin/audit-logs", params={"acao": "teste_repetido", "usuario_id": admin.id}, headers=cab).json()
    agrupados = client.get("/admin/audit-logs", params={"acao": "teste_repetido", "usuario_id": admin.id, "agrupar": True},
                           headers=cab).json()
    assert soltos["total"] == 7
    assert sum(i["vezes"] for i in agrupados["itens"]) == 7 and agrupados["total"] < 7  # mesmo segundo -> juntos
    contagem = client.get("/admin/audit-logs/acoes", headers=cab).json()["acoes"]
    assert contagem["teste_repetido"] >= 7
