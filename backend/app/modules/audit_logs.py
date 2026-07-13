"""
Modelo de dados da Auditoria do Radix Imago (Fase 4 - versao minima).

Guarda o registro de acoes sensiveis (quem fez, o que, quando, resultado).
A tela de consulta da auditoria sera construida na Fase 6; aqui definimos
apenas onde os registros ficam armazenados.
"""

import enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ResultadoAuditoria(str, enum.Enum):
    SUCESSO = "sucesso"
    NEGADO = "negado"
    ERRO = "erro"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Quem fez a acao (pode ser nulo em falhas de login, por exemplo)
    usuario_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # O que foi feito: login, falha_login, logout, aprovacao, descarte,
    # segunda_opiniao, acesso_negado, alteracao_usuario, erro_integracao...
    acao = Column(String(60), nullable=False, index=True)

    # Sobre qual item: "curation", "image", "user"... e o id do item
    entidade = Column(String(40), nullable=True)
    entidade_id = Column(Integer, nullable=True)

    # Resultado da acao
    resultado = Column(String(15), nullable=False, default="sucesso")

    # Informacoes extras (mensagem, contexto) - sem dados sensiveis
    detalhes = Column(Text, nullable=True)

    criado_em = Column(DateTime(timezone=True), server_default=func.now(), index=True)