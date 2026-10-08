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
- achados.py: CRUD de Achados odontologicos estruturados (Fase 2).
- erros_tecnicos.py: CRUD de Erros Tecnicos (Fase 2) - dimensao
  independente de Achado, de proposito.
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
- GET  /curation/reviews/answered                -> fila de segundas opinioes ja respondidas
- GET  /curation/minhas-estatisticas             -> resumo pessoal do curador (aprovadas + ranking do mes)
- GET  /curation/{curation_id}                  -> ficha de curadoria completa
- PATCH /curation/{curation_id}                 -> edita os campos de classificacao (nao altera status)
- GET  /curation/{curation_id}/reviews          -> historico de segundas opinioes
- POST /curation/{orthanc_reference_id}         -> cria a ficha de curadoria
- POST /curation/{curation_id}/approve          -> aprova a ficha (libera)
- POST /curation/{curation_id}/discard          -> descarta a ficha (com motivo)
- POST /curation/{curation_id}/request-review   -> solicita segunda opiniao
- POST /curation/reviews/{review_id}/respond    -> revisor responde
- POST /curation/{curation_id}/apply-review-decision -> aplica a decisao final apos a segunda opiniao respondida
- POST   /curation/{curation_id}/achados                  -> cria um achado
- GET    /curation/{curation_id}/achados                  -> lista os achados da ficha
- GET    /curation/{curation_id}/achados/{achado_id}      -> obtem um achado
- PATCH  /curation/{curation_id}/achados/{achado_id}      -> edita um achado (parcial)
- DELETE /curation/{curation_id}/achados/{achado_id}      -> exclui um achado
- POST   /curation/{curation_id}/erros-tecnicos             -> cria um erro tecnico
- GET    /curation/{curation_id}/erros-tecnicos             -> lista os erros tecnicos da ficha
- GET    /curation/{curation_id}/erros-tecnicos/{erro_id}   -> obtem um erro tecnico
- PATCH  /curation/{curation_id}/erros-tecnicos/{erro_id}   -> edita um erro tecnico (parcial)
- DELETE /curation/{curation_id}/erros-tecnicos/{erro_id}   -> exclui um erro tecnico

Acesso: administrador, suporte e curador podem operar todos os endpoints
deste modulo (criar ficha, aprovar, descartar, solicitar/responder segunda
opiniao, aplicar a decisao final, e agora tambem criar/consultar/editar/
excluir achados e erros tecnicos) - Bloco 4, Secao 16. Achados/erros
tecnicos so podem ser criados/editados/excluidos enquanto a ficha estiver
em status editavel (pendente/em_analise) - mesma regra ja aplicada aos
campos legados via PATCH /curation/{curation_id}.
"""

from .router import router
from . import consultas, ficha, aprovacao_descarte, segunda_opiniao, achados, erros_tecnicos  # noqa: F401 - registram as rotas no router compartilhado

__all__ = ["router"]
