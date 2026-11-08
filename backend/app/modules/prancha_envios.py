"""
PRANCHA ENVIADA A OUTRA PESSOA (etapa E, 08/11/2026).

Decisao do Luciano: para OUTRA pessoa, o e-mail leva so um LINK que exige
login - a imagem nao sai do sistema. Para o proprio e-mail, continua indo o
PDF anexado. Qualquer perfil envia para qualquer usuario cadastrado e ativo,
escolhido pelo nome ou e-mail.

Aqui fica guardado o PEDIDO (quais fichas e quais escolhas), nao o arquivo:
quem recebeu abre a prancha pelo Radix e ela e montada na hora, so com as
imagens que continuam aprovadas.
"""

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base

RECADO_MAX = 500
DESTINATARIOS_MAX = 30


class PranchaEnviada(Base):
    __tablename__ = "pranchas_enviadas"

    id = Column(Integer, primary_key=True, index=True)
    remetente_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    destinatario_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    curation_ids = Column(JSON, nullable=False)
    numeros = Column(JSON, nullable=True)
    por_folha = Column(Integer, nullable=False, default=2)
    com_informacoes = Column(Boolean, nullable=False, default=True)
    campos = Column(JSON, nullable=True)  # None = todos os dados
    com_marcacoes = Column(Boolean, nullable=False, default=True)
    recado = Column(String(RECADO_MAX), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    visto_em = Column(DateTime(timezone=True), nullable=True)
