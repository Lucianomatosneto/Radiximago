"""
Rotas do login em duas etapas (regras em app/modules/mfa.py - OWASP ASVS 6.3.3).

Durante o LOGIN (depois da senha certa; usam o "vale" de 5 min, sem sessao):
- POST /auth/login/segundo-fator              -> codigo do aplicativo (ou de recuperacao) -> abre a sessao
- POST /auth/login/cadastro-mfa/iniciar       -> perfil obrigatorio ainda sem aplicativo: mostra o QR code
- POST /auth/login/cadastro-mfa/confirmar     -> 1o codigo confere: ativa, mostra os codigos de recuperacao e abre a sessao

Com a SESSAO aberta ("Meus acessos"):
- GET  /auth/mfa                 -> situacao (ativo, obrigatorio, codigos de recuperacao restantes)
- POST /auth/mfa/iniciar         -> perfil opcional: comeca o cadastro (QR code)
- POST /auth/mfa/confirmar       -> confirma com o 1o codigo e mostra os codigos de recuperacao
- POST /auth/mfa/desativar       -> so perfis opcionais; exige senha + codigo
- POST /auth/mfa/novos-codigos   -> gera novos codigos de recuperacao (exige codigo)
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.limites import Senha
from app.core.rate_limit import limiter
from app.core.security import decodificar_desafio_mfa, verificar_senha
from app.modules import mfa
from app.modules.audit_logs import AuditLog
from app.modules.auth import concluir_login, obter_usuario_atual
from app.modules.users import User

router = APIRouter(prefix="/auth", tags=["Login em duas etapas"])

# codigo de 6 numeros ou de recuperacao (XXXX-XXXX)
Codigo = Field(min_length=6, max_length=12)


class PedidoDesafio(BaseModel):
    desafio: str = Field(min_length=10, max_length=1000)


class PedidoDesafioCodigo(PedidoDesafio):
    codigo: str = Codigo


class PedidoCodigo(BaseModel):
    codigo: str = Codigo


class PedidoDesativar(BaseModel):
    senha: Senha
    codigo: str = Codigo


INVALIDO = "Código inválido ou já usado."


def _registrar(db: Session, usuario: User, acao: str, resultado: str, detalhes: str | None = None) -> None:
    db.add(AuditLog(
        usuario_id=usuario.id, acao=acao, entidade="user", entidade_id=usuario.id,
        resultado=resultado, detalhes=detalhes,
    ))


def _usuario_do_desafio(db: Session, desafio: str) -> tuple[User, str]:
    dados = decodificar_desafio_mfa(desafio)
    if not dados or not mfa.desafio_disponivel(dados["jti"]):
        raise HTTPException(status_code=401, detail="Etapa expirada. Digite o e-mail e a senha de novo.")
    usuario = db.query(User).filter(User.id == int(dados["sub"])).first()
    if not usuario or usuario.bloqueado or not usuario.ativo or usuario.excluido:
        raise HTTPException(status_code=401, detail="Acesso negado")
    return usuario, dados["jti"]


def _codigo_errado(db: Session, usuario: User, jti: str | None, acao: str = "falha_segundo_fator") -> None:
    restantes = mfa.registrar_tentativa_errada(jti) if jti else None
    _registrar(db, usuario, acao, "negado", "Código errado." + (f" Restam {restantes} tentativa(s)." if jti else ""))
    db.commit()
    raise HTTPException(status_code=401, detail=INVALIDO)


# --- durante o login --------------------------------------------------------

@router.post("/login/segundo-fator")
@limiter.limit("10/minute")
def login_segundo_fator(request: Request, response: Response, dados: PedidoDesafioCodigo, db: Session = Depends(get_db)):
    usuario, jti = _usuario_do_desafio(db, dados.desafio)
    if not usuario.totp_ativo:
        raise HTTPException(status_code=409, detail="O aplicativo autenticador ainda não foi cadastrado.")
    aceito, recuperacao = mfa.conferir_segundo_fator(usuario, dados.codigo)
    if not aceito:
        _codigo_errado(db, usuario, jti)
    mfa.consumir_desafio(jti)
    if recuperacao:
        _registrar(db, usuario, "codigo_recuperacao_usado", "sucesso",
                   f"Restam {len(usuario.codigos_recuperacao or [])} código(s) de recuperação.")
    resposta = concluir_login(request, response, db, usuario,
                              "com segundo fator (código de recuperação)" if recuperacao else "com segundo fator")
    resposta["codigos_recuperacao_restantes"] = len(usuario.codigos_recuperacao or [])
    return resposta


@router.post("/login/cadastro-mfa/iniciar")
@limiter.limit("10/minute")
def login_cadastro_iniciar(request: Request, dados: PedidoDesafio, db: Session = Depends(get_db)):
    usuario, _ = _usuario_do_desafio(db, dados.desafio)
    # quem JA tem aplicativo nao cadastra outro so com a senha: seria o jeito
    # de um invasor com a senha roubada escapar do segundo fator
    if usuario.totp_ativo:
        raise HTTPException(status_code=409, detail="O aplicativo autenticador já está cadastrado.")
    cadastro = mfa.iniciar_cadastro(usuario)
    db.commit()
    return cadastro


@router.post("/login/cadastro-mfa/confirmar")
@limiter.limit("10/minute")
def login_cadastro_confirmar(request: Request, response: Response, dados: PedidoDesafioCodigo, db: Session = Depends(get_db)):
    usuario, jti = _usuario_do_desafio(db, dados.desafio)
    if usuario.totp_ativo:
        raise HTTPException(status_code=409, detail="O aplicativo autenticador já está cadastrado.")
    if not mfa.conferir_codigo(usuario, dados.codigo):
        _codigo_errado(db, usuario, jti)
    mfa.consumir_desafio(jti)
    codigos = mfa.ativar(usuario)
    _registrar(db, usuario, "segundo_fator_ativado", "sucesso", "Cadastrado no primeiro login (perfil obrigatório).")
    resposta = concluir_login(request, response, db, usuario, "com segundo fator (cadastro)")
    resposta["codigos_recuperacao"] = codigos
    return resposta


# --- com a sessao aberta ----------------------------------------------------

@router.get("/mfa")
def situacao(usuario: User = Depends(obter_usuario_atual)):
    return {
        "ativo": bool(usuario.totp_ativo),
        "obrigatorio": mfa.mfa_obrigatorio(usuario),
        "codigos_recuperacao_restantes": len(usuario.codigos_recuperacao or []) if usuario.totp_ativo else 0,
    }


@router.post("/mfa/iniciar")
@limiter.limit("10/minute")
def iniciar(request: Request, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    if usuario.totp_ativo:
        raise HTTPException(status_code=409, detail="O aplicativo autenticador já está cadastrado.")
    cadastro = mfa.iniciar_cadastro(usuario)
    db.commit()
    return cadastro


@router.post("/mfa/confirmar")
@limiter.limit("10/minute")
def confirmar(request: Request, dados: PedidoCodigo, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    if usuario.totp_ativo:
        raise HTTPException(status_code=409, detail="O aplicativo autenticador já está cadastrado.")
    if not mfa.conferir_codigo(usuario, dados.codigo):
        _codigo_errado(db, usuario, None)
    codigos = mfa.ativar(usuario)
    _registrar(db, usuario, "segundo_fator_ativado", "sucesso", "Ativado em Meus acessos.")
    db.commit()
    return {"codigos_recuperacao": codigos}


@router.post("/mfa/desativar")
@limiter.limit("5/minute")
def desativar(request: Request, dados: PedidoDesativar, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    if mfa.mfa_obrigatorio(usuario):
        raise HTTPException(status_code=403, detail="O login em duas etapas é obrigatório para o seu perfil.")
    if not usuario.totp_ativo:
        raise HTTPException(status_code=409, detail="O login em duas etapas não está ligado.")
    # reautenticacao (ASVS 7.5.1): senha E codigo
    if not verificar_senha(dados.senha, usuario.senha_hash) or not mfa.conferir_segundo_fator(usuario, dados.codigo)[0]:
        _codigo_errado(db, usuario, None)
    mfa.desligar(usuario)
    _registrar(db, usuario, "segundo_fator_desativado", "sucesso")
    db.commit()
    return {"mensagem": "Login em duas etapas desligado."}


@router.post("/mfa/novos-codigos")
@limiter.limit("5/minute")
def novos_codigos(request: Request, dados: PedidoCodigo, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    if not usuario.totp_ativo:
        raise HTTPException(status_code=409, detail="O login em duas etapas não está ligado.")
    if not mfa.conferir_codigo(usuario, dados.codigo):
        _codigo_errado(db, usuario, None)
    codigos = mfa.gerar_codigos_recuperacao(usuario)
    _registrar(db, usuario, "novos_codigos_recuperacao", "sucesso")
    db.commit()
    return {"codigos_recuperacao": codigos}
