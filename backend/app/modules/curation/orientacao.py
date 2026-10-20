"""
Giro da imagem pelo curador (pedido de 20/10/2026).

- POST /curation/imagem/{orthanc_reference_id}/girar  {"graus": 90|180|270}

O giro e feito no proprio arquivo DICOM, sem perda (so troca os pixels de
lugar - app/modules/geometria_imagem.py), para a imagem aparecer na mesma
posicao em TODAS as telas: OHIF, miniaturas, impressao, e-mail e download.
As marcacoes e anotacoes ja feitas giram junto. Cada giro fica na auditoria
e no proprio arquivo (DerivationDescription).
"""

from typing import Literal

import httpx
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.modules import orthanc_client
from app.modules.auth import PERFIS_CURADORIA, exigir_perfis
from app.modules.geometria_imagem import FormatoNaoSuportado, girar_dicom, girar_marcacoes, girar_ponto
from app.modules.orthanc_references import OrthancReference
from app.modules.substituir_instancia import ImagemDeVolume, conferir_pode_ajustar, substituir_arquivo
from app.modules.users import User

from .router import router

LIMITE_GIRO = "30/minute"


class PedidoGiro(BaseModel):
    graus: Literal[90, 180, 270]


@router.post("/imagem/{orthanc_reference_id}/girar")
@limiter.limit(LIMITE_GIRO)
def girar_imagem(
    request: Request,
    orthanc_reference_id: int,
    dados: PedidoGiro,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    # trava o registro: dois cliques seguidos giram um depois do outro, nunca juntos
    ref = (
        db.query(OrthancReference)
        .filter(OrthancReference.id == orthanc_reference_id)
        .with_for_update()
        .first()
    )
    if not ref:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    if not ref.ativo:
        raise HTTPException(status_code=409, detail="Imagem desativada.")
    graus = dados.graus
    try:
        conferir_pode_ajustar(orthanc_client.obter_tags_simplificadas_instancia(ref.orthanc_id))
        girado = girar_dicom(orthanc_client.obter_arquivo_instancia(ref.orthanc_id), graus)
    except (ImagemDeVolume, FormatoNaoSuportado) as erro:
        db.rollback()
        raise HTTPException(status_code=422, detail=f"Não foi possível girar: {erro}")
    except httpx.HTTPError:
        db.rollback()
        raise HTTPException(status_code=502, detail="O servidor de imagens (Orthanc) não respondeu. Tente de novo.")

    def anotar_giro(r: OrthancReference) -> None:
        r.giro_graus = ((r.giro_graus or 0) + graus) % 360

    try:
        substituir_arquivo(
            db, ref, girado,
            acao="imagem_girada",
            detalhes=f"Imagem girada {graus}° no sentido horário (sem perda).",
            usuario_id=usuario.id,
            marcacoes=lambda m: girar_marcacoes(m, graus),
            ponto=lambda x, y: girar_ponto(x, y, graus),
            antes_de_gravar=anotar_giro,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="O servidor de imagens (Orthanc) não respondeu. Tente de novo.")
    return {
        "orthanc_reference_id": ref.id,
        "orthanc_id": ref.orthanc_id,
        "giro_graus": ref.giro_graus,
        "mensagem": f"Imagem girada {graus}°.",
    }
