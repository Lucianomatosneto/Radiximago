import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import verificar_senha, criar_token_acesso, decodificar_token, gerar_hash_senha
from app.core.email import (
    enviar_email_confirmacao_cadastro,
    enviar_email_redefinicao_senha,
    enviar_email_solicitacao_recebida,
)
from app.modules.users import User, UserRole
from app.modules.access_requests import AccessRequest, IntencaoPerfil, StatusSolicitacaoAcesso
from app.modules.audit_logs import AuditLog

router = APIRouter(prefix="/auth", tags=["Autenticação"])

RESET_TOKEN_VALIDADE_MINUTOS = 60

# Confirmacao de e-mail do cadastro (ver AccessRequest): validade do link e
# quantas senhas erradas sao toleradas antes de invalidar o link.
CONFIRMACAO_VALIDADE_HORAS = 24
CONFIRMACAO_MAX_TENTATIVAS = 5


def _resumo_token(token: str) -> str:
    """SHA-256 do codigo do link - e so isso que fica guardado no banco."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

# Nome e atributos do cookie httpOnly que carrega o JWT (migracao de
# localStorage para cookie - 2026-08). httponly=True: inacessivel via JS no
# navegador (mitiga roubo de token por XSS, o que localStorage nunca
# protegia). secure=True fora de development: exige HTTPS pra o navegador
# aceitar/enviar o cookie (em dev, sobre http://localhost, teria que ficar
# False). samesite="lax": cobre o caso de uso daqui (frontend e backend em
# portas diferentes do mesmo host/"site" registravel) sem abrir mao da
# protecao contra CSRF que "none" removeria.
NOME_COOKIE_TOKEN = "access_token"
COOKIE_SECURE = settings.ENVIRONMENT == "production"


def _definir_cookie_token(response: Response, token: str) -> None:
    response.set_cookie(
        key=NOME_COOKIE_TOKEN,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

class TokenResposta(BaseModel):
    access_token: str
    token_type: str
    perfil: str
    nome: str
    foto_perfil_url: str | None = None

@router.post("/login", response_model=TokenResposta)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
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
    # Cookie httpOnly (migracao de localStorage) - a resposta JSON abaixo
    # continua identica, por compatibilidade (algum consumidor externo da
    # API pode depender do access_token no corpo; o frontend deste projeto
    # passou a ignorar esse campo e usar so o cookie).
    _definir_cookie_token(response, token)
    return {
        "access_token": token,
        "token_type": "bearer",
        "perfil": usuario.perfil,
        "nome": usuario.nome,
        "foto_perfil_url": usuario.foto_perfil_url,
    }

def obter_token(request: Request, token_header: str | None = Depends(oauth2_scheme)) -> str | None:
    """Le o token do cookie httpOnly primeiro; cai pro header Authorization
    (Bearer) se o cookie nao existir - mantem clientes antigos/externos que
    ainda mandam o header funcionando durante a migracao."""
    return request.cookies.get(NOME_COOKIE_TOKEN) or token_header


def obter_usuario_atual(token: str | None = Depends(obter_token), db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
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
# Quem pode ENVIAR (POST /images/upload) e VER a fila de imagens recebidas -
# mais amplo que PERFIS_IMAGENS de proposito: professor e curador podem
# incluir imagens novas e conferir o que ja enviaram, mas continuam SEM
# poder ativar/desativar imagens de terceiros nem disparar a sincronizacao
# em lote com o Orthanc (isso exige PERFIS_IMAGENS, so administrador/
# suporte) - privilegio minimo: dar so o acesso necessario para a tarefa
# pedida, nao todo o modulo de imagens.
PERFIS_ENVIO_IMAGENS = (UserRole.administrador, UserRole.suporte, UserRole.curador, UserRole.professor)


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
    response: Response,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Logout: apaga o cookie httpOnly do token (fim da migracao de
    localStorage - antes disso era so simbolico). O JWT em si continua
    stateless (sem lista de revogacao) - se alguem tiver guardado o valor
    do token por fora do cookie, ele so perde validade quando expirar.
    """
    response.delete_cookie(key=NOME_COOKIE_TOKEN, path="/", samesite="lax", secure=COOKIE_SECURE)
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
    # Idioma da tela que fez o pedido (ver frontend/src/i18n/config.ts) -
    # so usado pra escolher o template do e-mail (PT/EN); nao tem efeito
    # nenhum sobre token/expiracao/seguranca. "pt" se omitido ou invalido,
    # sem 422 - o formulario de "esqueci a senha" nao deve falhar por causa
    # de um campo puramente cosmetico.
    idioma: str | None = None


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
    idioma_email = dados.idioma if dados.idioma == "en" else "pt"
    enviar_email_redefinicao_senha(usuario.email, usuario.nome, link_reset, idioma=idioma_email)

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
@limiter.limit("5/minute")
def solicitar_acesso(
    request: Request,
    dados: SolicitarAcesso,
    db: Session = Depends(get_db),
):
    """
    Formulario publico de "Cadastrar" na tela de login - ETAPA 1 de 2.
    Grava o pedido e manda um link de confirmacao para o e-mail informado.
    O pedido so aparece para o administrador depois da ETAPA 2
    (/auth/confirm-email). Sempre devolve a mesma mensagem generica, mesmo
    se o e-mail ja tiver conta ou pedido - nao revela isso a quem preenche.
    """
    if len(dados.senha) < 8:
        raise HTTPException(status_code=422, detail="A senha deve ter ao menos 8 caracteres.")

    mensagem_generica = {
        "mensagem": (
            "Solicitação registrada. Enviamos um link de confirmação para o e-mail "
            "informado - confirme-o para que o pedido siga para análise."
        )
    }

    # Hash calculado ANTES das verificacoes: assim a resposta leva o mesmo
    # tempo exista ou nao conta com esse e-mail (nao da pista pelo relogio).
    senha_hash = gerar_hash_senha(dados.senha)

    ja_tem_conta = db.query(User).filter(User.email == dados.email, User.excluido.is_(False)).first()
    pedido_pendente = (
        db.query(AccessRequest)
        .filter(AccessRequest.email == dados.email, AccessRequest.status == StatusSolicitacaoAcesso.pendente)
        .first()
    )
    if ja_tem_conta or (pedido_pendente and pedido_pendente.email_confirmado_em):
        return mensagem_generica

    token = secrets.token_urlsafe(32)
    if pedido_pendente:
        # Pedido anterior ainda NAO confirmado (link perdido ou vencido):
        # os dados sao substituidos e um link novo e gerado (o antigo deixa
        # de valer). Isso e seguro porque a confirmacao exige a senha deste
        # ultimo formulario - quem nao a conhece nao consegue confirmar.
        pedido = pedido_pendente
        pedido.nome = dados.nome
        pedido.senha_hash = senha_hash
        pedido.instituicao = dados.instituicao
        pedido.perfil_solicitado = dados.perfil_solicitado
        pedido.motivo = dados.motivo
    else:
        pedido = AccessRequest(
            nome=dados.nome,
            email=dados.email,
            senha_hash=senha_hash,
            instituicao=dados.instituicao,
            perfil_solicitado=dados.perfil_solicitado,
            motivo=dados.motivo,
        )
        db.add(pedido)
    pedido.token_confirmacao_hash = _resumo_token(token)
    pedido.token_confirmacao_expira_em = datetime.now(timezone.utc) + timedelta(hours=CONFIRMACAO_VALIDADE_HORAS)
    pedido.tentativas_confirmacao = 0
    db.flush()
    db.add(AuditLog(
        usuario_id=None, acao="solicitacao_acesso_registrada", entidade="access_request",
        entidade_id=pedido.id, resultado="sucesso",
        detalhes="Pedido de acesso registrado; aguardando confirmação do e-mail.",
    ))
    db.commit()

    link = f"{settings.FRONTEND_URL}/confirmar-email?token={token}"
    enviar_email_confirmacao_cadastro(dados.email, dados.nome, link, CONFIRMACAO_VALIDADE_HORAS)

    return mensagem_generica


class ConfirmarEmail(BaseModel):
    token: str
    senha: str


@router.post("/confirm-email")
@limiter.limit("10/minute")
def confirmar_email(
    request: Request,
    dados: ConfirmarEmail,
    db: Session = Depends(get_db),
):
    """
    ETAPA 2 do cadastro: a pessoa abre o link recebido por e-mail e digita
    a senha que definiu no formulario. So entao o pedido vai para a fila do
    administrador. A confirmacao e um POST (e nao "abrir o link e pronto")
    de proposito: alguns servicos de e-mail abrem os links sozinhos para
    checar virus, e isso nao pode confirmar nada sem a pessoa.
    """
    erro_link = "Link de confirmação inválido ou já utilizado."
    if not dados.token or len(dados.token) > 200:
        raise HTTPException(status_code=400, detail=erro_link)

    pedido = (
        db.query(AccessRequest)
        .filter(
            AccessRequest.token_confirmacao_hash == _resumo_token(dados.token),
            AccessRequest.status == StatusSolicitacaoAcesso.pendente,
        )
        .first()
    )
    if not pedido or pedido.email_confirmado_em or not pedido.token_confirmacao_expira_em:
        raise HTTPException(status_code=400, detail=erro_link)
    if pedido.token_confirmacao_expira_em < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400, detail="Link de confirmação expirado. Faça a solicitação novamente."
        )

    if not verificar_senha(dados.senha, pedido.senha_hash):
        pedido.tentativas_confirmacao = (pedido.tentativas_confirmacao or 0) + 1
        bloqueou = pedido.tentativas_confirmacao >= CONFIRMACAO_MAX_TENTATIVAS
        if bloqueou:
            pedido.token_confirmacao_hash = None
            pedido.token_confirmacao_expira_em = None
        db.add(AuditLog(
            usuario_id=None, acao="falha_confirmacao_email", entidade="access_request",
            entidade_id=pedido.id, resultado="negado",
            detalhes=(
                "Senha incorreta na confirmação de e-mail"
                + ("; link invalidado por excesso de tentativas." if bloqueou else ".")
            ),
        ))
        db.commit()
        if bloqueou:
            raise HTTPException(
                status_code=400,
                detail="Link bloqueado por excesso de tentativas. Faça a solicitação novamente.",
            )
        raise HTTPException(status_code=401, detail="Senha incorreta.")

    pedido.email_confirmado_em = datetime.now(timezone.utc)
    pedido.token_confirmacao_hash = None
    pedido.token_confirmacao_expira_em = None
    pedido.tentativas_confirmacao = 0
    db.add(AuditLog(
        usuario_id=None, acao="confirmacao_email_solicitacao", entidade="access_request",
        entidade_id=pedido.id, resultado="sucesso",
        detalhes="E-mail confirmado; pedido encaminhado para análise do administrador.",
    ))
    db.commit()

    enviar_email_solicitacao_recebida(pedido.email, pedido.nome)
    return {
        "mensagem": "E-mail confirmado. Seu pedido foi enviado para análise do administrador."
    }
