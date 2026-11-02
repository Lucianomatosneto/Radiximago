"""
Eliminacao das pastas de pacientes (02/11/2026) - LGPD art. 15 e 16 (o dado
pessoal deve ser eliminado quando termina o tratamento) e art. 6, III
(necessidade). Decisao do responsavel: opcao A - prazo curto e eliminacao.

O Radix NAO e o prontuario da clinica-escola (que tem prazo legal longo: Lei
13.787/2018, parecer CFO 125/92). A pasta aqui e uma COPIA DE TRABALHO para
ensino e organizacao; por isso ela e apagada depois de CASOS_RETENCAO_MESES
(padrao 12; 0 desliga). Quem decide o numero final e o encarregado (DPO)/CEP.

Quando conta o prazo:
- pasta CONCLUIDA: da data da conclusao;
- pasta nao concluida: da ULTIMA ACAO registrada no historico da pasta (ou do
  envio, se nao houver nenhuma). Assim uma pasta em tratamento nao some no meio.

O que acontece ao eliminar: somem a ficha do paciente, as fotos cifradas do
disco, as versoes do professor, os compartilhamentos e o historico da pasta.
FICA: so o registro de auditoria `caso_eliminado` (numero da pasta, motivo e
quem pediu - nunca o nome do paciente). Copias de seguranca ja feitas guardam a
pasta ate sairem da rotina de backup (14 dias).

Dois caminhos:
- automatico, uma vez por dia (retencao.py), motivo "prazo";
- a pedido (professor, rota POST /casos/{id}/eliminar), motivo "pedido".
Quem tem pasta a vencer em ate AVISO_DIAS dias a ve em GET /casos/a-vencer.
"""

from __future__ import annotations

import calendar
import logging
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules import casos_arquivos
from app.modules.audit_logs import AuditLog
from app.modules.casos import (
    CasoClinico, CasoCompartilhamento, CasoHistorico, CasoImagem, CasoRevisao, EtapaCaso,
)

logger = logging.getLogger(__name__)

AVISO_DIAS = 30
ACAO_AUDITORIA = "caso_eliminado"


def retencao_ativa() -> bool:
    return settings.CASOS_RETENCAO_MESES > 0


def _somar_meses(data: datetime, meses: int) -> datetime:
    indice = data.month - 1 + meses
    ano = data.year + indice // 12
    mes = indice % 12 + 1
    dia = min(data.day, calendar.monthrange(ano, mes)[1])
    return data.replace(year=ano, month=mes, day=dia)


def data_base(db: Session, caso: CasoClinico) -> datetime:
    if caso.etapa == EtapaCaso.CONCLUIDO.value and caso.concluido_em:
        return caso.concluido_em
    ultima = db.query(func.max(CasoHistorico.criado_em)).filter(CasoHistorico.caso_id == caso.id).scalar()
    return ultima or caso.criado_em


def vencimento(db: Session, caso: CasoClinico) -> datetime | None:
    """Data em que a pasta sera eliminada (None se a eliminacao por prazo estiver desligada)."""
    if not retencao_ativa():
        return None
    return _somar_meses(data_base(db, caso), settings.CASOS_RETENCAO_MESES)


def pastas_com_vencimento_ate(db: Session, limite: datetime) -> list[tuple[CasoClinico, datetime]]:
    if not retencao_ativa():
        return []
    achadas = []
    for caso in db.query(CasoClinico).order_by(CasoClinico.id).all():
        venc = vencimento(db, caso)
        if venc is not None and venc <= limite:
            achadas.append((caso, venc))
    return achadas


def eliminar_pasta(db: Session, caso: CasoClinico, motivo: str, usuario_id: int | None = None,
                   detalhe: str | None = None) -> dict:
    """Apaga a pasta e tudo que e dela. O banco confirma ANTES; as fotos so saem
    do disco depois (se o banco falhar, nada se perde)."""
    caso_id = caso.id
    imagens = db.query(CasoImagem).filter(CasoImagem.caso_id == caso_id).all()
    arquivos = [nome for img in imagens for nome in (img.arquivo, img.miniatura)]
    db.query(CasoImagem).filter(CasoImagem.caso_id == caso_id).delete(synchronize_session=False)
    db.query(CasoRevisao).filter(CasoRevisao.caso_id == caso_id).delete(synchronize_session=False)
    db.query(CasoCompartilhamento).filter(CasoCompartilhamento.caso_id == caso_id).delete(synchronize_session=False)
    db.query(CasoHistorico).filter(CasoHistorico.caso_id == caso_id).delete(synchronize_session=False)
    db.delete(caso)
    texto = f"motivo={motivo}; arquivos={len(arquivos)}"
    if detalhe:
        texto += f"; {detalhe}"
    db.add(AuditLog(usuario_id=usuario_id, acao=ACAO_AUDITORIA, entidade="caso", entidade_id=caso_id,
                    resultado="sucesso", detalhes=texto))
    db.commit()
    for nome in arquivos:
        try:
            casos_arquivos.apagar(nome)
        except Exception:  # arquivo ja ausente nao impede a eliminacao
            logger.warning("Nao foi possivel apagar o arquivo %s da pasta %s", nome, caso_id)
    return {"caso_id": caso_id, "arquivos": len(arquivos)}


def eliminar_vencidas(db: Session, agora: datetime | None = None) -> int:
    """Chamada pela limpeza diaria: elimina as pastas cujo prazo acabou."""
    agora = agora or datetime.now(timezone.utc)
    total = 0
    for caso, _ in pastas_com_vencimento_ate(db, agora):
        eliminar_pasta(db, caso, "prazo", None, f"meses={settings.CASOS_RETENCAO_MESES}")
        total += 1
    return total
