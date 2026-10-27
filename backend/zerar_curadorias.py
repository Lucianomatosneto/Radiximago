"""
ZERAR AS CURADORIAS DE TESTE (pedido de 20/10/2026) - para comecar a
curadoria profissional do zero.

Apaga TODAS as fichas de curadoria e tudo o que depende delas:
  - segundas opinioes (pedidos e anotacoes por item);
  - historico das fichas, achados, erros tecnicos e termos ligados;
  - imagens salvas pelos usuarios ("Minhas imagens"), compartilhamentos e
    anotacoes de estudo feitas sobre as imagens curadas.

NAO apaga:
  - as IMAGENS (Orthanc e registros em orthanc_references) - elas voltam
    para a fila da Curadoria, com o giro e o recorte que ja receberam;
  - a AUDITORIA (protegida contra apagamento - ASVS 16.4.2); a propria
    limpeza fica registrada nela (acao "curadorias_zeradas");
  - usuarios, macros, frases aprendidas e o vocabulario.

Uso (na pasta do Radix, no computador/servidor que roda o sistema):

  1) BACKUP (obrigatorio antes de aplicar):
       docker compose exec radix-backup sh -c 'pg_dump --format=custom --file=/backups/postgres/antes-de-zerar-$(date +%Y%m%d-%H%M%S).dump'

  2) SIMULAR (nao altera nada) - mostra quantos registros seriam apagados:
       docker compose exec radix-api python zerar_curadorias.py

  3) APLICAR:
       docker compose exec radix-api python zerar_curadorias.py --aplicar --confirmo-apagar-tudo

Tudo e apagado numa UNICA transacao: se algo falhar no meio, nada e apagado.
"""

import sys

from sqlalchemy import text

import app.main  # noqa: F401 - carrega TODAS as tabelas do sistema (sem isso o banco nao monta as ligacoes entre elas)
from app.core.database import SessionLocal
from app.modules.audit_logs import AuditLog

# ordem de apagamento: primeiro quem aponta para outra tabela
TABELAS = [
    ("segmentacoes_curadoria", "pinturas de estruturas (segmentacao)"),
    ("curation_review_notes", "anotacoes por item da segunda opiniao"),
    ("curation_reviews", "pedidos de segunda opiniao"),
    ("curation_history", "historico das fichas"),
    ("achados", "achados estruturados"),
    ("erros_tecnicos", "erros tecnicos"),
    ("curation_termos", "termos do vocabulario ligados as fichas"),
    ("saved_images", "imagens salvas pelos usuarios"),
    ("compartilhamentos_imagem", "compartilhamentos"),
    ("anotacoes_imagem", "anotacoes de estudo sobre as imagens"),
    ("curations", "FICHAS DE CURADORIA"),
]


def executar(aplicar: bool) -> None:
    print("=" * 64)
    print(f"ZERAR CURADORIAS - {'APLICANDO' if aplicar else 'SIMULACAO (nada sera alterado)'}")
    print("=" * 64)
    db = SessionLocal()
    try:
        contagem = {}
        for tabela, descricao in TABELAS:
            contagem[tabela] = db.execute(text(f"SELECT count(*) FROM {tabela}")).scalar() or 0
            print(f"  {contagem[tabela]:>7}  {descricao} ({tabela})")
        imagens = db.execute(text("SELECT count(*) FROM orthanc_references WHERE ativo")).scalar() or 0
        aptas = db.execute(text(
            "SELECT count(*) FROM orthanc_references WHERE ativo AND enquadramento IN ('recortada', 'sem_borda')"
        )).scalar() or 0
        print("-" * 64)
        print(f"  Imagens ativas (nao serao apagadas): {imagens}")
        print(f"  Dessas, sem moldura (aparecem na Curadoria): {aptas}")
        print(f"  Ainda com moldura/nao verificadas (ficam fora ate o recorte): {imagens - aptas}")

        if not aplicar:
            print("\nSimulacao: nada foi alterado. Para aplicar, faca o backup e rode com")
            print("  --aplicar --confirmo-apagar-tudo")
            return

        for tabela, _ in TABELAS:
            db.execute(text(f"DELETE FROM {tabela}"))
        db.add(AuditLog(
            usuario_id=None, acao="curadorias_zeradas", entidade="curation", entidade_id=None, resultado="sucesso",
            detalhes=(
                "Curadorias de teste apagadas para inicio da curadoria profissional (roteiro zerar_curadorias.py): "
                + ", ".join(f"{t}={n}" for t, n in contagem.items())
            )[:1000],
        ))
        db.commit()
        print("\nPronto: curadorias, segundas opinioes e dados ligados foram apagados.")
        print("As imagens continuam no sistema e voltaram para a fila da Curadoria.")
    except Exception:
        db.rollback()
        print("\nERRO: nada foi apagado (a transacao foi desfeita).")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    aplicar = "--aplicar" in sys.argv
    if aplicar and "--confirmo-apagar-tudo" not in sys.argv:
        print("Para aplicar e preciso confirmar: --aplicar --confirmo-apagar-tudo (faca o backup antes).")
        sys.exit(1)
    executar(aplicar)
