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


def obter_estatisticas() -> dict:
    """
    Numeros gerais do Orthanc (GET /statistics): tamanho ocupado em disco
    (TotalDiskSizeMB) e quantidade de imagens (CountInstances), entre
    outros. Usado na tela de Integracoes (cartao Armazenamento).
    """
    resposta = _client.get(f"{settings.ORTHANC_URL}/statistics", timeout=10.0)
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


def obter_metadado_instancia(orthanc_id: str, chave: str) -> str | None:
    """
    Busca UM valor de metadata interna do Orthanc para uma instancia -
    "metadata" aqui e diferente das tags DICOM (MainDicomTags): sao
    informacoes que o proprio Orthanc guarda sobre COMO recebeu o arquivo,
    nao sobre o conteudo medico dele.

    Usado principalmente pra chave "Origin", que diz como a imagem chegou:
    "DicomProtocol" = enviada diretamente por um equipamento via C-STORE
    (protocolo DICOM, porta 4242) - e como o computador radiografico da
    UFSC envia. "RestApi" = enviada por upload manual (tela "Imagens
    recebidas" do Radix, e tambem usado internamente durante a
    anonimizacao). Ver uso em _determinar_origem, em images_router.py.

    Retorna None se a instancia nao tiver esse metadado (o Orthanc responde
    404 nesse caso - normal pra metadados opcionais, nao e erro).
    """
    resposta = _client.get(f"{settings.ORTHANC_URL}/instances/{orthanc_id}/metadata/{chave}")
    if resposta.status_code == 404:
        return None
    resposta.raise_for_status()
    return resposta.text.strip()


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


# REGRAS DE ANONIMIZACAO (revisadas em 18/10/2026 apos a auditoria
# TST-DICOM-02; decisoes do responsavel - ver docs/SEGURANCA.md, secao 6.1).
#
# Base: perfil padrao do DICOM (PS3.15 Tabela E.1-1, "Basic Application
# Level Confidentiality Profile"), aplicado pelo Orthanc: tira nome, IDs,
# nascimento, endereco, telefone, medicos, instituicao, aparelho, textos
# livres, tags privadas e a sequencia de equipamento
# (ContributingEquipmentSequence), e gera UIDs novos.
#
# Ajustes do Radix, porque data + hora + idade + sexo, juntos, podem
# reidentificar alguem num grupo pequeno (ex.: clinica-escola):
# - SEXO: mantido (contexto pedagogico; sozinho nao identifica);
# - IDADE: mantida em anos, mas 90 anos ou mais vira "090Y" (= "90 ou mais"),
#   regra usada internacionalmente (HIPAA Safe Harbor) porque idades muito
#   altas sao raras;
# - DATAS: so o ANO fica (a data vira 1o de janeiro do mesmo ano);
# - HORAS: apagadas (o perfil padrao ja as remove; nao as restauramos).
# O metodo usado fica registrado no proprio arquivo (DeidentificationMethod).
_CAMPOS_A_PRESERVAR = ["PatientSex", "PatientAge"]
# Removidos EXPLICITAMENTE: o perfil padrao do Orthanc (testado na 1.12.2)
# NAO remove a sequencia de equipamento, que traz instituicao, estacao e
# numero de serie do aparelho (auditoria TST-DICOM-02, reteste 18/10/2026).
_CAMPOS_A_REMOVER = ["ContributingEquipmentSequence"]
_DATAS_SO_ANO = [
    "StudyDate",
    "SeriesDate",
    "AcquisitionDate",
    "ContentDate",
    "InstanceCreationDate",
    "PerformedProcedureStepStartDate",
]
IDADE_LIMITE_AGRUPAMENTO = 90
METODO_ANONIMIZACAO = "Radix: PS3.15 basico, datas=ano, sem horas, idade 90+ agrupada"  # max. 64


def regras_de_anonimizacao(tags_originais: dict) -> dict:
    """
    Monta o pedido de anonimizacao para o Orthanc a partir das tags da
    imagem ORIGINAL (funcao pura - testada em tests/test_anonimizacao_regras.py).
    Devolve {"Keep": [...], "Replace": {...}, "Remove": [...]}.
    """
    manter = list(_CAMPOS_A_PRESERVAR)
    substituir: dict[str, str] = {"DeidentificationMethod": METODO_ANONIMIZACAO}

    for tag in _DATAS_SO_ANO:
        valor = str(tags_originais.get(tag) or "").strip()
        if len(valor) >= 4 and valor[:4].isdigit():
            substituir[tag] = f"{valor[:4]}0101"

    idade = str(tags_originais.get("PatientAge") or "").strip().upper()
    if len(idade) == 4 and idade[:3].isdigit() and idade[3] == "Y" and int(idade[:3]) >= IDADE_LIMITE_AGRUPAMENTO:
        manter.remove("PatientAge")
        substituir["PatientAge"] = f"{IDADE_LIMITE_AGRUPAMENTO:03d}Y"

    return {"Keep": manter, "Replace": substituir, "Remove": list(_CAMPOS_A_REMOVER)}


def anonimizar_instancia(orthanc_id: str):
    """
    Anonimiza uma instancia em duas etapas e grava a versao final no Orthanc:
    1) METADADOS: o Orthanc aplica o perfil padrao com as regras acima
       (regras_de_anonimizacao) e devolve o arquivo anonimizado (no nivel
       de instancia ele devolve o ARQUIVO DICOM cru, nao um ID);
    2) ENQUADRAMENTO: a moldura branca em volta da radiografia (comum em
       leitores de placa de fosforo) e recortada quando for seguro
       (app/modules/geometria_imagem.py) - antes do OCR, para o texto
       impresso so na moldura sair junto com ela;
    3) PIXELS: texto gravado na propria imagem e procurado e tarjado
       (app/modules/texto_na_imagem.py), sem sair do servidor.
    Depois o arquivo final e enviado ao Orthanc (enviar_instancia).

    Parametro:
        orthanc_id: o identificador interno do Orthanc da instancia original.

    Retorna: (resposta do Orthanc ao upload - inclui "ID", ResultadoTexto,
    ResultadoRecorte).
    """
    from app.modules.geometria_imagem import recortar_moldura
    from app.modules.texto_na_imagem import tarjar_texto

    regras = regras_de_anonimizacao(obter_tags_simplificadas_instancia(orthanc_id))
    url = f"{settings.ORTHANC_URL}/instances/{orthanc_id}/anonymize"
    corpo = {"Synchronous": True, **regras}
    resposta = _client.post(url, json=corpo, timeout=60.0)
    resposta.raise_for_status()
    arquivo, resultado_recorte = recortar_moldura(resposta.content)
    arquivo, resultado_texto = tarjar_texto(arquivo)
    return enviar_instancia(arquivo), resultado_texto, resultado_recorte


def obter_arquivo_instancia(orthanc_id: str) -> bytes:
    """Baixa o arquivo DICOM de uma instancia (GET /instances/{id}/file)."""
    resposta = _client.get(f"{settings.ORTHANC_URL}/instances/{orthanc_id}/file", timeout=60.0)
    resposta.raise_for_status()
    return resposta.content


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
