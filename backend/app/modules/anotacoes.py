"""
Anotacoes pessoais de estudo - qualquer usuario pode ativar o "modo de
anotar" numa imagem (tela de visualizacao) e clicar num ponto pra escrever
uma nota, escolhendo cor, tamanho de letra e negrito/italico.

Autoatendimento, como em saved_images.py: cada anotacao pertence a UM
usuario, e so ele ve e edita a propria - nunca aparece pra outro usuario,
mesmo que seja sobre a mesma imagem.
"""

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base


class AnotacaoImagem(Base):
    __tablename__ = "anotacoes_imagem"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    curation_id: Mapped[int] = mapped_column(Integer, ForeignKey("curations.id"), nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    texto: Mapped[str] = mapped_column(Text, nullable=False)

    # Estilo escolhido pelo proprio usuario ao escrever a nota.
    cor: Mapped[str] = mapped_column(String(20), nullable=False, default="#facc15")  # amarelo (padrao tipo post-it)
    tamanho_fonte: Mapped[int] = mapped_column(Integer, nullable=False, default=14)  # em pixels
    negrito: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    italico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Posicao onde a caixa/marcador da nota fica, relativa (0.0 a 1.0) a
    # largura/altura da area da imagem - mesmo padrao ja usado nas marcacoes
    # do curador (ver Marcacao em curation/schemas.py), pra funcionar em
    # qualquer resolucao/zoom de tela.
    pos_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    pos_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Ponto "alvo" (opcional): quando o usuario clica E ARRASTA ao criar a
    # nota, guardamos pra onde ele arrastou - e desenhamos uma seta ligando
    # a nota ate esse ponto. Se a nota foi so um clique simples (sem
    # arrastar), fica None e nenhuma seta e desenhada.
    alvo_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    alvo_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Se marcado, a nota fica sempre visivel na imagem (uma caixinha com o
    # texto, no estilo escolhido) em vez de aparecer so como um marcador
    # pequeno (📝) que precisa ser clicado pra abrir.
    fixada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    usuario = relationship("User")
    curation = relationship("Curation")
