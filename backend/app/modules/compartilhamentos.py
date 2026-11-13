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
- o destinatario pode "apagar" o recado e as anotacoes do remetente DA PROPRIA VISAO
  (anotacoes_ocultas, ex.: para imprimir sem elas) - a anotacao NAO e
  apagada de verdade: continua do remetente, que segue vendo e editando;
- o e-mail digitado NAO e guardado aqui - so o id do usuario encontrado.
"""

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, UniqueConstraint, false, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base


class CompartilhamentoImagem(Base):
    __tablename__ = "compartilhamentos_imagem"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    remetente_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    destinatario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    curation_id: Mapped[int] = mapped_column(Integer, ForeignKey("curations.id"), nullable=False, index=True)
    # recado opcional do remetente para quem recebe
    mensagem: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # quando o destinatario viu o compartilhamento (nulo = novo) - usado so
    # para o contador de novidades do proprio destinatario
    visto_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # ids das anotacoes do remetente que o destinatario ocultou da propria
    # visao ("apagar para mim"); vazio = ve todas
    anotacoes_ocultas: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, server_default=text("'{}'"), default=list)
    # o destinatario "apagou" o recado da propria visao (o texto continua
    # guardado; um recado NOVO do remetente volta a aparecer)
    mensagem_oculta: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false(), default=False)

    __table_args__ = (
        # a mesma imagem nao e compartilhada duas vezes com a mesma pessoa
        UniqueConstraint("remetente_id", "destinatario_id", "curation_id", name="uq_compartilhamento_unico"),
    )
