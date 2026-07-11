from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.sql import func
from app.core.database import Base
import enum

class UserRole(str, enum.Enum):
    administrador = "administrador"
    curador = "curador"
    professor = "professor"
    estudante = "estudante"
    pesquisador = "pesquisador"
    suporte = "suporte"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    senha_hash = Column(String(255), nullable=False)
    perfil = Column(Enum(UserRole), default=UserRole.estudante)
    instituicao = Column(String(200), nullable=True)
    ativo = Column(Boolean, default=True)
    bloqueado = Column(Boolean, default=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), onupdate=func.now())