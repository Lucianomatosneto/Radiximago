"""
APARELHOS DA REDE - etapa D (08/11/2026).

Aparelhos de raio X ligados na rede que mandam as imagens DICOM direto para
o Radix (protocolo DICOM, porta 4242), sem ninguem precisar enviar arquivo.

Regras decididas pelo Luciano:
- so o ADMINISTRADOR cadastra, libera e bloqueia um aparelho (o suporte ve a
  lista e testa a conexao);
- aparelho NAO cadastrado (ou bloqueado) tem o envio RECUSADO pelo Orthanc:
  o nome DICOM do aparelho (AE Title) e o endereco IP precisam bater.

Esta tabela e a "fonte da verdade"; o Orthanc recebe a mesma lista
(ver sincronizar_no_orthanc em aparelhos_router.py). Nada e apagado: um
aparelho que sai de uso fica bloqueado, e o historico continua na auditoria.
"""

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base

NOME_MAX = 80
UNIDADE_MAX = 80
# o padrao DICOM limita o AE Title a 16 caracteres
AET_MAX = 16
PORTA_PADRAO = 104  # porta DICOM padrao dos aparelhos


class AparelhoRede(Base):
    __tablename__ = "aparelhos_rede"
    __table_args__ = (CheckConstraint("porta BETWEEN 1 AND 65535", name="ck_aparelhos_rede_porta"),)

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(NOME_MAX), nullable=False)
    unidade = Column(String(UNIDADE_MAX), nullable=True)
    # nome DICOM do aparelho, sempre em maiusculas; unico
    aet = Column(String(AET_MAX), nullable=False, unique=True)
    ip = Column(String(45), nullable=False)
    porta = Column(Integer, nullable=False, default=PORTA_PADRAO)
    # liberado = o Orthanc aceita as imagens dele; bloqueado = recusa
    liberado = Column(Boolean, nullable=False, default=True)
    criado_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    ultimo_recebimento_em = Column(DateTime(timezone=True), nullable=True)
    total_recebidas = Column(Integer, nullable=False, default=0)


def chave_orthanc(aparelho_id: int) -> str:
    """Nome do aparelho na lista do Orthanc (so o Radix mexe nos 'radix-*')."""
    return f"radix-{aparelho_id}"
