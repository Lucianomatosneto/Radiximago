"""
Status da infraestrutura para a tela de Integracoes (pedido de 22/10/2026).

Antes, OHIF, Docker e Armazenamento apareciam sempre como "Aguardando
configuracao": nao havia checagem nenhuma. Esta rota fornece o que faltava,
SEM ampliar a superficie de ataque:

  - OHIF: devolve o endereco que o sistema realmente usa (OHIF_BASE_URL);
    quem testa e o NAVEGADOR (o endereco e o do navegador, ex.:
    localhost:3001 - de dentro do container ele nao vale).
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

from fastapi import APIRouter, Depends

from app.core.config import settings
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


@router.get("/status")
def status_integracoes(
    usuario: User = Depends(exigir_perfis(*PERFIS_INFRAESTRUTURA)),
):
    return {
        "ohif_url": settings.OHIF_BASE_URL,
        "armazenamento": situacao_armazenamento(),
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
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as servidor:
            servidor.ehlo()
            if settings.SMTP_USE_TLS:
                etapa = "criptografia"
                servidor.starttls()
                servidor.ehlo()
            if settings.SMTP_USER:
                etapa = "login"
                servidor.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            servidor.noop()
        return {"status": "online", "etapa": "ok", "erro": None, "servidor": settings.SMTP_HOST}
    except smtplib.SMTPAuthenticationError:
        erro = "senha_recusada"
    except (socket.timeout, TimeoutError):
        erro = "tempo_esgotado"
    except (ConnectionRefusedError, socket.gaierror, OSError) as e:
        erro = "sem_conexao" if not isinstance(e, smtplib.SMTPException) else "recusado"
    except smtplib.SMTPException:
        erro = "recusado"
    logger.warning("Teste do servidor de e-mail falhou na etapa %s (%s).", etapa, erro)
    return {"status": "erro", "etapa": etapa, "erro": erro, "servidor": settings.SMTP_HOST}


@router.get("/email")
def status_email(usuario: User = Depends(exigir_perfis(*PERFIS_INFRAESTRUTURA))):
    return situacao_email()
