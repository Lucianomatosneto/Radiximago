"""Schemas Pydantic de entrada dos endpoints de curadoria."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

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
)


class Marcacao(BaseModel):
    """
    Uma forma desenhada pelo curador sobre a miniatura estatica pra indicar
    uma lesao (nao sobre o OHIF, que roda em outra origem e nao tem como
    ser lido de volta). Coordenadas sempre relativas (0.0-1.0) a
    largura/altura da imagem, pra funcionar em qualquer resolucao/zoom.

    oval/retangulo usam x,y (canto superior esquerdo) + largura/altura.
    seta usa x1,y1 (cauda) + x2,y2 (ponta).
    """
    id: str
    tipo: Literal["oval", "retangulo", "seta"]
    x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    largura: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    altura: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    x1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    x2: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y2: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    # Tipo de lesao indicada por essa forma - o curador escolhe logo apos
    # desenhar, e o estudante ve o rotulo ao passar o mouse em cima dela.
    achado: Optional[AchadoPrincipal] = None


class CurationCreate(BaseModel):
    tipo_radiografia: TipoRadiografia
    dentes: Optional[List[int]] = None
    idade_min: Optional[int] = None
    idade_max: Optional[int] = None
    genero: Optional[Genero] = None
    achado_principal: Optional[AchadoPrincipal] = None
    achados_detalhe: Optional[str] = None
    alteracoes_observadas: Optional[List[AlteracaoObservada]] = None
    qualidade_tecnica: Optional[QualidadeTecnica] = None
    dificuldade: Optional[Dificuldade] = None
    descricao_didatica: Optional[str] = None
    observacoes_internas: Optional[str] = None


class CurationUpdate(BaseModel):
    """
    Atualizacao parcial dos campos de classificacao de uma ficha.
    Nao inclui `status` de proposito - a troca de status continua exclusiva
    de approve/discard/request-review/apply-review-decision.
    """
    modalidade: Optional[Modalidade] = None
    tipo_radiografia: Optional[TipoRadiografia] = None
    dentes: Optional[List[int]] = None
    idade_min: Optional[int] = None
    idade_max: Optional[int] = None
    genero: Optional[Genero] = None
    achado_principal: Optional[AchadoPrincipal] = None
    # Lista completa das marcacoes da ficha - quando enviado, substitui a
    # lista inteira (o frontend sempre manda o estado atual completo).
    marcacoes: Optional[List[Marcacao]] = None
    achados_detalhe: Optional[str] = None
    alteracoes_observadas: Optional[List[AlteracaoObservada]] = None
    qualidade_tecnica: Optional[QualidadeTecnica] = None
    dificuldade: Optional[Dificuldade] = None
    descricao_didatica: Optional[str] = None
    observacoes_internas: Optional[str] = None
    anonimizacao_validada: Optional[bool] = None


class CurationApprove(BaseModel):
    anonimizacao_validada: bool
    observacoes: Optional[str] = None


class CurationDiscard(BaseModel):
    motivo: str


class ReviewRequest(BaseModel):
    motivo: str
    primeiro_parecer: Optional[str] = None


class ReviewRespond(BaseModel):
    parecer_revisor: str
    concordancia: str  # "concorda" ou "discorda"
    decisao_final: Optional[DecisaoRevisao] = None
    observacoes: Optional[str] = None


class AplicarDecisaoRevisao(BaseModel):
    decisao: DecisaoFinalRevisao
    anonimizacao_validada: Optional[bool] = None  # obrigatorio de fato so se decisao == aprovar
    motivo: Optional[str] = None                   # obrigatorio de fato so se decisao == descartar
    observacoes: Optional[str] = None
