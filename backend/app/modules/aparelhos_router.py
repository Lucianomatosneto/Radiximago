"""
APARELHOS DA REDE (etapa D, 08/11/2026) - aparelhos de raio X que mandam as
imagens direto para o Radix pelo protocolo DICOM (porta 4242).

- GET  /aparelhos                 lista + como configurar o aparelho (adm, suporte)
- POST /aparelhos                 cadastra {nome, unidade, aet, ip, porta} (adm)
- PUT  /aparelhos/{id}            altera os dados (adm)
- POST /aparelhos/{id}/liberar    volta a aceitar as imagens dele (adm)
- POST /aparelhos/{id}/bloquear   passa a recusar as imagens dele (adm)
- POST /aparelhos/{id}/testar     o Radix "chama" o aparelho (DICOM C-ECHO) (adm, suporte)

Regras (decisao do Luciano): so o administrador libera; aparelho que nao
esta na lista, ou esta bloqueado, tem o envio RECUSADO pelo Orthanc (AE
Title e IP conferidos). Nada e apagado: bloquear guarda o historico.
Tudo fica na auditoria.

A lista do Radix e a fonte da verdade. sincronizar_no_orthanc() copia a lista
para o Orthanc depois de cada mudanca e, de novo, a cada ciclo da
anonimizacao automatica (se o Orthanc estava fora do ar na hora da mudanca,
ela e aplicada assim que ele voltar).
"""

from __future__ import annotations

import ipaddress
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.modules import orthanc_client
from app.modules.aparelhos import AET_MAX, NOME_MAX, PORTA_PADRAO, UNIDADE_MAX, AparelhoRede, chave_orthanc
from app.modules.audit_logs import AuditLog
from app.modules.auth import exigir_perfis
from app.modules.users import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aparelhos", tags=["Aparelhos da rede"])

PERFIS_VER = (UserRole.administrador, UserRole.suporte)
PERFIS_GERIR = (UserRole.administrador,)

# AE Title: letras, numeros, espaco, ponto, hifen e sublinhado (padrao DICOM)
_AET_VALIDO = re.compile(r"^[A-Z0-9 ._-]+$")
PREFIXO = "radix-"


# --- sincronizacao com o Orthanc --------------------------------------------

def sincronizar_no_orthanc(db: Session) -> int:
    """
    Deixa a lista do Orthanc igual a do Radix: grava os aparelhos liberados e
    tira os bloqueados. So mexe nos nomes "radix-*" (os criados pelo Radix).
    Devolve quantas mudancas fez. Levanta erro se o Orthanc nao responder.
    """
    no_orthanc = {
        nome: cfg for nome, cfg in orthanc_client.listar_modalidades().items()
        if nome.startswith(PREFIXO)
    }
    liberados = {chave_orthanc(a.id): a for a in db.query(AparelhoRede).filter(AparelhoRede.liberado.is_(True))}
    mudancas = 0
    for nome in set(no_orthanc) - set(liberados):
        orthanc_client.remover_modalidade(nome)
        mudancas += 1
    for nome, a in liberados.items():
        atual = no_orthanc.get(nome) or {}
        igual = (atual.get("AET") == a.aet and atual.get("Host") == a.ip
                 and int(atual.get("Port") or 0) == a.porta and atual.get("AllowStore") is True
                 and atual.get("AllowFind") is False)
        if not igual:
            orthanc_client.gravar_modalidade(nome, a.aet, a.ip, a.porta)
            mudancas += 1
    return mudancas


def _sincronizar_e_contar(db: Session) -> Optional[str]:
    """Sincroniza; devolve um aviso (texto) se o Orthanc nao respondeu."""
    try:
        sincronizar_no_orthanc(db)
        return None
    except Exception:
        logger.exception("Aparelhos: nao consegui atualizar a lista no Orthanc.")
        return ("Salvo no Radix, mas o servidor de imagens (Orthanc) não respondeu agora. "
                "A mudança será aplicada automaticamente assim que ele voltar (em até 1 minuto).")


def aparelho_da_chegada(db: Session, aet: Optional[str], ip: Optional[str]) -> Optional[AparelhoRede]:
    """Qual aparelho cadastrado mandou esta imagem (AE Title e IP batendo)."""
    if not aet:
        return None
    consulta = db.query(AparelhoRede).filter(AparelhoRede.aet == aet.strip().upper())
    if ip:
        consulta = consulta.filter(AparelhoRede.ip == ip.strip())
    return consulta.first()


# --- entrada e saida ----------------------------------------------------------

class AparelhoEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=NOME_MAX)
    unidade: str = Field(default="", max_length=UNIDADE_MAX)
    aet: str = Field(min_length=1, max_length=AET_MAX)
    ip: str = Field(min_length=3, max_length=45)
    porta: int = Field(default=PORTA_PADRAO, ge=1, le=65535)

    @field_validator("nome", "unidade")
    @classmethod
    def _limpar(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("aet")
    @classmethod
    def _aet(cls, v: str) -> str:
        v = v.strip().upper()
        if not v or not _AET_VALIDO.match(v):
            raise ValueError("O nome DICOM (AE Title) aceita só letras, números, espaço, ponto, hífen e sublinhado.")
        if v == settings.ORTHANC_AET.strip().upper():
            raise ValueError("Esse é o nome DICOM do próprio Radix; use o nome configurado no aparelho.")
        return v

    @field_validator("ip")
    @classmethod
    def _ip(cls, v: str) -> str:
        try:
            ip = ipaddress.ip_address(v.strip())
        except ValueError:
            raise ValueError("Endereço IP inválido (exemplo: 192.168.0.25).")
        if ip.is_unspecified or ip.is_multicast:
            raise ValueError("Esse endereço IP não identifica um aparelho.")
        return str(ip)


def _saida(a: AparelhoRede) -> dict:
    return {
        "id": a.id, "nome": a.nome, "unidade": a.unidade or "", "aet": a.aet, "ip": a.ip,
        "porta": a.porta, "liberado": bool(a.liberado), "total_recebidas": a.total_recebidas or 0,
        "ultimo_recebimento_em": a.ultimo_recebimento_em.isoformat() if a.ultimo_recebimento_em else None,
        "criado_em": a.criado_em.isoformat() if a.criado_em else None,
    }


def _auditar(db: Session, usuario: User, acao: str, a: AparelhoRede, detalhes: str, resultado: str = "sucesso"):
    db.add(AuditLog(usuario_id=usuario.id, acao=acao, entidade="aparelho_rede",
                    entidade_id=a.id, resultado=resultado, detalhes=detalhes))


def _aparelho(db: Session, aparelho_id: int) -> AparelhoRede:
    a = db.get(AparelhoRede, aparelho_id)
    if not a:
        raise HTTPException(status_code=404, detail="Aparelho não encontrado.")
    return a


# --- rotas ------------------------------------------------------------------------

@router.get("")
def listar_aparelhos(usuario: User = Depends(exigir_perfis(*PERFIS_VER)), db: Session = Depends(get_db)):
    aparelhos = db.query(AparelhoRede).order_by(AparelhoRede.liberado.desc(), AparelhoRede.nome).all()
    return {
        "aparelhos": [_saida(a) for a in aparelhos],
        # o que configurar NO APARELHO para ele mandar as imagens ao Radix
        "configuracao": {
            "aet": settings.ORTHANC_AET,
            "porta": settings.DICOM_PORTA,
            "endereco": settings.DICOM_ENDERECO_SERVIDOR,
        },
        "pode_gerir": usuario.perfil == UserRole.administrador,
    }


@router.post("")
def cadastrar_aparelho(entrada: AparelhoEntrada, usuario: User = Depends(exigir_perfis(*PERFIS_GERIR)),
                       db: Session = Depends(get_db)):
    a = AparelhoRede(nome=entrada.nome, unidade=entrada.unidade or None, aet=entrada.aet, ip=entrada.ip,
                     porta=entrada.porta, liberado=True, criado_por_id=usuario.id, total_recebidas=0)
    db.add(a)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um aparelho com esse nome DICOM (AE Title).")
    _auditar(db, usuario, "aparelho_cadastrado", a, f"Aparelho '{a.nome}' ({a.aet}) cadastrado e liberado.")
    db.commit()
    return {"aparelho": _saida(a), "aviso": _sincronizar_e_contar(db)}


@router.put("/{aparelho_id}")
def alterar_aparelho(aparelho_id: int, entrada: AparelhoEntrada,
                     usuario: User = Depends(exigir_perfis(*PERFIS_GERIR)), db: Session = Depends(get_db)):
    a = _aparelho(db, aparelho_id)
    antes = (a.aet, a.ip, a.porta)
    a.nome, a.unidade, a.aet, a.ip, a.porta = (entrada.nome, entrada.unidade or None, entrada.aet,
                                               entrada.ip, entrada.porta)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um aparelho com esse nome DICOM (AE Title).")
    mudou_rede = "sim" if antes != (a.aet, a.ip, a.porta) else "nao"
    _auditar(db, usuario, "aparelho_alterado", a, f"Aparelho '{a.nome}' alterado (endereco/nome DICOM mudou: {mudou_rede}).")
    db.commit()
    return {"aparelho": _saida(a), "aviso": _sincronizar_e_contar(db)}


def _mudar_liberacao(db: Session, usuario: User, aparelho_id: int, liberar: bool) -> dict:
    a = _aparelho(db, aparelho_id)
    a.liberado = liberar
    acao = "aparelho_liberado" if liberar else "aparelho_bloqueado"
    texto = "passa a enviar imagens" if liberar else "nao consegue mais enviar imagens"
    _auditar(db, usuario, acao, a, f"Aparelho '{a.nome}' ({a.aet}) {texto}.")
    db.commit()
    return {"aparelho": _saida(a), "aviso": _sincronizar_e_contar(db)}


@router.post("/{aparelho_id}/liberar")
def liberar_aparelho(aparelho_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GERIR)),
                     db: Session = Depends(get_db)):
    return _mudar_liberacao(db, usuario, aparelho_id, True)


@router.post("/{aparelho_id}/bloquear")
def bloquear_aparelho(aparelho_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GERIR)),
                      db: Session = Depends(get_db)):
    return _mudar_liberacao(db, usuario, aparelho_id, False)


@router.post("/{aparelho_id}/testar")
@limiter.limit("10/minute")
def testar_aparelho(request: Request, aparelho_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_VER)),
                    db: Session = Depends(get_db)):
    a = _aparelho(db, aparelho_id)
    if not a.liberado:
        raise HTTPException(status_code=409, detail="O aparelho está bloqueado. Libere-o antes de testar.")
    try:
        sincronizar_no_orthanc(db)
        respondeu = orthanc_client.testar_modalidade(chave_orthanc(a.id))
    except Exception:
        logger.exception("Aparelhos: teste de conexao falhou.")
        respondeu = None
    resultado = "sucesso" if respondeu else "erro"
    if respondeu is None:
        texto = "o servidor de imagens (Orthanc) nao respondeu"
    else:
        texto = "o aparelho respondeu" if respondeu else "o aparelho nao respondeu"
    _auditar(db, usuario, "aparelho_testado", a, f"Teste de conexao com '{a.nome}': {texto}.", resultado)
    db.commit()
    return {"respondeu": bool(respondeu), "orthanc_no_ar": respondeu is not None}
