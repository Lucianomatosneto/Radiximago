"""
Curadoria por voz - ponte entre a tela de Curadoria e o servico local de
transcricao (container radix-whisper, ver whisper/app.py).

- POST /voz/transcrever  -> recebe o audio gravado no navegador, repassa ao
  Whisper local e devolve o TEXTO. O audio nao e gravado em lugar nenhum.
- GET  /voz/saude        -> o servico de voz esta no ar? (a tela usa para
  mostrar ou nao o microfone)

O texto e interpretado NO NAVEGADOR (regras fixas, frontend/src/lib/vozCuradoria.ts)
e so vira dado da ficha quando o curador salva (PATCH /curation/{id} com
origem_voz=true - fica na auditoria como "preenchimento_por_voz").

So curadores (e administrador/suporte) usam; limite de 120 trechos por
minuto (na escuta continua cada item da ficha e um trecho curto, e curador
experiente fala varios por minuto). A auditoria registra cada transcricao (duracao), nunca o audio.
"""

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.modules.audit_logs import AuditLog
from app.modules.auth import PERFIS_CURADORIA, exigir_perfis
from app.modules.users import User
from app.modules.vocabulario import SinonimoTermo, TermoVocabulario

router = APIRouter(prefix="/voz", tags=["Curadoria por voz"])

TAMANHO_MAXIMO = 10 * 1024 * 1024

# "Dica" de vocabulario para o Whisper (initial_prompt): palavras que o
# curador vai falar - melhora o reconhecimento dos termos tecnicos.
PROMPT_BASE = (
    "Curadoria de radiografia odontológica. Periapical, panorâmica, interproximal, oclusal. "
    "Qualidade ótima, boa, regular, insatisfatória. Dente 11, 26, 36, 48. Sexo masculino, feminino. "
    "Idade de 30 a 40 anos. Alteração: cárie de esmalte, cárie em dentina, cárie próxima à polpa, cárie secundária, "
    "perda óssea horizontal, perda óssea vertical, cálculo dentário, alargamento do ligamento periodontal, "
    "lesão periapical, reabsorção radicular externa, reabsorção radicular interna, tratamento endodôntico, "
    "fratura radicular, restauração, coroa protética, núcleo, pino, cisto, lesão radiopaca, lesão radiolúcida, "
    "dente incluso, supranumerário, agenesia, seio maxilar, corpo estranho. "
    "Marcação um: outro. Descrição: ... fim. Achados detalhados. Observações internas. Desfazer. Salvar."
)


def _prompt(db: Session) -> str:
    termos = [t for (t,) in db.query(TermoVocabulario.termo).filter(TermoVocabulario.ativo.is_(True)).limit(60).all()]
    sinonimos = [
        s for (s,) in db.query(SinonimoTermo.sinonimo)
        .join(TermoVocabulario, TermoVocabulario.id == SinonimoTermo.termo_id)
        .filter(TermoVocabulario.ativo.is_(True)).limit(60).all()
    ]
    extras = ", ".join(termos + sinonimos)
    return (PROMPT_BASE + (" " + extras + "." if extras else ""))[:800]


# ESCUTA CONTINUA: cada trecho e UMA fala curta para o item em destaque
# ("ok", "feminino", "boa"). Para palavras isoladas, o prompt longo com todo
# o vocabulario atrapalha o Whisper (ele tende a "continuar" o prompt ou a
# devolver nada). Por isso o trecho curto leva como dica so as palavras
# ESPERADAS naquele item - o reconhecimento fica bem mais certeiro.
DICAS_ETAPA = {
    "anonimizacao": "Ok. Anonimizada. Sim. Validada.",
    "tipo": "Periapical. Panorâmica. Interproximal. Oclusal. Tomografia.",
    "idade": "Idade: 8 anos. 35 anos. Sessenta anos. De 30 a 40 anos.",
    "genero": "Masculino. Feminino.",
    "dentes": "Dente 11. Dentes 36 e 37. 46, 47 e 48. Trinta e seis.",
    "qualidade": "Ótima. Boa. Regular. Insatisfatória.",
    "achados": (
        "Cárie. Dentina. Esmalte. Próxima à polpa. Secundária. Perda óssea horizontal. Perda óssea vertical. "
        "Lesão periapical. Cálculo dentário. Reabsorção radicular. Tratamento endodôntico. Restauração. "
        "Coroa protética. Dente incluso. Cisto. Sem alterações. Normal."
    ),
    "erro_tecnico": (
        "Não. Sem erro técnico. Corte de cone. Alongamento. Encurtamento. Subexposição. Superexposição. "
        "Sobreposição. Movimento. Posicionamento."
    ),
    # fala curta quando o item ainda nao e certo (o curador falou de novo
    # antes de a fala anterior ser processada): palavras curtas de todos os itens
    "curto": (
        "Ok. Anonimizada. Periapical. Panorâmica. Interproximal. Oclusal. 35 anos. Masculino. Feminino. "
        "Dentes 36 e 37. Ótima. Boa. Regular. Insatisfatória. Cárie. Dentina. Perda óssea horizontal. "
        "Não. Sem erro técnico. Próximo."
    ),
}


@router.get("/saude")
def saude_voz(usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA))):
    try:
        r = httpx.get(f"{settings.WHISPER_URL}/saude", timeout=5)
        r.raise_for_status()
        return {"disponivel": True, **r.json()}
    except Exception:
        return {"disponivel": False}


@router.post("/aquecer")
def aquecer_voz(usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA))):
    """O curador abriu o microfone: pede ao servico local que carregue o
    modelo agora, para a 1a fala ja ser transcrita rapido. Sem audio e sem
    dado pessoal - so um aviso. Falha aqui nao atrapalha a curadoria."""
    try:
        r = httpx.post(f"{settings.WHISPER_URL}/aquecer", timeout=120)
        r.raise_for_status()
        return {"disponivel": True, **r.json()}
    except Exception:
        return {"disponivel": False}


@router.post("/transcrever")
@limiter.limit("120/minute")
def transcrever(
    request: Request,
    arquivo: UploadFile = File(...),
    rapido: bool = Form(default=False),
    etapa: str = Form(default=""),
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    tipo = (arquivo.content_type or "").split(";")[0].strip().lower()
    if not (tipo.startswith("audio/") or tipo in ("video/webm", "application/octet-stream")):
        raise HTTPException(status_code=415, detail="Envie um arquivo de áudio.")
    conteudo = arquivo.file.read(TAMANHO_MAXIMO + 1)
    if not conteudo:
        raise HTTPException(status_code=400, detail="Áudio vazio.")
    if len(conteudo) > TAMANHO_MAXIMO:
        raise HTTPException(status_code=413, detail="Áudio muito longo.")

    try:
        resposta = httpx.post(
            f"{settings.WHISPER_URL}/transcrever",
            files={"arquivo": (arquivo.filename or "audio.webm", conteudo, tipo or "audio/webm")},
            # rapido: trecho curto da escuta continua (decodificacao mais leve)
            data={
                # trecho curto com item em destaque: dica so com as palavras
                # esperadas; texto livre (descricao, observacoes): vocabulario todo
                "prompt": DICAS_ETAPA[etapa] if rapido and etapa in DICAS_ETAPA else _prompt(db),
                "rapido": "1" if rapido else "0",
            },
            timeout=180,
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=503,
            detail="Serviço de voz indisponível. Verifique se o container radix-whisper está ligado.",
        )
    finally:
        del conteudo

    if resposta.status_code >= 400:
        try:
            detalhe = resposta.json().get("detail") or "Não foi possível transcrever o áudio."
        except ValueError:
            detalhe = "Não foi possível transcrever o áudio."
        raise HTTPException(status_code=resposta.status_code if resposta.status_code < 500 else 502, detail=detalhe)

    dados = resposta.json()
    db.add(AuditLog(
        usuario_id=usuario.id,
        acao="transcricao_voz",
        entidade="voz",
        resultado="sucesso",
        detalhes=f"duracao_s={dados.get('duracao_s')} processamento_s={dados.get('processamento_s')} modelo={dados.get('modelo')}",
    ))
    db.commit()
    return {
        "texto": dados.get("texto", ""),
        "duracao_s": dados.get("duracao_s"),
        "processamento_s": dados.get("processamento_s"),
    }
