"""
Preenche a MODALIDADE PRELIMINAR das imagens que ja estavam no Radix antes
de 23/11/2026 (as novas ja entram com ela - images_router.py). E ela que
permite ao curador filtrar a fila da Curadoria por tipo de exame.

Regras (as mesmas da entrada, curation/tipo_automatico.py):
tomografia (DICOM CT), panoramica (DICOM PX ou imagem bem larga) e
"intraoral" para o resto. So mexe em imagens SEM modalidade preliminar;
o tipo informado por quem enviou nunca e trocado.

Uso (na pasta do Radix, no computador/servidor que roda o sistema):

  1) SIMULAR (nao altera nada) - mostra o que seria feito:
         docker compose exec radix-api python preencher_tipo_preliminar.py

  2) APLICAR:
         docker compose exec radix-api python preencher_tipo_preliminar.py --aplicar
"""

import sys

import app.main  # noqa: F401 - carrega TODAS as tabelas do sistema
from app.core.database import SessionLocal
from app.modules import orthanc_client
from app.modules.curation.tipo_automatico import tipo_preliminar_automatico
from app.modules.orthanc_references import OrthancReference


def executar(aplicar: bool) -> None:
    print("=" * 60)
    print(f"MODALIDADE PRELIMINAR - {'APLICANDO' if aplicar else 'SIMULACAO (nada sera alterado)'}")
    print("=" * 60)
    db = SessionLocal()
    contagem: dict[str, int] = {}
    falhas = 0
    try:
        imagens = db.query(OrthancReference).filter(OrthancReference.tipo_preliminar.is_(None)).all()
        for ref in imagens:
            try:
                tags = orthanc_client.obter_tags_simplificadas_instancia(ref.orthanc_id) or {}
            except Exception:  # noqa: BLE001 - imagem fora do Orthanc: fica "nao informado"
                falhas += 1
                continue
            tipo = tipo_preliminar_automatico(tags)
            contagem[tipo] = contagem.get(tipo, 0) + 1
            if aplicar:
                ref.tipo_preliminar = tipo
                ref.tipo_preliminar_origem = "automatico"
        if aplicar:
            db.commit()
    finally:
        db.close()
    print(f"Imagens sem modalidade preliminar: {sum(contagem.values()) + falhas}")
    for tipo, total in sorted(contagem.items()):
        print(f"  {tipo}: {total}")
    if falhas:
        print(f"  sem resposta do Orthanc (continuam 'nao informado'): {falhas}")
    if not aplicar:
        print("Nada foi alterado. Para gravar, rode de novo com --aplicar.")


if __name__ == "__main__":
    executar(aplicar="--aplicar" in sys.argv)
