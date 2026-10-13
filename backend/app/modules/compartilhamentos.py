"""
Compartilhamento de imagens anotadas entre usuarios ("Compartilhadas comigo").

Um usuario (remetente) compartilha uma imagem aprovada com outro usuario do
sistema (destinatario), informando o e-mail usado no cadastro dessa pessoa.
O destinatario passa a ver a imagem no espaco "Compartilhadas comigo" e as
anotacoes do remetente naquela imagem - sempre as ATUAIS e so para leitura
(se o remetente editar ou apagar uma anotacao, a mudanca aparece para ele).

Privacidade (LGPD):
- so circulam imagens ja anonimizadas e aprovadas na curadoria;
- a anotacao continua sendo do remetente: o destinatario nao edita nada;
- o remetente pode desfazer o compartilhamento a qualquer momento e o
  destinatario pode remover a imagem do proprio espaco (a linha e apagada);
- o e-mail digitado NAO e guardado aqui - so o id do usuario encontrado.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class CompartilhamentoImagem(Base):
    __tablename__ = "compartilhamentos_imagem"

    id = Column(Integer, primary_key=True, index=True)
    remetente_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    destinatario_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    curation_id = Column(Integer, ForeignKey("curations.id"), nullable=False, index=True)
    # recado opcional do remetente para quem recebe
    mensagem = Column(Text, nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    # quando o destinatario viu o compartilhamento (nulo = novo) - usado so
    # para o contador de novidades do proprio destinatario
    visto_em = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # a mesma imagem nao e compartilhada duas vezes com a mesma pessoa
        UniqueConstraint("remetente_id", "destinatario_id", "curation_id", name="uq_compartilhamento_unico"),
    )
