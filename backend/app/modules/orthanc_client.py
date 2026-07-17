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


def obter_detalhes_instancia(orthanc_id: str) -> dict:
    """
    Busca os detalhes de UMA instancia especifica no Orthanc.

    A partir desses detalhes conseguimos extrair os UIDs DICOM
    (Study, Series e SOP Instance UID) e os IDs dos niveis pai.

    Parametro:
        orthanc_id: o identificador interno do Orthanc.

    Retorna: um dicionario com os metadados da instancia.
    """
    url = f"{settings.ORTHANC_URL}/instances/{orthanc_id}"
    with httpx.Client(auth=_get_auth(), timeout=30.0) as client:
        resposta = client.get(url)
        resposta.raise_for_status()
        return resposta.json()


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