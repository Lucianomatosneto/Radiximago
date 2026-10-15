"""
PORTARIA DAS IMAGENS DICOM (OWASP ASVS 5.0 - V8.2.2, V8.3.1).

PROBLEMA QUE RESOLVE: o navegador busca as imagens no Orthanc atraves de um
proxy (container radix-orthanc-cors, porta 8042) que acrescenta a senha do
Orthanc a cada pedido. Antes desta regra, QUALQUER pessoa que alcancasse
essa porta via todas as imagens (e podia ate apagar), sem login no Radix.

COMO FUNCIONA: antes de repassar cada pedido ao Orthanc, o proxy (Nginx,
diretiva auth_request) pergunta ao backend "este usuario pode isto?",
mandando o cookie de login e o endereco pedido. Este modulo so faz a parte
"pura" da decisao (sem banco), para ser facil de testar:

1. classificar_pedido(): descobre de qual ESTUDO (StudyInstanceUID) e o
   pedido, olhando o endereco DICOMweb/WADO.
2. decidir(): aplica as regras por perfil.

REGRAS (privilegio minimo):
- administrador: tudo (inclui o Orthanc Explorer e envios/exclusoes),
  agora so com login de administrador no Radix;
- suporte: so leitura (GET), de tudo;
- curador: so leitura, apenas estudos cadastrados no Radix (referencias
  ativas, ja anonimizadas);
- professor, estudante, pesquisador: so leitura, apenas estudos com
  curadoria APROVADA (os que aparecem na Pesquisa) ou compartilhados com
  a propria pessoa;
- listas gerais (todos os estudos do Orthanc) e a API administrativa do
  Orthanc: so administrador e suporte.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Iterable
from urllib.parse import parse_qs, unquote, urlsplit

# UID DICOM: so digitos e pontos, ate 64 caracteres (PS3.5, 9.1)
_UID_VALIDO = re.compile(r"^[0-9]+(\.[0-9]+)*$")
METODOS_LEITURA = {"GET", "HEAD"}

PERFIS_TUDO = {"administrador"}
PERFIS_LEITURA_TOTAL = {"suporte"}
PERFIS_CADASTRADOS = {"curador"}


@dataclass(frozen=True)
class PedidoImagem:
    """tipo: 'estudo' (sabemos de quais estudos e), 'lista' (busca geral em
    todos os estudos) ou 'outro' (API administrativa do Orthanc)."""

    tipo: str
    uids: frozenset[str] = field(default_factory=frozenset)
    uid_invalido: bool = False


def _separar_uids(valores: Iterable[str]) -> list[str]:
    uids: list[str] = []
    for v in valores:
        # o DICOMweb aceita varios UIDs separados por virgula ou barra invertida
        uids.extend(p.strip() for p in re.split(r"[,\\]", v) if p.strip())
    return uids


def _pedido_com_uids(uids: list[str], tipo_sem_uid: str) -> PedidoImagem:
    if not uids:
        return PedidoImagem(tipo_sem_uid)
    invalido = any(len(u) > 64 or not _UID_VALIDO.match(u) for u in uids)
    return PedidoImagem("estudo", frozenset(uids), uid_invalido=invalido)


def classificar_pedido(uri: str) -> PedidoImagem:
    """Recebe o endereco pedido (ex.: '/dicom-web/studies/1.2.3/series')."""
    partes = urlsplit(uri or "/")
    caminho = unquote(partes.path or "/")
    consulta = parse_qs(partes.query, keep_blank_values=False)
    # caminhos com ".." nunca sao aceitos (tentativa de "pular" de pasta)
    if ".." in caminho.split("/"):
        return PedidoImagem("outro", uid_invalido=True)

    if caminho.startswith("/dicom-web/studies/"):
        uid = caminho[len("/dicom-web/studies/"):].split("/", 1)[0]
        return _pedido_com_uids([uid] if uid else [], "lista")
    if caminho.rstrip("/") in ("/dicom-web/studies", "/dicom-web/series", "/dicom-web/instances"):
        uids = _separar_uids(consulta.get("StudyInstanceUID", []) + consulta.get("0020000D", []))
        return _pedido_com_uids(uids, "lista")
    if caminho.rstrip("/") == "/wado":
        return _pedido_com_uids(_separar_uids(consulta.get("studyUID", [])), "outro")
    if caminho.startswith("/dicom-web"):
        return PedidoImagem("lista")
    return PedidoImagem("outro")


def decidir(
    perfil: str,
    metodo: str,
    pedido: PedidoImagem,
    uids_permitidos: Callable[[frozenset[str]], set[str]],
) -> bool:
    """True = pode. `uids_permitidos(uids)` devolve, dentre os estudos
    pedidos, os que este usuario pode ver (consulta ao banco, so chamada
    quando necessario)."""
    metodo = (metodo or "GET").upper()
    if perfil in PERFIS_TUDO:
        return True
    if metodo not in METODOS_LEITURA or pedido.uid_invalido:
        return False
    if perfil in PERFIS_LEITURA_TOTAL:
        return True
    if pedido.tipo != "estudo" or not pedido.uids:
        return False
    return uids_permitidos(pedido.uids) >= set(pedido.uids)
