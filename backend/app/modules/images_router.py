"""
Roteador de Imagens.

Endpoints:
- POST /images/import-from-orthanc              -> sincroniza em lote (varre o Orthanc)
- POST /images/upload                            -> upload direto de um arquivo DICOM
- GET  /images/{orthanc_reference_id}             -> consulta uma imagem
- PATCH /images/{orthanc_reference_id}/deactivate -> desativa (soft delete)
- PATCH /images/{orthanc_reference_id}/activate   -> reativa

Acesso restrito a administrador e suporte (Bloco 4, Secao 13).
"""

import io

import httpx
import pydicom
from pydicom.errors import InvalidDicomError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth import exigir_perfis, PERFIS_IMAGENS
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference
from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog

router = APIRouter(prefix="/images", tags=["Imagens"])


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


def _registrar_referencia_se_nova(db: Session, orthanc_id: str) -> tuple[OrthancReference, bool]:
    """
    Garante que existe uma orthanc_reference para este orthanc_id.
    Retorna (referencia, criada_agora). Compartilhado pela sincronizacao em
    lote e pelo upload direto.
    """
    existente = (
        db.query(OrthancReference)
        .filter(OrthancReference.orthanc_id == orthanc_id)
        .first()
    )
    if existente:
        return existente, False

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
    return nova_ref, True


def _alterar_ativo_imagem(db: Session, orthanc_reference_id: int, ativo: bool, usuario: User) -> OrthancReference:
    """
    Ativa ou desativa uma imagem (soft delete). Compartilhado por
    desativar_imagem/ativar_imagem para nao duplicar a logica. O `acao` da
    auditoria e derivado de `ativo`, nao recebido como parametro separado,
    para nao correr o risco de os dois ficarem dessincronizados.
    """
    imagem = (
        db.query(OrthancReference)
        .filter(OrthancReference.id == orthanc_reference_id)
        .first()
    )
    if not imagem:
        raise HTTPException(
            status_code=404,
            detail=f"Imagem {orthanc_reference_id} nao encontrada.",
        )

    imagem.ativo = ativo
    estado = "ativada" if ativo else "desativada"
    acao = "reativacao_imagem" if ativo else "desativacao_imagem"
    db.add(AuditLog(
        usuario_id=usuario.id, acao=acao, entidade="orthanc_reference",
        entidade_id=imagem.id, resultado="sucesso",
        detalhes=f"Imagem {imagem.orthanc_id} foi {estado}.",
    ))
    db.commit()
    return imagem


@router.post("/import-from-orthanc")
def importar_do_orthanc(
    usuario: User = Depends(exigir_perfis(*PERFIS_IMAGENS)),
    db: Session = Depends(get_db),
):
    """
    Sincroniza as imagens do Orthanc com o banco (tabela orthanc_references).
    Varre todas as instancias do Orthanc e registra as que ainda nao existem.
    Retorna um resumo com numeros.
    """
    ids_orthanc = orthanc_client.listar_instancias()

    total = len(ids_orthanc)
    novas = 0
    ja_existentes = 0
    erros = 0
    detalhes_resultado = []

    for orthanc_id in ids_orthanc:
        try:
            ref, criada = _registrar_referencia_se_nova(db, orthanc_id)
            if criada:
                novas += 1
                detalhes_resultado.append(
                    {"orthanc_id": orthanc_id, "status": "importada"}
                )
            else:
                ja_existentes += 1
                detalhes_resultado.append(
                    {"orthanc_id": orthanc_id, "status": "ja_existente"}
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


@router.post("/upload")
def upload_imagem(
    arquivo: UploadFile = File(...),
    usuario: User = Depends(exigir_perfis(*PERFIS_IMAGENS)),
    db: Session = Depends(get_db),
):
    """
    Recebe um arquivo DICOM, envia para o Orthanc e registra a referencia.
    Nao faz nenhuma anonimizacao - a seguranca de LGPD continua sendo a
    checagem manual humana no fluxo de curadoria (anonimizacao_validada).
    """
    limite_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    pedaco_bytes = 1024 * 1024  # 1MB por leitura

    partes = bytearray()
    while True:
        pedaco = arquivo.file.read(pedaco_bytes)
        if not pedaco:
            break
        partes.extend(pedaco)
        if len(partes) > limite_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Arquivo maior que o limite permitido ({settings.MAX_UPLOAD_SIZE_MB}MB).",
            )
    conteudo = bytes(partes)
    del partes  # libera o bytearray imediatamente, nao esperar o fim da funcao

    preambulo_ausente = False
    try:
        pydicom.dcmread(io.BytesIO(conteudo))
    except InvalidDicomError:
        try:
            pydicom.dcmread(io.BytesIO(conteudo), force=True)
        except Exception:
            raise HTTPException(status_code=422, detail="Arquivo enviado nao e um DICOM valido.")
        preambulo_ausente = True
    except Exception:
        raise HTTPException(status_code=422, detail="Arquivo enviado nao e um DICOM valido.")

    try:
        resultado_orthanc = orthanc_client.enviar_instancia(conteudo)
    except httpx.HTTPStatusError as e:
        # O Orthanc e a autoridade final sobre o que e um DICOM valido: um
        # 4xx dele significa que o proprio conteudo foi rejeitado (a validacao
        # do pydicom com force=True e permissiva demais para pegar tudo).
        if e.response.status_code < 500:
            raise HTTPException(status_code=422, detail="Arquivo enviado nao e um DICOM valido (rejeitado pelo Orthanc).")
        raise HTTPException(status_code=502, detail=f"Falha ao enviar o arquivo para o Orthanc: {e}")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao enviar o arquivo para o Orthanc: {e}")

    orthanc_id = resultado_orthanc.get("ID")
    if not orthanc_id:
        raise HTTPException(status_code=502, detail="Orthanc nao retornou um ID valido para o arquivo enviado.")

    try:
        ref, criada = _registrar_referencia_se_nova(db, orthanc_id)
    except IntegrityError:
        # orthanc_id e unico no banco: se a insercao colidiu, e porque um
        # upload concorrente do mesmo arquivo ja registrou a referencia
        # entre a checagem e o commit. Nao e uma falha de verdade.
        db.rollback()
        ref = db.query(OrthancReference).filter(OrthancReference.orthanc_id == orthanc_id).first()
        if not ref:
            raise HTTPException(
                status_code=502,
                detail="Arquivo foi enviado ao Orthanc, mas falhou ao registrar a referencia no sistema. Contate o suporte.",
            )
        criada = False
    except Exception as e:
        db.rollback()
        db.add(AuditLog(
            usuario_id=usuario.id, acao="upload_imagem", entidade="orthanc_reference",
            resultado="erro",
            detalhes=f"Falha ao registrar referencia apos upload no Orthanc (orthanc_id={orthanc_id}): {e}",
        ))
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="Arquivo foi enviado ao Orthanc, mas falhou ao registrar a referencia no sistema. Contate o suporte.",
        )

    db.add(AuditLog(
        usuario_id=usuario.id, acao="upload_imagem", entidade="orthanc_reference", entidade_id=ref.id,
        resultado="sucesso",
        detalhes=f"Upload direto: orthanc_id={orthanc_id}, {'nova imagem' if criada else 'imagem ja existente'}.",
    ))
    if preambulo_ausente:
        db.add(AuditLog(
            usuario_id=usuario.id, acao="upload_sem_preambulo_dicom", entidade="orthanc_reference",
            entidade_id=ref.id, resultado="sucesso",
            detalhes=(
                f"Arquivo aceito com force=True: nao tinha o preambulo DICOM padrao "
                f"de 128 bytes + 'DICM'. orthanc_id={orthanc_id}."
            ),
        ))
    db.commit()

    return {
        "mensagem": "Imagem enviada com sucesso." if criada else "Este arquivo ja estava registrado (imagem existente).",
        "orthanc_reference_id": ref.id,
        "orthanc_id": ref.orthanc_id,
        "status": "importada" if criada else "ja_existente",
        "preambulo_dicom_ausente": preambulo_ausente,
    }


@router.get("/{orthanc_reference_id}")
def obter_imagem(
    orthanc_reference_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_IMAGENS)),
    db: Session = Depends(get_db),
):
    """Busca uma unica imagem (orthanc_reference) pelo id interno."""
    imagem = (
        db.query(OrthancReference)
        .filter(OrthancReference.id == orthanc_reference_id)
        .first()
    )
    if not imagem:
        raise HTTPException(
            status_code=404,
            detail=f"Imagem {orthanc_reference_id} nao encontrada.",
        )

    return {
        "id": imagem.id,
        "orthanc_id": imagem.orthanc_id,
        "study_instance_uid": imagem.study_instance_uid,
        "series_instance_uid": imagem.series_instance_uid,
        "sop_instance_uid": imagem.sop_instance_uid,
        "resource_type": imagem.resource_type,
        "dicomweb_url": imagem.dicomweb_url,
        "ativo": imagem.ativo,
        "criado_em": imagem.criado_em.isoformat() if imagem.criado_em else None,
    }


@router.patch("/{orthanc_reference_id}/deactivate")
def desativar_imagem(
    orthanc_reference_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_IMAGENS)),
    db: Session = Depends(get_db),
):
    """Desativa (soft delete) uma imagem - some das listagens ativas (pending/search)."""
    imagem = _alterar_ativo_imagem(db, orthanc_reference_id, False, usuario)
    return {"mensagem": "Imagem desativada com sucesso.", "id": imagem.id, "ativo": imagem.ativo}


@router.patch("/{orthanc_reference_id}/activate")
def ativar_imagem(
    orthanc_reference_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_IMAGENS)),
    db: Session = Depends(get_db),
):
    """Reativa uma imagem previamente desativada."""
    imagem = _alterar_ativo_imagem(db, orthanc_reference_id, True, usuario)
    return {"mensagem": "Imagem reativada com sucesso.", "id": imagem.id, "ativo": imagem.ativo}