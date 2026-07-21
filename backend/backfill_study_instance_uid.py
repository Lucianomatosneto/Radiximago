"""
Script de backfill: preenche study_instance_uid para orthanc_references ja
existentes que ficaram com esse campo NULL.

Causa original: GET /instances/{id} do Orthanc nao expoe ParentStudy (so
ParentSeries, que e o pai imediato); o StudyInstanceUID real so vem de
GET /instances/{id}/simplified-tags. Corrigido em images_router.py para
importacoes novas - este script cobre o que ja tinha sido importado antes
da correcao.

Uso: rodar dentro do container radix-api.
"""

from app.core.database import SessionLocal
from app.modules.orthanc_references import OrthancReference
from app.modules.curations import Curation  # noqa: F401 - registra o mapper p/ OrthancReference.curations
from app.modules import orthanc_client


def backfill_study_instance_uid():
    print("=" * 50)
    print("BACKFILL DE StudyInstanceUID - Radix Imago")
    print("=" * 50)

    db = SessionLocal()
    try:
        referencias = (
            db.query(OrthancReference)
            .filter(OrthancReference.study_instance_uid.is_(None))
            .all()
        )
        total = len(referencias)
        print(f"Referencias sem study_instance_uid: {total}")

        atualizadas = 0
        sem_uid_no_orthanc = 0
        erros = 0

        for ref in referencias:
            try:
                tags = orthanc_client.obter_tags_simplificadas_instancia(ref.orthanc_id)
                study_uid = tags.get("StudyInstanceUID")
                if study_uid:
                    ref.study_instance_uid = study_uid
                    atualizadas += 1
                else:
                    sem_uid_no_orthanc += 1
            except Exception as e:
                erros += 1
                print(f"  [ERRO] {ref.orthanc_id}: {e}")

        db.commit()

        print()
        print(f"Atualizadas com sucesso: {atualizadas}")
        print(f"Sem StudyInstanceUID no Orthanc: {sem_uid_no_orthanc}")
        print(f"Erros: {erros}")
        print("=" * 50)
    except Exception as e:
        db.rollback()
        print(f"\n[ERRO] Falha no backfill: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    backfill_study_instance_uid()
