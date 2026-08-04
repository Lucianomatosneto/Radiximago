import enum

from sqlalchemy import Column, Integer, String, DateTime, Boolean, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class OrigemImagem(str, enum.Enum):
    """
    De onde a imagem chegou ao Orthanc - descoberto automaticamente (nao e
    escolhido por ninguem) a partir da propria metadata "Origin" que o
    Orthanc guarda de cada instancia (ver _determinar_origem em
    images_router.py). Guardado como texto simples no banco (mesmo padrao
    de curations.py), so o Enum aqui e a lista oficial de valores validos.
    """
    UFSC = "ufsc"        # chegou por envio direto do equipamento (protocolo DICOM/C-STORE)
    EXTERNA = "externa"  # chegou por upload manual (API REST) - inclusive de fora da UFSC


class OrthancReference(Base):
    __tablename__ = "orthanc_references"

    id = Column(Integer, primary_key=True, index=True)
    orthanc_id = Column(String(255), unique=True, index=True, nullable=False)
    study_instance_uid = Column(String(255), index=True, nullable=True)
    series_instance_uid = Column(String(255), index=True, nullable=True)
    sop_instance_uid = Column(String(255), index=True, nullable=True)
    resource_type = Column(String(50), nullable=False)
    dicomweb_url = Column(String(500), nullable=True)
    ativo = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    anonimizacao_status = Column(
        String(20), nullable=False, default="aguardando", server_default=text("'aguardando'")
    )
    # "ufsc" ou "externa" (ver OrigemImagem). Registros gravados ANTES desta
    # coluna existir foram marcados como "externa" por padrao (server_default)
    # - nao ha como descobrir retroativamente a origem real deles, porque a
    # instancia que guardamos e sempre a versao JA ANONIMIZADA, e o Orthanc
    # nao preserva a metadata de origem do original depois da anonimizacao.
    # So imagens recebidas a partir de agora tem a origem detectada de verdade.
    origem = Column(String(10), nullable=False, default="externa", server_default=text("'externa'"))
    criado_em = Column(DateTime(timezone=True), server_default=func.now())

    curations = relationship("Curation", back_populates="orthanc_reference")
