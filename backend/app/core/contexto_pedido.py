"""
Dados do pedido em andamento, disponiveis para qualquer parte do codigo
durante aquele pedido (sem passar parametro por todas as funcoes).

Usado para gravar na auditoria DE ONDE veio cada acao (OWASP ASVS 16.2.1):
endereco de rede (ip) e rota ("POST /curation/12/approve"). Fora de um
pedido (tarefas do proprio sistema) o valor e None.
"""

from contextvars import ContextVar

pedido_atual: ContextVar[dict | None] = ContextVar("pedido_atual", default=None)
