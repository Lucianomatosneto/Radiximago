"""
Servico de transcricao de voz do Radix Imago (curadoria por voz).

- Usa o Whisper (OpenAI, licenca MIT) na implementacao faster-whisper
  (CTranslate2, licenca MIT), rodando LOCALMENTE: o audio nunca sai da
  maquina/rede do Radix (LGPD - a voz do curador e dado pessoal).
- Modelo "small" quantizado em int8 (~1 GB de memoria; roda bem em CPU,
  sem placa de video). O modelo e baixado durante a CONSTRUCAO da imagem
  Docker, entao em uso o servico nao acessa a internet.
- O modelo so e CARREGADO na primeira transcricao e e DESCARREGADO depois
  de alguns minutos sem uso (RADIX_WHISPER_OCIOSO_S), devolvendo a memoria
  ao computador.
- Nada e gravado em disco: o audio fica so em memoria durante a
  transcricao e e descartado em seguida.
- So responde dentro da rede interna do Docker (nao publica porta); quem
  conversa com ele e o backend (radix-api), que exige login de curador.

Endpoints:
- GET  /saude       -> estado do servico (modelo carregado ou nao)
- POST /aquecer     -> carrega o modelo JA (chamado quando o curador abre o
                       microfone: a 1a fala nao espera o modelo carregar)
- POST /transcrever -> multipart: arquivo (audio), prompt (opcional)
"""

import io
import logging
import os
import threading
import time

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("radix-whisper")

MODELO = os.getenv("RADIX_WHISPER_MODELO", "small")
PASTA_MODELOS = os.getenv("RADIX_WHISPER_PASTA", "/modelos")
OCIOSO_S = int(os.getenv("RADIX_WHISPER_OCIOSO_S", "600"))
THREADS = int(os.getenv("RADIX_WHISPER_THREADS", "4"))
TAMANHO_MAXIMO = 10 * 1024 * 1024  # 10 MB (~ varios minutos de audio comprimido)
DURACAO_MAXIMA_S = 120

app = FastAPI(title="Radix Imago - transcricao de voz", docs_url=None, redoc_url=None)

_trava = threading.Lock()
_modelo = None
_ultimo_uso = 0.0


def _criar_modelo():
    # importado aqui para os testes poderem trocar o modelo sem baixar nada
    from faster_whisper import WhisperModel

    return WhisperModel(
        MODELO,
        device="cpu",
        compute_type="int8",
        cpu_threads=THREADS,
        download_root=PASTA_MODELOS,
        local_files_only=os.getenv("RADIX_WHISPER_OFFLINE", "1") == "1",
    )


def obter_modelo():
    global _modelo, _ultimo_uso
    with _trava:
        if _modelo is None:
            inicio = time.time()
            _modelo = _criar_modelo()
            log.info("modelo %s carregado em %.1fs", MODELO, time.time() - inicio)
        _ultimo_uso = time.time()
        return _modelo


def descarregar_se_ocioso() -> bool:
    global _modelo
    with _trava:
        if _modelo is not None and time.time() - _ultimo_uso > OCIOSO_S:
            _modelo = None
            log.info("modelo descarregado por inatividade")
            return True
    return False


def _vigia():
    while True:
        time.sleep(30)
        descarregar_se_ocioso()


threading.Thread(target=_vigia, daemon=True).start()


@app.get("/saude")
def saude():
    return {"modelo": MODELO, "carregado": _modelo is not None, "ocioso_s": OCIOSO_S}


@app.post("/aquecer")
def aquecer():
    """Carrega o modelo antes da primeira fala. Sem isso, a 1a transcricao
    demorava varios segundos (carga do modelo) e as falas seguintes chegavam
    todas juntas no navegador."""
    ja_estava = _modelo is not None
    obter_modelo()
    return {"carregado": True, "ja_estava": ja_estava}


@app.post("/transcrever")
def transcrever(arquivo: UploadFile = File(...), prompt: str = Form(default=""), rapido: str = Form(default="0")):
    conteudo = arquivo.file.read(TAMANHO_MAXIMO + 1)
    if not conteudo:
        raise HTTPException(status_code=400, detail="Áudio vazio.")
    if len(conteudo) > TAMANHO_MAXIMO:
        raise HTTPException(status_code=413, detail="Áudio muito longo.")

    modelo = obter_modelo()
    inicio = time.time()
    try:
        segmentos, info = modelo.transcribe(
            io.BytesIO(conteudo),
            language="pt",
            task="transcribe",
            # trecho curto da escuta continua ("ok", "pan", "35"): busca
            # gulosa (beam 1) - bem mais rapida e com a mesma precisao para
            # falas de poucas palavras; textos longos continuam com beam 5
            beam_size=1 if rapido == "1" else 5,
            vad_filter=True,  # ignora silencios (respiracao, pausas)
            # vocabulario do Radix como "dica" para o reconhecimento
            initial_prompt=prompt[:800] or None,
            condition_on_previous_text=False,
        )
        if getattr(info, "duration", 0) and info.duration > DURACAO_MAXIMA_S:
            raise HTTPException(status_code=413, detail="Áudio muito longo (máximo de 2 minutos por vez).")
        texto = " ".join(s.text.strip() for s in segmentos).strip()
    except HTTPException:
        raise
    except Exception as erro:  # audio corrompido/formato desconhecido
        log.warning("falha ao transcrever: %s", erro.__class__.__name__)
        raise HTTPException(status_code=422, detail="Não foi possível entender o áudio enviado.")
    finally:
        del conteudo
    global _ultimo_uso
    _ultimo_uso = time.time()
    return {
        "texto": texto,
        "duracao_s": round(getattr(info, "duration", 0.0) or 0.0, 2),
        "processamento_s": round(time.time() - inicio, 2),
        "modelo": MODELO,
    }
