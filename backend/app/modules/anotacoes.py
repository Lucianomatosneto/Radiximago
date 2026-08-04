"""
Anotacoes pessoais de estudo - qualquer usuario pode ativar o "modo de
anotar" numa imagem (tela de visualizacao) e clicar num ponto pra escrever
uma nota, escolhendo cor, tamanho de letra e negrito/italico.

Autoatendimento, como em saved_images.py: cada anotacao pertence a UM
usuario, e so ele ve e edita a propria - nunca aparece pra outro usuario,
mesmo que seja sobre a mesma imagem.
"""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class AnotacaoImagem(Base):
    __tablename__ = "anotacoes_imagem"

    id = Column(Integer, primary_key=True, index=True)
    curation_id = Column(Integer, ForeignKey("curations.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    texto = Column(Text, nullable=False)

    # Estilo escolhido pelo proprio usuario ao escrever a nota.
    cor = Column(String(20), nullable=False, default="#facc15")  # amarelo (padrao tipo post-it)
    tamanho_fonte = Column(Integer, nullable=False, default=14)  # em pixels
    negrito = Column(Boolean, nullable=False, default=False)
    italico = Column(Boolean, nullable=False, default=False)

    # Posicao onde a caixa/marcador da nota fica, relativa (0.0 a 1.0) a
    # largura/altura da area da imagem - mesmo padrao ja usado nas marcacoes
    # do curador (ver Marcacao em curation/schemas.py), pra funcionar em
    # qualquer resolucao/zoom de tela.
    pos_x = Column(Float, nullable=True)
    pos_y = Column(Float, nullable=True)

    # Ponto "alvo" (opcional): quando o usuario clica E ARRASTA ao criar a
    # nota, guardamos pra onde ele arrastou - e desenhamos uma seta ligando
    # a nota ate esse ponto. Se a nota foi so um clique simples (sem
    # arrastar), fica None e nenhuma seta e desenhada.
    alvo_x = Column(Float, nullable=True)
    alvo_y = Column(Float, nullable=True)

    # Se marcado, a nota fica sempre visivel na imagem (uma caixinha com o
    # texto, no estilo escolhido) em vez de aparecer so como um marcador
    # pequeno (📝) que precisa ser clicado pra abrir.
    fixada = Column(Boolean, nullable=False, default=False)

    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), onupdate=func.now())

    usuario = relationship("User")
    curation = relationship("Curation")
