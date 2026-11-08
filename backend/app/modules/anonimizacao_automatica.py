"""
Anonimizacao automatica das imagens que chegam DIRETO DO APARELHO
(protocolo DICOM, porta 4242) - auditoria de 18/10/2026.

Antes: a imagem enviada pelo aparelho ficava no Orthanc COM o nome do
paciente ate alguem clicar em "Sincronizar com o Orthanc" na tela de
imagens. Agora o servidor confere a cada minuto (configuravel) se chegou
imagem nova do aparelho e a anonimiza na hora, pelo mesmo caminho do botao
(_registrar_referencia_se_nova: anonimiza metadados, tarja texto nos pixels,
apaga o original e registra a imagem).

So mexe em imagens com origem "DicomProtocol" (vindas do aparelho). O envio
manual pela tela ("Enviar DICOM") ja anonimiza na hora e nao passa por aqui
- assim os dois caminhos nunca disputam a mesma imagem.

Configuracao: ANONIMIZACAO_AUTOMATICA_SEGUNDOS no .env (padrao 60;
0 desliga). Cada imagem tratada fica registrada na auditoria.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules import orthanc_client
from app.modules.aparelhos_router import aparelho_da_chegada, sincronizar_no_orthanc
from app.modules.audit_logs import AuditLog
from app.modules.orthanc_references import OrthancReference

logger = logging.getLogger(__name__)


def ferramentas_prontas() -> bool:
    """
    So anonimiza se o leitor de texto (Tesseract) e as bibliotecas de imagem
    estiverem instalados. Sem eles, NAO toca nas imagens (elas ficam
    esperando) - porque uma anonimizacao que falha no meio apaga o original
    por seguranca (_anonimizar_e_excluir_original), e a imagem se perderia.
    Ex.: logo depois de atualizar o codigo e antes de reconstruir o servidor.
    """
    import importlib.util
    import shutil

    if shutil.which("tesseract") is None:
        return False
    return all(importlib.util.find_spec(m) is not None for m in ("numpy", "pytesseract", "pydicom"))


def processar_chegadas() -> int:
    """Anonimiza as imagens do aparelho ainda nao registradas. Devolve quantas tratou."""
    if not ferramentas_prontas():
        logger.warning("Anonimizacao automatica em espera: Tesseract/bibliotecas nao instalados "
                       "(rode: docker compose build radix-api).")
        return 0
    # import adiado: images_router importa este modulo indiretamente via main
    from app.modules.images_router import _registrar_referencia_se_nova

    ids_orthanc = orthanc_client.listar_instancias()
    if not ids_orthanc:
        return 0
    db = SessionLocal()
    tratadas = 0
    try:
        registrados = {
            oid for (oid,) in db.query(OrthancReference.orthanc_id)
            .filter(OrthancReference.orthanc_id.in_(ids_orthanc)).all()
        }
        for orthanc_id in ids_orthanc:
            if orthanc_id in registrados:
                continue
            try:
                if orthanc_client.obter_metadado_instancia(orthanc_id, "Origin") != "DicomProtocol":
                    continue
                # de qual aparelho veio (etapa D): lido ANTES da anonimizacao,
                # que cria uma copia nova e apaga o original
                aparelho = aparelho_da_chegada(
                    db,
                    orthanc_client.obter_metadado_instancia(orthanc_id, "RemoteAET"),
                    orthanc_client.obter_metadado_instancia(orthanc_id, "RemoteIP"),
                )
                ref, criada = _registrar_referencia_se_nova(db, orthanc_id)
                if criada:
                    tratadas += 1
                    if aparelho is not None:
                        ref.aparelho_id = aparelho.id
                        aparelho.total_recebidas = (aparelho.total_recebidas or 0) + 1
                        aparelho.ultimo_recebimento_em = datetime.now(timezone.utc)
                        de_onde = f"do aparelho '{aparelho.nome}'"
                    else:
                        de_onde = "de aparelho NAO cadastrado"
                    db.add(AuditLog(
                        usuario_id=None, acao="anonimizacao_automatica", entidade="orthanc_reference",
                        entidade_id=ref.id, resultado="sucesso",
                        detalhes=f"Imagem {de_onde} anonimizada na chegada. Texto na imagem: {ref.texto_na_imagem}.",
                    ))
                    db.commit()
            except Exception:
                db.rollback()
                logger.exception("Anonimizacao automatica falhou para a instancia %s.", orthanc_id)
                db.add(AuditLog(
                    usuario_id=None, acao="anonimizacao_automatica", entidade="orthanc_reference",
                    resultado="erro", detalhes="Falha ao anonimizar imagem recebida do aparelho (ver log do servidor).",
                ))
                db.commit()
    finally:
        db.close()
    return tratadas


def sincronizar_aparelhos() -> int:
    db = SessionLocal()
    try:
        return sincronizar_no_orthanc(db)
    finally:
        db.close()


async def vigiar_chegadas() -> None:
    """Laco que roda junto com o servidor (iniciado em app/main.py)."""
    intervalo = settings.ANONIMIZACAO_AUTOMATICA_SEGUNDOS
    if intervalo <= 0:
        logger.info("Anonimizacao automatica desligada (ANONIMIZACAO_AUTOMATICA_SEGUNDOS=0).")
        return
    while True:
        await asyncio.sleep(intervalo)
        try:
            # lista de aparelhos liberados (etapa D): reaplicada a cada ciclo,
            # para o caso de o Orthanc ter estado fora do ar numa mudanca
            await asyncio.to_thread(sincronizar_aparelhos)
        except Exception:
            logger.warning("Aparelhos da rede: Orthanc nao respondeu; nova tentativa em %ss.", intervalo)
        try:
            tratadas = await asyncio.to_thread(processar_chegadas)
            if tratadas:
                logger.info("Anonimizacao automatica: %s imagem(ns) do aparelho tratada(s).", tratadas)
        except Exception:
            # Orthanc fora do ar, banco indisponivel... tenta de novo no proximo ciclo
            logger.exception("Anonimizacao automatica: ciclo falhou; nova tentativa em %ss.", intervalo)
