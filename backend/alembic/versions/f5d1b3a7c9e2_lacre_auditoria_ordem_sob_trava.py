"""auditoria: o numero (id) do registro passa a ser dado DENTRO da trava do lacre

Causa da quebra de integridade vista na auditoria do administrador
(01/11/2026, registros 6309-6316 de 25/10): o numero do registro (id) era
sorteado ANTES de o gatilho pegar a trava. Com dois pedidos ao mesmo tempo, o
de numero maior podia entrar primeiro na corrente; a verificacao, que segue a
ordem dos numeros, via entao dois elos "fora de ordem" (nenhum registro foi
alterado - ver verificacao tolerante em admin_router.py).

Agora o gatilho pega a trava e SO DEPOIS da o numero (nextval), entao a ordem
dos numeros e sempre a ordem da corrente. Nada e apagado nem reescrito: so a
funcao do gatilho muda; os registros antigos ficam como estao.

Revision ID: f5d1b3a7c9e2
Revises: e3c9a5f1b7d4
"""
from alembic import op

revision = "f5d1b3a7c9e2"
down_revision = "e3c9a5f1b7d4"
branch_labels = None
depends_on = None

NOVO = """
CREATE OR REPLACE FUNCTION radix_auditoria_ao_inserir() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  anterior text;
BEGIN
  -- um registro por vez na corrente (evita duas "pontas" ao mesmo tempo)
  PERFORM pg_advisory_xact_lock(hashtext('radix_audit_logs_lacre'));
  -- o numero e dado DEPOIS da trava: a ordem dos ids = a ordem da corrente
  NEW.id := nextval(pg_get_serial_sequence('audit_logs', 'id'));
  IF NEW.criado_em IS NULL THEN
    NEW.criado_em := now();
  END IF;
  SELECT lacre INTO anterior FROM audit_logs ORDER BY id DESC LIMIT 1;
  NEW.lacre := radix_lacre_auditoria(anterior, NEW);
  RETURN NEW;
END;
$$;
"""

ANTIGO = """
CREATE OR REPLACE FUNCTION radix_auditoria_ao_inserir() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  anterior text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('radix_audit_logs_lacre'));
  IF NEW.criado_em IS NULL THEN
    NEW.criado_em := now();
  END IF;
  SELECT lacre INTO anterior FROM audit_logs ORDER BY id DESC LIMIT 1;
  NEW.lacre := radix_lacre_auditoria(anterior, NEW);
  RETURN NEW;
END;
$$;
"""


def upgrade() -> None:
    op.execute(NOVO)


def downgrade() -> None:
    op.execute(ANTIGO)
