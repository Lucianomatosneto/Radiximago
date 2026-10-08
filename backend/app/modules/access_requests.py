import enum

from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, ForeignKey, SmallInteger
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

    # CONFIRMACAO DO E-MAIL (cadastro em duas etapas - 2026-10)
    # O pedido so chega ao administrador depois que o solicitante prova
    # que e dono do e-mail informado: ele recebe um link com um codigo
    # aleatorio de uso unico e, ao abrir, precisa digitar a mesma senha que
    # definiu no formulario. Assim, mesmo que outra pessoa faca um pedido
    # usando o e-mail de alguem, quem confirmar precisa saber a senha
    # escolhida por quem preencheu (e a dona do e-mail nao a conhece).
    #
    # - email_confirmado_em: nulo enquanto nao confirmado. O admin so ve e
    #   so consegue aprovar pedidos com esse campo preenchido.
    # - token_confirmacao_hash: guardamos so o RESUMO (SHA-256) do codigo,
    #   nunca o codigo em si - se o banco vazar, os links continuam inuteis.
    # - token_confirmacao_expira_em: o link vale por pouco tempo (24 h).
    # - tentativas_confirmacao: senhas erradas na tela de confirmacao; ao
    #   atingir o limite o link e invalidado (protege contra adivinhacao).
    email_confirmado_em = Column(DateTime(timezone=True), nullable=True)
    token_confirmacao_hash = Column(String(64), unique=True, index=True, nullable=True)
    token_confirmacao_expira_em = Column(DateTime(timezone=True), nullable=True)
    tentativas_confirmacao = Column(SmallInteger, nullable=False, default=0, server_default="0")
