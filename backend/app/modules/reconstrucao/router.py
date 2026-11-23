"""
RECONSTRUCAO PANORAMICA DA TOMOGRAFIA - rotas (pedido do Luciano,
23/11/2026). Para VISUALIZAR e ENSINAR (decisao dele): as imagens geradas
viram series novas DENTRO do estudo da tomografia; nao entram na fila de
curadoria nem na pesquisa como radiografia.

- GET  /reconstrucao/{ref}/geometria  -> medidas da tomografia (tela de tracar)
- GET  /reconstrucao/{ref}/axial.png  -> corte axial (MIP de uma faixa) para
                                         clicar os pontos da arcada
- POST /reconstrucao/{ref}            -> gera a panoramica e os cortes
                                         transversais e grava no Orthanc
- GET  /reconstrucao/{ref}/lista      -> reconstrucoes ja feitas desse exame

Quem pode: curador e administrador (quem escreve na curadoria). Ver as
series geradas segue a regra do estudo (portaria do visualizador).
Uma reconstrucao por vez no servidor (TRAVA): o calculo usa memoria e CPU,
e o resto do Radix nao pode ficar lento por causa dele.
"""

from __future__ import annotations

import io
import threading

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from PIL import Image
from pydantic import BaseModel, Field
from pydicom.uid import generate_uid
from sqlalchemy.orm import Session

from app.core.cabecalhos import disposicao_de_arquivo
from app.core.database import get_db
from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog
from app.modules.auth import PERFIS_CURADORIA_ESCRITA, exigir_perfis
from app.modules.orthanc_references import OrthancReference, visivel_para
from app.modules.reconstrucao import fonte
from app.modules.reconstrucao.dicom_derivado import gerar_instancia
from app.modules.reconstrucao.modelo import ReconstrucaoTomografia
from app.modules.reconstrucao.motor import (
    ESPESSURA_MAX,
    ESPESSURA_MIN,
    INTERVALO_MAX,
    INTERVALO_MIN,
    LARGURA_MAX,
    LARGURA_MIN,
    cortes_transversais,
    panoramica,
)
from app.modules.users import User

router = APIRouter(prefix="/reconstrucao", tags=["Reconstrução panorâmica (tomografia)"])

# uma reconstrucao por vez no servidor
TRAVA = threading.Lock()
# serie da panoramica = 9001, 9003...; cortes = 9002, 9004... (uma dupla por reconstrucao)
SERIE_BASE = 9001
MARGEM_MM = 5.0  # folga ao redor da curva no recorte do volume


def _perfil(usuario: User) -> str:
    return usuario.perfil.value if hasattr(usuario.perfil, "value") else str(usuario.perfil)


def _exame(db: Session, ref_id: int, usuario: User) -> OrthancReference:
    ref = db.query(OrthancReference).filter(OrthancReference.id == ref_id, OrthancReference.ativo.is_(True)).first()
    if not ref or not visivel_para(ref, usuario.id, _perfil(usuario)):
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return ref


def _geometria(ref: OrthancReference) -> fonte.Geometria:
    try:
        return fonte.geometria(ref.orthanc_id)
    except ValueError as erro:  # NaoETomografia e multi-frame
        raise HTTPException(status_code=422, detail=str(erro)) from erro


@router.get("/{ref_id}/geometria")
def obter_geometria(ref_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)), db: Session = Depends(get_db)):
    g = _geometria(_exame(db, ref_id, usuario))
    dz, dy, dx = g.espacamento
    return {
        "cortes": len(g.ids),
        "linhas": g.linhas,
        "colunas": g.colunas,
        "espacamento_mm": [dz, dy, dx],
        "altura_mm": (len(g.ids) - 1) * dz,
        "limites": {
            "espessura_mm": [ESPESSURA_MIN, ESPESSURA_MAX],
            "intervalo_mm": [INTERVALO_MIN, INTERVALO_MAX],
            "largura_mm": [LARGURA_MIN, LARGURA_MAX],
        },
    }


@router.get("/{ref_id}/axial.png")
def obter_axial(
    ref_id: int,
    altura_mm: float = Query(..., ge=0),
    espessura_mm: float = Query(10.0, ge=0, le=40),
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
    db: Session = Depends(get_db),
):
    g = _geometria(_exame(db, ref_id, usuario))
    try:
        img = fonte.corte_axial_mip(g, altura_mm, espessura_mm)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    baixo, alto = np.percentile(img, [1, 99.7])
    escala = np.clip((img - baixo) / max(float(alto - baixo), 1.0) * 255, 0, 255).astype(np.uint8)
    saida = io.BytesIO()
    Image.fromarray(escala).save(saida, format="PNG")
    return Response(
        content=saida.getvalue(),
        media_type="image/png",
        headers={
            "Content-Disposition": disposicao_de_arquivo(f"radix-imago-tomografia-{ref_id}-axial.png"),
            "Cache-Control": "private, max-age=300",
        },
    )


class PedidoReconstrucao(BaseModel):
    # pontos clicados no corte axial, em PIXELS (coluna, linha)
    pontos_px: list[tuple[float, float]] = Field(..., min_length=3, max_length=60)
    espessura_mm: float = Field(10.0, ge=ESPESSURA_MIN, le=ESPESSURA_MAX)
    intervalo_mm: float = Field(1.0, ge=INTERVALO_MIN, le=INTERVALO_MAX)
    largura_mm: float = Field(40.0, ge=LARGURA_MIN, le=LARGURA_MAX)


@router.post("/{ref_id}", status_code=201)
def gerar_reconstrucao(
    ref_id: int,
    pedido: PedidoReconstrucao,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
    db: Session = Depends(get_db),
):
    ref = _exame(db, ref_id, usuario)
    if not TRAVA.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Há outra reconstrução em andamento no servidor; tente de novo em instantes.")
    try:
        g = _geometria(ref)
        dz, dy, dx = g.espacamento
        pontos = np.array(pedido.pontos_px, dtype=np.float64)
        if np.any(pontos[:, 0] < 0) or np.any(pontos[:, 0] > g.colunas - 1) or np.any(pontos[:, 1] < 0) or np.any(pontos[:, 1] > g.linhas - 1):
            raise HTTPException(status_code=422, detail="Há pontos fora do corte axial; marque a arcada dentro da imagem.")
        # recorte do volume: a regiao da curva + a faixa/largura + folga
        folga_mm = max(pedido.espessura_mm, pedido.largura_mm) / 2 + MARGEM_MM
        l0 = int(np.floor(pontos[:, 1].min() - folga_mm / dy))
        l1 = int(np.ceil(pontos[:, 1].max() + folga_mm / dy)) + 1
        c0 = int(np.floor(pontos[:, 0].min() - folga_mm / dx))
        c1 = int(np.ceil(pontos[:, 0].max() + folga_mm / dx)) + 1
        l0, c0 = max(0, l0), max(0, c0)
        try:
            volume = fonte.carregar_volume(g, (l0, l1, c0, c1))
            # pontos em mm a partir do canto do recorte
            pontos_mm = [((c - c0) * dx, (r - l0) * dy) for c, r in pontos]
            pano, passo = panoramica(volume, pontos_mm, espessura_mm=pedido.espessura_mm)
            cortes, _ = cortes_transversais(volume, pontos_mm, intervalo_mm=pedido.intervalo_mm,
                                            largura_mm=pedido.largura_mm, passo_mm=passo)
        except ValueError as erro:
            raise HTTPException(status_code=422, detail=str(erro)) from erro
        del volume

        anteriores = db.query(ReconstrucaoTomografia).filter(ReconstrucaoTomografia.orthanc_reference_id == ref.id).count()
        numero_pano = SERIE_BASE + 2 * anteriores
        uid_pano, uid_cortes = generate_uid(), generate_uid()
        parametros = {
            "pontos_px": [list(p) for p in pedido.pontos_px],
            "espessura_mm": pedido.espessura_mm,
            "intervalo_mm": pedido.intervalo_mm,
            "largura_mm": pedido.largura_mm,
            "tamanho_pixel_mm": passo,
        }
        derivacao = (
            f"Reconstrucao panoramica (Radix Imago) da serie {g.primeiro.SeriesInstanceUID}: curva por "
            f"{len(pedido.pontos_px)} pontos, faixa de {pedido.espessura_mm:g} mm (media), pixel {passo:g} mm."
        )
        enviados = [orthanc_client.enviar_instancia(gerar_instancia(
            g.primeiro, pano, passo, uid_pano, numero_pano, "RADIX - Panorâmica reconstruída (TC)", 1, derivacao,
        ))["ID"]]
        for i, corte in enumerate(cortes, start=1):
            enviados.append(orthanc_client.enviar_instancia(gerar_instancia(
                g.primeiro, corte, passo, uid_cortes, numero_pano + 1, "RADIX - Cortes transversais (TC)", i,
                f"Corte transversal a arcada (Radix Imago), da lingual (esquerda) para a vestibular (direita); "
                f"largura {pedido.largura_mm:g} mm, a cada {pedido.intervalo_mm:g} mm.",
                comentario=f"Corte {i}: {(i - 1) * pedido.intervalo_mm:g} mm ao longo da arcada (do 1º ponto marcado).",
            ))["ID"])
        rec = ReconstrucaoTomografia(
            orthanc_reference_id=ref.id, criado_por_id=usuario.id, parametros=parametros,
            serie_panoramica_uid=uid_pano, serie_cortes_uid=uid_cortes, total_cortes=len(cortes),
            tamanho_pixel_mm=passo, instancias_orthanc=enviados,
        )
        db.add(rec)
        db.add(AuditLog(
            usuario_id=usuario.id, acao="reconstrucao_panoramica", entidade="orthanc_reference", entidade_id=ref.id,
            resultado="sucesso",
            detalhes=(f"Panoramica + {len(cortes)} cortes transversais gerados (series {numero_pano} e {numero_pano + 1}); "
                      f"faixa {pedido.espessura_mm:g} mm, intervalo {pedido.intervalo_mm:g} mm, largura {pedido.largura_mm:g} mm."),
        ))
        db.commit()
        db.refresh(rec)
        return {
            "id": rec.id,
            "serie_panoramica_uid": uid_pano,
            "serie_cortes_uid": uid_cortes,
            "total_cortes": len(cortes),
            "tamanho_pixel_mm": passo,
        }
    finally:
        TRAVA.release()


@router.get("/{ref_id}/lista")
def listar_reconstrucoes(ref_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)), db: Session = Depends(get_db)):
    ref = _exame(db, ref_id, usuario)
    linhas = (
        db.query(ReconstrucaoTomografia)
        .filter(ReconstrucaoTomografia.orthanc_reference_id == ref.id)
        .order_by(ReconstrucaoTomografia.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "criado_em": r.criado_em.isoformat() if r.criado_em else None,
            "serie_panoramica_uid": r.serie_panoramica_uid,
            "serie_cortes_uid": r.serie_cortes_uid,
            "total_cortes": r.total_cortes,
            "tamanho_pixel_mm": r.tamanho_pixel_mm,
            "parametros": r.parametros,
        }
        for r in linhas
    ]


def instancias_derivadas(db: Session) -> set[str]:
    """IDs (Orthanc) de todas as instancias geradas por reconstrucao - a
    sincronizacao com o Orthanc nao as importa como imagens novas."""
    ids: set[str] = set()
    for (lista,) in db.query(ReconstrucaoTomografia.instancias_orthanc).all():
        ids.update(lista or [])
    return ids
