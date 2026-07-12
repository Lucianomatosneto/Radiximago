from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class OrthancReference(Base):
    __tablename__ = "orthanc_references"

    id = Column(Integer, primary_key=True, index=True)
    orthanc_id = Column(String(255), unique=True, index=True, nullable=False)
    study_instance_uid = Column(String(255), index=True, nullable=True)
    series_instance_uid = Column(String(255), index=True, nullable=True)
    sop_instance_uid = Column(String(255), index=True, nullable=True)
    resource_type = Column(String(50), nullable=False)
    dicomweb_url = Column(String(500), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())