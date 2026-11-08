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
- GET    /envios/{id}/preview         miniatura (dono, quem analisa, curadoria)

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
from app.modules.curations import Curation
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
    }


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
    usuario: User = Depends(exigir_perfis(*PERFIS_QUE_ENVIAM)),
    db: Session = Depends(get_db),
):
    """Arquivo DICOM ou foto (JPG/PNG/WebP). A foto vira DICOM antes de entrar."""
    if destino not in DESTINOS_POR_PERFIL.get(usuario.perfil, set()):
        raise HTTPException(status_code=422, detail="Destino nao permitido para o seu perfil.")
    nota_limpa = _nota(nota)
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
    resultado["destino"] = destino
    resultado["foto_convertida"] = era_foto
    return resultado


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
    if not visivel_para(ref, usuario.id, _perfil(usuario)):
        raise HTTPException(status_code=404, detail="Imagem nao encontrada.")
    conteudo = orthanc_client.obter_preview_instancia(ref.orthanc_id)
    return Response(content=conteudo, media_type="image/png",
                    headers={"Content-Disposition": disposicao_de_arquivo(f"radix-imago-imagem-{ref.id}.png"),
                             "Cache-Control": "private, no-store"})
