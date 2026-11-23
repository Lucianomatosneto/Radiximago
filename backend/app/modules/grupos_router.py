"""
GRUPOS DE ENVIO (etapa C, 08/11/2026) e ENTRADA CONSENTIDA (Etapa 1,
17/11/2026). Professor, pesquisador, curador e administrador montam os
proprios grupos para enviar imagens a varias pessoas de uma vez.

Decisao D1 do Luciano: NINGUEM e colocado direto num grupo. Ha so dois
caminhos, sempre com as duas partes de acordo:
  (a) o estudante PEDE para entrar e o dono AUTORIZA;
  (b) o dono CONVIDA e a pessoa ACEITA.
Se os dois se cruzam (convidado que pede, ou quem pediu e e convidado), a
pessoa entra na hora. Convites e pedidos sem resposta vencem em 30 dias.

DONO DO GRUPO (professor, pesquisador, curador, administrador):
- GET    /grupos                              meus grupos: participantes, convites e pedidos
- POST   /grupos                              cria {nome, aceita_pedidos, membros_ids -> CONVITES}
- PUT    /grupos/{id}                         renomeia, liga/desliga pedidos e ajusta a lista
- DELETE /grupos/{id}                         apaga o grupo (as imagens ja enviadas ficam)
- GET    /grupos/pessoas?busca=               procura pessoas para convidar
- POST   /grupos/{id}/convites                convida {usuario_id}
- DELETE /grupos/{id}/convites/{entrada}      cancela um convite ainda sem resposta
- POST   /grupos/{id}/pedidos/{entrada}/autorizar | /recusar
- DELETE /grupos/{id}/membros/{usuario}       tira alguem do grupo

QUALQUER PESSOA LOGADA (participante ou convidado):
- GET    /grupos/pendencias                   numeros do menu (convites e pedidos esperando)
- GET    /grupos/participo                    grupos de que participo
- DELETE /grupos/participo/{id}               sair do grupo
- GET    /grupos/convites-recebidos           convites esperando minha resposta
- POST   /grupos/convites-recebidos/{entrada}/aceitar | /recusar

SO ESTUDANTES (D7):
- GET    /grupos/procurar?nome=               no minimo 3 letras, ate 20 grupos
- POST   /grupos/{id}/pedir                   pedir para entrar
- GET    /grupos/pedidos-enviados             meus pedidos esperando o dono
- DELETE /grupos/pedidos-enviados/{entrada}   desistir do pedido

Privacidade (D2): a busca mostra so o nome do grupo e quem o criou; o dono
ve todos os participantes; o participante nao ve os colegas. E-mails saem
mascarados. Tudo vai para a auditoria, sem nomes (so os numeros de cadastro).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.modules.audit_logs import AuditLog
from app.modules.auth import exigir_perfis, obter_usuario_atual
from app.modules.grupos import (
    DIAS_VALIDADE_ENTRADA, MEMBROS_MAX, NOME_GRUPO_MAX, ORIGEM_CONVITE, ORIGEM_PEDIDO,
    GrupoEntrada, GrupoEnvio, GrupoEnvioMembro,
)
from app.modules.prancha_router import _mascarar
from app.modules.users import User, UserRole

router = APIRouter(prefix="/grupos", tags=["Grupos de envio"])

PERFIS_GRUPOS = (UserRole.professor, UserRole.pesquisador, UserRole.curador, UserRole.administrador)
BUSCA_MIN_LETRAS = 3
BUSCA_MAX_RESULTADOS = 20

CONVITE, PEDIDO = "convite", "pedido"
PENDENTE = "pendente"

# situacao da pessoa em relacao a um grupo (devolvida as telas)
PARTICIPA = "participa"
CONVITE_PENDENTE = "convite_pendente"
PEDIDO_PENDENTE = "pedido_pendente"

NAO_ENCONTRADO = "Grupo nao encontrado."
ENTRADA_NAO_ENCONTRADA = "Convite ou pedido nao encontrado (pode ter vencido ou ja ter resposta)."


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _perfil(u: User) -> str:
    return u.perfil.value if hasattr(u.perfil, "value") else str(u.perfil)


def _pessoa(u: User) -> dict:
    return {"id": u.id, "nome": u.nome, "perfil": _perfil(u), "email": _mascarar(u.email)}


def _data(valor: datetime | None) -> str | None:
    return valor.isoformat() if valor else None


def pessoas_validas(db: Session, ids: list[int]) -> list[User]:
    """Usuarios ativos entre os ids pedidos (os demais sao ignorados)."""
    if not ids:
        return []
    return (db.query(User)
            .filter(User.id.in_(set(ids)), User.ativo.is_(True), User.excluido.is_(False), User.bloqueado.isnot(True))
            .all())


def membros_dos_grupos(db: Session, dono_id: int, grupos_ids: list[int]) -> set[int]:
    """Ids dos membros dos grupos pedidos - SO grupos do proprio dono."""
    if not grupos_ids:
        return set()
    return {
        uid for (uid,) in db.query(GrupoEnvioMembro.usuario_id)
        .join(GrupoEnvio, GrupoEnvio.id == GrupoEnvioMembro.grupo_id)
        .filter(GrupoEnvio.dono_id == dono_id, GrupoEnvio.id.in_(set(grupos_ids)))
    }


def _vencer_pendentes(db: Session) -> None:
    """Convites e pedidos sem resposta ha mais de 30 dias passam a 'vencido'."""
    limite = _agora() - timedelta(days=DIAS_VALIDADE_ENTRADA)
    vencidos = (db.query(GrupoEntrada)
                .filter(GrupoEntrada.estado == PENDENTE, GrupoEntrada.criado_em < limite)
                .update({"estado": "vencido", "decidido_em": _agora()}, synchronize_session=False))
    if vencidos:
        db.commit()


def _grupo_do_dono(db: Session, grupo_id: int, usuario: User) -> GrupoEnvio:
    grupo = db.get(GrupoEnvio, grupo_id)
    if not grupo or grupo.dono_id != usuario.id:
        raise HTTPException(status_code=404, detail=NAO_ENCONTRADO)
    return grupo


def _membro(db: Session, grupo_id: int, usuario_id: int) -> GrupoEnvioMembro | None:
    return db.get(GrupoEnvioMembro, (grupo_id, usuario_id))


def _pendente(db: Session, grupo_id: int, usuario_id: int) -> GrupoEntrada | None:
    return (db.query(GrupoEntrada)
            .filter(GrupoEntrada.grupo_id == grupo_id, GrupoEntrada.usuario_id == usuario_id,
                    GrupoEntrada.estado == PENDENTE)
            .first())


def _auditar(db: Session, usuario: User, acao: str, grupo: GrupoEnvio, detalhes: str) -> None:
    db.add(AuditLog(usuario_id=usuario.id, acao=acao, entidade="grupo_envio",
                    entidade_id=grupo.id, resultado="sucesso", detalhes=detalhes))


def _gravar(db: Session) -> None:
    """Grava; se outra resposta chegou ao mesmo tempo (indice unico), avisa em vez de duplicar."""
    try:
        db.commit()
    except IntegrityError as causa:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ja existe um convite ou pedido para essa pessoa.") from causa


def _decidir(entrada: GrupoEntrada, estado: str) -> None:
    entrada.estado = estado
    entrada.decidido_em = _agora()


def _entrar(db: Session, grupo: GrupoEnvio, usuario_id: int, origem: str) -> None:
    if not _membro(db, grupo.id, usuario_id):
        db.add(GrupoEnvioMembro(grupo_id=grupo.id, usuario_id=usuario_id, origem=origem))


def _saida(db: Session, grupo: GrupoEnvio) -> dict:
    """O que o DONO ve do grupo: todos os participantes, convites e pedidos pendentes."""
    membros = (db.query(User, GrupoEnvioMembro)
               .join(GrupoEnvioMembro, GrupoEnvioMembro.usuario_id == User.id)
               .filter(GrupoEnvioMembro.grupo_id == grupo.id).order_by(User.nome, User.id).all())
    pendentes = (db.query(User, GrupoEntrada)
                 .join(GrupoEntrada, GrupoEntrada.usuario_id == User.id)
                 .filter(GrupoEntrada.grupo_id == grupo.id, GrupoEntrada.estado == PENDENTE)
                 .order_by(GrupoEntrada.criado_em, GrupoEntrada.id).all())

    def _item(u: User, e: GrupoEntrada) -> dict:
        return {"id": e.id, "pessoa": _pessoa(u), "criado_em": _data(e.criado_em)}

    return {
        "id": grupo.id,
        "nome": grupo.nome,
        "aceita_pedidos": bool(grupo.aceita_pedidos),
        "membros": [{**_pessoa(u), "entrou_em": _data(m.entrou_em), "origem": m.origem} for u, m in membros],
        "convites": [_item(u, e) for u, e in pendentes if e.tipo == CONVITE],
        "pedidos": [_item(u, e) for u, e in pendentes if e.tipo == PEDIDO],
    }


def _convidar(db: Session, grupo: GrupoEnvio, dono: User, pessoa_id: int) -> str:
    """Convida uma pessoa. Se ela ja tinha pedido para entrar, entra na hora.
    Devolve a situacao (ou 'ja_participa' / 'ja_pendente', sem mudar nada)."""
    if _membro(db, grupo.id, pessoa_id):
        return "ja_participa"
    pendente = _pendente(db, grupo.id, pessoa_id)
    if pendente and pendente.tipo == PEDIDO:
        _decidir(pendente, "aceito")
        _entrar(db, grupo, pessoa_id, ORIGEM_PEDIDO)
        _auditar(db, dono, "grupo_pedido_autorizado", grupo, f"pessoa {pessoa_id} (convidada apos pedir)")
        return PARTICIPA
    if pendente:
        return "ja_pendente"
    db.add(GrupoEntrada(grupo_id=grupo.id, usuario_id=pessoa_id, tipo=CONVITE))
    _auditar(db, dono, "grupo_convite_enviado", grupo, f"pessoa {pessoa_id}")
    return CONVITE_PENDENTE


def _convidar_lista(db: Session, grupo: GrupoEnvio, ids: list[int], dono: User) -> int:
    """A lista do formulario vira convites (so pessoas ativas; nunca o proprio dono)."""
    validos = [u.id for u in pessoas_validas(db, ids) if u.id != dono.id]
    return sum(_convidar(db, grupo, dono, uid) in (CONVITE_PENDENTE, PARTICIPA) for uid in validos)


def _tirar(db: Session, grupo: GrupoEnvio, dono: User, usuario_id: int) -> bool:
    membro = _membro(db, grupo.id, usuario_id)
    if not membro:
        return False
    db.delete(membro)
    _auditar(db, dono, "grupo_participante_retirado", grupo, f"pessoa {usuario_id}")
    return True


class GrupoDados(BaseModel):
    nome: str = Field(min_length=1, max_length=NOME_GRUPO_MAX)
    # quem o dono quer no grupo: os novos recebem CONVITE (ninguem entra direto)
    membros_ids: list[int] | None = Field(default=None, max_length=MEMBROS_MAX)
    aceita_pedidos: bool | None = None


class ConviteDados(BaseModel):
    usuario_id: int


def _nome_livre(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as causa:
        db.rollback()
        raise HTTPException(status_code=409, detail="Voce ja tem um grupo com esse nome.") from causa


# ======================================================================
# DONO DO GRUPO
# ======================================================================

@router.get("")
def meus_grupos(usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)), db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    grupos = db.query(GrupoEnvio).filter(GrupoEnvio.dono_id == usuario.id).order_by(GrupoEnvio.nome).all()
    return {"grupos": [_saida(db, g) for g in grupos]}


@router.get("/pessoas")
def procurar_pessoas(busca: str = Query("", max_length=80),
                     usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)), db: Session = Depends(get_db)):
    termo = busca.strip().lower()
    consulta = db.query(User).filter(User.ativo.is_(True), User.excluido.is_(False),
                                     User.bloqueado.isnot(True), User.id != usuario.id)
    if termo:
        consulta = consulta.filter(or_(func.lower(User.nome).contains(termo, autoescape=True),
                                       func.lower(User.email).contains(termo, autoescape=True)))
    return {"pessoas": [_pessoa(u) for u in consulta.order_by(User.nome).limit(50).all()]}


@router.post("")
def criar_grupo(entrada: GrupoDados, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                db: Session = Depends(get_db)):
    aceita = True if entrada.aceita_pedidos is None else entrada.aceita_pedidos
    grupo = GrupoEnvio(dono_id=usuario.id, nome=entrada.nome.strip(), aceita_pedidos=aceita)
    db.add(grupo)
    _nome_livre(db)
    n = _convidar_lista(db, grupo, entrada.membros_ids or [], usuario)
    _auditar(db, usuario, "grupo_envio_criado", grupo, f"{n} convite(s); aceita pedidos: {'sim' if aceita else 'nao'}")
    _gravar(db)
    return _saida(db, grupo)


@router.put("/{grupo_id}")
def editar_grupo(grupo_id: int, entrada: GrupoDados, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                 db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    grupo.nome = entrada.nome.strip()
    if entrada.aceita_pedidos is not None:
        grupo.aceita_pedidos = entrada.aceita_pedidos
    _nome_livre(db)
    detalhes = f"aceita pedidos: {'sim' if grupo.aceita_pedidos else 'nao'}"
    if entrada.membros_ids is not None:
        # quem saiu da lista sai do grupo; quem e novo na lista recebe convite
        lista = set(entrada.membros_ids)
        atuais = {uid for (uid,) in db.query(GrupoEnvioMembro.usuario_id).filter(GrupoEnvioMembro.grupo_id == grupo.id)}
        retirados = sum(_tirar(db, grupo, usuario, uid) for uid in atuais - lista)
        convidados = _convidar_lista(db, grupo, sorted(lista - atuais), usuario)
        detalhes += f"; {convidados} convite(s); {retirados} retirado(s)"
    _auditar(db, usuario, "grupo_envio_editado", grupo, detalhes)
    _gravar(db)
    return _saida(db, grupo)


@router.delete("/{grupo_id}")
def apagar_grupo(grupo_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                 db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    _auditar(db, usuario, "grupo_envio_apagado", grupo, "grupo apagado (envios ja feitos continuam)")
    db.delete(grupo)
    db.commit()
    return {"mensagem": "Grupo apagado."}


@router.post("/{grupo_id}/convites")
@limiter.limit("20/minute")
def convidar(request: Request, grupo_id: int, dados: ConviteDados,
             usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)), db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    if dados.usuario_id == usuario.id or not pessoas_validas(db, [dados.usuario_id]):
        raise HTTPException(status_code=404, detail="Pessoa nao encontrada.")
    situacao = _convidar(db, grupo, usuario, dados.usuario_id)
    if situacao == "ja_participa":
        raise HTTPException(status_code=409, detail="Essa pessoa ja participa do grupo.")
    if situacao == "ja_pendente":
        raise HTTPException(status_code=409, detail="Essa pessoa ja tem um convite esperando resposta.")
    _gravar(db)
    return {"situacao": situacao}


def _entrada_do_grupo(db: Session, grupo: GrupoEnvio, entrada_id: int, tipo: str) -> GrupoEntrada:
    entrada = db.get(GrupoEntrada, entrada_id)
    if not entrada or entrada.grupo_id != grupo.id or entrada.tipo != tipo or entrada.estado != PENDENTE:
        raise HTTPException(status_code=404, detail=ENTRADA_NAO_ENCONTRADA)
    return entrada


@router.delete("/{grupo_id}/convites/{entrada_id}")
def cancelar_convite(grupo_id: int, entrada_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                     db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    entrada = _entrada_do_grupo(db, grupo, entrada_id, CONVITE)
    _decidir(entrada, "cancelado")
    _auditar(db, usuario, "grupo_convite_cancelado", grupo, f"pessoa {entrada.usuario_id}")
    db.commit()
    return {"mensagem": "Convite cancelado."}


@router.post("/{grupo_id}/pedidos/{entrada_id}/autorizar")
def autorizar_pedido(grupo_id: int, entrada_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                     db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    entrada = _entrada_do_grupo(db, grupo, entrada_id, PEDIDO)
    _decidir(entrada, "aceito")
    _entrar(db, grupo, entrada.usuario_id, ORIGEM_PEDIDO)
    _auditar(db, usuario, "grupo_pedido_autorizado", grupo, f"pessoa {entrada.usuario_id}")
    db.commit()
    return {"mensagem": "Pedido autorizado: a pessoa agora participa do grupo."}


@router.post("/{grupo_id}/pedidos/{entrada_id}/recusar")
def recusar_pedido(grupo_id: int, entrada_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                   db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    entrada = _entrada_do_grupo(db, grupo, entrada_id, PEDIDO)
    _decidir(entrada, "recusado")
    _auditar(db, usuario, "grupo_pedido_recusado", grupo, f"pessoa {entrada.usuario_id}")
    db.commit()
    return {"mensagem": "Pedido recusado."}


@router.delete("/{grupo_id}/membros/{usuario_id}")
def tirar_participante(grupo_id: int, usuario_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_GRUPOS)),
                       db: Session = Depends(get_db)):
    grupo = _grupo_do_dono(db, grupo_id, usuario)
    if not _tirar(db, grupo, usuario, usuario_id):
        raise HTTPException(status_code=404, detail="Essa pessoa nao participa do grupo.")
    db.commit()
    return {"mensagem": "Pessoa retirada do grupo."}


# ======================================================================
# PARTICIPANTE E CONVIDADO (qualquer pessoa logada)
# ======================================================================

@router.get("/pendencias")
def pendencias(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """Numeros do menu: convites que a pessoa tem para responder, pedidos
    esperando por ela nos grupos de que e dona e imagens novas nos grupos de
    que participa (so numeros, sem nomes)."""
    _vencer_pendentes(db)
    convites = (db.query(func.count(GrupoEntrada.id))
                .filter(GrupoEntrada.usuario_id == usuario.id, GrupoEntrada.tipo == CONVITE,
                        GrupoEntrada.estado == PENDENTE).scalar())
    pedidos = (db.query(func.count(GrupoEntrada.id))
               .join(GrupoEnvio, GrupoEnvio.id == GrupoEntrada.grupo_id)
               .filter(GrupoEnvio.dono_id == usuario.id, GrupoEntrada.tipo == PEDIDO,
                       GrupoEntrada.estado == PENDENTE).scalar())
    from app.modules.grupos_aula_router import imagens_novas_por_grupo  # (evita import circular)
    novas = sum(imagens_novas_por_grupo(db, usuario.id).values())
    return {"convites": convites or 0, "pedidos": pedidos or 0, "imagens_novas": novas}


@router.get("/participo")
def grupos_de_que_participo(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """Os grupos de que a pessoa participa - sem a lista dos colegas (D2) -,
    com quantas imagens novas chegaram em cada um."""
    from app.modules.grupos_aula_router import imagens_novas_por_grupo  # (evita import circular)
    novas = imagens_novas_por_grupo(db, usuario.id)
    dono = aliased(User)
    linhas = (db.query(GrupoEnvio, GrupoEnvioMembro, dono.nome)
              .join(GrupoEnvioMembro, GrupoEnvioMembro.grupo_id == GrupoEnvio.id)
              .join(dono, dono.id == GrupoEnvio.dono_id)
              .filter(GrupoEnvioMembro.usuario_id == usuario.id)
              .order_by(GrupoEnvio.nome).all())
    return {"grupos": [{"id": g.id, "nome": g.nome, "criador": nome_dono, "entrou_em": _data(m.entrou_em),
                        "imagens_novas": novas.get(g.id, 0)} for g, m, nome_dono in linhas]}


@router.delete("/participo/{grupo_id}")
def sair_do_grupo(grupo_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    membro = _membro(db, grupo_id, usuario.id)
    if not membro:
        raise HTTPException(status_code=404, detail="Voce nao participa desse grupo.")
    grupo = db.get(GrupoEnvio, grupo_id)
    db.delete(membro)
    _auditar(db, usuario, "grupo_participante_saiu", grupo, "saiu por conta propria")
    db.commit()
    return {"mensagem": "Voce saiu do grupo."}


@router.get("/convites-recebidos")
def convites_recebidos(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    dono = aliased(User)
    linhas = (db.query(GrupoEntrada, GrupoEnvio, dono.nome)
              .join(GrupoEnvio, GrupoEnvio.id == GrupoEntrada.grupo_id)
              .join(dono, dono.id == GrupoEnvio.dono_id)
              .filter(GrupoEntrada.usuario_id == usuario.id, GrupoEntrada.tipo == CONVITE,
                      GrupoEntrada.estado == PENDENTE)
              .order_by(GrupoEntrada.criado_em.desc()).all())
    return {"convites": [{"id": e.id, "grupo": {"id": g.id, "nome": g.nome}, "convidado_por": nome_dono,
                          "criado_em": _data(e.criado_em)} for e, g, nome_dono in linhas]}


def _minha_entrada(db: Session, entrada_id: int, usuario: User, tipo: str) -> tuple[GrupoEntrada, GrupoEnvio]:
    """Convite ou pedido da PROPRIA pessoa, ainda sem resposta (de outra pessoa: 404)."""
    _vencer_pendentes(db)
    entrada = db.get(GrupoEntrada, entrada_id)
    if not entrada or entrada.usuario_id != usuario.id or entrada.tipo != tipo or entrada.estado != PENDENTE:
        raise HTTPException(status_code=404, detail=ENTRADA_NAO_ENCONTRADA)
    return entrada, db.get(GrupoEnvio, entrada.grupo_id)


@router.post("/convites-recebidos/{entrada_id}/aceitar")
def aceitar_convite(entrada_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    entrada, grupo = _minha_entrada(db, entrada_id, usuario, CONVITE)
    _decidir(entrada, "aceito")
    _entrar(db, grupo, usuario.id, ORIGEM_CONVITE)
    _auditar(db, usuario, "grupo_convite_aceito", grupo, "aceitou o convite")
    db.commit()
    return {"mensagem": "Convite aceito: voce agora participa do grupo.", "grupo_id": grupo.id}


@router.post("/convites-recebidos/{entrada_id}/recusar")
def recusar_convite(entrada_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    entrada, grupo = _minha_entrada(db, entrada_id, usuario, CONVITE)
    _decidir(entrada, "recusado")
    _auditar(db, usuario, "grupo_convite_recusado", grupo, "recusou o convite")
    db.commit()
    return {"mensagem": "Convite recusado."}


# ======================================================================
# SO ESTUDANTES: procurar grupo e pedir para entrar (D7)
# ======================================================================

def _situacao(db: Session, grupo_id: int, usuario_id: int) -> str | None:
    if _membro(db, grupo_id, usuario_id):
        return PARTICIPA
    pendente = _pendente(db, grupo_id, usuario_id)
    if not pendente:
        return None
    return CONVITE_PENDENTE if pendente.tipo == CONVITE else PEDIDO_PENDENTE


@router.get("/procurar")
@limiter.limit("30/minute")
def procurar_grupos(request: Request, nome: str = Query(..., min_length=BUSCA_MIN_LETRAS, max_length=NOME_GRUPO_MAX),
                    usuario: User = Depends(exigir_perfis(UserRole.estudante)), db: Session = Depends(get_db)):
    """So grupos que aceitam pedidos; mostra so o nome e quem criou (D2)."""
    termo = nome.strip().lower()
    if len(termo) < BUSCA_MIN_LETRAS:
        raise HTTPException(status_code=422, detail=f"Digite pelo menos {BUSCA_MIN_LETRAS} letras.")
    _vencer_pendentes(db)
    dono = aliased(User)
    linhas = (db.query(GrupoEnvio, dono.nome)
              .join(dono, dono.id == GrupoEnvio.dono_id)
              .filter(GrupoEnvio.aceita_pedidos.is_(True), dono.ativo.is_(True), dono.excluido.is_(False),
                      dono.bloqueado.isnot(True),
                      func.lower(GrupoEnvio.nome).contains(termo, autoescape=True))
              .order_by(GrupoEnvio.nome, GrupoEnvio.id).limit(BUSCA_MAX_RESULTADOS).all())
    return {"grupos": [{"id": g.id, "nome": g.nome, "criador": nome_dono,
                        "situacao": _situacao(db, g.id, usuario.id)} for g, nome_dono in linhas]}


@router.post("/{grupo_id}/pedir")
@limiter.limit("20/minute")
def pedir_para_entrar(request: Request, grupo_id: int, usuario: User = Depends(exigir_perfis(UserRole.estudante)),
                      db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    grupo = db.get(GrupoEnvio, grupo_id)
    if not grupo or not grupo.aceita_pedidos:
        raise HTTPException(status_code=404, detail=NAO_ENCONTRADO)
    if _membro(db, grupo.id, usuario.id):
        raise HTTPException(status_code=409, detail="Voce ja participa desse grupo.")
    pendente = _pendente(db, grupo.id, usuario.id)
    if pendente and pendente.tipo == CONVITE:
        # o dono ja tinha convidado: as duas partes concordaram, entra na hora
        _decidir(pendente, "aceito")
        _entrar(db, grupo, usuario.id, ORIGEM_CONVITE)
        _auditar(db, usuario, "grupo_convite_aceito", grupo, "pediu para entrar e ja tinha convite")
        db.commit()
        return {"situacao": PARTICIPA}
    if pendente:
        raise HTTPException(status_code=409, detail="Seu pedido ja esta esperando o dono do grupo.")
    db.add(GrupoEntrada(grupo_id=grupo.id, usuario_id=usuario.id, tipo=PEDIDO))
    _auditar(db, usuario, "grupo_pedido_enviado", grupo, "pediu para entrar")
    _gravar(db)
    return {"situacao": PEDIDO_PENDENTE}


@router.get("/pedidos-enviados")
def pedidos_enviados(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    _vencer_pendentes(db)
    dono = aliased(User)
    linhas = (db.query(GrupoEntrada, GrupoEnvio, dono.nome)
              .join(GrupoEnvio, GrupoEnvio.id == GrupoEntrada.grupo_id)
              .join(dono, dono.id == GrupoEnvio.dono_id)
              .filter(GrupoEntrada.usuario_id == usuario.id, GrupoEntrada.tipo == PEDIDO,
                      GrupoEntrada.estado == PENDENTE)
              .order_by(GrupoEntrada.criado_em.desc()).all())
    return {"pedidos": [{"id": e.id, "grupo": {"id": g.id, "nome": g.nome}, "criador": nome_dono,
                         "criado_em": _data(e.criado_em)} for e, g, nome_dono in linhas]}


@router.delete("/pedidos-enviados/{entrada_id}")
def desistir_do_pedido(entrada_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    entrada, grupo = _minha_entrada(db, entrada_id, usuario, PEDIDO)
    _decidir(entrada, "cancelado")
    _auditar(db, usuario, "grupo_pedido_cancelado", grupo, "desistiu do pedido")
    db.commit()
    return {"mensagem": "Pedido cancelado."}
