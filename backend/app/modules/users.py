from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
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
    # Sem unique=True aqui: a unicidade de fato e uma constraint parcial no
    # banco (so entre usuarios com excluido=false - ver migration
    # e3a2b7c1f9d4), pra permitir reaproveitar o e-mail de um usuario
    # excluido num novo cadastro.
    email = Column(String(150), index=True, nullable=False)
    senha_hash = Column(String(255), nullable=False)
    perfil = Column(Enum(UserRole), default=UserRole.estudante)
    instituicao = Column(String(200), nullable=True)
    ativo = Column(Boolean, default=True)
    bloqueado = Column(Boolean, default=False)
    # Foto de perfil: autoatendimento (o proprio usuario troca a sua, ver
    # POST/DELETE /users/me/avatar) - caminho relativo servido em /uploads.
    foto_perfil_url = Column(String(255), nullable=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), onupdate=func.now())

    # Exclusao "suave": o registro nunca e apagado de verdade (mantem
    # historico/rastreabilidade - curations, audit_logs etc continuam
    # apontando pra ele). So sai da listagem padrao e nao pode mais logar;
    # o e-mail fica livre pra um novo cadastro (ver constraint parcial).
    excluido = Column(Boolean, nullable=False, default=False)
    excluido_em = Column(DateTime(timezone=True), nullable=True)
    excluido_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    excluido_por = relationship("User", remote_side=[id], foreign_keys=[excluido_por_id])

    # Redefinicao de senha (fluxo "esqueci a senha"): token de uso unico e
    # sua expiracao. Ficam nulos fora de um pedido de reset em andamento -
    # sao limpos assim que o token e usado (ou substituidos por um novo
    # pedido).
    reset_token = Column(String(255), unique=True, index=True, nullable=True)
    reset_token_expira_em = Column(DateTime(timezone=True), nullable=True)