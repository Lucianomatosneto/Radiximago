"""
RECONSTRUCAO PANORAMICA DA TOMOGRAFIA - rotas (pedido do Luciano,
23/11/2026). Para VISUALIZAR e ENSINAR (decisao dele): as imagens geradas
viram series novas DENTRO do estudo da tomografia; nao entram na fila de
curadoria nem na pesquisa como radiografia.

- GET  /reconstrucao/{ref}/geometria  -> medidas da tomografia (tela de tracar)
- GET  /reconstrucao/{ref}/axial.png  -> corte axial (MIP de uma faixa) para
                                         clicar os pontos da arcada
- GET  /reconstrucao/{ref}/plano.png  -> um corte axial, sagital ou coronal,
                                         para MARCAR a lesao no corte (23/11/2026)
- POST /reconstrucao/{ref}            -> gera a panoramica e os cortes
                                         transversais e grava no Orthanc
- GET  /reconstrucao/{ref}/lista      -> reconstrucoes ja feitas desse exame
- GET  /reconstrucao/{ref}/{rec}/panoramica(.png) -> a panoramica gerada,
                                         para marcar o canal mandibular
- POST /reconstrucao/{ref}/{rec}/canal -> desenha o canal na panoramica e nos
                                         cortes (series novas; 23/11/2026)

Quem pode: curador e administrador (quem escreve na curadoria). Ver as
series geradas segue a regra do estudo (portaria do visualizador).
Uma reconstrucao por vez no servidor (TRAVA): o calculo usa memoria e CPU,
e o resto do Radix nao pode ficar lento por causa dele.
"""

from __future__ import annotations

import io
import threading
from datetime import datetime, timezone
from typing import Literal

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
from app.modules.reconstrucao import canal as desenho_canal
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
# canal mandibular desenhado: panoramica = 9501, 9503...; cortes = 9502, 9504...
SERIE_BASE_CANAL = 9501
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


@router.get("/{ref_id}/plano.png")
def obter_plano(
    ref_id: int,
    plano: Literal["axial", "sagital", "coronal"] = Query(...),
    indice: int = Query(..., ge=0, le=100000),
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
    db: Session = Depends(get_db),
):
    """Um corte de um plano (axial, sagital ou coronal), para o curador marcar
    a lesao no corte onde ela aparece melhor (pedido do Luciano, 23/11/2026)."""
    g = _geometria(_exame(db, ref_id, usuario))
    try:
        img = fonte.imagem_do_plano(g, plano, indice)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    saida = io.BytesIO()
    Image.fromarray(img).save(saida, format="PNG")
    return Response(
        content=saida.getvalue(),
        media_type="image/png",
        headers={
            "Content-Disposition": disposicao_de_arquivo(f"radix-imago-tomografia-{ref_id}-{plano}-{indice}.png"),
            "Cache-Control": "private, max-age=300",
        },
    )


@router.get("/{ref_id}/axial.png")
def obter_axial(
    ref_id: int,
    altura_mm: float = Query(..., ge=0),
    espessura_mm: float = Query(10.0, ge=0, le=40),
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
    db: Session = Depends(get_db),
):
    g = _geometria(_exame(db, ref_id, usuario))
    # 23/11/2026: com o volume pronto na memoria, o corte sai na hora (a roda
    # do mouse passa os cortes sem esperar o Orthanc); senao, o caminho lento
    # e o volume comeca a ser montado em segundo plano
    try:
        escala = fonte.axial_da_memoria(g, altura_mm, espessura_mm)
        if escala is None:
            fonte.preparar_volume(g)
            img = fonte.corte_axial_mip(g, altura_mm, espessura_mm)
            baixo, alto = np.percentile(img, [1, 99.7])
            escala = np.clip((img - baixo) / max(float(alto - baixo), 1.0) * 255, 0, 255).astype(np.uint8)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
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
            "canal": ({"tracados": r.canal.get("tracados"), "criado_em": r.canal.get("criado_em")} if r.canal else None),
        }
        for r in linhas
    ]


# --------------------------------------------------------------------- canal mandibular
def _reconstrucao(db: Session, ref_id: int, rec_id: int, usuario: User) -> tuple[OrthancReference, ReconstrucaoTomografia]:
    ref = _exame(db, ref_id, usuario)
    rec = db.query(ReconstrucaoTomografia).filter(
        ReconstrucaoTomografia.id == rec_id, ReconstrucaoTomografia.orthanc_reference_id == ref.id
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Reconstrução não encontrada.")
    return ref, rec


def _ler_derivada(orthanc_id: str):
    try:
        return fonte.ler_corte(orthanc_id)
    except Exception as erro:  # noqa: BLE001 - instancia apagada do Orthanc
        raise HTTPException(status_code=409, detail="As imagens desta reconstrução não estão mais no Orthanc; gere de novo.") from erro


@router.get("/{ref_id}/{rec_id}/panoramica")
def obter_panoramica(ref_id: int, rec_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
                     db: Session = Depends(get_db)):
    _, rec = _reconstrucao(db, ref_id, rec_id, usuario)
    pano = fonte.ler_corte(rec.instancias_orthanc[0], so_cabecalho=True)
    return {
        "largura": int(pano.Columns),
        "altura": int(pano.Rows),
        "tamanho_pixel_mm": rec.tamanho_pixel_mm,
        "canal": {"tracados": rec.canal.get("tracados")} if rec.canal else None,
    }


@router.get("/{ref_id}/{rec_id}/panoramica.png")
def obter_panoramica_png(ref_id: int, rec_id: int, usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
                         db: Session = Depends(get_db)):
    _, rec = _reconstrucao(db, ref_id, rec_id, usuario)
    cinza = desenho_canal.em_rgb(_ler_derivada(rec.instancias_orthanc[0]).pixel_array.astype(np.float32))[:, :, 0]
    saida = io.BytesIO()
    Image.fromarray(cinza).save(saida, format="PNG")
    return Response(
        content=saida.getvalue(),
        media_type="image/png",
        headers={
            "Content-Disposition": disposicao_de_arquivo(f"radix-imago-tomografia-{ref_id}-panoramica-{rec_id}.png"),
            "Cache-Control": "private, max-age=300",
        },
    )


class PedidoCanal(BaseModel):
    # ate 2 tracados (os dois lados); pontos em PIXELS da panoramica (coluna, linha)
    tracados: list[list[tuple[float, float]]] = Field(..., min_length=1, max_length=desenho_canal.MAX_TRACADOS)


@router.post("/{ref_id}/{rec_id}/canal", status_code=201)
def marcar_canal(
    ref_id: int,
    rec_id: int,
    pedido: PedidoCanal,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
    db: Session = Depends(get_db),
):
    ref, rec = _reconstrucao(db, ref_id, rec_id, usuario)
    if not TRAVA.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Há outra reconstrução em andamento no servidor; tente de novo em instantes.")
    try:
        pano_ds = _ler_derivada(rec.instancias_orthanc[0])
        pano = pano_ds.pixel_array.astype(np.float32)
        altura, largura = pano.shape
        try:
            tracados = [desenho_canal.linha_do_canal(t, largura, altura) for t in pedido.tracados]
        except ValueError as erro:
            raise HTTPException(status_code=422, detail=str(erro)) from erro
        params = rec.parametros or {}
        passo = float(rec.tamanho_pixel_mm)
        intervalo = float(params.get("intervalo_mm", 1.0))
        meia_faixa = max(1, int(round(float(params.get("espessura_mm", 10.0)) / 2 / passo)))

        anteriores = [r.canal.get("numero_serie", 0) for r in db.query(ReconstrucaoTomografia).filter(
            ReconstrucaoTomografia.orthanc_reference_id == ref.id, ReconstrucaoTomografia.canal.isnot(None)).all()]
        numero = max([SERIE_BASE_CANAL - 2, *anteriores]) + 2
        uid_pano, uid_cortes = generate_uid(), generate_uid()
        n_tracados = len(pedido.tracados)
        derivacao = (
            f"Canal mandibular marcado por curador (Radix Imago) sobre a panoramica reconstruida "
            f"{rec.serie_panoramica_uid}: {n_tracados} tracado(s). Material de ensino, nao diagnostico."
        )
        enviados = [orthanc_client.enviar_instancia(gerar_instancia(
            pano_ds, desenho_canal.panoramica_com_canal(pano, pedido.tracados), passo, uid_pano, numero,
            "RADIX - Panorâmica com canal (TC)", 1, derivacao,
        ))["ID"]]
        for i, oid in enumerate(rec.instancias_orthanc[1:1 + rec.total_cortes], start=1):
            corte = _ler_derivada(oid)
            coluna = desenho_canal.coluna_do_corte(i, intervalo, passo, largura)
            marcas = desenho_canal.alturas_na_coluna(tracados, coluna)
            enviados.append(orthanc_client.enviar_instancia(gerar_instancia(
                corte, desenho_canal.corte_com_canal(corte.pixel_array.astype(np.float32), marcas, meia_faixa), passo,
                uid_cortes, numero + 1, "RADIX - Cortes com canal (TC)", i,
                "Corte transversal com a ALTURA do canal mandibular marcada sobre a faixa da panoramica "
                "(a panoramica nao define a posicao vestibulolingual do canal).",
                comentario=str(getattr(corte, "ImageComments", "")),
            ))["ID"])
        rec.canal = {
            "tracados": [[list(p) for p in t] for t in pedido.tracados],
            "serie_panoramica_uid": uid_pano,
            "serie_cortes_uid": uid_cortes,
            "numero_serie": numero,
            "criado_por_id": usuario.id,
            "criado_em": datetime.now(timezone.utc).isoformat(),
        }
        rec.instancias_orthanc = [*rec.instancias_orthanc, *enviados]
        db.add(AuditLog(
            usuario_id=usuario.id, acao="marcacao_canal_mandibular", entidade="orthanc_reference", entidade_id=ref.id,
            resultado="sucesso",
            detalhes=(f"Canal mandibular ({n_tracados} tracado(s)) desenhado na reconstrucao {rec.id}: "
                      f"series {numero} e {numero + 1} ({len(enviados) - 1} cortes)."),
        ))
        db.commit()
        return {
            "id": rec.id,
            "serie_panoramica_uid": uid_pano,
            "serie_cortes_uid": uid_cortes,
            "total_cortes": len(enviados) - 1,
        }
    finally:
        TRAVA.release()


def instancias_derivadas(db: Session) -> set[str]:
    """IDs (Orthanc) de todas as instancias geradas por reconstrucao - a
    sincronizacao com o Orthanc nao as importa como imagens novas."""
    ids: set[str] = set()
    for (lista,) in db.query(ReconstrucaoTomografia.instancias_orthanc).all():
        ids.update(lista or [])
    return ids


# --------------------------------------------------------------------- exportacao
class AvisoExportacao(BaseModel):
    """quantas marcacoes e medidas foram no arquivo JSON"""
    marcacoes: int = Field(..., ge=0, le=10000)
    medidas: int = Field(..., ge=0, le=10000)


@router.post("/{ref_id}/exportacao", status_code=201)
def registrar_exportacao(
    ref_id: int,
    aviso: AvisoExportacao,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA_ESCRITA)),
    db: Session = Depends(get_db),
):
    """EXPORTACAO NA AUDITORIA (pedido do Luciano, 24/11/2026: "registrar
    auditoria"): o arquivo JSON das marcacoes da tomografia e montado no
    navegador; antes de baixar, a tela avisa aqui e fica registrado quem
    exportou, de qual exame e quantas marcacoes e medidas. Sem o registro, a
    tela nao baixa o arquivo."""
    ref = _exame(db, ref_id, usuario)
    db.add(AuditLog(
        usuario_id=usuario.id, acao="exportacao_marcacoes_tc", entidade="orthanc_reference", entidade_id=ref.id,
        resultado="sucesso",
        detalhes=f"Exportação JSON das marcações da tomografia: {aviso.marcacoes} marcações e {aviso.medidas} medidas.",
    ))
    db.commit()
    return {"registrado": True}
