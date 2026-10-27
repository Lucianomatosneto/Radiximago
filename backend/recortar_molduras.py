"""
Recorta a MOLDURA BRANCA das imagens que ja estavam no Radix antes de
20/10/2026 (as novas ja sao recortadas na entrada - app/modules/geometria_imagem.py).

Uso (na pasta do Radix, no computador/servidor que roda o sistema):

  1) SIMULAR (nao altera nada) - mostra o que seria feito e grava, para
     conferencia visual, uma figura de cada imagem com o retangulo do
     recorte em vermelho, na pasta backend/recortes_simulacao:
         docker compose exec radix-api python recortar_molduras.py

  2) APLICAR (depois de conferir as figuras e com um backup recente):
         docker compose exec radix-api python recortar_molduras.py --aplicar

So mexe em imagens ativas, ainda nao avaliadas (enquadramento vazio), que
nao sejam cortes de tomografia. As marcacoes e anotacoes ja feitas sao
ajustadas ao novo enquadramento. Cada imagem alterada fica na auditoria.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import app.main  # noqa: F401 - carrega TODAS as tabelas do sistema (sem isso o banco nao monta as ligacoes entre elas)
from app.core.database import SessionLocal
from app.modules import orthanc_client
from app.modules.geometria_imagem import (
    RECORTADA, ler_pixels, brilho_na_tela, novo_identificador, recortar_marcacoes, recortar_moldura, recortar_ponto,
)
from app.modules.orthanc_references import OrthancReference
from app.modules.substituir_instancia import ImagemDeVolume, conferir_pode_ajustar, substituir_arquivo
from app.modules.segmentacoes import recortar_mascara

PASTA_SIMULACAO = Path(__file__).resolve().parent / "recortes_simulacao"
LADO_FIGURA = 800


def _figura(dicom_bytes: bytes, caixa, destino: Path) -> None:
    """Imagem reduzida com o retangulo que sera MANTIDO desenhado em vermelho."""
    _, pixels, fotometria = ler_pixels(dicom_bytes)
    imagem = Image.fromarray((brilho_na_tela(pixels, fotometria) * 255).astype(np.uint8)).convert("RGB")
    escala = LADO_FIGURA / max(imagem.size)
    if escala < 1:
        imagem = imagem.resize((int(imagem.width * escala), int(imagem.height * escala)))
    else:
        escala = 1.0
    x0, y0, x1, y1 = (int(v * escala) for v in caixa)
    desenho = ImageDraw.Draw(imagem)
    desenho.rectangle((x0, y0, x1 - 1, y1 - 1), outline=(255, 0, 0), width=max(2, LADO_FIGURA // 200))
    imagem.save(destino)


def executar(aplicar: bool) -> None:
    print("=" * 60)
    print(f"RECORTE DA MOLDURA BRANCA - {'APLICANDO' if aplicar else 'SIMULACAO (nada sera alterado)'}")
    print("=" * 60)
    if not aplicar:
        PASTA_SIMULACAO.mkdir(exist_ok=True)
    db = SessionLocal()
    contagem: dict[str, int] = {}
    try:
        ids = [
            i for (i,) in db.query(OrthancReference.id)
            .filter(OrthancReference.ativo.is_(True), OrthancReference.enquadramento.is_(None))
            .order_by(OrthancReference.id).all()
        ]
        print(f"Imagens a avaliar: {len(ids)}\n")
        for ref_id in ids:
            ref = db.query(OrthancReference).filter(OrthancReference.id == ref_id).with_for_update().first()
            try:
                conferir_pode_ajustar(orthanc_client.obter_tags_simplificadas_instancia(ref.orthanc_id))
                original = orthanc_client.obter_arquivo_instancia(ref.orthanc_id)
                recortado, resultado = recortar_moldura(original)
            except ImagemDeVolume:
                db.rollback()
                contagem["volume (ignorada)"] = contagem.get("volume (ignorada)", 0) + 1
                continue
            except Exception as erro:
                db.rollback()
                print(f"  imagem {ref_id}: ERRO ao ler ({type(erro).__name__})")
                contagem["erro"] = contagem.get("erro", 0) + 1
                continue
            contagem[resultado.situacao] = contagem.get(resultado.situacao, 0) + 1
            print(f"  imagem {ref_id}: {resultado.situacao} - {resultado.descricao}")
            if not aplicar:
                if resultado.situacao == RECORTADA:
                    _figura(original, resultado.caixa, PASTA_SIMULACAO / f"imagem_{ref_id}.png")
                db.rollback()
                continue
            if resultado.situacao != RECORTADA:
                ref.enquadramento = resultado.situacao
                db.commit()
                continue
            caixa, largura, altura = resultado.caixa, resultado.largura_original, resultado.altura_original

            def marcar(r: OrthancReference) -> None:
                r.enquadramento = RECORTADA

            substituir_arquivo(
                db, ref, novo_identificador(recortado),
                acao="moldura_recortada",
                detalhes=f"Roteiro recortar_molduras.py: {resultado.descricao}.",
                usuario_id=None,
                marcacoes=lambda m: recortar_marcacoes(m, caixa, largura, altura),
                ponto=lambda x, y: recortar_ponto(x, y, caixa, largura, altura),
                antes_de_gravar=marcar,
                mascara=lambda png: recortar_mascara(png, caixa, largura, altura),
            )
    finally:
        db.close()
    print("\nResumo:")
    for situacao, total in sorted(contagem.items()):
        print(f"  {situacao}: {total}")
    if not aplicar:
        print(f"\nFiguras para conferir: {PASTA_SIMULACAO}")
        print("Se estiverem certas, rode de novo com --aplicar (depois de um backup).")


if __name__ == "__main__":
    executar(aplicar="--aplicar" in sys.argv[1:])
