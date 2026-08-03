"""
Roteador de Curadoria - endpoints da Fase 4.

Pacote dividido por sub-fluxo:
- consultas.py: leitura (fila pendente, fila de reviews pendentes, link do
  OHIF, series/preview de imagem pendente, ficha completa, historico de
  reviews de uma ficha).
- ficha.py: criacao e edicao da ficha.
- aprovacao_descarte.py: aprovar/descartar uma ficha.
- segunda_opiniao.py: solicitar, responder e aplicar a decisao da segunda
  opiniao.
- common.py: helpers e constantes compartilhados entre os submodulos acima.
- schemas.py: schemas Pydantic de entrada dos endpoints.
- router.py: instancia unica do APIRouter compartilhada por todos os
  submodulos (evita import circular).

Endpoints:
- GET  /curation/pending                       -> fila de imagens sem ficha
- GET  /curation/reviews/pending                -> fila de segundas opinioes aguardando resposta
- GET  /curation/{orthanc_reference_id}/viewer-url -> link do OHIF para abrir a imagem
- GET  /curation/{orthanc_reference_id}/series  -> series do estudo (fila de curadoria)
- GET  /curation/{orthanc_reference_id}/preview -> miniatura PNG (fila de curadoria)
- GET  /curation/{curation_id}                  -> ficha de curadoria completa
- PATCH /curation/{curation_id}                 -> edita os campos de classificacao (nao altera status)
- GET  /curation/{curation_id}/reviews          -> historico de segundas opinioes
- POST /curation/{orthanc_reference_id}         -> cria a ficha de curadoria
- POST /curation/{curation_id}/approve          -> aprova a ficha (libera)
- POST /curation/{curation_id}/discard          -> descarta a ficha (com motivo)
- POST /curation/{curation_id}/request-review   -> solicita segunda opiniao
- POST /curation/reviews/{review_id}/respond    -> revisor responde
- POST /curation/{curation_id}/apply-review-decision -> aplica a decisao final apos a segunda opiniao respondida

Acesso: administrador, suporte e curador podem operar todos os endpoints
deste modulo (criar ficha, aprovar, descartar, solicitar/responder segunda
opiniao e aplicar a decisao final) - Bloco 4, Secao 16.
"""

from .router import router
from . import consultas, ficha, aprovacao_descarte, segunda_opiniao  # noqa: F401 - registram as rotas no router compartilhado

__all__ = ["router"]
