import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import verificar_senha, criar_token_acesso, decodificar_token, gerar_hash_senha
from app.core.email import enviar_email_redefinicao_senha, enviar_email_solicitacao_recebida
from app.modules.users import User, UserRole
from app.modules.access_requests import AccessRequest, IntencaoPerfil
from app.modules.audit_logs import AuditLog

router = APIRouter(prefix="/auth", tags=["Autenticação"])

RESET_TOKEN_VALIDADE_MINUTOS = 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

class TokenResposta(BaseModel):
    access_token: str
    token_type: str
    perfil: str
    nome: str
    foto_perfil_url: str | None = None

@router.post("/login", response_model=TokenResposta)
@limiter.limit("5/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Exclui usuarios excluidos (soft-delete) da busca - o e-mail pode ter
    # sido reaproveitado por uma conta nova, e essa e a que deve logar.
    usuario = db.query(User).filter(
        User.email == form_data.username, User.excluido.is_(False)
    ).first()
    if not usuario:
        db.add(AuditLog(
            usuario_id=None, acao="falha_login", entidade="user", resultado="negado",
            detalhes=f"Tentativa de login com e-mail nao cadastrado: {form_data.username}",
        ))
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if not verificar_senha(form_data.password, usuario.senha_hash):
        db.add(AuditLog(
            usuario_id=usuario.id, acao="falha_login", entidade="user", entidade_id=usuario.id,
            resultado="negado", detalhes="Senha incorreta.",
        ))
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if usuario.bloqueado:
        db.add(AuditLog(
            usuario_id=usuario.id, acao="falha_login", entidade="user", entidade_id=usuario.id,
            resultado="negado", detalhes="Usuario bloqueado.",
        ))
        db.commit()
        raise HTTPException(status_code=403, detail="Usuário bloqueado")
    if not usuario.ativo:
        db.add(AuditLog(
            usuario_id=usuario.id, acao="falha_login", entidade="user", entidade_id=usuario.id,
            resultado="negado", detalhes="Usuario inativo.",
        ))
        db.commit()
        raise HTTPException(status_code=403, detail="Usuário inativo")
    token = criar_token_acesso({"sub": str(usuario.id), "perfil": usuario.perfil})
    db.add(AuditLog(
        usuario_id=usuario.id, acao="login", entidade="user", entidade_id=usuario.id,
        resultado="sucesso",
    ))
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "perfil": usuario.perfil,
        "nome": usuario.nome,
        "foto_perfil_url": usuario.foto_perfil_url,
    }

def obter_usuario_atual(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decodificar_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    usuario = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not usuario or usuario.bloqueado or not usuario.ativo or usuario.excluido:
        raise HTTPException(status_code=401, detail="Acesso negado")
    return usuario

# Registro central de quais perfis podem acessar cada area do sistema -
# consultar aqui para saber "quem pode fazer o que" (ex.: auditoria de LGPD).
PERFIS_ADMIN = (UserRole.administrador,)
PERFIS_IMAGENS = (UserRole.administrador, UserRole.suporte)
PERFIS_CURADORIA = (UserRole.administrador, UserRole.suporte, UserRole.curador)


def exigir_perfis(*perfis_permitidos: UserRole):
    """
    Fabrica um guardiao de permissao reutilizavel como dependencia do FastAPI.
    Uso: usuario: User = Depends(exigir_perfis(UserRole.administrador, UserRole.suporte))
    """
    def guardiao(usuario: User = Depends(obter_usuario_atual)) -> User:
        if usuario.perfil not in perfis_permitidos:
            nomes = ", ".join(p.value for p in perfis_permitidos)
            raise HTTPException(
                status_code=403,
                detail=f"Acesso negado: requer um destes perfis: {nomes}.",
            )
        return usuario
    return guardiao

@router.get("/me")
def meu_perfil(usuario: User = Depends(obter_usuario_atual)):
    return {
        "id": usuario.id,
        "nome": usuario.nome,
        "email": usuario.email,
        "perfil": usuario.perfil,
        "foto_perfil_url": usuario.foto_perfil_url,
    }

@router.post("/logout")
def logout(
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Logout simbolico: o JWT e stateless (sem lista de revogacao), entao o
    token continua valido ate expirar. Este endpoint so registra a
    auditoria; o cliente e responsavel por descartar o token localmente.
    """
    db.add(AuditLog(
        usuario_id=usuario.id, acao="logout", entidade="user", entidade_id=usuario.id,
        resultado="sucesso",
    ))
    db.commit()
    return {"mensagem": "Logout registrado com sucesso."}

class TrocarSenha(BaseModel):
    senha_atual: str
    nova_senha: str

@router.post("/change-password")
def trocar_senha_propria(
    dados: TrocarSenha,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Autotroca de senha: o proprio usuario logado troca a sua senha."""
    if not verificar_senha(dados.senha_atual, usuario.senha_hash):
        db.add(AuditLog(
            usuario_id=usuario.id, acao="falha_troca_senha", entidade="user", entidade_id=usuario.id,
            resultado="negado", detalhes="Senha atual incorreta.",
        ))
        db.commit()
        raise HTTPException(status_code=401, detail="Senha atual incorreta.")

    if len(dados.nova_senha) < 8:
        raise HTTPException(status_code=422, detail="A nova senha deve ter ao menos 8 caracteres.")

    usuario.senha_hash = gerar_hash_senha(dados.nova_senha)
    db.add(AuditLog(
        usuario_id=usuario.id, acao="troca_senha", entidade="user", entidade_id=usuario.id,
        resultado="sucesso",
    ))
    db.commit()
    return {"mensagem": "Senha alterada com sucesso."}


class SolicitarRedefinicao(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
@limiter.limit("3/minute")
def solicitar_redefinicao_senha(
    request: Request,
    dados: SolicitarRedefinicao,
    db: Session = Depends(get_db),
):
    """
    Inicia a redefinicao de senha (usuario deslogado, sem senha atual).
    Sempre devolve a mesma mensagem generica, exista ou nao o e-mail -
    padrao de seguranca pra nao revelar quais e-mails estao cadastrados.
    """
    mensagem_generica = {
        "mensagem": "Se esse e-mail estiver cadastrado, enviamos instruções de redefinição."
    }
    usuario = db.query(User).filter(User.email == dados.email, User.excluido.is_(False)).first()
    if not usuario or not usuario.ativo or usuario.bloqueado:
        return mensagem_generica

    usuario.reset_token = secrets.token_urlsafe(32)
    usuario.reset_token_expira_em = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_VALIDADE_MINUTOS)
    db.add(AuditLog(
        usuario_id=usuario.id, acao="solicitacao_redefinicao_senha", entidade="user",
        entidade_id=usuario.id, resultado="sucesso",
    ))
    db.commit()

    link_reset = f"{settings.FRONTEND_URL}/redefinir-senha?token={usuario.reset_token}"
    enviar_email_redefinicao_senha(usuario.email, usuario.nome, link_reset)

    return mensagem_generica


class RedefinirSenha(BaseModel):
    token: str
    nova_senha: str


@router.post("/reset-password")
@limiter.limit("10/minute")
def redefinir_senha(
    request: Request,
    dados: RedefinirSenha,
    db: Session = Depends(get_db),
):
    """Conclui a redefinicao de senha a partir do token recebido por e-mail."""
    if len(dados.nova_senha) < 8:
        raise HTTPException(status_code=422, detail="A nova senha deve ter ao menos 8 caracteres.")

    usuario = db.query(User).filter(User.reset_token == dados.token).first()
    if not usuario or not usuario.reset_token_expira_em:
        raise HTTPException(status_code=400, detail="Link de redefinição inválido ou já utilizado.")
    if usuario.reset_token_expira_em < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Link de redefinição expirado. Solicite um novo.")

    usuario.senha_hash = gerar_hash_senha(dados.nova_senha)
    usuario.reset_token = None
    usuario.reset_token_expira_em = None
    db.add(AuditLog(
        usuario_id=usuario.id, acao="redefinicao_senha", entidade="user", entidade_id=usuario.id,
        resultado="sucesso",
    ))
    db.commit()
    return {"mensagem": "Senha redefinida com sucesso. Você já pode entrar."}


class SolicitarAcesso(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    instituicao: str | None = None
    # Sem valor padrao: a escolha e obrigatoria no formulario publico. O
    # admin decide o UserRole real concedido na aprovacao (pode honrar
    # essa escolha ou restringir a "estudante") - ver AprovarSolicitacao
    # em users_router.py.
    perfil_solicitado: IntencaoPerfil
    motivo: str | None = None


@router.post("/request-access", status_code=201)
def solicitar_acesso(
    dados: SolicitarAcesso,
    db: Session = Depends(get_db),
):
    """
    Formulario publico de "Cadastrar" na tela de login. Nao cria a conta
    na hora - fica pendente pra um admin revisar (ver /users/access-
    requests). Sempre devolve sucesso genérico, mesmo se o e-mail ja
    tiver conta ou pedido pendente - nao revela isso a quem preenche.
    """
    if len(dados.senha) < 8:
        raise HTTPException(status_code=422, detail="A senha deve ter ao menos 8 caracteres.")

    mensagem_generica = {
        "mensagem": "Solicitação recebida. Um administrador vai revisar seu pedido em breve."
    }

    ja_tem_conta = db.query(User).filter(User.email == dados.email, User.excluido.is_(False)).first()
    ja_tem_pedido_pendente = (
        db.query(AccessRequest)
        .filter(AccessRequest.email == dados.email, AccessRequest.status == "pendente")
        .first()
    )
    if ja_tem_conta or ja_tem_pedido_pendente:
        return mensagem_generica

    pedido = AccessRequest(
        nome=dados.nome,
        email=dados.email,
        senha_hash=gerar_hash_senha(dados.senha),
        instituicao=dados.instituicao,
        perfil_solicitado=dados.perfil_solicitado,
        motivo=dados.motivo,
    )
    db.add(pedido)
    db.commit()

    enviar_email_solicitacao_recebida(dados.email, dados.nome)

    return mensagem_generica