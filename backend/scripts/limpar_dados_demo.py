"""
Limpeza dos dados de DEMONSTRACAO antes de usar dados reais (02/11/2026).

Por padrao e uma SIMULACAO: so mostra o que seria removido e nao muda nada.
Para apagar de verdade, acrescente --executar.

Uso (PowerShell, na pasta do projeto, com o Docker ligado):
    docker compose exec radix-api python scripts/limpar_dados_demo.py
    docker compose exec radix-api python scripts/limpar_dados_demo.py --pasta 1 --pasta 2
    docker compose exec radix-api python scripts/limpar_dados_demo.py --pasta 2 --executar

O que entra na limpeza:
 - Usuarios com e-mail @radiximago.example.com (os de demonstracao): sao
   marcados como EXCLUIDOS (como a tela Usuarios faz), ficam inativos e as
   sessoes abertas sao fechadas. Nada e apagado do banco, para a auditoria
   continuar com todos os nomes.
 - Pastas de pacientes (casos_clinicos) em que o aluno OU o professor e de
   demonstracao, ou cujo paciente se chama "DEMO ...". Para incluir outra pasta
   (por exemplo, uma pasta de teste antiga), informe --pasta NUMERO. Cada pasta
   apagada leva junto as fotos cifradas do disco, o historico, as revisoes e os
   compartilhamentos dela.
 - Compartilhamentos de imagem entre usuarios de demonstracao.

O que NUNCA e apagado: o registro de auditoria (tabela audit_logs), as imagens do
acervo e as fichas de curadoria (pelo vinculo com o Orthanc; desative-as pela
tela de Curadoria se for o caso). A propria limpeza grava uma linha na auditoria.
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.modules import casos_arquivos
from app.modules.audit_logs import AuditLog
from app.modules.casos import (
    CasoClinico, CasoCompartilhamento, CasoHistorico, CasoImagem, CasoRevisao,
)
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.sessoes import encerrar_sessoes_do_usuario
from app.modules.users import User

DOMINIO_DEMO = "@radiximago.example.com"
ACAO_AUDITORIA = "limpeza_dados_demo"


def planejar(db: Session, pastas_extra: list[int] | None = None) -> dict:
    """Levanta o que seria removido, sem mudar nada."""
    usuarios = (db.query(User).filter(func.lower(User.email).like(f"%{DOMINIO_DEMO}"), User.excluido.is_(False))
                .order_by(User.id).all())
    ids_demo = [u.id for u in usuarios]
    # usuarios de demonstracao JA excluidos tambem contam para achar pastas ligadas a eles
    todos_demo = [i for (i,) in db.query(User.id).filter(func.lower(User.email).like(f"%{DOMINIO_DEMO}")).all()]

    filtro = [func.upper(func.substr(CasoClinico.paciente_nome, 1, 5)) == "DEMO "]
    if todos_demo:
        filtro += [CasoClinico.aluno_id.in_(todos_demo), CasoClinico.professor_id.in_(todos_demo)]
    if pastas_extra:
        filtro.append(CasoClinico.id.in_(pastas_extra))
    casos = db.query(CasoClinico).filter(or_(*filtro)).order_by(CasoClinico.id).all()

    compart = []
    if todos_demo:
        compart = (db.query(CompartilhamentoImagem)
                   .filter(CompartilhamentoImagem.remetente_id.in_(todos_demo),
                           CompartilhamentoImagem.destinatario_id.in_(todos_demo)).all())
    nao_existentes = sorted(set(pastas_extra or []) - {c.id for c in casos})
    return {"usuarios": usuarios, "casos": casos, "compartilhamentos": compart, "pastas_inexistentes": nao_existentes,
            "ids_usuarios": ids_demo}


def descrever(plano: dict, db: Session) -> list[str]:
    linhas = [f"Usuarios de demonstracao a EXCLUIR (soft-delete): {len(plano['usuarios'])}"]
    linhas += [f"   - #{u.id} {u.nome} <{u.email}> ({u.perfil})" for u in plano["usuarios"]]
    linhas.append(f"Pastas de pacientes a APAGAR: {len(plano['casos'])}")
    for c in plano["casos"]:
        fotos = db.query(CasoImagem).filter(CasoImagem.caso_id == c.id).count()
        linhas.append(f"   - pasta #{c.id} (paciente '{c.paciente_nome}', aluno_id={c.aluno_id}, {fotos} arquivo(s) cifrado(s))")
    linhas.append(f"Compartilhamentos de imagem entre usuarios de demonstracao: {len(plano['compartilhamentos'])}")
    if plano["pastas_inexistentes"]:
        linhas.append(f"ATENCAO: pasta(s) pedida(s) que nao existem: {plano['pastas_inexistentes']}")
    return linhas


def executar(db: Session, plano: dict) -> dict:
    """Aplica o plano. Devolve contadores. Faz commit no fim (tudo ou nada)."""
    agora = datetime.now(timezone.utc)
    arquivos: list[str] = []
    for c in plano["casos"]:
        for img in db.query(CasoImagem).filter(CasoImagem.caso_id == c.id).all():
            arquivos += [img.arquivo, img.miniatura]
        db.query(CasoImagem).filter(CasoImagem.caso_id == c.id).delete(synchronize_session=False)
        db.query(CasoRevisao).filter(CasoRevisao.caso_id == c.id).delete(synchronize_session=False)
        db.query(CasoCompartilhamento).filter(CasoCompartilhamento.caso_id == c.id).delete(synchronize_session=False)
        db.query(CasoHistorico).filter(CasoHistorico.caso_id == c.id).delete(synchronize_session=False)
        db.delete(c)
    for cp in plano["compartilhamentos"]:
        db.delete(cp)
    for u in plano["usuarios"]:
        encerrar_sessoes_do_usuario(db, u.id, "limpeza_dados_demo")
        u.excluido = True
        u.excluido_em = agora
        u.ativo = False
    resumo = {"usuarios": len(plano["usuarios"]), "pastas": len(plano["casos"]),
              "compartilhamentos": len(plano["compartilhamentos"]), "arquivos": len(arquivos)}
    db.add(AuditLog(usuario_id=None, acao=ACAO_AUDITORIA, entidade="sistema", entidade_id=None, resultado="sucesso",
                    detalhes=f"usuarios={resumo['usuarios']}, pastas={resumo['pastas']}, "
                             f"compartilhamentos={resumo['compartilhamentos']}, arquivos={resumo['arquivos']}"))
    db.commit()
    # os arquivos so saem do disco DEPOIS de o banco confirmar (se o banco falhar, nada se perde)
    for nome in arquivos:
        casos_arquivos.apagar(nome)
    return resumo


def main() -> int:
    ap = argparse.ArgumentParser(description="Limpa os dados de demonstracao (simulacao por padrao).")
    ap.add_argument("--executar", action="store_true", help="apaga de verdade (sem isso, so simula)")
    ap.add_argument("--pasta", type=int, action="append", default=[], help="numero de uma pasta extra a apagar (repita)")
    args = ap.parse_args()

    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        plano = planejar(db, args.pasta)
        print("\n".join(descrever(plano, db)))
        if not args.executar:
            print("\nSIMULACAO: nada foi alterado. Para apagar de verdade, rode de novo com --executar.")
            return 0
        resumo = executar(db, plano)
        print(f"\nFEITO: {resumo}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
