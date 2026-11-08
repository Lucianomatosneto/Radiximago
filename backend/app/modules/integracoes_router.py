"""
Status da infraestrutura para a tela de Integracoes (pedido de 22/10/2026).

Antes, OHIF, Docker e Armazenamento apareciam sempre como "Aguardando
configuracao": nao havia checagem nenhuma. Esta rota fornece o que faltava,
SEM ampliar a superficie de ataque:

  - OHIF: desde 01/11/2026 (B2 da auditoria do administrador) quem confere
    e o SERVIDOR, pelo endereco interno do Docker (OHIF_URL, ex.:
    http://radix-ohif). Antes so o navegador testava, e qualquer bloqueio
    dele (pagina https chamando http, rede, extensao) aparecia como
    "Instavel" mesmo com o visualizador funcionando - um falso alarme.
    Sem OHIF_URL, a tela volta a testar pelo navegador (OHIF_BASE_URL).
  - Docker: NAO e consultado diretamente. Ler o Docker exigiria montar o
    "painel de controle" dele (/var/run/docker.sock) no radix-api, o que
    daria a quem invadisse a API o controle do computador inteiro (OWASP:
    privilegio minimo). A tela deduz o estado pelos servicos que rodam
    nele (checagem indireta).
  - Armazenamento: espaco livre em disco, tamanho dos dados do Orthanc e
    o ULTIMO BACKUP de cada tipo (banco e imagens) - com alerta se estiver
    vazio (0 bytes), ausente ou antigo. A pasta de backups entra no
    radix-api SOMENTE LEITURA (docker-compose.yml: ./backups:/backups:ro).

So leitura; nao expoe segredos nem dados de pacientes (os nomes dos
arquivos de backup sao apenas data/hora). Acesso: administrador e suporte.
"""

import logging
import os
import shutil
import smtplib
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.email import abrir_conexao_smtp, senha_smtp
from app.modules import orthanc_client
from app.modules.auth import exigir_perfis
from app.modules.users import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integracoes", tags=["Integracoes"])

PERFIS_INFRAESTRUTURA = (UserRole.administrador, UserRole.suporte)

# pasta de backups montada no container (somente leitura); pode ser trocada
# por variavel de ambiente (testes)
PASTA_BACKUPS = Path(os.environ.get("RADIX_PASTA_BACKUPS", "/backups"))
# o backup roda 1 vez por dia: mais de 36 h sem um novo = algo parou
HORAS_BACKUP_ANTIGO = 36
# menos que isso livre no disco = alerta
PERCENTUAL_DISCO_MINIMO = 10.0


def _ultimo_backup(pasta: Path, padrao: str) -> Optional[dict]:
    arquivos = [a for a in pasta.glob(padrao) if a.is_file()]
    if not arquivos:
        return None
    ultimo = max(arquivos, key=lambda a: a.stat().st_mtime)
    info = ultimo.stat()
    return {
        "arquivo": ultimo.name,
        "tamanho_bytes": info.st_size,
        "data": datetime.fromtimestamp(info.st_mtime, tz=timezone.utc).isoformat(),
        "horas_desde": round((datetime.now(timezone.utc).timestamp() - info.st_mtime) / 3600, 1),
        "quantidade_guardada": len(arquivos),
    }


def _avaliar_backup(nome: str, backup: Optional[dict], alertas: list[str]) -> None:
    if backup is None:
        alertas.append(f"backup_{nome}_ausente")
    elif backup["tamanho_bytes"] == 0:
        alertas.append(f"backup_{nome}_vazio")
    elif backup["horas_desde"] > HORAS_BACKUP_ANTIGO:
        alertas.append(f"backup_{nome}_antigo")


def situacao_armazenamento(pasta_backups: Path = PASTA_BACKUPS) -> dict:
    alertas: list[str] = []

    disco = None
    backup_banco = None
    backup_imagens = None
    if pasta_backups.is_dir():
        uso = shutil.disk_usage(pasta_backups)
        disco = {
            "total_gb": round(uso.total / 1024**3, 1),
            "livre_gb": round(uso.free / 1024**3, 1),
            "percentual_livre": round(uso.free / uso.total * 100, 1) if uso.total else 0.0,
        }
        if disco["percentual_livre"] < PERCENTUAL_DISCO_MINIMO:
            alertas.append("disco_pouco_espaco")
        backup_banco = _ultimo_backup(pasta_backups / "postgres", "*.dump")
        backup_imagens = _ultimo_backup(pasta_backups / "orthanc", "*.tar.gz")
        _avaliar_backup("banco", backup_banco, alertas)
        _avaliar_backup("imagens", backup_imagens, alertas)
    else:
        alertas.append("pasta_backup_indisponivel")

    orthanc = None
    try:
        estatisticas = orthanc_client.obter_estatisticas()
        orthanc = {
            "tamanho_mb": estatisticas.get("TotalDiskSizeMB"),
            "instancias": estatisticas.get("CountInstances"),
        }
    except Exception:
        logger.warning("Nao foi possivel ler as estatisticas do Orthanc.", exc_info=True)
        alertas.append("orthanc_estatisticas_indisponiveis")

    # erro: backup vazio/ausente (risco real de perder dados);
    # instavel: antigo, pouco disco ou algo que nao deu para ler
    graves = [a for a in alertas if a.endswith("_vazio") or a.endswith("_ausente")]
    if pasta_backups.is_dir() and graves:
        status = "erro"
    elif alertas:
        status = "instavel"
    else:
        status = "online"

    return {
        "status": status,
        "alertas": alertas,
        "disco": disco,
        "orthanc": orthanc,
        "backup_banco": backup_banco,
        "backup_imagens": backup_imagens,
    }


OHIF_TEMPO_LIMITE_S = 3.0


def situacao_ohif() -> dict:
    """
    O visualizador responde? Pede a pagina inicial do OHIF pela rede
    interna (nao envia login nem dado nenhum; so le o codigo de resposta).
    "nao_verificado" = OHIF_URL nao configurado (a tela testa pelo navegador).
    """
    if not (settings.OHIF_URL or "").strip():
        return {"status": "nao_verificado", "codigo": None}
    try:
        # endereco SO da configuracao (.env) - nada vindo do usuario (SSRF)
        url = settings.OHIF_URL.rstrip("/") + "/"
        resposta = httpx.get(url, timeout=OHIF_TEMPO_LIMITE_S, follow_redirects=True)
    except httpx.HTTPError as erro:
        logger.warning("OHIF nao respondeu pela rede interna: %s", type(erro).__name__)
        return {"status": "offline", "codigo": None}
    return {"status": "online" if resposta.status_code < 400 else "offline", "codigo": resposta.status_code}


def situacao_aparelhos(db: Session) -> dict:
    """
    Aparelhos de raio X da rede (etapa D, 08/11/2026) no Painel e em
    Integracoes: quantos estao liberados e se a lista do Orthanc confere com a
    do Radix. So LE (a sincronizacao fica com aparelhos_router).
    - aguardando: nenhum aparelho liberado (a porta 4242 recusa tudo)
    - online: liberados e a lista do Orthanc confere
    - instavel: o Orthanc nao respondeu ou a lista dele ainda esta diferente
      (a anonimizacao automatica reaplica em ate 1 minuto)
    """
    from sqlalchemy import func

    from app.modules.aparelhos import AparelhoRede, chave_orthanc

    liberados = db.query(AparelhoRede).filter(AparelhoRede.liberado.is_(True)).all()
    bloqueados = db.query(AparelhoRede).filter(AparelhoRede.liberado.is_(False)).count()
    ultimo = db.query(func.max(AparelhoRede.ultimo_recebimento_em)).scalar()
    situacao = {
        "liberados": len(liberados),
        "bloqueados": bloqueados,
        "ultimo_recebimento_em": ultimo.isoformat() if ultimo else None,
        "lista_confere": None,
    }
    if not liberados:
        return {**situacao, "status": "aguardando"}
    try:
        no_orthanc = {n for n in orthanc_client.listar_modalidades() if n.startswith("radix-")}
        situacao["lista_confere"] = no_orthanc == {chave_orthanc(a.id) for a in liberados}
    except Exception:
        return {**situacao, "status": "instavel"}
    return {**situacao, "status": "online" if situacao["lista_confere"] else "instavel"}


@router.get("/status")
def status_integracoes(
    usuario: User = Depends(exigir_perfis(*PERFIS_INFRAESTRUTURA)),
    db: Session = Depends(get_db),
):
    return {
        "ohif_url": settings.OHIF_BASE_URL,
        "ohif": situacao_ohif(),
        "armazenamento": situacao_armazenamento(),
        "aparelhos": situacao_aparelhos(db),
    }


def situacao_email() -> dict:
    """
    Testa o servidor de e-mail (SMTP) SEM enviar nada: conecta, liga a
    criptografia (STARTTLS) e faz o login. Diz em que etapa falhou - e o que
    fazer - sem nunca mostrar a senha. Usado no cartao "E-mail" das
    Integracoes (cadastro de usuarios e "esqueci a senha" dependem dele).
    """
    if not settings.SMTP_HOST:
        return {"status": "aguardando", "etapa": "configuracao", "erro": "sem_servidor"}
    etapa = "conexao"
    try:
        with abrir_conexao_smtp(timeout=10) as servidor:
            if settings.SMTP_USER:
                etapa = "login"
                servidor.login(settings.SMTP_USER, senha_smtp())
            servidor.noop()
        return {"status": "online", "etapa": "ok", "erro": None, "servidor": settings.SMTP_HOST}
    except smtplib.SMTPAuthenticationError as e:
        erro, detalhe = "senha_recusada", _detalhe_smtp(e)
    except (socket.timeout, TimeoutError) as e:
        erro, detalhe = "tempo_esgotado", _detalhe_smtp(e)
    except smtplib.SMTPException as e:
        # (SMTPException tambem e um OSError: precisa vir ANTES do OSError)
        erro, detalhe = "recusado", _detalhe_smtp(e)
    except (ConnectionRefusedError, socket.gaierror, OSError) as e:
        erro, detalhe = "sem_conexao", _detalhe_smtp(e)
    logger.warning("Teste do servidor de e-mail falhou na etapa %s (%s): %s", etapa, erro, detalhe)
    return {"status": "erro", "etapa": etapa, "erro": erro, "detalhe": detalhe, "servidor": settings.SMTP_HOST}


def _detalhe_smtp(e: Exception) -> str:
    """Resposta do servidor de e-mail, curta e sem dados da conta: o tipo do
    erro e o codigo/mensagem SMTP (ex.: 'SMTPServerDisconnected' ou '535
    5.7.8 Username and Password not accepted'). A senha nunca aparece -
    ela nao faz parte da resposta do servidor."""
    codigo = getattr(e, "smtp_code", None)
    texto = getattr(e, "smtp_error", None)
    if isinstance(texto, bytes):
        texto = texto.decode("utf-8", "replace")
    texto = str(texto if texto is not None else e)
    if settings.SMTP_USER:
        texto = texto.replace(settings.SMTP_USER, "***")
    texto = " ".join(texto.split())[:180]
    return f"{type(e).__name__}{f' {codigo}' if codigo else ''}{f': {texto}' if texto else ''}"


@router.get("/email")
def status_email(usuario: User = Depends(exigir_perfis(*PERFIS_INFRAESTRUTURA))):
    return situacao_email()
