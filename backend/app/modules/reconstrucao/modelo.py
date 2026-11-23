"""
Registro das reconstrucoes panoramicas feitas a partir das tomografias
(pedido do Luciano, 23/11/2026).

Cada linha = uma reconstrucao: de qual tomografia (a referencia que
representa o exame na fila), quem gerou, quando, com quais parametros
(pontos da curva, espessura...) e quais series/instancias novas foram
gravadas no Orthanc. As instancias ficam listadas para que a sincronizacao
com o Orthanc (images_router.importar_do_orthanc) NAO as trate como
imagens novas - a reconstrucao e para visualizar e ensinar, nao entra na
fila nem na pesquisa como radiografia.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReconstrucaoTomografia(Base):
    __tablename__ = "reconstrucoes_tomografia"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    orthanc_reference_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orthanc_references.id", ondelete="CASCADE"), nullable=False, index=True
    )
    criado_por_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    parametros: Mapped[Any] = mapped_column(JSONB, nullable=False)
    serie_panoramica_uid: Mapped[str] = mapped_column(String(64), nullable=False)
    serie_cortes_uid: Mapped[str] = mapped_column(String(64), nullable=False)
    total_cortes: Mapped[int] = mapped_column(Integer, nullable=False)
    tamanho_pixel_mm: Mapped[float] = mapped_column(nullable=False)
    # IDs (Orthanc) de todas as instancias gravadas (panoramica + cortes)
    instancias_orthanc: Mapped[Any] = mapped_column(JSONB, nullable=False)
