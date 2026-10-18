"""auditoria: de onde veio o pedido, lacre encadeado e protecao contra alteracao

OWASP ASVS 16.2.1, 16.4.2 e 14.2.4 (docs/REGISTROS.md).

1. Colunas novas em audit_logs (nada e apagado):
   - ip: endereco de rede de quem fez o pedido;
   - rota: metodo e caminho usados (ex.: "POST /auth/login");
   - lacre: resumo SHA-256 do proprio registro somado ao lacre do registro
     anterior ("corrente"): mudar ou apagar um registro antigo quebra a
     corrente dali em diante, e a verificacao (GET /admin/audit-logs/integridade)
     aponta onde.
2. O lacre e calculado PELO BANCO (gatilho), nao pela aplicacao - assim
   nenhum caminho do codigo grava registro sem lacre.
3. O banco RECUSA alterar registros e so permite apagar os mais antigos que
   o prazo de guarda (5 anos - docs/DADOS_E_PRIVACIDADE.md). Limite honesto:
   quem administra o banco com superusuario pode desligar gatilhos; nesse
   caso o lacre denuncia a alteracao. Isolamento total = registros em outro
   sistema (ASVS 16.4.3, na implantacao).

Revision ID: a4c8e2f6b1d9
Revises: f3a7b9d1c5e6
"""
import sqlalchemy as sa
from alembic import op

revision = "a4c8e2f6b1d9"
down_revision = "f3a7b9d1c5e6"
branch_labels = None
depends_on = None

FUNCAO_LACRE = """
CREATE OR REPLACE FUNCTION radix_lacre_auditoria(anterior text, r audit_logs) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
      coalesce(anterior, 'inicio'),
      r.id::text,
      to_char(r.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      coalesce(r.usuario_id::text, ''),
      r.acao,
      coalesce(r.entidade, ''),
      coalesce(r.entidade_id::text, ''),
      r.resultado,
      coalesce(r.detalhes, ''),
      coalesce(r.ip, ''),
      coalesce(r.rota, '')
  ), 'UTF8')), 'hex')
$$;
"""

GATILHO_INSERCAO = """
CREATE OR REPLACE FUNCTION radix_auditoria_ao_inserir() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  anterior text;
BEGIN
  -- um registro por vez na corrente (evita duas "pontas" ao mesmo tempo)
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

GATILHO_PROTECAO = """
CREATE OR REPLACE FUNCTION radix_auditoria_protegida() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.criado_em < now() - interval '5 years' THEN
    RETURN OLD;  -- prazo de guarda vencido: pode apagar
  END IF;
  RAISE EXCEPTION 'Registros de auditoria nao podem ser alterados nem apagados (ASVS 16.4.2).';
END;
$$;
"""


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("ip", sa.String(length=45), nullable=True))
    op.add_column("audit_logs", sa.Column("rota", sa.String(length=200), nullable=True))
    op.add_column("audit_logs", sa.Column("lacre", sa.String(length=64), nullable=True))
    op.execute(FUNCAO_LACRE)
    # registros que ja existiam entram na corrente, em ordem
    op.execute("""
        DO $$
        DECLARE
          r audit_logs;
          anterior text := NULL;
        BEGIN
          FOR r IN SELECT * FROM audit_logs ORDER BY id LOOP
            anterior := radix_lacre_auditoria(anterior, r);
            UPDATE audit_logs SET lacre = anterior WHERE id = r.id;
          END LOOP;
        END $$;
    """)
    op.execute(GATILHO_INSERCAO)
    op.execute(GATILHO_PROTECAO)
    op.execute("""
        CREATE TRIGGER audit_logs_lacre BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION radix_auditoria_ao_inserir();
    """)
    op.execute("""
        CREATE TRIGGER audit_logs_protegida BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION radix_auditoria_protegida();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_logs_protegida ON audit_logs")
    op.execute("DROP TRIGGER IF EXISTS audit_logs_lacre ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS radix_auditoria_protegida()")
    op.execute("DROP FUNCTION IF EXISTS radix_auditoria_ao_inserir()")
    op.execute("DROP FUNCTION IF EXISTS radix_lacre_auditoria(text, audit_logs)")
    op.drop_column("audit_logs", "lacre")
    op.drop_column("audit_logs", "rota")
    op.drop_column("audit_logs", "ip")
