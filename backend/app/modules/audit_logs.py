"""
Modelo de dados da Auditoria do Radix Imago (Fase 4 - versao minima).

Guarda o registro de acoes sensiveis (quem fez, o que, quando, resultado).
A tela de consulta da auditoria sera construida na Fase 6; aqui definimos
apenas onde os registros ficam armazenados.
"""

import enum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base


class ResultadoAuditoria(str, enum.Enum):
    SUCESSO = "sucesso"
    NEGADO = "negado"
    ERRO = "erro"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Quem fez a acao (pode ser nulo em falhas de login, por exemplo)
    usuario_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # O que foi feito: login, falha_login, logout, aprovacao, descarte,
    # segunda_opiniao, acesso_negado, alteracao_usuario, erro_integracao...
    acao: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    # Sobre qual item: "curation", "image", "user"... e o id do item
    entidade: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entidade_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Resultado da acao
    resultado: Mapped[str] = mapped_column(String(15), nullable=False, default="sucesso")

    # Informacoes extras (mensagem, contexto) - sem dados sensiveis
    detalhes: Mapped[str | None] = mapped_column(Text, nullable=True)

    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    # De onde veio o pedido (ASVS 16.2.1) - preenchidos automaticamente a
    # partir do pedido em andamento (app/core/contexto_pedido.py). Vazios
    # quando a acao e do proprio sistema (ex.: anonimizacao automatica).
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    rota: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Lacre encadeado (ASVS 16.4.2): calculado PELO BANCO (gatilho da
    # migracao a4c8e2f6b1d9) - a aplicacao nunca preenche nem altera.
    lacre: Mapped[str | None] = mapped_column(String(64), nullable=True)

# Preenche ip/rota de todo registro novo com os dados do pedido em andamento,
# sem precisar mexer nos mais de 50 lugares que gravam auditoria.
from sqlalchemy import event  # noqa: E402

from app.core.contexto_pedido import pedido_atual  # noqa: E402


@event.listens_for(AuditLog, "before_insert")
def _origem_do_pedido(mapper, conexao, registro):  # noqa: ARG001
    dados = pedido_atual.get()
    if dados:
        if registro.ip is None:
            registro.ip = dados.get("ip")
        if registro.rota is None:
            registro.rota = dados.get("rota")
