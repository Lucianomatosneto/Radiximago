"""Schemas Pydantic de entrada dos endpoints de curadoria."""

from datetime import datetime
from typing import Annotated, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.core.limites import (
    MAX_ACHADOS, MAX_ALTERACOES, MAX_DENTES, MAX_ERROS_TECNICOS, MAX_MARCACOES, MAX_TERMOS,
    TextoCurto, TextoLongo, TextoMedio,
)

from app.modules.curations import (
    Modalidade,
    TipoRadiografia,
    Genero,
    AchadoPrincipal,
    AlteracaoObservada,
    QualidadeTecnica,
    Dificuldade,
    DecisaoRevisao,
    DecisaoFinalRevisao,
    ClassificacaoRevisao,
    AvaliacaoItem,
    Denticao,
    SituacaoDente,
    EstruturaExtradental,
    DENTES_FDI,
)
from app.modules.achados import TipoAchado, RegiaoAnatomica, TipoErroTecnico
from app.modules.orthanc_references import OrigemImagem


class Marcacao(BaseModel):
    """
    Uma forma desenhada pelo curador sobre a miniatura estatica pra indicar
    uma lesao (nao sobre o OHIF, que roda em outra origem e nao tem como
    ser lido de volta). Coordenadas sempre relativas (0.0-1.0) a
    largura/altura da imagem, pra funcionar em qualquer resolucao/zoom.

    oval/retangulo usam x,y (canto superior esquerdo) + largura/altura.
    seta usa x1,y1 (cauda) + x2,y2 (ponta).
    """
    id: str = Field(max_length=64)
    tipo: Literal["oval", "retangulo", "seta"]
    x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    largura: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    altura: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    x1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    x2: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y2: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    # Inclinacao (graus, sentido horario, em volta do centro) do retangulo ou
    # oval - o curador gira a forma para alinha-la a estrutura (27/10/2026).
    # Medida em PIXELS da imagem (a proporcao largura/altura da imagem nao a
    # deforma).
    angulo: Optional[float] = Field(default=None, ge=-360.0, le=360.0)
    # Tipo de lesao indicada por essa forma - o curador escolhe logo apos
    # desenhar, e o estudante ve o rotulo ao passar o mouse em cima dela.
    achado: Optional[AchadoPrincipal] = None
    # Texto livre usado quando achado == "outro" (a enum AchadoPrincipal e
    # fechada, entao nao ha como o curador descrever algo fora da lista so
    # com o campo `achado`) - o estudante ve esse texto no lugar do rotulo
    # generico "Outro" no tooltip, quando preenchido. Sem validacao cruzada
    # com `achado` de proposito (mesmo padrao tolerante ja usado em outros
    # campos de texto livre da ficha, ex.: parecer_revisor).
    achado_descricao: Optional[TextoCurto] = None
    # TOMOGRAFIA (23/11/2026, pedido do Luciano, "opcao 1"): a marcacao fica
    # num CORTE de um PLANO; as coordenadas sao relativas a imagem desse
    # corte (GET /reconstrucao/{ref}/plano.png). Os dois andam juntos; sem
    # eles e marcacao de radiografia, como sempre.
    plano: Optional[Literal["axial", "sagital", "coronal"]] = None
    corte: Optional[int] = Field(default=None, ge=0, le=100000)

    @model_validator(mode="after")
    def _plano_e_corte_juntos(self):
        if (self.plano is None) != (self.corte is None):
            raise ValueError("Marcação de tomografia precisa do plano e do número do corte.")
        return self

    @model_validator(mode="after")
    def _coordenadas_do_tipo(self):
        """Combinacao coerente (OWASP ASVS 2.2.3): cada forma precisa das
        proprias coordenadas - uma "seta" sem ponta ou um "oval" sem tamanho
        seria gravado e depois desenhado errado (ou nem desenhado)."""
        exigidas = ("x1", "y1", "x2", "y2") if self.tipo == "seta" else ("x", "y", "largura", "altura")
        faltando = [c for c in exigidas if getattr(self, c) is None]
        if faltando:
            raise ValueError(f"Marcação '{self.tipo}' sem as coordenadas: {', '.join(faltando)}.")
        return self


class CurationCreate(BaseModel):
    # Opcional desde 18/11/2026: sem tipo informado, o sistema sugere um a
    # partir da propria imagem (curation/tipo_automatico.py).
    tipo_radiografia: Optional[TipoRadiografia] = None
    dentes: Optional[List[int]] = Field(default=None, max_length=MAX_DENTES)
    idade_min: Optional[int] = None
    idade_max: Optional[int] = None
    genero: Optional[Genero] = None
    achado_principal: Optional[AchadoPrincipal] = None
    achados_detalhe: Optional[TextoLongo] = None
    alteracoes_observadas: Optional[List[AlteracaoObservada]] = Field(default=None, max_length=MAX_ALTERACOES)
    # regioes que a imagem mostra (lista completa; substitui a anterior)
    regioes_imagem: Optional[List[RegiaoAnatomica]] = Field(default=None, max_length=len(RegiaoAnatomica))
    qualidade_tecnica: Optional[QualidadeTecnica] = None
    dificuldade: Optional[Dificuldade] = None
    descricao_didatica: Optional[TextoLongo] = None
    observacoes_internas: Optional[TextoLongo] = None


class PontoMedida(BaseModel):
    """Um ponto da medida, em fracao (0-1) da imagem do corte."""
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


MAX_MEDIDAS = 50


class MedidaFicha(BaseModel):
    """
    MEDIDA NA TOMOGRAFIA (24/11/2026, pedido do Luciano): regua (2 pontos)
    ou angulo (3 pontos; o do meio e o vertice) num CORTE de um PLANO. O
    valor (mm ou graus) nao e guardado: a tela calcula pela geometria do
    exame (lib/tomografia.ts), assim nunca fica diferente dos pontos.
    """
    id: str = Field(max_length=64)
    tipo: Literal["regua", "angulo"]
    plano: Literal["axial", "sagital", "coronal"]
    corte: int = Field(ge=0, le=100000)
    pontos: List[PontoMedida] = Field(min_length=2, max_length=3)

    @model_validator(mode="after")
    def _pontos_do_tipo(self):
        esperado = 2 if self.tipo == "regua" else 3
        if len(self.pontos) != esperado:
            raise ValueError(f"{self.tipo} tem {esperado} pontos.")
        return self


class CurationUpdate(BaseModel):
    """
    Atualizacao parcial dos campos de classificacao de uma ficha.
    Nao inclui `status` de proposito - a troca de status continua exclusiva
    de approve/discard/request-review/apply-review-decision.
    """
    modalidade: Optional[Modalidade] = None
    tipo_radiografia: Optional[TipoRadiografia] = None
    dentes: Optional[List[int]] = Field(default=None, max_length=MAX_DENTES)
    idade_min: Optional[int] = None
    idade_max: Optional[int] = None
    genero: Optional[Genero] = None
    achado_principal: Optional[AchadoPrincipal] = None
    # Lista completa das marcacoes da ficha - quando enviado, substitui a
    # lista inteira (o frontend sempre manda o estado atual completo).
    marcacoes: Optional[List[Marcacao]] = Field(default=None, max_length=MAX_MARCACOES)
    # medidas da tomografia (24/11/2026): lista completa; substitui a anterior
    medidas: Optional[List[MedidaFicha]] = Field(default=None, max_length=MAX_MEDIDAS)
    achados_detalhe: Optional[TextoLongo] = None
    alteracoes_observadas: Optional[List[AlteracaoObservada]] = Field(default=None, max_length=MAX_ALTERACOES)
    # regioes que a imagem mostra (lista completa; substitui a anterior)
    regioes_imagem: Optional[List[RegiaoAnatomica]] = Field(default=None, max_length=len(RegiaoAnatomica))
    qualidade_tecnica: Optional[QualidadeTecnica] = None
    dificuldade: Optional[Dificuldade] = None
    descricao_didatica: Optional[TextoLongo] = None
    observacoes_internas: Optional[TextoLongo] = None
    # 08/11/2026: texto livre que nao vai para a Pesquisa avancada
    informacoes_adicionais: Optional[TextoLongo] = None
    anonimizacao_validada: Optional[bool] = None
    # Termos do vocabulario controlado ligados a ficha (lista completa -
    # substitui a anterior). Ver app/modules/vocabulario.py.
    termos: Optional[List[int]] = Field(default=None, max_length=MAX_TERMOS)
    # A edicao veio (no todo ou em parte) da curadoria por voz - so para
    # registro na auditoria (dado de pesquisa); nao muda nenhum campo.
    origem_voz: Optional[bool] = None
    # SECAO UNICA "ACHADOS" (um achado = um registro: tipo + dentes + regiao
    # + marcacoes). Quando enviado, substitui TODOS os achados estruturados
    # da ficha; o resumo legado `alteracoes_observadas` e os `dentes` da
    # ficha passam a ser DERIVADOS destes achados (ver ficha.py). Definido
    # mais abaixo (AchadoCreate) - referencia adiada.
    achados: Optional[List["AchadoCreate"]] = Field(default=None, max_length=MAX_ACHADOS)
    # "Imagem sem alteracoes" (radiografia normal) - guardado como
    # achado_principal = "normal". So vale se a ficha nao tiver achados.
    sem_alteracoes: Optional[bool] = None
    # Erros tecnicos da imagem (lista completa - substitui os anteriores).
    erros_tecnicos: Optional[List[TipoErroTecnico]] = Field(default=None, max_length=MAX_ERROS_TECNICOS)
    # ORIGEM da imagem (aparelho / externa) - antes so automatica; desde
    # 26/10/2026 o curador confere e corrige na ficha (filtro da Pesquisa)
    origem: Optional[OrigemImagem] = None
    # 23/11/2026 (curation/situacao_dentaria.py): denticao, odontograma de
    # situacao {"16": ["restaurado"]} (lista completa - substitui; {} apaga)
    # e estruturas fora dos dentes (so panoramica; lista completa)
    denticao: Optional[Denticao] = None
    situacao_dentes: Optional[Dict[str, List[SituacaoDente]]] = Field(default=None, max_length=len(DENTES_FDI))
    estruturas_extradentais: Optional[List[EstruturaExtradental]] = Field(default=None, max_length=len(EstruturaExtradental))


class CurationApprove(BaseModel):
    anonimizacao_validada: bool
    observacoes: Optional[TextoMedio] = None


class CurationDiscard(BaseModel):
    motivo: TextoMedio


class CurationArquivar(BaseModel):
    motivo: TextoMedio


class CurationDesarquivar(BaseModel):
    motivo: Optional[TextoMedio] = None


class ReviewRequest(BaseModel):
    motivo: TextoMedio
    primeiro_parecer: Optional[TextoMedio] = None


class AnotacaoItemEntrada(BaseModel):
    """Anotacao do revisor sobre UM item da ficha (ver segunda_opiniao.py)."""
    item: str = Field(max_length=40)
    avaliacao: AvaliacaoItem
    nota: Optional[TextoMedio] = None
    # valor proposto para o item (so nos itens com lista de valores: tipo,
    # qualidade, achado principal, genero, dentes) - validado no servidor
    # ou, no item "marcacoes" (22/11/2026), as marcacoes que o revisor desenhou
    valor_sugerido: Optional[
        Annotated[str, Field(max_length=60)]
        | Annotated[List[int], Field(max_length=MAX_DENTES)]
        | Annotated[List[Marcacao], Field(max_length=MAX_MARCACOES)]
    ] = None


class ReviewRespond(BaseModel):
    # Parecer escrito opcional. A tela nova (out/2026) manda a avaliacao
    # geral (classificacao, escala tipo RADPEER) e as anotacoes item a item;
    # "concordancia" continua aceito (telas/integracoes antigas) e, quando a
    # classificacao vem, e derivado dela.
    parecer_revisor: Optional[TextoMedio] = None
    concordancia: Optional[str] = Field(default=None, max_length=20)  # "concorda" ou "discorda"
    classificacao: Optional[ClassificacaoRevisao] = None
    anotacoes: List[AnotacaoItemEntrada] = Field(default_factory=list, max_length=60)
    decisao_final: Optional[DecisaoRevisao] = None
    observacoes: Optional[TextoMedio] = None


class AplicarDecisaoRevisao(BaseModel):
    decisao: DecisaoFinalRevisao
    anonimizacao_validada: Optional[bool] = None  # obrigatorio de fato so se decisao == aprovar
    motivo: Optional[TextoMedio] = None            # obrigatorio de fato so se decisao == descartar
    observacoes: Optional[TextoMedio] = None


# ---------------------------------------------------------------------
# Classificacao odontologica estruturada (Fase 2) - Achado / ErroTecnico.
# Modelos ORM e enums em app/modules/achados.py (Fase 1, aprovada).
# ---------------------------------------------------------------------
class AchadoCreate(BaseModel):
    tipo: TipoAchado
    regiao_anatomica: Optional[RegiaoAnatomica] = None
    # Numeros FDI (11-48) relacionados a ESTE achado - validados/normalizados
    # (duplicata removida, ordenado) na camada de rota, nao aqui, pra poder
    # cruzar com `dente_nao_identificado` (que so o endpoint tem acesso aos
    # dois valores juntos no momento da validacao).
    dentes: Optional[List[int]] = Field(default=None, max_length=MAX_DENTES)
    dente_nao_identificado: bool = False
    descricao: Optional[TextoMedio] = None
    # termo do vocabulario escolhido para esta marcacao (tipo "outro")
    termo_id: Optional[int] = Field(default=None, ge=1)
    # Mesmo formato geometrico ja usado em Curation.marcacoes - reaproveita
    # `Marcacao` (acima) sem inventar um novo formato. Os subcampos
    # achado/achado_descricao de Marcacao ficam sem uso aqui de proposito
    # (a classificacao do achado ja e o proprio registro, nao mais um
    # atributo por forma).
    marcacoes: Optional[List[Marcacao]] = Field(default=None, max_length=MAX_MARCACOES)


class AchadoUpdate(BaseModel):
    """Atualizacao parcial - so os campos enviados sao alterados."""
    tipo: Optional[TipoAchado] = None
    regiao_anatomica: Optional[RegiaoAnatomica] = None
    dentes: Optional[List[int]] = Field(default=None, max_length=MAX_DENTES)
    dente_nao_identificado: Optional[bool] = None
    descricao: Optional[TextoMedio] = None
    marcacoes: Optional[List[Marcacao]] = Field(default=None, max_length=MAX_MARCACOES)


class AchadoOut(BaseModel):
    id: int
    curation_id: int
    tipo: str
    regiao_anatomica: Optional[str] = None
    dentes: Optional[List[int]] = None
    dente_nao_identificado: bool
    descricao: Optional[str] = None
    termo_id: Optional[int] = None
    marcacoes: list
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None

    class Config:
        from_attributes = True


class ErroTecnicoCreate(BaseModel):
    tipo: TipoErroTecnico
    descricao: Optional[TextoMedio] = None


class ErroTecnicoUpdate(BaseModel):
    tipo: Optional[TipoErroTecnico] = None
    descricao: Optional[TextoMedio] = None


class ErroTecnicoOut(BaseModel):
    id: int
    curation_id: int
    tipo: str
    descricao: Optional[str] = None
    criado_em: Optional[datetime] = None

    class Config:
        from_attributes = True


# resolve a referencia adiada de CurationUpdate.achados (AchadoCreate e
# declarado depois de CurationUpdate neste arquivo)
CurationUpdate.model_rebuild()
