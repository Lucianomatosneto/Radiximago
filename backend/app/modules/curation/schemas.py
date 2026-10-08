"""Schemas Pydantic de entrada dos endpoints de curadoria."""

from datetime import datetime
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
from app.modules.achados import TipoAchado, RegiaoAnatomica, TipoErroTecnico


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
    # Texto livre usado quando achado == "outro" (a enum AchadoPrincipal e
    # fechada, entao nao ha como o curador descrever algo fora da lista so
    # com o campo `achado`) - o estudante ve esse texto no lugar do rotulo
    # generico "Outro" no tooltip, quando preenchido. Sem validacao cruzada
    # com `achado` de proposito (mesmo padrao tolerante ja usado em outros
    # campos de texto livre da ficha, ex.: parecer_revisor).
    achado_descricao: Optional[str] = None


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
    # Opcional por pedido: a tela de segunda opiniao passou a ter so os
    # botoes "Concordar com o curador" / "Discordar" - sem campo de texto
    # livre obrigatorio. Continua aceitando um parecer escrito se um dia a
    # tela voltar a coletar um (nao remove a capacidade da API).
    parecer_revisor: Optional[str] = None
    concordancia: str  # "concorda" ou "discorda"
    decisao_final: Optional[DecisaoRevisao] = None
    observacoes: Optional[str] = None


class AplicarDecisaoRevisao(BaseModel):
    decisao: DecisaoFinalRevisao
    anonimizacao_validada: Optional[bool] = None  # obrigatorio de fato so se decisao == aprovar
    motivo: Optional[str] = None                   # obrigatorio de fato so se decisao == descartar
    observacoes: Optional[str] = None


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
    dentes: Optional[List[int]] = None
    dente_nao_identificado: bool = False
    descricao: Optional[str] = None
    # Mesmo formato geometrico ja usado em Curation.marcacoes - reaproveita
    # `Marcacao` (acima) sem inventar um novo formato. Os subcampos
    # achado/achado_descricao de Marcacao ficam sem uso aqui de proposito
    # (a classificacao do achado ja e o proprio registro, nao mais um
    # atributo por forma).
    marcacoes: Optional[List[Marcacao]] = None


class AchadoUpdate(BaseModel):
    """Atualizacao parcial - so os campos enviados sao alterados."""
    tipo: Optional[TipoAchado] = None
    regiao_anatomica: Optional[RegiaoAnatomica] = None
    dentes: Optional[List[int]] = None
    dente_nao_identificado: Optional[bool] = None
    descricao: Optional[str] = None
    marcacoes: Optional[List[Marcacao]] = None


class AchadoOut(BaseModel):
    id: int
    curation_id: int
    tipo: str
    regiao_anatomica: Optional[str] = None
    dentes: Optional[List[int]] = None
    dente_nao_identificado: bool
    descricao: Optional[str] = None
    marcacoes: list
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None

    class Config:
        from_attributes = True


class ErroTecnicoCreate(BaseModel):
    tipo: TipoErroTecnico
    descricao: Optional[str] = None


class ErroTecnicoUpdate(BaseModel):
    tipo: Optional[TipoErroTecnico] = None
    descricao: Optional[str] = None


class ErroTecnicoOut(BaseModel):
    id: int
    curation_id: int
    tipo: str
    descricao: Optional[str] = None
    criado_em: Optional[datetime] = None

    class Config:
        from_attributes = True
