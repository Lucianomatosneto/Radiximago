"""
ANEXOS DA CURADORIA (08/11/2026, pedido do Luciano).

Na caixa "Achados" o curador pode ligar "Informacoes adicionais": um texto
livre e um clipe para anexar imagens (fotos clinicas, esquemas, outra
radiografia...). Nada disso entra na Pesquisa avancada; so aparece para quem
ABRE a imagem curada (icone de clipe no visualizador).

Cuidados:
- os arquivos ficam FORA da pasta publica /uploads (que e servida sem
  login): pasta propria (settings.ANEXOS_DIR), entregue so pela API, com
  login e conferencia de perfil;
- toda imagem e REGRAVADA pelo servidor (Pillow): sai sem metadados (EXIF,
  GPS, modelo do celular) e sem nada escondido no arquivo; so JPEG/PNG/WebP;
- limites: 10 MB por arquivo, ate 10 anexos por ficha, lado maior ate
  4000 px;
- a tela avisa para NAO anexar imagem com nome, data ou numero do paciente
  (o anexo NAO passa pela anonimizacao automatica do DICOM);
- tudo na auditoria (anexo_curadoria_adicionado / anexo_curadoria_removido).

Quem faz o que:
- acrescentar e remover: quem pode EDITAR a ficha (curador, administrador e
  o professor no rascunho dele) - mesmas regras de conferir_acesso_ficha;
- ver na curadoria: quem pode LER a ficha;
- ver na imagem curada: qualquer usuario com login, so de ficha APROVADA.
"""

from __future__ import annotations

import io
import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.rate_limit import limiter
from app.modules.audit_logs import AuditLog
from app.modules.auth import PERFIS_FICHA_ESCRITA, PERFIS_FICHA_LEITURA, exigir_perfis, obter_usuario_atual
from app.modules.users import User

logger = logging.getLogger(__name__)

TAMANHO_MAX = 10 * 1024 * 1024
MAX_ANEXOS = 10
LADO_MAX = 4000
NOME_MAX = 120
FORMATOS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}


class AnexoCuradoria(Base):
    __tablename__ = "anexos_curadoria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    curation_id: Mapped[int] = mapped_column(Integer, ForeignKey("curations.id", ondelete="CASCADE"), nullable=False, index=True)
    nome_original: Mapped[str] = mapped_column(String(NOME_MAX), nullable=False)
    arquivo: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)  # nome sorteado no disco
    tipo_mime: Mapped[str] = mapped_column(String(30), nullable=False)
    tamanho: Mapped[int] = mapped_column(Integer, nullable=False)
    largura: Mapped[int | None] = mapped_column(Integer, nullable=True)
    altura: Mapped[int | None] = mapped_column(Integer, nullable=True)
    criado_por_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())


def pasta_anexos() -> Path:
    pasta = Path(settings.ANEXOS_DIR)
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def _nome_limpo(nome: str | None) -> str:
    base = os.path.basename(nome or "imagem")
    base = re.sub(r"[^\w.\- ()]+", "_", base, flags=re.UNICODE).strip() or "imagem"
    return base[:NOME_MAX]


def _regravar(conteudo: bytes) -> tuple[bytes, str, str, int, int]:
    """Abre, confere e regrava a imagem sem metadados. Devolve (bytes, mime, extensao, largura, altura)."""
    try:
        with Image.open(io.BytesIO(conteudo)) as im:
            formato = (im.format or "").upper()
            if formato not in FORMATOS:
                raise HTTPException(status_code=422, detail="Só imagens JPEG, PNG ou WebP podem ser anexadas.")
            im.load()
            im = ImageOps.exif_transpose(im)  # respeita a rotacao do celular antes de tirar o EXIF
            if max(im.size) > LADO_MAX:
                im.thumbnail((LADO_MAX, LADO_MAX))
            if formato == "JPEG" and im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            saida = io.BytesIO()
            opcoes = {"quality": 90} if formato in ("JPEG", "WEBP") else {}
            im.save(saida, format=formato, **opcoes)  # sem exif=, sem info: metadados ficam para tras
            mime, ext = FORMATOS[formato]
            return saida.getvalue(), mime, ext, im.size[0], im.size[1]
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=422, detail="O arquivo não é uma imagem válida.")


def _saida(a: AnexoCuradoria) -> dict:
    return {"id": a.id, "nome": a.nome_original, "tipo": a.tipo_mime, "tamanho": a.tamanho,
            "largura": a.largura, "altura": a.altura,
            "criado_em": a.criado_em.isoformat() if a.criado_em else None}


def anexos_da_ficha(db: Session, curation_id: int) -> list[AnexoCuradoria]:
    return db.query(AnexoCuradoria).filter(AnexoCuradoria.curation_id == curation_id).order_by(AnexoCuradoria.id).all()


def contar_por_ficha(db: Session, curation_ids: list[int]) -> dict[int, int]:
    if not curation_ids:
        return {}
    from sqlalchemy import func as f
    return dict(db.query(AnexoCuradoria.curation_id, f.count(AnexoCuradoria.id))
                .filter(AnexoCuradoria.curation_id.in_(curation_ids)).group_by(AnexoCuradoria.curation_id).all())


def _arquivo(a: AnexoCuradoria) -> Response:
    caminho = pasta_anexos() / a.arquivo
    if not caminho.is_file():
        raise HTTPException(status_code=404, detail="Arquivo do anexo não encontrado.")
    return Response(content=caminho.read_bytes(), media_type=a.tipo_mime,
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                             "Content-Disposition": "inline"})


def _do_anexo(db: Session, curation_id: int, anexo_id: int) -> AnexoCuradoria:
    a = db.get(AnexoCuradoria, anexo_id)
    if not a or a.curation_id != curation_id:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")
    return a


# --- rotas da Curadoria -------------------------------------------------------

router_curadoria = APIRouter(prefix="/curation", tags=["Curadoria - anexos"])


def _ficha(db: Session, curation_id: int, usuario: User, escrita: bool):
    from app.modules.curation.common import _buscar_ficha  # evita import circular
    return _buscar_ficha(db, curation_id, usuario, escrita=escrita)


@router_curadoria.get("/{curation_id}/anexos")
def listar_anexos(curation_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
                  db: Session = Depends(get_db)):
    _ficha(db, curation_id, usuario, escrita=False)
    return {"anexos": [_saida(a) for a in anexos_da_ficha(db, curation_id)], "maximo": MAX_ANEXOS}


@router_curadoria.post("/{curation_id}/anexos")
@limiter.limit("30/minute")
async def acrescentar_anexo(request: Request, curation_id: int, arquivo: UploadFile = File(...),
                            usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_ESCRITA)),
                            db: Session = Depends(get_db)):
    ficha = _ficha(db, curation_id, usuario, escrita=True)
    if len(anexos_da_ficha(db, ficha.id)) >= MAX_ANEXOS:
        raise HTTPException(status_code=422, detail=f"Cada ficha aceita até {MAX_ANEXOS} anexos.")
    conteudo = await arquivo.read(TAMANHO_MAX + 1)
    if not conteudo:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")
    if len(conteudo) > TAMANHO_MAX:
        raise HTTPException(status_code=413, detail="Arquivo maior que 10 MB.")
    dados, mime, ext, largura, altura = _regravar(conteudo)
    nome_disco = f"{uuid.uuid4().hex}.{ext}"
    (pasta_anexos() / nome_disco).write_bytes(dados)
    a = AnexoCuradoria(curation_id=ficha.id, nome_original=_nome_limpo(arquivo.filename), arquivo=nome_disco,
                       tipo_mime=mime, tamanho=len(dados), largura=largura, altura=altura, criado_por_id=usuario.id)
    db.add(a)
    db.flush()
    db.add(AuditLog(usuario_id=usuario.id, acao="anexo_curadoria_adicionado", entidade="curation",
                    entidade_id=ficha.id, resultado="sucesso",
                    detalhes=f"Anexo {a.id} ({mime}, {largura}x{altura}) acrescentado à ficha."))
    db.commit()
    return _saida(a)


@router_curadoria.delete("/{curation_id}/anexos/{anexo_id}")
def remover_anexo(curation_id: int, anexo_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_ESCRITA)),
                  db: Session = Depends(get_db)):
    _ficha(db, curation_id, usuario, escrita=True)
    a = _do_anexo(db, curation_id, anexo_id)
    caminho = pasta_anexos() / a.arquivo
    db.delete(a)
    db.add(AuditLog(usuario_id=usuario.id, acao="anexo_curadoria_removido", entidade="curation",
                    entidade_id=curation_id, resultado="sucesso", detalhes=f"Anexo {anexo_id} removido da ficha."))
    db.commit()
    try:
        caminho.unlink(missing_ok=True)
    except OSError:
        logger.warning("Anexo %s: arquivo nao pode ser apagado do disco.", anexo_id)
    return {"removido": anexo_id}


@router_curadoria.get("/{curation_id}/anexos/{anexo_id}/arquivo")
def arquivo_na_curadoria(curation_id: int, anexo_id: int,
                         usuario: User = Depends(exigir_perfis(*PERFIS_FICHA_LEITURA)),
                         db: Session = Depends(get_db)):
    _ficha(db, curation_id, usuario, escrita=False)
    return _arquivo(_do_anexo(db, curation_id, anexo_id))


# --- rotas da imagem curada (qualquer usuario com login, so aprovada) ---------

router_pesquisa = APIRouter(prefix="/search", tags=["Pesquisa - anexos"])


def _aprovada(db: Session, curation_id: int):
    from app.modules.search_router import _buscar_ficha_aprovada  # evita import circular
    return _buscar_ficha_aprovada(db, curation_id)


@router_pesquisa.get("/{curation_id}/anexos")
def anexos_da_imagem(curation_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    ficha = _aprovada(db, curation_id)
    return {"informacoes_adicionais": ficha.informacoes_adicionais or "",
            "anexos": [_saida(a) for a in anexos_da_ficha(db, ficha.id)]}


@router_pesquisa.get("/{curation_id}/anexos/{anexo_id}/arquivo")
def arquivo_da_imagem(curation_id: int, anexo_id: int, usuario: User = Depends(obter_usuario_atual),
                      db: Session = Depends(get_db)):
    ficha = _aprovada(db, curation_id)
    return _arquivo(_do_anexo(db, ficha.id, anexo_id))
