import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import get_db
from app.core.security import gerar_hash_senha
from app.core.email import enviar_email_acesso_aprovado, enviar_email_acesso_rejeitado
from app.modules.users import User, UserRole
from app.modules.auth import exigir_perfis, obter_usuario_atual, PERFIS_ADMIN
from app.modules.access_requests import AccessRequest, StatusSolicitacaoAcesso
from app.modules.audit_logs import AuditLog

router = APIRouter(prefix="/users", tags=["Usuários"])

# Foto de perfil (autoatendimento) - guardada fora do diretorio da app, no
# bind mount ./backend do docker-compose (persiste no host, sobrevive a
# rebuilds do container). Servida como estatico em /uploads (ver main.py).
DIRETORIO_AVATARS = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "avatars")
TIPOS_IMAGEM_PERMITIDOS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
TAMANHO_MAXIMO_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB


def _remover_arquivo_avatar(foto_url: Optional[str]) -> None:
    """Apaga o arquivo antigo do disco ao trocar/remover a foto. Silencioso
    em caso de falha - nao deve quebrar o fluxo principal por causa disso."""
    if not foto_url or not foto_url.startswith("/uploads/avatars/"):
        return
    caminho = os.path.join(DIRETORIO_AVATARS, os.path.basename(foto_url))
    try:
        if os.path.isfile(caminho):
            os.remove(caminho)
    except OSError:
        pass

class UsuarioCriar(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    perfil: UserRole = UserRole.estudante
    instituicao: Optional[str] = None

class UsuarioResposta(BaseModel):
    id: int
    nome: str
    email: str
    perfil: str
    instituicao: Optional[str]
    ativo: bool
    bloqueado: bool
    foto_perfil_url: Optional[str] = None
    criado_em: Optional[datetime] = None

    class Config:
        from_attributes = True

class UsuarioAtualizar(BaseModel):
    nome: Optional[str] = None
    instituicao: Optional[str] = None


class UsuarioExcluidoResposta(BaseModel):
    id: int
    nome: str
    email: str
    perfil: str
    instituicao: Optional[str]
    excluido_em: Optional[datetime] = None
    excluido_por: Optional[str] = None


class SolicitacaoAcessoResposta(BaseModel):
    id: int
    nome: str
    email: str
    instituicao: Optional[str]
    perfil_solicitado: str
    motivo: Optional[str]
    status: str
    motivo_rejeicao: Optional[str]
    criado_em: Optional[datetime] = None

    class Config:
        from_attributes = True


class RejeitarSolicitacao(BaseModel):
    motivo: str


class AprovarSolicitacao(BaseModel):
    # Obrigatorio: o admin decide o perfil de fato concedido - pode honrar
    # a intencao declarada pelo solicitante (curador/estudante) ou
    # restringir a "estudante", independente do que foi pedido.
    perfil_concedido: UserRole


# Autoatendimento: o proprio usuario logado troca/remove a sua foto de
# perfil (nao e uma acao de admin - qualquer perfil autenticado pode usar
# essas duas rotas pra si mesmo).
@router.post("/me/avatar", response_model=UsuarioResposta)
async def enviar_foto_perfil(
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(obter_usuario_atual),
):
    extensao = TIPOS_IMAGEM_PERMITIDOS.get(arquivo.content_type)
    if not extensao:
        raise HTTPException(
            status_code=422,
            detail="Formato de imagem não suportado. Envie um arquivo JPEG, PNG ou WEBP.",
        )

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")
    if len(conteudo) > TAMANHO_MAXIMO_AVATAR_BYTES:
        raise HTTPException(status_code=422, detail="A imagem deve ter no máximo 5 MB.")

    os.makedirs(DIRETORIO_AVATARS, exist_ok=True)
    foto_antiga = usuario_atual.foto_perfil_url
    novo_nome_arquivo = f"{usuario_atual.id}-{uuid.uuid4().hex}{extensao}"
    with open(os.path.join(DIRETORIO_AVATARS, novo_nome_arquivo), "wb") as destino:
        destino.write(conteudo)

    usuario_atual.foto_perfil_url = f"/uploads/avatars/{novo_nome_arquivo}"
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="atualizacao_foto_perfil", entidade="user",
        entidade_id=usuario_atual.id, resultado="sucesso",
    ))
    db.commit()
    db.refresh(usuario_atual)

    _remover_arquivo_avatar(foto_antiga)
    return usuario_atual


@router.delete("/me/avatar", response_model=UsuarioResposta)
def remover_foto_perfil(
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(obter_usuario_atual),
):
    if not usuario_atual.foto_perfil_url:
        raise HTTPException(status_code=404, detail="Você não tem uma foto de perfil definida.")

    foto_antiga = usuario_atual.foto_perfil_url
    usuario_atual.foto_perfil_url = None
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="remocao_foto_perfil", entidade="user",
        entidade_id=usuario_atual.id, resultado="sucesso",
    ))
    db.commit()
    db.refresh(usuario_atual)

    _remover_arquivo_avatar(foto_antiga)
    return usuario_atual


# IMPORTANTE: estas rotas com prefixo fixo "/access-requests" precisam vir
# ANTES de "/{user_id}" no arquivo - senao o FastAPI tenta casar
# "access-requests" como se fosse um user_id (int) e cai em 422 antes de
# alcancar essas rotas.
@router.get("/access-requests", response_model=list[SolicitacaoAcessoResposta])
def listar_solicitacoes_acesso(
    status_filtro: Optional[str] = "pendente",
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
):
    """Lista as solicitacoes de acesso (por padrao, so as pendentes)."""
    query = db.query(AccessRequest)
    if status_filtro:
        query = query.filter(AccessRequest.status == status_filtro)
    return query.order_by(AccessRequest.criado_em.desc()).all()


@router.post("/access-requests/{request_id}/approve", response_model=UsuarioResposta)
def aprovar_solicitacao_acesso(
    request_id: int,
    dados: AprovarSolicitacao,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
):
    """Aprova a solicitacao: cria o User de verdade, reaproveitando a senha
    que o solicitante ja definiu no formulario (nao gera senha nova). O
    perfil concedido e o que o admin escolher em `dados.perfil_concedido`
    - pode ser diferente da intencao original (`pedido.perfil_solicitado`),
    por exemplo restringindo a "estudante"."""
    pedido = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    if pedido.status != StatusSolicitacaoAcesso.pendente:
        raise HTTPException(status_code=409, detail="Essa solicitação já foi revisada.")

    existente = db.query(User).filter(User.email == pedido.email, User.excluido.is_(False)).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail="Já existe uma conta com este e-mail. Rejeite a solicitação se for duplicada.",
        )

    novo = User(
        nome=pedido.nome,
        email=pedido.email,
        senha_hash=pedido.senha_hash,
        perfil=dados.perfil_concedido,
        instituicao=pedido.instituicao,
    )
    db.add(novo)
    db.flush()

    pedido.status = StatusSolicitacaoAcesso.aprovada
    pedido.revisado_por_id = usuario_atual.id
    pedido.revisado_em = datetime.utcnow()

    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="aprovacao_solicitacao_acesso", entidade="user",
        entidade_id=novo.id, resultado="sucesso",
        detalhes=(
            f"Solicitação #{pedido.id} de {pedido.email} aprovada (intenção declarada: "
            f"'{pedido.perfil_solicitado}'), conta criada com perfil {novo.perfil.value}."
        ),
    ))
    db.commit()
    db.refresh(novo)

    enviar_email_acesso_aprovado(novo.email, novo.nome)
    return novo


@router.post("/access-requests/{request_id}/reject")
def rejeitar_solicitacao_acesso(
    request_id: int,
    dados: RejeitarSolicitacao,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN)),
):
    if not dados.motivo or not dados.motivo.strip():
        raise HTTPException(status_code=422, detail="Informe o motivo da rejeição.")

    pedido = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    if pedido.status != StatusSolicitacaoAcesso.pendente:
        raise HTTPException(status_code=409, detail="Essa solicitação já foi revisada.")

    pedido.status = StatusSolicitacaoAcesso.rejeitada
    pedido.motivo_rejeicao = dados.motivo
    pedido.revisado_por_id = usuario_atual.id
    pedido.revisado_em = datetime.utcnow()

    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="rejeicao_solicitacao_acesso", entidade="user",
        resultado="sucesso",
        detalhes=f"Solicitação #{pedido.id} de {pedido.email} rejeitada: {dados.motivo}",
    ))
    db.commit()

    enviar_email_acesso_rejeitado(pedido.email, pedido.nome, dados.motivo)
    return {"mensagem": "Solicitação rejeitada."}


@router.get("/", response_model=list[UsuarioResposta])
def listar_usuarios(
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN))
):
    """Lista os usuarios ativos (exclui os removidos via soft-delete -
    ver GET /users/deleted pra ve-los)."""
    return db.query(User).filter(User.excluido.is_(False)).all()


@router.get("/deleted", response_model=list[UsuarioExcluidoResposta])
def listar_usuarios_excluidos(
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN))
):
    """
    Lista os usuarios excluidos (soft-delete) - mantidos no banco pra
    preservar historico/auditoria (curations, audit_logs etc continuam
    apontando pra eles), so saem da listagem padrao.
    """
    excluidos = (
        db.query(User)
        .filter(User.excluido.is_(True))
        .order_by(User.excluido_em.desc())
        .all()
    )
    return [
        UsuarioExcluidoResposta(
            id=u.id,
            nome=u.nome,
            email=u.email,
            perfil=u.perfil,
            instituicao=u.instituicao,
            excluido_em=u.excluido_em,
            excluido_por=u.excluido_por.nome if u.excluido_por else None,
        )
        for u in excluidos
    ]


@router.get("/{user_id}", response_model=UsuarioResposta)
def obter_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN))
):
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario

@router.post("/", response_model=UsuarioResposta)
def criar_usuario(
    dados: UsuarioCriar,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN))
):
    if len(dados.senha) < 8:
        raise HTTPException(status_code=422, detail="A senha deve ter ao menos 8 caracteres.")
    existente = db.query(User).filter(User.email == dados.email, User.excluido.is_(False)).first()
    if existente:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    novo = User(
        nome=dados.nome,
        email=dados.email,
        senha_hash=gerar_hash_senha(dados.senha),
        perfil=dados.perfil,
        instituicao=dados.instituicao
    )
    db.add(novo)
    db.flush()
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="criacao_usuario", entidade="user", entidade_id=novo.id,
        resultado="sucesso", detalhes=f"Usuario {novo.email} criado com perfil {novo.perfil.value}.",
    ))
    db.commit()
    db.refresh(novo)
    return novo

@router.patch("/{user_id}/block")
def bloquear_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN))
):
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    usuario.bloqueado = not usuario.bloqueado
    estado = "bloqueado" if usuario.bloqueado else "desbloqueado"
    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="bloqueio_usuario", entidade="user", entidade_id=usuario.id,
        resultado="sucesso", detalhes=f"Usuario {usuario.email} foi {estado}.",
    ))
    db.commit()
    return {"mensagem": f"Usuário {estado} com sucesso"}


@router.delete("/{user_id}")
def excluir_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN))
):
    """
    Exclusao suave: o registro continua no banco (preserva historico -
    curations, audit_logs etc seguem apontando pra ele), so sai da
    listagem padrao e nao pode mais logar. O e-mail fica livre pra um
    novo cadastro (ver constraint parcial na migration e3a2b7c1f9d4).
    """
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if usuario.excluido:
        raise HTTPException(status_code=409, detail="Usuário já está excluído.")
    if usuario.id == usuario_atual.id:
        raise HTTPException(status_code=422, detail="Você não pode excluir a própria conta.")

    usuario.excluido = True
    usuario.excluido_em = datetime.utcnow()
    usuario.excluido_por_id = usuario_atual.id
    usuario.bloqueado = True  # defesa extra: garante que nao loga mesmo se algo ignorar `excluido`

    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="exclusao_usuario", entidade="user", entidade_id=usuario.id,
        resultado="sucesso", detalhes=f"Usuário {usuario.email} excluído.",
    ))
    db.commit()
    return {"mensagem": "Usuário excluído com sucesso."}


@router.patch("/{user_id}", response_model=UsuarioResposta)
def atualizar_usuario(
    user_id: int,
    dados: UsuarioAtualizar,
    db: Session = Depends(get_db),
    usuario_atual: User = Depends(exigir_perfis(*PERFIS_ADMIN))
):
    """
    Atualiza nome e/ou instituicao de um usuario existente.
    NAO permite trocar o perfil por aqui - troca de perfil e sensivel demais
    para um PATCH simples e fica de fora deliberadamente (ver AUDITORIA_BACKEND.md).
    """
    usuario = db.query(User).filter(User.id == user_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if dados.nome is not None:
        usuario.nome = dados.nome
    if dados.instituicao is not None:
        usuario.instituicao = dados.instituicao

    db.add(AuditLog(
        usuario_id=usuario_atual.id, acao="edicao_usuario", entidade="user", entidade_id=usuario.id,
        resultado="sucesso", detalhes=f"Dados do usuario {usuario.email} atualizados (nome/instituicao).",
    ))
    db.commit()
    db.refresh(usuario)
    return usuario