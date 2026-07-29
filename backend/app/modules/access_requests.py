import enum

from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class StatusSolicitacaoAcesso(str, enum.Enum):
    pendente = "pendente"
    aprovada = "aprovada"
    rejeitada = "rejeitada"


class IntencaoPerfil(str, enum.Enum):
    """
    Escolha obrigatoria do solicitante no formulario publico, entre os
    mesmos perfis autosolicitaveis de antes - so a preferencia dele, nao
    concede nada sozinha. O perfil de fato concedido e decidido pelo admin
    na aprovacao (ver AprovarSolicitacao em users_router.py), que pode
    honrar essa escolha ou restringir a "estudante".
    """
    CURADOR = "curador"
    PROFESSOR = "professor"
    ESTUDANTE = "estudante"
    PESQUISADOR = "pesquisador"


class AccessRequest(Base):
    """
    Pedido de acesso feito pelo formulario publico de "Cadastrar" na tela
    de login. Nao cria a conta na hora - fica pendente pra um admin
    aprovar (cria o User de verdade) ou rejeitar. A senha e definida aqui
    mesmo, no pedido, e reaproveitada pro User quando aprovado (assim o
    solicitante nao precisa definir senha de novo depois de aprovado).
    """

    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False)
    email = Column(String(150), nullable=False, index=True)
    senha_hash = Column(String(255), nullable=False)
    instituicao = Column(String(200), nullable=True)
    # native_enum=False: fica como VARCHAR no banco (nao um tipo Postgres
    # nativo). Guarda a INTENCAO do solicitante, nao necessariamente o
    # UserRole que sera de fato concedido - esse e escolhido pelo admin na
    # aprovacao. Sem default: a escolha e obrigatoria no formulario
    # (Pydantic exige o campo).
    perfil_solicitado = Column(
        Enum(IntencaoPerfil, native_enum=False, length=20), nullable=False
    )
    motivo = Column(Text, nullable=True)

    status = Column(
        Enum(StatusSolicitacaoAcesso), nullable=False,
        default=StatusSolicitacaoAcesso.pendente, index=True,
    )
    motivo_rejeicao = Column(Text, nullable=True)

    revisado_por_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    revisado_por = relationship("User")
    revisado_em = Column(DateTime(timezone=True), nullable=True)

    criado_em = Column(DateTime(timezone=True), server_default=func.now())
