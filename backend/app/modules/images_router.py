"""
Roteador de Imagens.

Endpoints:
- GET  /images/                                   -> lista as imagens ativas
- POST /images/import-from-orthanc              -> sincroniza em lote (varre o Orthanc)
- POST /images/upload                            -> upload direto de um arquivo DICOM
- GET  /images/{orthanc_reference_id}             -> consulta uma imagem
- PATCH /images/{orthanc_reference_id}/deactivate -> desativa (soft delete)
- PATCH /images/{orthanc_reference_id}/activate   -> reativa

Acesso restrito a administrador e suporte (Bloco 4, Secao 13).
"""

import io
import logging

import httpx
import pydicom
from pydicom.errors import InvalidDicomError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.modules.auth import exigir_perfis, PERFIS_IMAGENS, PERFIS_CURADORIA
from app.modules.users import User
from app.modules.orthanc_references import OrthancReference, OrigemImagem
from app.modules.curations import Curation
from app.modules import orthanc_client
from app.modules.audit_logs import AuditLog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/images", tags=["Imagens"])


def _extrair_uids(detalhes: dict, tags_simplificadas: dict) -> dict:
    """
    Extrai os UIDs DICOM de uma instancia do Orthanc.

    'detalhes' (GET /instances/{id}) so tem o SOPInstanceUID e o ParentSeries
    (ID interno do Orthanc, nao UID DICOM, e nao existe ParentStudy nesse
    nivel). O StudyInstanceUID real vem de 'tags_simplificadas'
    (GET /instances/{id}/simplified-tags), que expoe a tag DICOM diretamente.
    """
    tags = detalhes.get("MainDicomTags", {})
    return {
        "sop_instance_uid": tags.get("SOPInstanceUID"),
        "series_instance_uid": detalhes.get("ParentSeries"),
        "study_instance_uid": tags_simplificadas.get("StudyInstanceUID"),
    }


def _anonimizar_e_excluir_original(orthanc_id_original: str) -> str:
    """
    Manda o Orthanc anonimizar a instancia (perfil padrao DICOM PS3.15) e
    apaga o original identificavel em seguida. Devolve o orthanc_id da
    instancia anonimizada - e essa que deve ser referenciada dai em diante,
    nunca o original.

    Se a anonimizacao falhar (ou o Orthanc nao devolver um ID valido),
    tenta apagar o original mesmo assim (melhor esforco) antes de propagar
    o erro, pra nao deixar um arquivo identificavel orfao - sem nenhuma
    referencia no banco - parado no Orthanc.
    """
    try:
        resultado = orthanc_client.anonimizar_instancia(orthanc_id_original)
    except Exception:
        try:
            orthanc_client.excluir_instancia(orthanc_id_original)
        except Exception:
            pass
        raise

    orthanc_id_anonimizado = resultado.get("ID")
    if not orthanc_id_anonimizado:
        try:
            orthanc_client.excluir_instancia(orthanc_id_original)
        except Exception:
            pass
        raise RuntimeError(
            f"Orthanc nao retornou um ID valido para a instancia anonimizada "
            f"(original={orthanc_id_original})."
        )

    orthanc_client.excluir_instancia(orthanc_id_original)
    return orthanc_id_anonimizado


def _determinar_origem(orthanc_id_original: str) -> str:
    """
    Descobre se a instancia original chegou ao Orthanc por envio direto do
    equipamento de raio-X (protocolo DICOM/C-STORE, porta 4242 - o
    computador radiografico da UFSC usa esse caminho) ou por upload manual
    (API REST, tela "Imagens recebidas").

    CRITICO: isso precisa ser checado ANTES da anonimizacao. A versao
    anonimizada e uma instancia NOVA, criada pelo proprio Orthanc via chamada
    de API - a Origin dela seria sempre "RestApi"/interna, nunca refletindo
    de onde a imagem ORIGINAL de fato veio. Por isso esta funcao recebe o id
    original, e e chamada antes de _anonimizar_e_excluir_original.

    Se a checagem falhar por qualquer motivo (Orthanc fora do ar, etc.),
    assume "externa" por seguranca - mais conservador do que afirmar uma
    origem "ufsc" sem ter certeza.
    """
    try:
        origin = orthanc_client.obter_metadado_instancia(orthanc_id_original, "Origin")
    except Exception:
        logger.exception("Falha ao consultar a origem da instancia %s no Orthanc.", orthanc_id_original)
        return OrigemImagem.EXTERNA.value
    return OrigemImagem.UFSC.value if origin == "DicomProtocol" else OrigemImagem.EXTERNA.value


def _registrar_referencia_se_nova(db: Session, orthanc_id: str) -> tuple[OrthancReference, bool]:
    """
    Garante que existe uma orthanc_reference para este orthanc_id.
    Retorna (referencia, criada_agora). Compartilhado pela sincronizacao em
    lote e pelo upload direto - e por isso o unico ponto por onde TODA
    imagem nova passa, seja ela recebida via C-STORE direto do computador
    radiografico (descoberta depois pela sincronizacao) ou via upload manual.

    Antes de registrar, manda anonimizar a instancia original no Orthanc
    (perfil padrao DICOM PS3.15) e apaga o original identificavel - a
    referencia gravada no banco aponta so pra versao anonimizada, o arquivo
    com os dados originais nunca fica persistido.
    """
    existente = (
        db.query(OrthancReference)
        .filter(OrthancReference.orthanc_id == orthanc_id)
        .first()
    )
    if existente:
        return existente, False

    origem = _determinar_origem(orthanc_id)
    orthanc_id_anonimizado = _anonimizar_e_excluir_original(orthanc_id)

    detalhes = orthanc_client.obter_detalhes_instancia(orthanc_id_anonimizado)
    tags_simplificadas = orthanc_client.obter_tags_simplificadas_instancia(orthanc_id_anonimizado)
    uids = _extrair_uids(detalhes, tags_simplificadas)
    dicomweb_url = f"{settings.DICOMWEB_URL}/instances/{orthanc_id_anonimizado}"

    nova_ref = OrthancReference(
        orthanc_id=orthanc_id_anonimizado,
        study_instance_uid=uids["study_instance_uid"],
        series_instance_uid=uids["series_instance_uid"],
        sop_instance_uid=uids["sop_instance_uid"],
        resource_type="instance",
        dicomweb_url=dicomweb_url,
        anonimizacao_status="concluida",
        origem=origem,
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


@router.get("/")
def listar_imagens(
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Lista as imagens ativas (orthanc_references com ativo=True), trazendo
    o status da ficha de curadoria mais recente vinculada a cada uma
    (None se ainda nao houver ficha).

    Leitura apenas (os demais endpoints deste modulo - upload, import,
    ativar/desativar - continuam restritos a admin/suporte): o curador
    tambem precisa ver a fila de imagens recebidas, mas nao gerencia a
    ingestao delas.
    """
    imagens = (
        db.query(OrthancReference)
        .filter(OrthancReference.ativo == True)
        .order_by(OrthancReference.id)
        .all()
    )

    ids = [imagem.id for imagem in imagens]
    status_mais_recente_por_imagem: dict[int, str] = {}
    if ids:
        curadorias = (
            db.query(Curation)
            .filter(Curation.orthanc_reference_id.in_(ids))
            .order_by(
                Curation.orthanc_reference_id,
                Curation.criado_em.desc(),
                Curation.id.desc(),
            )
            .all()
        )
        for curadoria in curadorias:
            status_mais_recente_por_imagem.setdefault(
                curadoria.orthanc_reference_id, curadoria.status
            )

    return [
        {
            "id": imagem.id,
            "orthanc_id": imagem.orthanc_id,
            "resource_type": imagem.resource_type,
            "anonimizacao_status": imagem.anonimizacao_status,
            "origem": imagem.origem,
            "criado_em": imagem.criado_em.isoformat() if imagem.criado_em else None,
            "status_curadoria": status_mais_recente_por_imagem.get(imagem.id),
        }
        for imagem in imagens
    ]


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
    Recebe um arquivo DICOM, envia para o Orthanc, anonimiza (perfil padrao
    DICOM PS3.15, via _registrar_referencia_se_nova) e registra a
    referencia apontando pra versao anonimizada. A checagem manual humana
    no fluxo de curadoria (anonimizacao_validada) continua existindo como
    segunda camada antes da aprovacao, mas nao e mais a unica protecao.
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
        logger.exception("Falha ao enviar arquivo para o Orthanc.")
        raise HTTPException(status_code=502, detail="Falha ao enviar o arquivo para o Orthanc.")
    except httpx.HTTPError:
        logger.exception("Falha ao enviar arquivo para o Orthanc.")
        raise HTTPException(status_code=502, detail="Falha ao enviar o arquivo para o Orthanc.")

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
        "origem": imagem.origem,
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