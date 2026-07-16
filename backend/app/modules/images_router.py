"""
Roteador de Imagens - endpoint de sincronizacao com o Orthanc.

Expoe: POST /images/import-from-orthanc
Faz a varredura do Orthanc e registra as referencias novas no PostgreSQL.
Acesso restrito a administrador e suporte (Bloco 4, Secao 13).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth import obter_usuario_atual
from app.modules.users import User, UserRole
from app.modules.orthanc_references import OrthancReference
from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog

router = APIRouter(prefix="/images", tags=["Imagens"])


def _exigir_admin_ou_suporte(usuario: User) -> None:
    """
    Guardiao de permissao: so administrador ou suporte podem sincronizar.
    Se o perfil nao for permitido, barra com HTTP 403 (acesso negado).
    """
    perfis_permitidos = [UserRole.administrador, UserRole.suporte]
    if usuario.perfil not in perfis_permitidos:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado: apenas administrador ou suporte podem sincronizar.",
        )


def _extrair_uids(detalhes: dict) -> dict:
    """
    Extrai os UIDs DICOM de dentro dos detalhes de uma instancia do Orthanc.
    Os detalhes trazem um bloco 'MainDicomTags' com as tags principais.
    Retorna um dicionario com os tres UIDs (pode vir vazio se ausente).
    """
    tags = detalhes.get("MainDicomTags", {})
    return {
        "sop_instance_uid": tags.get("SOPInstanceUID"),
        "series_instance_uid": detalhes.get("ParentSeries"),
        "study_instance_uid": detalhes.get("ParentStudy"),
    }


@router.post("/import-from-orthanc")
def importar_do_orthanc(
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """
    Sincroniza as imagens do Orthanc com o banco (tabela orthanc_references).
    Varre todas as instancias do Orthanc e registra as que ainda nao existem.
    Retorna um resumo com numeros.
    """
    _exigir_admin_ou_suporte(usuario)

    ids_orthanc = orthanc_client.listar_instancias()

    total = len(ids_orthanc)
    novas = 0
    ja_existentes = 0
    erros = 0
    detalhes_resultado = []

    for orthanc_id in ids_orthanc:
        try:
            existente = (
                db.query(OrthancReference)
                .filter(OrthancReference.orthanc_id == orthanc_id)
                .first()
            )
            if existente:
                ja_existentes += 1
                detalhes_resultado.append(
                    {"orthanc_id": orthanc_id, "status": "ja_existente"}
                )
                continue

            detalhes = orthanc_client.obter_detalhes_instancia(orthanc_id)
            uids = _extrair_uids(detalhes)

            dicomweb_url = f"{settings.DICOMWEB_URL}/instances/{orthanc_id}"

            nova_ref = OrthancReference(
                orthanc_id=orthanc_id,
                study_instance_uid=uids["study_instance_uid"],
                series_instance_uid=uids["series_instance_uid"],
                sop_instance_uid=uids["sop_instance_uid"],
                resource_type="instance",
                dicomweb_url=dicomweb_url,
            )
            db.add(nova_ref)
            db.commit()

            novas += 1
            detalhes_resultado.append(
                {"orthanc_id": orthanc_id, "status": "importada"}
            )
        except Exception as e:
            db.rollback()
            erros += 1
            detalhes_resultado.append(
                {"orthanc_id": orthanc_id, "status": "erro", "mensagem": str(e)}
            )

    db.add(AuditLog(
        usuario_id=usuario.id,
        acao="importacao_orthanc",
        entidade="orthanc_reference",
        resultado="erro" if erros > 0 else "sucesso",
        detalhes=f"Sincronizacao com Orthanc: total={total}, novas={novas}, ja_existentes={ja_existentes}, erros={erros}.",
    ))
    db.commit()

    return {
        "total_no_orthanc": total,
        "novas_importadas": novas,
        "ja_existentes": ja_existentes,
        "erros": erros,
        "detalhes": detalhes_resultado,
    }