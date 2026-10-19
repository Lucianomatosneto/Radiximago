"""
Rotas das macros da curadoria e das frases aprendidas pela voz (ver
app/modules/macros.py).

Macros (perfis de curadoria: administrador, suporte, curador):
- GET    /macros              -> macros ativas (incluir_inativas=true para todas)
- POST   /macros              -> cria
- PATCH  /macros/{id}         -> edita nome/conteudo/ativo
- DELETE /macros/{id}         -> desativa (nada e apagado de verdade)

Frases aprendidas (mesmos perfis):
- GET    /voz/frases          -> frases que valem como alteracoes da lista
- POST   /voz/frases          -> ensina: {frase, tipo: "alteracao"|"termo", valor}
                                 ("termo" vira sinonimo do termo do vocabulario)
- DELETE /voz/frases/{id}     -> esquece uma frase

Toda alteracao fica na auditoria.
"""

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.audit_logs import AuditLog
from app.modules.auth import PERFIS_CURADORIA, exigir_perfis
from app.modules.curations import AlteracaoObservada, QualidadeTecnica, TipoRadiografia
from app.modules.macros import FraseAprendida, MacroCuradoria
from app.modules.users import User
from app.modules.vocabulario import SinonimoTermo, TermoVocabulario, normalizar

router_macros = APIRouter(prefix="/macros", tags=["Macros da curadoria"])
router_frases = APIRouter(prefix="/voz/frases", tags=["Curadoria por voz"])

ALTERACOES_VALIDAS = {a.value for a in AlteracaoObservada}
TIPOS_VALIDOS = {t.value for t in TipoRadiografia}
QUALIDADES_VALIDAS = {q.value for q in QualidadeTecnica}
# palavras que ja tem outro significado na voz e nao podem virar nome de macro
NOMES_RESERVADOS = {"fim", "desfazer", "salvar", "apagar", "corrigir"}


class ConteudoMacro(BaseModel):
    descricao_didatica: Optional[str] = Field(default=None, max_length=4000)
    achados_detalhe: Optional[str] = Field(default=None, max_length=4000)
    observacoes_internas: Optional[str] = Field(default=None, max_length=4000)
    alteracoes_observadas: List[str] = Field(default_factory=list, max_length=30)
    # lista fechada conferida nos validadores abaixo; o tamanho so barra abuso
    tipo_radiografia: Optional[str] = Field(default=None, max_length=40)
    qualidade_tecnica: Optional[str] = Field(default=None, max_length=40)

    @field_validator("alteracoes_observadas")
    @classmethod
    def _alteracoes(cls, v: List[str]) -> List[str]:
        invalidas = [a for a in v if a not in ALTERACOES_VALIDAS]
        if invalidas:
            raise ValueError(f"Alteração inválida: {', '.join(invalidas)}")
        return list(dict.fromkeys(v))

    @field_validator("tipo_radiografia")
    @classmethod
    def _tipo(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in TIPOS_VALIDOS:
            raise ValueError("Tipo de radiografia inválido.")
        return v or None

    @field_validator("qualidade_tecnica")
    @classmethod
    def _qualidade(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in QUALIDADES_VALIDAS:
            raise ValueError("Qualidade técnica inválida.")
        return v or None

    def limpo(self) -> dict:
        """so os campos preenchidos (textos aparados)"""
        dados = self.model_dump()
        saida: dict = {}
        for chave, valor in dados.items():
            if isinstance(valor, str):
                valor = valor.strip()
            if valor:
                saida[chave] = valor
        return saida


class MacroEntrada(BaseModel):
    nome: str = Field(min_length=2, max_length=80)
    conteudo: ConteudoMacro


class MacroEdicao(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=2, max_length=80)
    conteudo: Optional[ConteudoMacro] = None
    ativo: Optional[bool] = None


class FraseEntrada(BaseModel):
    frase: str = Field(min_length=3, max_length=150)
    tipo: Literal["alteracao", "termo"]
    valor: str = Field(min_length=1, max_length=60)


def _auditar(db: Session, usuario_id: int, acao: str, entidade: str, entidade_id: int | None, detalhes: str) -> None:
    db.add(AuditLog(
        usuario_id=usuario_id, acao=acao, entidade=entidade,
        entidade_id=entidade_id, resultado="sucesso", detalhes=detalhes[:500],
    ))


def _serializar_macro(m: MacroCuradoria) -> dict:
    return {
        "id": m.id,
        "nome": m.nome,
        "conteudo": m.conteudo or {},
        "ativo": m.ativo,
        "criado_por_id": m.criado_por_id,
    }


def _nome_valido(db: Session, nome: str, ignorar_id: int | None = None) -> str:
    normalizado = normalizar(nome)
    if len(normalizado) < 2 or normalizado in NOMES_RESERVADOS:
        raise HTTPException(status_code=422, detail="Nome de macro inválido.")
    q = db.query(MacroCuradoria).filter(MacroCuradoria.nome_normalizado == normalizado)
    if ignorar_id is not None:
        q = q.filter(MacroCuradoria.id != ignorar_id)
    if q.first():
        raise HTTPException(status_code=409, detail="Já existe uma macro com esse nome.")
    return normalizado


# ------------------------------------------------------------------ macros
@router_macros.get("")
def listar_macros(
    incluir_inativas: bool = False,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    q = db.query(MacroCuradoria)
    if not incluir_inativas:
        q = q.filter(MacroCuradoria.ativo.is_(True))
    return {"macros": [_serializar_macro(m) for m in q.order_by(MacroCuradoria.nome).all()]}


@router_macros.post("")
def criar_macro(
    dados: MacroEntrada,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    normalizado = _nome_valido(db, dados.nome)
    conteudo = dados.conteudo.limpo()
    if not conteudo:
        raise HTTPException(status_code=422, detail="A macro precisa preencher pelo menos um campo.")
    macro = MacroCuradoria(
        nome=dados.nome.strip(), nome_normalizado=normalizado, conteudo=conteudo, criado_por_id=usuario.id,
    )
    db.add(macro)
    db.flush()
    _auditar(db, usuario.id, "macro_criada", "macro_curadoria", macro.id, f"{macro.nome} | campos: {', '.join(conteudo)}")
    db.commit()
    db.refresh(macro)
    return _serializar_macro(macro)


@router_macros.patch("/{macro_id}")
def editar_macro(
    macro_id: int,
    dados: MacroEdicao,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    macro = db.query(MacroCuradoria).filter(MacroCuradoria.id == macro_id).first()
    if not macro:
        raise HTTPException(status_code=404, detail="Macro não encontrada.")
    mudancas = []
    if dados.nome is not None and normalizar(dados.nome) != macro.nome_normalizado:
        macro.nome_normalizado = _nome_valido(db, dados.nome, ignorar_id=macro.id)
        macro.nome = dados.nome.strip()
        mudancas.append("nome")
    elif dados.nome is not None:
        macro.nome = dados.nome.strip()
    if dados.conteudo is not None:
        conteudo = dados.conteudo.limpo()
        if not conteudo:
            raise HTTPException(status_code=422, detail="A macro precisa preencher pelo menos um campo.")
        macro.conteudo = conteudo
        mudancas.append("conteudo")
    if dados.ativo is not None and dados.ativo != macro.ativo:
        macro.ativo = dados.ativo
        mudancas.append("reativada" if dados.ativo else "desativada")
    _auditar(db, usuario.id, "macro_editada", "macro_curadoria", macro.id, f"{macro.nome} | {', '.join(mudancas) or 'sem mudanças'}")
    db.commit()
    db.refresh(macro)
    return _serializar_macro(macro)


@router_macros.delete("/{macro_id}")
def desativar_macro(
    macro_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    macro = db.query(MacroCuradoria).filter(MacroCuradoria.id == macro_id).first()
    if not macro:
        raise HTTPException(status_code=404, detail="Macro não encontrada.")
    macro.ativo = False
    _auditar(db, usuario.id, "macro_desativada", "macro_curadoria", macro.id, macro.nome)
    db.commit()
    return {"ok": True}


# -------------------------------------------------------- frases aprendidas
@router_frases.get("")
def listar_frases(
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    frases = db.query(FraseAprendida).order_by(FraseAprendida.frase).all()
    return {"frases": [{"id": f.id, "frase": f.frase, "alteracao": f.alteracao} for f in frases]}


@router_frases.post("")
def ensinar_frase(
    dados: FraseEntrada,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    normalizada = normalizar(dados.frase)
    if len(normalizada) < 3:
        raise HTTPException(status_code=422, detail="Frase muito curta.")
    ja_termo = (
        db.query(TermoVocabulario).filter(TermoVocabulario.termo_normalizado == normalizada).first()
        or db.query(SinonimoTermo).filter(SinonimoTermo.sinonimo_normalizado == normalizada).first()
    )
    ja_frase = db.query(FraseAprendida).filter(FraseAprendida.frase_normalizada == normalizada).first()
    if ja_termo or ja_frase:
        raise HTTPException(status_code=409, detail="Essa frase já é reconhecida.")

    if dados.tipo == "alteracao":
        if dados.valor not in ALTERACOES_VALIDAS:
            raise HTTPException(status_code=422, detail="Alteração inválida.")
        frase = FraseAprendida(
            frase=dados.frase.strip(), frase_normalizada=normalizada, alteracao=dados.valor, criado_por_id=usuario.id,
        )
        db.add(frase)
        db.flush()
        _auditar(db, usuario.id, "voz_frase_aprendida", "frase_voz", frase.id, f"{frase.frase} -> {frase.alteracao}")
        db.commit()
        return {"id": frase.id, "frase": frase.frase, "alteracao": frase.alteracao}

    # termo do vocabulario: vira sinonimo
    try:
        termo_id = int(dados.valor)
    except ValueError:
        raise HTTPException(status_code=422, detail="Termo inválido.")
    termo = db.query(TermoVocabulario).filter(TermoVocabulario.id == termo_id, TermoVocabulario.ativo.is_(True)).first()
    if not termo:
        raise HTTPException(status_code=404, detail="Termo não encontrado.")
    sinonimo = SinonimoTermo(termo_id=termo.id, sinonimo=dados.frase.strip(), sinonimo_normalizado=normalizada)
    db.add(sinonimo)
    db.flush()
    _auditar(db, usuario.id, "voz_frase_aprendida", "termo_vocabulario", termo.id, f"{sinonimo.sinonimo} -> termo {termo.termo}")
    db.commit()
    return {"id": sinonimo.id, "sinonimo": sinonimo.sinonimo, "termo_id": termo.id}


@router_frases.delete("/{frase_id}")
def esquecer_frase(
    frase_id: int,
    usuario: User = Depends(exigir_perfis(*PERFIS_CURADORIA)),
    db: Session = Depends(get_db),
):
    frase = db.query(FraseAprendida).filter(FraseAprendida.id == frase_id).first()
    if not frase:
        raise HTTPException(status_code=404, detail="Frase não encontrada.")
    _auditar(db, usuario.id, "voz_frase_esquecida", "frase_voz", frase.id, f"{frase.frase} -> {frase.alteracao}")
    db.delete(frase)
    db.commit()
    return {"ok": True}
