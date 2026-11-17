"""
GRUPOS - "MODO AULA", IMAGENS ENVIADAS E COMENTARIOS (Etapa 3, 17/11/2026).

O dono do grupo prepara uma imagem curada para a aula e envia ao grupo:
- parte das marcacoes OFICIAIS da ficha e ajusta (acrescenta, muda, apaga);
- escolhe quais alteracoes da ficha quer DESTACAR;
- escreve uma mensagem;
- escolhe se os participantes podem COMENTAR (e muda quando quiser).
Tudo isso vale so para o envio: a ficha oficial nao muda (D3).

DONO DO GRUPO (professor, pesquisador, curador, administrador):
- GET    /grupos/aula/imagem/{curation_id}          ponto de partida (marcacoes e alteracoes oficiais)
- POST   /grupos/{id}/envios                        envia a imagem preparada
- GET    /grupos/{id}/envios                        imagens enviadas ao grupo
- PATCH  /grupos/{id}/envios/{envio}                liga/desliga "pode comentar"
- DELETE /grupos/{id}/envios/{envio}                retira a imagem do grupo
- GET    /grupos/{id}/envios/{envio}/conversas      todas as conversas (uma por participante)
- POST   /grupos/{id}/envios/{envio}/conversas/{participante}   responde

PARTICIPANTE (so enquanto participa do grupo):
- GET    /grupos/participo/{id}/envios              imagens do grupo + a PROPRIA conversa
- POST   /grupos/participo/{id}/envios/{envio}/comentarios          comenta (se o dono permitiu)
- DELETE /grupos/participo/{id}/envios/{envio}/comentarios/{c}      apaga o proprio comentario

Comentario e PARTICULAR (D4): cada participante ve so a propria conversa com
o dono. Só imagens aprovadas e ativas circulam (as mesmas do Banco de
imagens); se a ficha deixar de estar aprovada, a imagem some do grupo.
A auditoria registra as acoes SEM o texto da mensagem e dos comentarios.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.modules.auth import exigir_perfis, obter_usuario_atual
from app.modules.curation.schemas import Marcacao
from app.modules.curations import Curation, StatusCuradoria
from app.modules.grupos import (
    COMENTARIO_MAX, MARCACOES_ENVIO_MAX, MENSAGEM_ENVIO_MAX,
    GrupoComentario, GrupoEnvio, GrupoEnvioCurado, GrupoEnvioMembro,
)
from app.modules.grupos_router import PERFIS_GRUPOS, _agora, _auditar, _data, _grupo_do_dono
from app.modules.orthanc_references import OrthancReference
from app.modules.users import User

router = APIRouter(prefix="/grupos", tags=["Grupos de envio"])

DESTAQUES_MAX = 20
IMAGEM_NAO_ENCONTRADA = "Imagem nao encontrada (so imagens aprovadas e ativas podem ir para o grupo)."
ENVIO_NAO_ENCONTRADO = "Imagem do grupo nao encontrada."


def _ficha_aprovada(db: Session, curation_id: int) -> Curation:
    """A mesma regra do compartilhamento: ficha APROVADA e imagem ATIVA."""
    ficha = (db.query(Curation)
             .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
             .filter(Curation.id == curation_id, Curation.status == StatusCuradoria.APROVADA.value,
                     OrthancReference.ativo.is_(True))
             .first())
    if not ficha:
        raise HTTPException(status_code=404, detail=IMAGEM_NAO_ENCONTRADA)
    return ficha


def _envios_visiveis(db: Session, grupo_id: int):
    """Envios do grupo cuja ficha continua aprovada e ativa."""
    return (db.query(GrupoEnvioCurado, Curation)
            .join(Curation, Curation.id == GrupoEnvioCurado.curation_id)
            .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
            .filter(GrupoEnvioCurado.grupo_id == grupo_id, Curation.status == StatusCuradoria.APROVADA.value,
                    OrthancReference.ativo.is_(True))
            .order_by(GrupoEnvioCurado.criado_em.desc(), GrupoEnvioCurado.id.desc()))


def imagens_novas_por_grupo(db: Session, usuario_id: int) -> dict[int, int]:
    """Quantas imagens (aprovadas e ativas) chegaram em cada grupo de que a
    pessoa participa desde a ultima vez que ela abriu as imagens do grupo."""
    linhas = (db.query(GrupoEnvioCurado.grupo_id, func.count(GrupoEnvioCurado.id))
              .join(GrupoEnvioMembro, (GrupoEnvioMembro.grupo_id == GrupoEnvioCurado.grupo_id)
                    & (GrupoEnvioMembro.usuario_id == usuario_id))
              .join(Curation, Curation.id == GrupoEnvioCurado.curation_id)
              .join(OrthancReference, Curation.orthanc_reference_id == OrthancReference.id)
              .filter(Curation.status == StatusCuradoria.APROVADA.value, OrthancReference.ativo.is_(True),
                      or_(GrupoEnvioMembro.imagens_vistas_em.is_(None),
                          GrupoEnvioCurado.criado_em > GrupoEnvioMembro.imagens_vistas_em))
              .group_by(GrupoEnvioCurado.grupo_id).all())
    return dict(linhas)


def _envio_do_dono(db: Session, grupo: GrupoEnvio, envio_id: int) -> GrupoEnvioCurado:
    envio = db.get(GrupoEnvioCurado, envio_id)
    if not envio or envio.grupo_id != grupo.id:
        raise HTTPException(status_code=404, detail=ENVIO_NAO_ENCONTRADO)
    return envio


def _base_envio(envio: GrupoEnvioCurado, ficha: Curation) -> dict:
    return {
        "id": envio.id,
        "curation_id": envio.curation_id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "tipo_radiografia": ficha.tipo_radiografia,
        "mensagem": envio.mensagem,
        "permite_comentar": bool(envio.permite_comentar),
        "marcacoes": envio.marcacoes or [],
        "destaques": list(envio.destaques or []),
        "criado_em": _data(envio.criado_em),
    }


def _texto_limpo(valor: str) -> str:
    texto = valor.strip()
    if not texto:
        raise ValueError("O texto nao pode ficar vazio.")
    return texto


class EnvioDados(BaseModel):
    curation_id: int
    mensagem: str | None = Field(default=None, max_length=MENSAGEM_ENVIO_MAX)
    permite_comentar: bool = False
    # None = usar as marcacoes oficiais da ficha
    marcacoes: list[Marcacao] | None = Field(default=None, max_length=MARCACOES_ENVIO_MAX)
    destaques: list[str] = Field(default_factory=list, max_length=DESTAQUES_MAX)


class ChaveComentarios(BaseModel):
    permite_comentar: bool


class ComentarioDados(BaseModel):
    texto: str = Field(max_length=COMENTARIO_MAX)

    @field_validator("texto")
    @classmethod
    def _nao_vazio(cls, valor: str) -> str:
        return _texto_limpo(valor)


# ======================================================================
# DONO DO GRUPO
# ======================================================================

@router.get("/aula/imagem/{curation_id}")
def ponto_de_partida_da_aula(curation_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                             db: Session = Depends(get_db)):
    """O que o modo aula precisa da ficha OFICIAL (so leitura)."""
    ficha = _ficha_aprovada(db, curation_id)
    return {
        "curation_id": ficha.id,
        "orthanc_reference_id": ficha.orthanc_reference_id,
        "tipo_radiografia": ficha.tipo_radiografia,
        "descricao_didatica": ficha.descricao_didatica,
        "marcacoes": ficha.marcacoes or [],
        "alteracoes_observadas": list(ficha.alteracoes_observadas or []),
    }


@router.post("/{grupo_id}/envios")
@limiter.limit("30/minute")
def enviar_imagem_ao_grupo(request: Request, grupo_id: int, dados: EnvioDados,
                           usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)), db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    ficha = _ficha_aprovada(db, dados.curation_id)
    alteracoes = set(ficha.alteracoes_observadas or [])
    if any(d not in alteracoes for d in dados.destaques):
        raise HTTPException(status_code=422, detail="Os destaques precisam ser alteracoes registradas na ficha.")
    marcacoes = (ficha.marcacoes or [] if dados.marcacoes is None
                 else [m.model_dump(mode="json", exclude_none=True) for m in dados.marcacoes])
    mensagem = (dados.mensagem or "").strip() or None
    envio = GrupoEnvioCurado(grupo_id=grupo.id, curation_id=ficha.id, remetente_id=usuario.id, mensagem=mensagem,
                             permite_comentar=dados.permite_comentar, marcacoes=marcacoes,
                             destaques=list(dict.fromkeys(dados.destaques)))
    db.add(envio)
    try:
        db.flush()
    except IntegrityError as causa:
        db.rollback()
        raise HTTPException(status_code=409, detail="Essa imagem ja foi enviada a este grupo.") from causa
    _auditar(db, usuario, "grupo_imagem_enviada", grupo,
             f"ficha {ficha.id}; {len(marcacoes)} marcacao(oes); {len(envio.destaques)} destaque(s); "
             f"comentarios: {'sim' if envio.permite_comentar else 'nao'}")
    db.commit()
    return {**_base_envio(envio, ficha), "comentarios": 0}


@router.get("/{grupo_id}/envios")
def imagens_enviadas_ao_grupo(grupo_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                              db: Session = Depends(get_db)):
    grupo = db.get(GrupoEnvio, grupo_id)
    if not grupo or grupo.dono_id != usuario.id:
        return {"envios": []}
    linhas = _envios_visiveis(db, grupo.id).all()
    contagem = dict(db.query(GrupoComentario.envio_id, func.count(GrupoComentario.id))
                    .filter(GrupoComentario.envio_id.in_([e.id for e, _ in linhas] or [0]))
                    .group_by(GrupoComentario.envio_id).all())
    return {"envios": [{**_base_envio(e, f), "comentarios": contagem.get(e.id, 0)} for e, f in linhas]}


@router.patch("/{grupo_id}/envios/{envio_id}")
def ligar_desligar_comentarios(grupo_id: int, envio_id: int, dados: ChaveComentarios,
                               usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)), db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    envio = _envio_do_dono(db, grupo, envio_id)
    envio.permite_comentar = dados.permite_comentar
    acao = "grupo_comentarios_ligados" if dados.permite_comentar else "grupo_comentarios_desligados"
    _auditar(db, usuario, acao, grupo, f"envio {envio.id}")
    db.commit()
    return {"id": envio.id, "permite_comentar": envio.permite_comentar}


@router.delete("/{grupo_id}/envios/{envio_id}")
def retirar_imagem_do_grupo(grupo_id: int, envio_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                            db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    envio = _envio_do_dono(db, grupo, envio_id)
    _auditar(db, usuario, "grupo_imagem_retirada", grupo, f"envio {envio.id}; ficha {envio.curation_id} (comentarios apagados)")
    db.delete(envio)
    db.commit()
    return {"mensagem": "Imagem retirada do grupo."}


def _comentarios(db: Session, envio_id: int, participante_id: int | None = None) -> list[GrupoComentario]:
    consulta = db.query(GrupoComentario).filter(GrupoComentario.envio_id == envio_id)
    if participante_id is not None:
        consulta = consulta.filter(GrupoComentario.participante_id == participante_id)
    return consulta.order_by(GrupoComentario.criado_em, GrupoComentario.id).all()


def _comentario(c: GrupoComentario, eu_sou_participante: bool) -> dict:
    do_participante = c.autor_id == c.participante_id
    if eu_sou_participante:
        autor = "eu" if do_participante else "dono"
    else:
        autor = "participante" if do_participante else "dono"
    return {"id": c.id, "autor": autor, "texto": c.texto, "criado_em": _data(c.criado_em)}


@router.get("/{grupo_id}/envios/{envio_id}/conversas")
def conversas_do_envio(grupo_id: int, envio_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                       db: Session = Depends(get_db)):
    """Todas as conversas da imagem, uma por participante (so o dono ve)."""
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    envio = _envio_do_dono(db, grupo, envio_id)
    conversas: dict[int, list[dict]] = {}
    for c in _comentarios(db, envio.id):
        conversas.setdefault(c.participante_id, []).append(_comentario(c, eu_sou_participante=False))
    pessoas = {u.id: u for u in db.query(User).filter(User.id.in_(list(conversas) or [0]))}
    return {"conversas": [{"participante": {"id": pid, "nome": pessoas[pid].nome if pid in pessoas else ""},
                           "comentarios": itens} for pid, itens in conversas.items()]}


@router.post("/{grupo_id}/envios/{envio_id}/conversas/{participante_id}")
@limiter.limit("20/minute")
def responder_participante(request: Request, grupo_id: int, envio_id: int, participante_id: int,
                           dados: ComentarioDados, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                           db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    envio = _envio_do_dono(db, grupo, envio_id)
    if not db.get(GrupoEnvioMembro, (grupo.id, participante_id)):
        raise HTTPException(status_code=404, detail="Essa pessoa nao participa do grupo.")
    comentario = GrupoComentario(envio_id=envio.id, participante_id=participante_id, autor_id=usuario.id,
                                 texto=dados.texto)
    db.add(comentario)
    _auditar(db, usuario, "grupo_comentario_respondido", grupo, f"envio {envio.id}; pessoa {participante_id}")
    db.commit()
    return _comentario(comentario, eu_sou_participante=False)


# ======================================================================
# PARTICIPANTE
# ======================================================================

def _grupo_em_que_participo(db: Session, grupo_id: int, usuario: User) -> GrupoEnvio:
    if not db.get(GrupoEnvioMembro, (grupo_id, usuario.id)):
        raise HTTPException(status_code=404, detail="Voce nao participa desse grupo.")
    return db.get(GrupoEnvio, grupo_id)


def _envio_do_grupo(db: Session, grupo: GrupoEnvio, envio_id: int) -> GrupoEnvioCurado:
    for envio, _ficha in _envios_visiveis(db, grupo.id).filter(GrupoEnvioCurado.id == envio_id):
        return envio
    raise HTTPException(status_code=404, detail=ENVIO_NAO_ENCONTRADO)


@router.get("/participo/{grupo_id}/envios")
def imagens_do_grupo(grupo_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """Imagens do grupo e, em cada uma, SO a conversa da propria pessoa (D4).
    Cada imagem diz se e NOVA para a pessoa; abrir a lista marca todas como vistas."""
    grupo = _grupo_em_que_participo(db, grupo_id, usuario)
    membro = db.get(GrupoEnvioMembro, (grupo.id, usuario.id))
    vistas_em = membro.imagens_vistas_em
    dono = db.get(User, grupo.dono_id)
    envios = [{**_base_envio(e, f), "remetente": dono.nome if dono else "",
               "nova": vistas_em is None or (e.criado_em is not None and e.criado_em > vistas_em),
               "comentarios": [_comentario(c, eu_sou_participante=True) for c in _comentarios(db, e.id, usuario.id)]}
              for e, f in _envios_visiveis(db, grupo.id).all()]
    membro.imagens_vistas_em = _agora()
    db.commit()
    return {"envios": envios}


@router.post("/participo/{grupo_id}/envios/{envio_id}/comentarios")
@limiter.limit("20/minute")
def comentar(request: Request, grupo_id: int, envio_id: int, dados: ComentarioDados,
             usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    grupo = _grupo_em_que_participo(db, grupo_id, usuario)
    envio = _envio_do_grupo(db, grupo, envio_id)
    if not envio.permite_comentar:
        raise HTTPException(status_code=403, detail="O dono do grupo nao abriu esta imagem para comentarios.")
    comentario = GrupoComentario(envio_id=envio.id, participante_id=usuario.id, autor_id=usuario.id, texto=dados.texto)
    db.add(comentario)
    _auditar(db, usuario, "grupo_comentario_enviado", grupo, f"envio {envio.id}")
    db.commit()
    return _comentario(comentario, eu_sou_participante=True)


@router.delete("/participo/{grupo_id}/envios/{envio_id}/comentarios/{comentario_id}")
def apagar_meu_comentario(grupo_id: int, envio_id: int, comentario_id: int,
                          usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    grupo = _grupo_em_que_participo(db, grupo_id, usuario)
    envio = _envio_do_grupo(db, grupo, envio_id)
    comentario = db.get(GrupoComentario, comentario_id)
    if not comentario or comentario.envio_id != envio.id or comentario.autor_id != usuario.id:
        raise HTTPException(status_code=404, detail="Comentario nao encontrado.")
    db.delete(comentario)
    _auditar(db, usuario, "grupo_comentario_apagado", grupo, f"envio {envio.id}")
    db.commit()
    return {"mensagem": "Comentario apagado."}
