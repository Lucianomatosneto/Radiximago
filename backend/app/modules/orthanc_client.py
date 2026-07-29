"""
Cliente Orthanc - camada de comunicacao com o servidor DICOM.

Responsabilidade unica (SOLID): saber conversar com o Orthanc.
Nao grava no banco, nao expoe endpoints. Apenas fala com o Orthanc
e devolve dados em Python para quem chamar.
"""

import httpx
from app.core.config import settings


def _get_auth() -> httpx.BasicAuth:
    """
    Monta a autenticacao HTTP Basic com usuario e senha do Orthanc.
    As credenciais vem do config.py (que por sua vez le do .env).
    Nunca escrevemos senha diretamente aqui.
    """
    return httpx.BasicAuth(
        username=settings.ORTHANC_USERNAME,
        password=settings.ORTHANC_PASSWORD,
    )


def listar_instancias() -> list[str]:
    """
    Pergunta ao Orthanc a lista de TODAS as instancias que ele tem.

    O Orthanc responde com uma lista de identificadores (os 'orthanc_id').
    Exemplo de retorno: ['3e196500-70a18a69-...', 'outro-id', ...]

    Retorna: lista de strings (os IDs internos do Orthanc).
    """
    url = f"{settings.ORTHANC_URL}/instances"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.get(url)
        resposta.raise_for_status()
        return resposta.json()


def obter_preview_instancia(orthanc_id: str) -> bytes:
    """
    Pede ao Orthanc uma renderizacao PNG (com windowing automatico) de uma
    instancia - usado pra miniatura/visualizacao/download na tela de
    Pesquisa (nao precisa de um visualizador DICOM pra ver essa versao).

    Retorna: os bytes do PNG.
    """
    url = f"{settings.ORTHANC_URL}/instances/{orthanc_id}/preview"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.get(url)
        resposta.raise_for_status()
        return resposta.content


def obter_detalhes_instancia(orthanc_id: str) -> dict:
    """
    Busca os detalhes de UMA instancia especifica no Orthanc.

    A partir desses detalhes conseguimos o SOPInstanceUID (em MainDicomTags)
    e o ParentSeries - que e o ID interno do Orthanc da serie-mae, NAO um UID
    DICOM. Esse nivel tambem NAO expoe o StudyInstanceUID (o Orthanc so devolve
    o pai imediato); para isso usar obter_tags_simplificadas_instancia.

    Parametro:
        orthanc_id: o identificador interno do Orthanc.

    Retorna: um dicionario com os metadados da instancia.
    """
    url = f"{settings.ORTHANC_URL}/instances/{orthanc_id}"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.get(url)
        resposta.raise_for_status()
        return resposta.json()


def obter_tags_simplificadas_instancia(orthanc_id: str) -> dict:
    """
    Busca as tags DICOM simplificadas (nome legivel -> valor) de uma instancia.

    Diferente de obter_detalhes_instancia, aqui vem o StudyInstanceUID real,
    direto da tag DICOM (0020,000D) - e nao um ID interno do Orthanc.

    Parametro:
        orthanc_id: o identificador interno do Orthanc.

    Retorna: um dicionario {nome_da_tag: valor}.
    """
    url = f"{settings.ORTHANC_URL}/instances/{orthanc_id}/simplified-tags"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.get(url)
        resposta.raise_for_status()
        return resposta.json()


# O perfil padrao do Orthanc (DICOM PS3.15 Table E.1-1) remove/substitui os
# dados pessoais exigidos pela LGPD, mas TAMBEM uma serie de metadados
# tecnicos e demograficos que nao identificam ninguem sozinhos - o KEEP
# abaixo restaura o que nao precisa sair. Lista descoberta testando
# empiricamente o antes/depois do perfil padrao num arquivo real (nao ha
# combinacao documentada de flags no Orthanc que va direto pro minimo sem
# passar pelo perfil completo primeiro).
#
# Sexo, idade e data do exame (Study/Series) ficam de proposito - sao
# contexto pedagogico util pro fluxo de curadoria (a propria ficha de
# curadoria ja pede idade/genero manualmente) e, sozinhos, nao identificam
# um paciente. O que sai continua sendo nome, ID, data de nascimento,
# medicos, instituicao e numero de serie do aparelho (ver
# verificar_anonimizacao.py, mantido consistente com esta lista).
_CAMPOS_A_PRESERVAR = [
    "AcquisitionDate",
    "AcquisitionTime",
    "ContentDate",
    "ContentTime",
    "ContributingEquipmentSequence",
    "InstanceCreationDate",
    "InstanceCreationTime",
    "PatientAge",
    "PatientSex",
    "PerformedProcedureStepStartDate",
    "PerformedProcedureStepStartTime",
    "SeriesDate",
    "SeriesTime",
    "StudyDate",
    "StudyTime",
]


def anonimizar_instancia(orthanc_id: str) -> dict:
    """
    Manda o Orthanc anonimizar uma instancia usando o perfil padrao do DICOM
    (PS3.15 Basic Application Level Confidentiality Profile), mas com um
    Keep explicito pra restaurar o que o perfil padrao remove sem ser dado
    pessoal (ver _CAMPOS_A_PRESERVAR) - decisao deliberada: so sai o que a
    LGPD exige de verdade (nome, ID, data de nascimento, medicos,
    instituicao, numero de serie do aparelho, accession number); sexo,
    idade e datas do exame ficam. Os UIDs (Study/Series/SOP) sao
    regenerados pra impedir correlacionar de volta ao original entre
    sistemas.

    Ao contrario do endpoint equivalente em studies/series/patients (que
    grava o resultado direto no Orthanc e devolve um JSON com o ID), no
    nivel de instancia o Orthanc devolve o ARQUIVO DICOM ANONIMIZADO CRU
    (Content-Type: application/dicom) no corpo da resposta - confirmado
    testando direto (content-type e os bytes batem com um DICOM valido,
    "DICM" no offset 128). Por isso fazemos o upload desses bytes nos
    mesmos, via enviar_instancia, pra ter uma instancia de verdade gravada
    com um ID.

    Parametro:
        orthanc_id: o identificador interno do Orthanc da instancia original.

    Retorna: o dicionario de resposta do Orthanc pro upload (inclui "ID").
    """
    url = f"{settings.ORTHANC_URL}/instances/{orthanc_id}/anonymize"
    corpo = {"Synchronous": True, "Keep": _CAMPOS_A_PRESERVAR}
    with httpx.Client(auth=_get_auth(), timeout=60.0) as client:
        resposta = client.post(url, json=corpo)
        resposta.raise_for_status()
        return enviar_instancia(resposta.content)


def excluir_instancia(orthanc_id: str) -> None:
    """
    Remove uma instancia do Orthanc. Usado pra apagar o arquivo original
    identificavel depois que a versao anonimizada ja foi gravada (ou pra
    limpar o original se a anonimizacao falhar no meio do caminho).

    Parametro:
        orthanc_id: o identificador interno do Orthanc da instancia a remover.
    """
    url = f"{settings.ORTHANC_URL}/instances/{orthanc_id}"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.delete(url)
        resposta.raise_for_status()


def obter_detalhes_serie(orthanc_series_id: str) -> dict:
    """
    Busca os detalhes de UMA serie especifica no Orthanc.

    Diferente do nivel de instancia (que so expoe ParentSeries), aqui vem o
    ParentStudy - o ID interno do Orthanc do estudo-mae.

    Parametro:
        orthanc_series_id: o identificador interno do Orthanc da serie.

    Retorna: um dicionario com os metadados da serie (inclui "ParentStudy"
    e "Instances").
    """
    url = f"{settings.ORTHANC_URL}/series/{orthanc_series_id}"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.get(url)
        resposta.raise_for_status()
        return resposta.json()


def listar_instancias_do_estudo(orthanc_study_id: str) -> list[str]:
    """
    Lista os IDs (Orthanc) de todas as instancias de um estudo, percorrendo
    suas series - usado pra descobrir se uma imagem faz parte de uma serie
    com varios cortes (ex.: tomografia) e pra montar o ZIP de download com
    todos os cortes.

    Parametro:
        orthanc_study_id: o identificador interno do Orthanc do estudo
        (ParentStudy de uma instancia, NAO o StudyInstanceUID DICOM).

    Retorna: lista de IDs (Orthanc) de instancias.
    """
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.get(f"{settings.ORTHANC_URL}/studies/{orthanc_study_id}")
        resposta.raise_for_status()
        series_ids = resposta.json().get("Series", [])

        instancias: list[str] = []
        for serie_id in series_ids:
            resposta_serie = client.get(f"{settings.ORTHANC_URL}/series/{serie_id}")
            resposta_serie.raise_for_status()
            instancias.extend(resposta_serie.json().get("Instances", []))
        return instancias


def obter_arquivo_zip_estudo(orthanc_study_id: str) -> bytes:
    """
    Pede ao Orthanc o ZIP nativo (DICOM) com todos os arquivos de um estudo -
    usado no download "DICOM" de uma imagem que e na verdade uma serie com
    varios cortes (ex.: tomografia). Estudos grandes podem ter centenas de
    arquivos, por isso o timeout maior que os outros metodos deste modulo.

    Parametro:
        orthanc_study_id: o identificador interno do Orthanc do estudo.

    Retorna: os bytes do arquivo ZIP.
    """
    url = f"{settings.ORTHANC_URL}/studies/{orthanc_study_id}/archive"
    with httpx.Client(auth=_get_auth(), timeout=180.0) as client:
        resposta = client.get(url)
        resposta.raise_for_status()
        return resposta.content


def enviar_instancia(conteudo: bytes) -> dict:
    """
    Envia um arquivo DICOM bruto para o Orthanc (upload).

    O Orthanc aceita o binario DICOM diretamente no corpo do POST e devolve
    o ID interno da instancia. Se o arquivo ja existia, o Orthanc responde
    com o mesmo ID de sempre (Status "AlreadyStored"), sem duplicar nada.

    Parametro:
        conteudo: os bytes crus do arquivo DICOM.

    Retorna: um dicionario com o resultado (inclui a chave "ID").
    """
    url = f"{settings.ORTHANC_URL}/instances"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.post(url, content=conteudo, headers={"Content-Type": "application/dicom"})
        resposta.raise_for_status()
        return resposta.json()