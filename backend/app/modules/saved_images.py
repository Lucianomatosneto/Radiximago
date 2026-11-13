"""
Imagens salvas ("Minhas imagens") - cada usuario pode guardar imagens
aprovadas encontradas na Pesquisa avancada pra achar depois sem precisar
refazer a busca. Autoatendimento: cada usuario so ve/mexe nas proprias.
"""

from sqlalchemy import Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base


class SavedImage(Base):
    __tablename__ = "saved_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    curation_id: Mapped[int] = mapped_column(Integer, ForeignKey("curations.id"), nullable=False, index=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())

    usuario = relationship("User")
    curation = relationship("Curation")

    __table_args__ = (
        # Nao deixa salvar a mesma imagem duas vezes pro mesmo usuario.
        UniqueConstraint("user_id", "curation_id", name="uq_saved_images_usuario_curation"),
    )
