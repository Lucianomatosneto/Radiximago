"""
Identificadores (UIDs) FIXOS para as imagens anonimizadas (18/11/2026).

PROBLEMA QUE RESOLVE (auditoria do dossie, doc. 06, achados DICOM-ACH-01/02):
o perfil padrao de anonimizacao do Orthanc SORTEIA UIDs novos a cada
chamada. Como o Radix anonimiza imagem por imagem:
- os cortes de UMA tomografia viravam estudos e series DIFERENTES (o OHIF
  nao montava o volume e cada corte parecia um exame separado);
- reenviar o MESMO arquivo criava uma copia nova (duplicata na fila).

SOLUCAO: em vez de sortear, o novo UID e CALCULADO a partir do UID original
com uma chave secreta do servidor (HMAC-SHA256 - "codigo de autenticacao de
mensagem com resumo": a mesma entrada com a mesma chave da sempre o mesmo
resultado, e sem a chave nao da para voltar ao original nem refazer a conta).
- cortes do mesmo estudo original -> o mesmo estudo anonimizado;
- o mesmo arquivo de novo -> exatamente os mesmos UIDs -> o Orthanc avisa
  que ja tem a imagem ("AlreadyStored") e o Radix reconhece a repeticao.

PRIVACIDADE (LGPD): e uma tecnica de PSEUDONIMIZACAO (codigo derivado com
chave). A chave fica so no .env do servidor (ANONIMIZACAO_CHAVE_UID), nunca
no banco nem no Git. O identificador do PACIENTE e derivado do ESTUDO
original (nao do PatientID original), de proposito: exames diferentes da
mesma pessoa NAO ficam ligados entre si no Radix, o que reduz o risco de
reidentificacao por cruzamento.

Funcoes puras (sem Orthanc nem banco) - testadas em
tests/test_uids_anonimizados.py.
"""
from __future__ import annotations

import hashlib
import hmac

# Raiz "2.25" do padrao DICOM (PS3.5, B.2): UID formado por um numero
# inteiro de 128 bits. Nao exige registrar raiz propria de organizacao.
RAIZ_UID = "2.25"
TAMANHO_MAX_UID = 64  # limite do tipo UI no DICOM
PREFIXO_PACIENTE = "RADIX-"
NOME_PACIENTE = "ANONIMIZADO"

# UIDs que precisam ficar coerentes entre os cortes de um mesmo exame.
# FrameOfReferenceUID: o "sistema de coordenadas" do volume - se cada corte
# tiver um diferente, o visualizador nao reconstroi o volume.
UIDS_DERIVADOS = ("StudyInstanceUID", "SeriesInstanceUID", "SOPInstanceUID", "FrameOfReferenceUID")


def _resumo(chave: str, tipo: str, valor: str) -> bytes:
    """HMAC-SHA256 de 'tipo|valor'. O tipo entra na conta para que, por
    exemplo, um UID de estudo e um de serie com o mesmo texto nao gerem o
    mesmo resultado."""
    return hmac.new(chave.encode("utf-8"), f"{tipo}|{valor}".encode("utf-8"), hashlib.sha256).digest()


def uid_derivado(chave: str, tipo: str, uid_original: str) -> str:
    """UID novo no formato 2.25.<inteiro de 128 bits> (no maximo 44 caracteres)."""
    numero = int.from_bytes(_resumo(chave, tipo, uid_original.strip())[:16], "big")
    uid = f"{RAIZ_UID}.{numero}"
    assert len(uid) <= TAMANHO_MAX_UID
    return uid


def paciente_derivado(chave: str, study_uid_original: str) -> str:
    """Identificador de paciente ficticio, um por ESTUDO original."""
    return PREFIXO_PACIENTE + _resumo(chave, "paciente", study_uid_original.strip()).hex()[:20].upper()


def substituicoes_de_identificadores(chave: str, tags_originais: dict) -> dict[str, str]:
    """
    Monta as substituicoes de UIDs e do paciente a partir das tags da imagem
    ORIGINAL. So substitui o que existe no arquivo; o resto continua com o
    tratamento do perfil padrao. Sem chave ou sem StudyInstanceUID, devolve
    vazio (o Orthanc volta a sortear, como antes).
    """
    if not chave:
        return {}
    study = str(tags_originais.get("StudyInstanceUID") or "").strip()
    if not study:
        return {}
    substituir: dict[str, str] = {}
    for tag in UIDS_DERIVADOS:
        valor = str(tags_originais.get(tag) or "").strip()
        if valor:
            substituir[tag] = uid_derivado(chave, tag, valor)
    substituir["PatientID"] = paciente_derivado(chave, study)
    substituir["PatientName"] = NOME_PACIENTE
    return substituir
