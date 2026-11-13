from sqlalchemy import JSON, BigInteger, Integer, String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Any
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    # Sem unique=True aqui: a unicidade de fato e uma constraint parcial no
    # banco (so entre usuarios com excluido=false - ver migration
    # e3a2b7c1f9d4), pra permitir reaproveitar o e-mail de um usuario
    # excluido num novo cadastro.
    email: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    perfil: Mapped[UserRole | None] = mapped_column(Enum(UserRole), default=UserRole.estudante)
    instituicao: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ativo: Mapped[bool | None] = mapped_column(Boolean, default=True)
    bloqueado: Mapped[bool | None] = mapped_column(Boolean, default=False)
    # Foto de perfil: autoatendimento (o proprio usuario troca a sua, ver
    # POST/DELETE /users/me/avatar) - caminho relativo servido em /uploads.
    foto_perfil_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Exclusao "suave": o registro nunca e apagado de verdade (mantem
    # historico/rastreabilidade - curations, audit_logs etc continuam
    # apontando pra ele). So sai da listagem padrao e nao pode mais logar;
    # o e-mail fica livre pra um novo cadastro (ver constraint parcial).
    excluido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    excluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    excluido_por_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    excluido_por = relationship("User", remote_side=[id], foreign_keys=[excluido_por_id])

    # Redefinicao de senha (fluxo "esqueci a senha"): token de uso unico e
    # sua expiracao. Ficam nulos fora de um pedido de reset em andamento -
    # sao limpos assim que o token e usado (ou substituidos por um novo
    # pedido).
    reset_token: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    reset_token_expira_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Login em duas etapas (OWASP ASVS 6.3.3 - app/modules/mfa.py):
    # - totp_segredo_cifrado: segredo do aplicativo autenticador, CIFRADO
    #   (Fernet/AES; chave derivada da JWT_SECRET_KEY). Preenchido ja no
    #   inicio do cadastro; so vale depois de confirmado (totp_ativo);
    # - totp_ultimo_passo: ultimo codigo aceito (janela de 30 s) - o mesmo
    #   codigo nao entra duas vezes (ASVS 6.5.1);
    # - codigos_recuperacao: resumos SHA-256 dos codigos de uso unico para
    #   quando o celular nao estiver a mao (ASVS 6.5.x).
    totp_segredo_cifrado: Mapped[str | None] = mapped_column(String(300), nullable=True)
    totp_ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    totp_ultimo_passo: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    codigos_recuperacao: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    # codigos antigos (resumo SHA-256 de ~40 bits) foram invalidados pela
    # migracao f1a3c5e7b9d2 (12/11/2026, ASVS 6.5.2): no proximo login com
    # segundo fator, o sistema gera os novos e mostra uma vez
    codigos_recuperacao_trocar: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
