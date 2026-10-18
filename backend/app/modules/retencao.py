"""
Prazos de guarda aplicados automaticamente (OWASP ASVS 14.2.4 -
docs/DADOS_E_PRIVACIDADE.md, secao 2).

Uma vez por dia, enquanto o servidor estiver ligado:
- registros de auditoria com mais de AUDITORIA_RETENCAO_ANOS sao apagados.
  O banco so permite apagar registros acima desse prazo (gatilho
  radix_auditoria_protegida, migracao a4c8e2f6b1d9) - os dois valores
  precisam ser iguais (conferido em tests/test_registros_seguranca.py);
- sessoes encerradas ha mais de 30 dias sao apagadas.
Referencia do prazo: 5 anos, o mesmo exigido para a guarda de dados de
pesquisa (Resolucao CNS 466/2012, item XI.2.f).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal

logger = logging.getLogger(__name__)

AUDITORIA_RETENCAO_ANOS = 5
INTERVALO_LIMPEZA_SEGUNDOS = 24 * 3600


def limpar_registros_vencidos() -> dict:
    from app.modules.audit_logs import AuditLog
    from app.modules.sessoes import DIAS_GUARDAR_SESSOES, SessaoUsuario

    agora = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        auditoria = (
            db.query(AuditLog)
            .filter(AuditLog.criado_em < agora - timedelta(days=365 * AUDITORIA_RETENCAO_ANOS + 2))
            .delete(synchronize_session=False)
        )
        sessoes = (
            db.query(SessaoUsuario)
            .filter(SessaoUsuario.encerrada_em.isnot(None),
                    SessaoUsuario.encerrada_em < agora - timedelta(days=DIAS_GUARDAR_SESSOES))
            .delete(synchronize_session=False)
        )
        db.commit()
        return {"auditoria": auditoria, "sessoes": sessoes}
    finally:
        db.close()


async def limpeza_diaria() -> None:
    while True:
        try:
            resultado = await asyncio.to_thread(limpar_registros_vencidos)
            if any(resultado.values()):
                logger.info("Limpeza por prazo de guarda: %s", resultado)
        except Exception:
            logger.exception("Limpeza por prazo de guarda falhou; nova tentativa amanha.")
        await asyncio.sleep(INTERVALO_LIMPEZA_SEGUNDOS)
