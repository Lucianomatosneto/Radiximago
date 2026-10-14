"""
Roteador do vocabulario controlado (ver app/modules/vocabulario.py).

Leitura (qualquer usuario logado - usado pela Pesquisa avancada e pela
curadoria por voz):
- GET    /vocabulario                         -> termos ativos + sinonimos

Gestao (administrador, suporte e curador):
- GET    /vocabulario/termos-livres           -> textos livres ("Outro") mais repetidos
- POST   /vocabulario/termos                  -> promove um texto a termo oficial
- PATCH  /vocabulario/termos/{id}             -> edita (nome, categoria, DeCS, ativo)
- POST   /vocabulario/termos/{id}/sinonimos   -> acrescenta sinonimo
- DELETE /vocabulario/sinonimos/{id}          -> remove sinonimo
- GET    /vocabulario/termos/{id}/candidatas  -> fichas cujo texto bate com o termo (para conferir)
- POST   /vocabulario/termos/{id}/vincular    -> liga as fichas conferidas ao termo
- DELETE /vocabulario/termos/{id}/fichas/{curation_id} -> desfaz uma ligacao

Toda alteracao fica na auditoria.
"""

from collections import Counter, defaultdict
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.audit_logs import AuditLog
from app.modules.auth import PERFIS_CURADORIA, exigir_perfis, obter_usuario_atual
from app.modules.busca_texto import condicao_busca_texto
from app.modules.curations import Curation, StatusCuradoria
from app.modules.users import User
from app.modules.vocabulario import (
    CATEGORIAS_TERMO,
    CurationTermo,
    SinonimoTermo,
    TermoVocabulario,
    normalizar,
)

router = APIRouter(prefix="/vocabulario", tags=["Vocabulário controlado"])

Categoria = Literal["achado", "alteracao", "outro"]


class TermoEntrada(BaseModel):
    termo: str = Field(min_length=2, max_length=150)
    categoria: Categoria = "achado"
    codigo_decs: Optional[str] = Field(default=None, max_length=30)
    sinonimos: List[str] = Field(default_factory=list, max_length=30)


class TermoEdicao(BaseModel):
    termo: Optional[str] = Field(default=None, min_length=2, max_length=150)
    categoria: Optional[Categoria] = None
    codigo_decs: Optional[str] = Field(default=None, max_length=30)
    ativo: Optional[bool] = None


class SinonimoEntrada(BaseModel):
    sinonimo: str = Field(min_length=2, max_length=150)


class VinculoEntrada(BaseModel):
    curation_ids: List[int] = Field(min_length=1, max_length=500)


def _auditar(db: Session, usuario_id: int, acao: str, entidade_id: int | None, detalhes: str) -> None:
    db.add(AuditLog(
        usuario_id=usuario_id, acao=acao, entidade="termo_vocabulario",
        entidade_id=entidade_id, resultado="sucesso", detalhes=detalhes[:500],
    ))


def _ja_existe(db: Session, normalizado: str, ignorar_termo_id: int | None = None) -> bool:
    """O texto ja e nome de um termo ou sinonimo de algum?"""
    q_termo = db.query(TermoVocabulario).filter(TermoVocabulario.termo_normalizado == normalizado)
    if ignorar_termo_id is not None:
        q_termo = q_termo.filter(TermoVocabulario.id != ignorar_termo_id)
    if q_termo.first():
        return True
    return db.query(SinonimoTermo).filter(SinonimoTermo.sinonimo_normalizado == normalizado).first() is not None


def _serializar(termo: TermoVocabulario, quantidade: int = 0) -> dict:
    return {
        "id": termo.id,
        "termo": termo.termo,
        "categoria": termo.categoria,
        "codigo_decs": termo.codigo_decs,
        "ativo": termo.ativo,
        "sinonimos": [{"id": s.id, "sinonimo": s.sinonimo} for s in termo.sinonimos],
        "quantidade_fichas": quantidade,
    }


def _contagem_fichas(db: Session) -> dict[int, int]:
    linhas = db.query(CurationTermo.termo_id, func.count(CurationTermo.curation_id)).group_by(CurationTermo.termo_id).all()
    return {termo_id: n for termo_id, n in linhas}


def _buscar_termo(db: Session, termo_id: int) -> TermoVocabulario:
    termo = db.query(TermoVocabulario).filter(TermoVocabulario.id == termo_id).first()
    if not termo:
        raise HTTPException(status_code=404, detail="Termo não encontrado.")
    return termo


@router.get("")
def listar_vocabulario(
    incluir_inativos: bool = False,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    consulta = db.query(TermoVocabulario)
    if not incluir_inativos:
        consulta = consulta.filter(TermoVocabulario.ativo.is_(True))
    contagem = _contagem_fichas(db)
    termos = consulta.order_by(TermoVocabulario.termo).all()
    return {"categorias": list(CATEGORIAS_TERMO), "termos": [_serializar(t, contagem.get(t.id, 0)) for t in termos]}


@router.get("/termos-livres")
def termos_livres(
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """
    Textos livres curtos - o "Outro" das marcacoes e os itens de "Achados
    detalhados" (onde a curadoria, inclusive por voz, guarda o texto do
    "Outro") - agrupados por texto normalizado e ordenados pelos mais
    repetidos. Os que ja sao termo ou sinonimo ficam de fora; frases longas
    (mais de 6 palavras) tambem, pois sao descricao e nao nome de achado.
    """
    conhecidos = {t for (t,) in db.query(TermoVocabulario.termo_normalizado).all()}
    conhecidos |= {s for (s,) in db.query(SinonimoTermo.sinonimo_normalizado).all()}

    contagem: Counter[str] = Counter()
    exemplos: dict[str, str] = {}
    fichas: dict[str, set[int]] = defaultdict(set)

    def registrar(texto: str | None, curation_id: int) -> None:
        if not texto:
            return
        # um texto livre pode listar varias coisas separadas por virgula/ponto e virgula
        for pedaco in texto.replace(";", ",").split(","):
            n = normalizar(pedaco)
            if len(n) < 3 or n in conhecidos or len(n.split()) > 6:
                continue
            if curation_id not in fichas[n]:
                fichas[n].add(curation_id)
                contagem[n] += 1
            exemplos.setdefault(n, pedaco.strip())

    linhas = (
        db.query(Curation.id, Curation.achado_principal, Curation.achados_detalhe, Curation.marcacoes)
        .filter(Curation.status != StatusCuradoria.DESCARTADA.value)
        .all()
    )
    for curation_id, _achado_principal, achados_detalhe, marcacoes in linhas:
        registrar(achados_detalhe, curation_id)
        for m in marcacoes or []:
            if isinstance(m, dict) and m.get("achado") == "outro":
                registrar(m.get("achado_descricao"), curation_id)

    itens = [
        {"texto": exemplos[n], "normalizado": n, "quantidade_fichas": q}
        for n, q in contagem.most_common(100)
    ]
    return {"quantidade": len(itens), "itens": itens}


@router.post("/termos")
def criar_termo(
    dados: TermoEntrada,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    normalizado = normalizar(dados.termo)
    if len(normalizado) < 2:
        raise HTTPException(status_code=422, detail="Termo inválido.")
    if _ja_existe(db, normalizado):
        raise HTTPException(status_code=409, detail="Esse texto já é um termo ou sinônimo do vocabulário.")

    termo = TermoVocabulario(
        termo=dados.termo.strip(),
        termo_normalizado=normalizado,
        categoria=dados.categoria,
        codigo_decs=(dados.codigo_decs or "").strip() or None,
        criado_por_id=usuario.id,
    )
    db.add(termo)
    db.flush()
    vistos = {normalizado}
    for s in dados.sinonimos:
        ns = normalizar(s)
        if len(ns) < 2 or ns in vistos or _ja_existe(db, ns):
            continue
        vistos.add(ns)
        termo.sinonimos.append(SinonimoTermo(sinonimo=s.strip(), sinonimo_normalizado=ns))
    _auditar(db, usuario.id, "vocabulario_termo_criado", termo.id, f"termo='{termo.termo}' categoria={termo.categoria}")
    db.commit()
    db.refresh(termo)
    return _serializar(termo)


@router.patch("/termos/{termo_id}")
def editar_termo(
    termo_id: int,
    dados: TermoEdicao,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    termo = _buscar_termo(db, termo_id)
    if dados.termo is not None:
        normalizado = normalizar(dados.termo)
        if normalizado != termo.termo_normalizado:
            if _ja_existe(db, normalizado, ignorar_termo_id=termo.id):
                raise HTTPException(status_code=409, detail="Esse texto já é um termo ou sinônimo do vocabulário.")
            termo.termo_normalizado = normalizado
        termo.termo = dados.termo.strip()
    if dados.categoria is not None:
        termo.categoria = dados.categoria
    if dados.codigo_decs is not None:
        termo.codigo_decs = dados.codigo_decs.strip() or None
    if dados.ativo is not None:
        termo.ativo = dados.ativo
    _auditar(db, usuario.id, "vocabulario_termo_editado", termo.id, f"termo='{termo.termo}' ativo={termo.ativo}")
    db.commit()
    db.refresh(termo)
    return _serializar(termo, _contagem_fichas(db).get(termo.id, 0))


@router.post("/termos/{termo_id}/sinonimos")
def adicionar_sinonimo(
    termo_id: int,
    dados: SinonimoEntrada,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    termo = _buscar_termo(db, termo_id)
    normalizado = normalizar(dados.sinonimo)
    if len(normalizado) < 2:
        raise HTTPException(status_code=422, detail="Sinônimo inválido.")
    if _ja_existe(db, normalizado):
        raise HTTPException(status_code=409, detail="Esse texto já é um termo ou sinônimo do vocabulário.")
    termo.sinonimos.append(SinonimoTermo(sinonimo=dados.sinonimo.strip(), sinonimo_normalizado=normalizado))
    _auditar(db, usuario.id, "vocabulario_sinonimo_criado", termo.id, f"sinonimo='{dados.sinonimo.strip()}'")
    db.commit()
    db.refresh(termo)
    return _serializar(termo, _contagem_fichas(db).get(termo.id, 0))


@router.delete("/sinonimos/{sinonimo_id}")
def remover_sinonimo(
    sinonimo_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    sinonimo = db.query(SinonimoTermo).filter(SinonimoTermo.id == sinonimo_id).first()
    if not sinonimo:
        raise HTTPException(status_code=404, detail="Sinônimo não encontrado.")
    _auditar(db, usuario.id, "vocabulario_sinonimo_removido", sinonimo.termo_id, f"sinonimo='{sinonimo.sinonimo}'")
    db.delete(sinonimo)
    db.commit()
    return {"mensagem": "Sinônimo removido."}


@router.get("/termos/{termo_id}/candidatas")
def fichas_candidatas(
    termo_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    """Fichas cujo texto livre bate com o termo (ou sinonimos) e ainda nao ligadas a ele."""
    termo = _buscar_termo(db, termo_id)
    condicao = condicao_busca_texto(db, termo.termo)
    if condicao is None:
        return {"quantidade": 0, "itens": []}
    ja_ligadas = {c for (c,) in db.query(CurationTermo.curation_id).filter(CurationTermo.termo_id == termo.id).all()}
    fichas = (
        db.query(Curation)
        .filter(condicao)
        .filter(Curation.status != StatusCuradoria.DESCARTADA.value)
        .order_by(Curation.id.desc())
        .limit(300)
        .all()
    )
    itens = []
    for f in fichas:
        if f.id in ja_ligadas:
            continue
        trechos = [f.achados_detalhe or ""] + [
            m.get("achado_descricao") or "" for m in (f.marcacoes or []) if isinstance(m, dict)
        ] + [f.descricao_didatica or ""]
        trecho = next((t for t in trechos if t.strip()), "")
        itens.append({
            "curation_id": f.id,
            "status": f.status,
            "tipo_radiografia": f.tipo_radiografia,
            "achado_principal": f.achado_principal,
            "trecho": trecho[:200],
        })
    return {"quantidade": len(itens), "itens": itens}


@router.post("/termos/{termo_id}/vincular")
def vincular_fichas(
    termo_id: int,
    dados: VinculoEntrada,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    termo = _buscar_termo(db, termo_id)
    existentes = {c for (c,) in db.query(Curation.id).filter(Curation.id.in_(dados.curation_ids)).all()}
    ja_ligadas = {
        c for (c,) in db.query(CurationTermo.curation_id)
        .filter(CurationTermo.termo_id == termo.id, CurationTermo.curation_id.in_(existentes)).all()
    }
    novas = sorted(existentes - ja_ligadas)
    for curation_id in novas:
        db.add(CurationTermo(curation_id=curation_id, termo_id=termo.id, vinculado_por_id=usuario.id))
    _auditar(db, usuario.id, "vocabulario_fichas_vinculadas", termo.id, f"fichas={novas}")
    db.commit()
    return {"mensagem": f"{len(novas)} ficha(s) ligada(s) ao termo.", "vinculadas": novas}


@router.delete("/termos/{termo_id}/fichas/{curation_id}")
def desvincular_ficha(
    termo_id: int,
    curation_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    ligacao = (
        db.query(CurationTermo)
        .filter(CurationTermo.termo_id == termo_id, CurationTermo.curation_id == curation_id)
        .first()
    )
    if not ligacao:
        raise HTTPException(status_code=404, detail="Ligação não encontrada.")
    _auditar(db, usuario.id, "vocabulario_ficha_desvinculada", termo_id, f"ficha={curation_id}")
    db.delete(ligacao)
    db.commit()
    return {"mensagem": "Ligação removida."}
