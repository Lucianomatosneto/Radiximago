"""
ENVIO DE IMAGENS POR TODOS OS PERFIS - etapa B da separacao Radix Imago /
Radix Clinica (08/11/2026, documento "Separacao Radix Imago e Radix Clinica").

- POST   /envios                      envia arquivo DICOM ou foto (JPG/PNG,
                                      inclusive pela camera do celular)
- GET    /envios/meus                 o que EU enviei (Minhas imagens)
- GET    /envios/para-analisar        o que mandaram para EU analisar
- GET    /envios/analistas            professores e curadores que podem analisar
- POST   /envios/{id}/analise         dono manda uma imagem pessoal para analise
- POST   /envios/{id}/decidir         quem analisa: colocar na fila ou devolver
- DELETE /envios/{id}                 dono retira uma imagem pessoal
- GET    /envios/{id}/preview         miniatura (dono, quem analisa, quem recebeu, curadoria)
- POST   /envios/{id}/enviar-para     professor/curador manda a imagem a pessoas e grupos (etapa C)
- GET    /envios/recebidas            imagens que colegas me enviaram (etapa C)

REGRAS (decisoes do Luciano, 08/11/2026):
- ESTUDANTE escolhe "so para mim" (fica so com ele, em Minhas imagens) ou
  "enviar para analise" de UM professor ou curador. A imagem vai SO para essa
  pessoa, que decide colocar na fila de curadoria ou devolver com um recado.
- PROFESSOR e CURADOR enviam para a fila de curadoria (ou "so para mim").
- So o CURADOR publica no banco geral (aprovando a ficha na Curadoria):
  nenhuma imagem pessoal ou em analise aparece na pesquisa.
- Toda imagem passa pela MESMA entrada (receber_dicom): anonimizacao, texto
  gravado na imagem, recorte da moldura. Foto vira DICOM sem os metadados
  do celular (foto_para_dicom.py).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import get_db
from app.core.cabecalhos import disposicao_de_arquivo
from app.core.limites import TextoMedio
from app.core.rate_limit import LIMITE_UPLOAD_DICOM, limiter
from app.modules import foto_para_dicom, orthanc_client
from app.modules.audit_logs import AuditLog
from app.modules.auth import exigir_perfis, obter_usuario_atual
from app.core.config import settings
from app.modules.curations import Curation
from app.modules.grupos import EnvioDestinatario
from app.modules.grupos_router import membros_dos_grupos, pessoas_validas
from app.modules.images_router import ler_arquivo_limitado, receber_dicom
from app.modules.orthanc_references import DestinoImagem, OrthancReference, visivel_para
from app.modules.users import User, UserRole

router = APIRouter(prefix="/envios", tags=["Envio de imagens"])

PERFIS_QUE_ENVIAM = (UserRole.estudante, UserRole.professor, UserRole.curador, UserRole.administrador)
PERFIS_QUE_ANALISAM = (UserRole.professor, UserRole.curador)
DESTINOS_POR_PERFIL = {
    UserRole.estudante: {DestinoImagem.PESSOAL.value, DestinoImagem.ANALISE.value},
    UserRole.professor: {DestinoImagem.FILA.value, DestinoImagem.PESSOAL.value},
    UserRole.curador: {DestinoImagem.FILA.value, DestinoImagem.PESSOAL.value},
    UserRole.administrador: {DestinoImagem.FILA.value, DestinoImagem.PESSOAL.value},
}
NOTA_MAX = 500


def _perfil(usuario: User) -> str:
    return usuario.perfil.value if hasattr(usuario.perfil, "value") else str(usuario.perfil)


def _analista_valido(db: Session, destinatario_id: int | None, usuario: User) -> User:
    if not destinatario_id or destinatario_id == usuario.id:
        raise HTTPException(status_code=422, detail="Escolha o professor ou curador que vai analisar a imagem.")
    pessoa = db.get(User, destinatario_id)
    if (not pessoa or pessoa.excluido or not pessoa.ativo or pessoa.bloqueado
            or pessoa.perfil not in PERFIS_QUE_ANALISAM):
        raise HTTPException(status_code=422, detail="So um professor ou curador ativo pode analisar a imagem.")
    return pessoa


def _nota(texto: str | None) -> str | None:
    texto = (texto or "").strip()
    if len(texto) > NOTA_MAX:
        raise HTTPException(status_code=422, detail=f"O recado pode ter no maximo {NOTA_MAX} caracteres.")
    return texto or None


def _situacao(ref: OrthancReference, aprovada: bool) -> str:
    if aprovada:
        return "no_banco"
    if ref.destino == DestinoImagem.ANALISE.value:
        return "em_analise"
    if ref.destino == DestinoImagem.FILA.value:
        return "na_fila"
    return "devolvida" if ref.devolucao_nota else "so_para_mim"


def _item(db: Session, ref: OrthancReference) -> dict:
    curadoria = (db.query(Curation).filter(Curation.orthanc_reference_id == ref.id)
                 .order_by(Curation.id.desc()).first())
    analista = db.get(User, ref.analise_destinatario_id) if ref.analise_destinatario_id else None
    dono = db.get(User, ref.enviado_por_id) if ref.enviado_por_id else None
    return {
        "id": ref.id,
        "situacao": _situacao(ref, bool(curadoria and curadoria.status == "aprovada")),
        "destino": ref.destino,
        "enviado_em": ref.criado_em.isoformat() if ref.criado_em else None,
        "enviado_por": dono.nome if dono else None,
        "analista": analista.nome if analista else None,
        "analise_nota": ref.analise_nota,
        "devolucao_nota": ref.devolucao_nota,
        "texto_na_imagem": ref.texto_na_imagem,
        "curation_id": curadoria.id if curadoria and curadoria.status == "aprovada" else None,
        # abrir no visualizador (a portaria das imagens confere quem pode ver)
        "viewer_url": (f"{settings.OHIF_BASE_URL}/viewer?StudyInstanceUIDs={ref.study_instance_uid}"
                       if ref.study_instance_uid else None),
        "enviada_para": db.query(EnvioDestinatario).filter(EnvioDestinatario.orthanc_reference_id == ref.id).count(),
    }


PERFIS_QUE_ENVIAM_A_PESSOAS = (UserRole.professor, UserRole.curador, UserRole.administrador)
DESTINATARIOS_MAX = 300


def _ids(texto: str | None) -> list[int]:
    """'3,8, 12' -> [3, 8, 12] (formulario de envio)."""
    try:
        return [int(p) for p in (texto or "").replace(" ", "").split(",") if p][:DESTINATARIOS_MAX]
    except ValueError:
        raise HTTPException(status_code=422, detail="Lista de pessoas ou grupos invalida.")


def enviar_a_pessoas(db: Session, ref: OrthancReference, remetente: User,
                     pessoas_ids: list[int], grupos_ids: list[int]) -> int:
    """Grava o envio da imagem para as pessoas e os membros dos grupos (so
    grupos do proprio remetente). Devolve quantas pessoas NOVAS receberam."""
    alvo = set(pessoas_ids) | membros_dos_grupos(db, remetente.id, grupos_ids)
    alvo.discard(remetente.id)
    ja = {d for (d,) in db.query(EnvioDestinatario.destinatario_id)
          .filter(EnvioDestinatario.orthanc_reference_id == ref.id)}
    novos = [u for u in pessoas_validas(db, list(alvo)) if u.id not in ja]
    for u in novos:
        db.add(EnvioDestinatario(orthanc_reference_id=ref.id, remetente_id=remetente.id, destinatario_id=u.id))
    if novos:
        _auditar(db, remetente, "imagem_enviada_pessoas", ref,
                 f"{len(novos)} pessoa(s); grupos usados: {len(set(grupos_ids))}")
    return len(novos)


def recebeu(db: Session, ref: OrthancReference, usuario_id: int) -> bool:
    return db.query(EnvioDestinatario.id).filter(EnvioDestinatario.orthanc_reference_id == ref.id,
                                                 EnvioDestinatario.destinatario_id == usuario_id).first() is not None


def _buscar(db: Session, imagem_id: int) -> OrthancReference:
    ref = db.get(OrthancReference, imagem_id)
    if not ref or not ref.ativo:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")
    return ref


def _auditar(db: Session, usuario: User, acao: str, ref: OrthancReference, detalhes: str) -> None:
    db.add(AuditLog(usuario_id=usuario.id, acao=acao, entidade="orthanc_reference",
                    entidade_id=ref.id, resultado="sucesso", detalhes=detalhes))


@router.post("")
@limiter.limit(LIMITE_UPLOAD_DICOM)
def enviar_imagem(
    request: Request,
    arquivo: UploadFile = File(...),
    destino: str = Form(..., max_length=10),
    analista_id: int | None = Form(None, ge=1),
    nota: str | None = Form(None, max_length=NOTA_MAX),
    pessoas: str | None = Form(None, max_length=4000),
    grupos: str | None = Form(None, max_length=4000),
    usuario: User = Depends(exigir_perfis(*PERFIS_QUE_ENVIAM)),
    db: Session = Depends(get_db),
):
    """Arquivo DICOM ou foto (JPG/PNG/WebP). A foto vira DICOM antes de entrar."""
    if destino not in DESTINOS_POR_PERFIL.get(usuario.perfil, set()):
        raise HTTPException(status_code=422, detail="Destino nao permitido para o seu perfil.")
    nota_limpa = _nota(nota)
    pessoas_ids, grupos_ids = _ids(pessoas), _ids(grupos)
    if (pessoas_ids or grupos_ids) and usuario.perfil not in PERFIS_QUE_ENVIAM_A_PESSOAS:
        raise HTTPException(status_code=403, detail="Seu perfil nao envia imagens para pessoas ou grupos.")
    destinatario_id = None
    if destino == DestinoImagem.ANALISE.value:
        destinatario_id = _analista_valido(db, analista_id, usuario).id
    conteudo = ler_arquivo_limitado(arquivo)
    era_foto = foto_para_dicom.e_foto(conteudo)
    if era_foto:
        try:
            conteudo = foto_para_dicom.converter(conteudo)
        except foto_para_dicom.FotoInvalida as erro:
            raise HTTPException(status_code=422, detail=str(erro))
    resultado = receber_dicom(db, usuario, conteudo, destino=destino,
                              destinatario_id=destinatario_id, nota=nota_limpa)
    if era_foto:
        ref = db.get(OrthancReference, resultado["orthanc_reference_id"])
        _auditar(db, usuario, "foto_convertida_dicom", ref,
                 "Foto (JPG/PNG) convertida em DICOM de captura secundaria; metadados da foto descartados.")
        db.commit()
    if destino == DestinoImagem.ANALISE.value and resultado.get("status") == "importada":
        ref = db.get(OrthancReference, resultado["orthanc_reference_id"])
        _auditar(db, usuario, "imagem_enviada_analise", ref, f"para usuario_id={destinatario_id}")
        db.commit()
    resultado["enviada_para"] = 0
    if pessoas_ids or grupos_ids:
        ref = db.get(OrthancReference, resultado["orthanc_reference_id"])
        if ref.enviado_por_id == usuario.id:
            resultado["enviada_para"] = enviar_a_pessoas(db, ref, usuario, pessoas_ids, grupos_ids)
            db.commit()
    resultado["destino"] = destino
    resultado["foto_convertida"] = era_foto
    return resultado


class PedidoEnvioPessoas(BaseModel):
    pessoas_ids: list[int] = Field(default_factory=list, max_length=DESTINATARIOS_MAX)
    grupos_ids: list[int] = Field(default_factory=list, max_length=100)


@router.post("/{imagem_id}/enviar-para")
def enviar_para(imagem_id: int, pedido: PedidoEnvioPessoas,
                usuario: User = Depends(exigir_perfis(*PERFIS_QUE_ENVIAM_A_PESSOAS)), db: Session = Depends(get_db)):
    """Quem enviou a imagem a manda para mais pessoas e grupos."""
    ref = _buscar(db, imagem_id)
    if ref.enviado_por_id != usuario.id:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")
    n = enviar_a_pessoas(db, ref, usuario, pedido.pessoas_ids, pedido.grupos_ids)
    db.commit()
    return {"mensagem": f"Imagem enviada para {n} pessoa(s)." if n else "Essas pessoas ja tinham recebido a imagem.",
            "enviada_para": n}


@router.get("/recebidas")
def recebidas(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """Imagens que colegas me enviaram (antes ou depois de entrar no banco geral)."""
    linhas = (db.query(OrthancReference, EnvioDestinatario)
              .join(EnvioDestinatario, EnvioDestinatario.orthanc_reference_id == OrthancReference.id)
              .filter(EnvioDestinatario.destinatario_id == usuario.id, OrthancReference.ativo.is_(True))
              .order_by(EnvioDestinatario.id.desc()).limit(500).all())
    itens = []
    for ref, envio in linhas:
        item = _item(db, ref)
        item["recebida_em"] = envio.criado_em.isoformat() if envio.criado_em else None
        item["nova"] = envio.visto_em is None
        item.pop("analise_nota", None)
        item.pop("devolucao_nota", None)
        item.pop("enviada_para", None)
        itens.append(item)
    return {"itens": itens}


@router.post("/recebidas/vistas")
def marcar_vistas(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    db.query(EnvioDestinatario).filter(EnvioDestinatario.destinatario_id == usuario.id,
                                       EnvioDestinatario.visto_em.is_(None)).update(
        {EnvioDestinatario.visto_em: func.now()}, synchronize_session=False)
    db.commit()
    return {"mensagem": "ok"}


@router.get("/meus")
def meus_envios(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    refs = (db.query(OrthancReference)
            .filter(OrthancReference.enviado_por_id == usuario.id, OrthancReference.ativo.is_(True))
            .order_by(OrthancReference.id.desc()).limit(500).all())
    return {"itens": [_item(db, r) for r in refs]}


@router.get("/para-analisar")
def para_analisar(usuario: User = Depends(exigir_perfis(*PERFIS_QUE_ANALISAM)), db: Session = Depends(get_db)):
    refs = (db.query(OrthancReference)
            .filter(OrthancReference.destino == DestinoImagem.ANALISE.value,
                    OrthancReference.analise_destinatario_id == usuario.id,
                    OrthancReference.ativo.is_(True))
            .order_by(OrthancReference.analise_em.asc()).limit(500).all())
    return {"itens": [_item(db, r) for r in refs]}


@router.get("/analistas")
def analistas(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """Professores e curadores ativos (nome e perfil; o e-mail nao sai)."""
    pessoas = (db.query(User)
               .filter(User.perfil.in_(PERFIS_QUE_ANALISAM), User.ativo.is_(True),
                       User.excluido.is_(False), User.bloqueado.isnot(True), User.id != usuario.id)
               .order_by(User.nome).limit(500).all())
    return {"pessoas": [{"id": p.id, "nome": p.nome, "perfil": _perfil(p)} for p in pessoas]}


class PedidoAnalise(BaseModel):
    analista_id: int = Field(ge=1)
    nota: TextoMedio | None = None


@router.post("/{imagem_id}/analise")
def pedir_analise(imagem_id: int, pedido: PedidoAnalise, usuario: User = Depends(obter_usuario_atual),
                  db: Session = Depends(get_db)):
    """O dono manda uma imagem "so para mim" (ou devolvida) para analise."""
    ref = _buscar(db, imagem_id)
    if ref.enviado_por_id != usuario.id:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")
    if ref.destino != DestinoImagem.PESSOAL.value:
        raise HTTPException(status_code=409, detail="So uma imagem sua que nao esta na fila nem em analise pode ser enviada.")
    pessoa = _analista_valido(db, pedido.analista_id, usuario)
    ref.destino = DestinoImagem.ANALISE.value
    ref.analise_destinatario_id = pessoa.id
    ref.analise_nota = _nota(pedido.nota)
    ref.analise_em = func.now()
    ref.devolucao_nota = None
    _auditar(db, usuario, "imagem_enviada_analise", ref, f"para usuario_id={pessoa.id}")
    db.commit()
    return {"mensagem": f"Imagem enviada para {pessoa.nome} analisar."}


class Decisao(BaseModel):
    acao: Literal["fila", "devolver"]
    nota: TextoMedio | None = None


@router.post("/{imagem_id}/decidir")
def decidir_analise(imagem_id: int, decisao: Decisao,
                    usuario: User = Depends(exigir_perfis(*PERFIS_QUE_ANALISAM)), db: Session = Depends(get_db)):
    """Quem analisa coloca a imagem na fila de curadoria ou a devolve ao dono."""
    ref = _buscar(db, imagem_id)
    if ref.destino != DestinoImagem.ANALISE.value or ref.analise_destinatario_id != usuario.id:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada na sua lista para analisar.")
    nota = _nota(decisao.nota)
    if decisao.acao == "fila":
        ref.destino = DestinoImagem.FILA.value
        _auditar(db, usuario, "imagem_analise_para_fila", ref, "colocada na fila de curadoria")
        mensagem = "Imagem colocada na fila de curadoria."
    else:
        if not nota:
            raise HTTPException(status_code=422, detail="Escreva um recado dizendo por que a imagem foi devolvida.")
        ref.destino = DestinoImagem.PESSOAL.value
        ref.devolucao_nota = nota
        _auditar(db, usuario, "imagem_analise_devolvida", ref, "devolvida ao estudante com recado")
        mensagem = "Imagem devolvida com o seu recado."
    db.commit()
    return {"mensagem": mensagem}


@router.delete("/{imagem_id}")
def retirar_imagem(imagem_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    """O dono retira uma imagem SO SUA (fica desativada, nada e apagado do Orthanc)."""
    ref = _buscar(db, imagem_id)
    if ref.enviado_por_id != usuario.id:
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")
    if ref.destino != DestinoImagem.PESSOAL.value:
        raise HTTPException(status_code=409, detail="Imagem na fila ou em analise nao pode ser retirada por aqui.")
    ref.ativo = False
    _auditar(db, usuario, "imagem_pessoal_retirada", ref, "retirada pelo dono (desativada)")
    db.commit()
    return {"mensagem": "Imagem retirada."}


@router.get("/{imagem_id}/preview")
def miniatura(imagem_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    ref = _buscar(db, imagem_id)
    if not (visivel_para(ref, usuario.id, _perfil(usuario)) or recebeu(db, ref, usuario.id)):
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")
    conteudo = orthanc_client.obter_preview_instancia(ref.orthanc_id)
    return Response(content=conteudo, media_type="image/png",
                    headers={"Content-Disposition": disposicao_de_arquivo(f"radix-imago-imagem-{ref.id}.png"),
                             "Cache-Control": "private, no-store"})
