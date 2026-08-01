"""
Cliente Orthanc - camada de comunicacao com o servidor DICOM.

Responsabilidade unica (SOLID): saber conversar com o Orthanc.
Nao grava no banco, nao expoe endpoints. Apenas fala com o Orthanc
e devolve dados em Python para quem chamar.
"""

import httpx
from app.core.config import settings

# Cliente HTTP unico, reaproveitado entre todas as chamadas ao Orthanc -
# antes cada funcao abria uma conexao nova (handshake TCP completo) a cada
# chamada; um Client persistente reaproveita conexoes ja abertas
# (keep-alive), o que reduz bastante a latencia acumulada quando varias
# chamadas encadeadas acontecem em sequencia (ex.: abrir uma imagem na
# Curadoria). httpx.Client e seguro para uso concorrente entre threads - o
# FastAPI roda endpoints sincronos numa threadpool.
_client = httpx.Client(
    auth=httpx.BasicAuth(username=settings.ORTHANC_USERNAME, password=settings.ORTHANC_PASSWORD),
    timeout=30.0,
)


def listar_instancias() -> list[str]:
    """
    Pergunta ao Orthanc a lista de TODAS as instancias que ele tem.

    O Orthanc responde com uma lista de identificadores (os 'orthanc_id').
    Exemplo de retorno: ['3e196500-70a18a69-...', 'outro-id', ...]

    Retorna: lista de strings (os IDs internos do Orthanc).
    """
    resposta = _client.get(f"{settings.ORTHANC_URL}/instances")
    resposta.raise_for_status()
    return resposta.json()


def obter_preview_instancia(orthanc_id: str) -> bytes:
    """
    Pede ao Orthanc uma renderizacao PNG (com windowing automatico) de uma
    instancia - usado pra miniatura/visualizacao/download na tela de
    Pesquisa (nao precisa de um visualizador DICOM pra ver essa versao).

    Retorna: os bytes do PNG.
    """
    resposta = _client.get(f"{settings.ORTHANC_URL}/instances/{orthanc_id}/preview")
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
    resposta = _client.get(f"{settings.ORTHANC_URL}/instances/{orthanc_id}")
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
    resposta = _client.get(f"{settings.ORTHANC_URL}/instances/{orthanc_id}/simplified-tags")
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
    resposta = _client.post(url, json=corpo, timeout=60.0)
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
    resposta = _client.delete(f"{settings.ORTHANC_URL}/instances/{orthanc_id}")
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
    resposta = _client.get(f"{settings.ORTHANC_URL}/series/{orthanc_series_id}")
    resposta.raise_for_status()
    return resposta.json()


def listar_instancias_do_estudo(orthanc_study_id: str) -> list[str]:
    """
    Lista os IDs (Orthanc) de todas as instancias de um estudo - usado pra
    descobrir se uma imagem faz parte de uma serie com varios cortes (ex.:
    tomografia) e pra montar o ZIP de download com todos os cortes.

    Usa `?expand` pra trazer os detalhes de todas as series do estudo numa
    unica chamada, em vez de uma chamada por serie (evita N+1 quando o
    estudo tem varias series).

    Parametro:
        orthanc_study_id: o identificador interno do Orthanc do estudo
        (ParentStudy de uma instancia, NAO o StudyInstanceUID DICOM).

    Retorna: lista de IDs (Orthanc) de instancias.
    """
    resposta = _client.get(f"{settings.ORTHANC_URL}/studies/{orthanc_study_id}/series", params={"expand": ""})
    resposta.raise_for_status()
    instancias: list[str] = []
    for serie in resposta.json():
        instancias.extend(serie.get("Instances", []))
    return instancias


def listar_series_do_estudo(orthanc_study_id: str) -> list[dict]:
    """
    Lista as series de um estudo, com o SeriesInstanceUID DICOM real de
    cada uma (vem pronto no MainDicomTags do proprio recurso de serie do
    Orthanc). Usado pra navegar entre series/"pastas" de um estudo com
    varias (ex.: cortes axiais, reconstrucao, escanograma) sem depender da
    coluna series_instance_uid do banco, que guarda o ID interno do
    Orthanc, nao o UID DICOM.

    Usa `?expand` pra trazer os detalhes de todas as series numa unica
    chamada ao Orthanc, em vez de uma chamada por serie (evita N+1 quando o
    estudo tem varias series).

    Parametro:
        orthanc_study_id: o identificador interno do Orthanc do estudo.

    Retorna: lista de dicionarios, ordenada por SeriesNumber (quando
    presente), cada uma com series_instance_uid, series_number, modality
    e total_instancias.
    """
    resposta = _client.get(f"{settings.ORTHANC_URL}/studies/{orthanc_study_id}/series", params={"expand": ""})
    resposta.raise_for_status()

    series: list[dict] = []
    for info in resposta.json():
        tags = info.get("MainDicomTags", {})
        series.append({
            "series_instance_uid": tags.get("SeriesInstanceUID"),
            "series_number": tags.get("SeriesNumber"),
            "modality": tags.get("Modality"),
            "total_instancias": len(info.get("Instances", [])),
        })

    def _chave_ordenacao(serie: dict):
        numero = serie.get("series_number")
        try:
            return (0, int(numero))
        except (TypeError, ValueError):
            return (1, 0)

    series.sort(key=_chave_ordenacao)
    return series


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
    resposta = _client.get(f"{settings.ORTHANC_URL}/studies/{orthanc_study_id}/archive", timeout=180.0)
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
    resposta = _client.post(url, content=conteudo, headers={"Content-Type": "application/dicom"})
    resposta.raise_for_status()
    return resposta.json()
