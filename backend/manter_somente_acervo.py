"""
Deixa ATIVAS no Radix so as imagens do acervo da avaliacao (as enviadas em
22/11/2026) e DESATIVA as antigas. Pedido do Luciano, 23/11/2026.

Nada e apagado: a desativacao e a mesma da tela de Imagens (ativo=false,
reversivel com "reativar"), com um registro "desativacao_imagem" na
auditoria para cada exame, em nome do administrador informado. Os arquivos
continuam no Orthanc e a auditoria nao e alterada.

- a lista do que FICA vem do envio.csv do acervo (linhas com resultado
  "importada" ou "ja_existente") ou de um arquivo com um ID por linha;
- tomografia: se um corte do exame esta na lista, o exame inteiro fica;
  um exame antigo e desativado inteiro, com UM registro de auditoria;
- lista vazia, ou que nao acha nenhuma imagem ativa: para sem mexer.

Uso (PowerShell, na pasta do Radix):

  1) FAZER O BACKUP antes (roteiro de backup do projeto).
  2) Copiar a lista para dentro do sistema:
         docker compose cp C:\\Users\\<voce>\\RadixImagens\\convertidos\\envio.csv radix-api:/tmp/envio.csv
  3) SIMULAR (nao altera nada):
         docker compose exec radix-api python manter_somente_acervo.py /tmp/envio.csv --admin <email do administrador>
  4) APLICAR:
         docker compose exec radix-api python manter_somente_acervo.py /tmp/envio.csv --admin <email do administrador> --aplicar
"""

import csv
import sys

from sqlalchemy.orm import Session

RESULTADOS_QUE_FICAM = {"importada", "ja_existente"}


def ler_ids_a_manter(caminho: str) -> set[int]:
    """IDs (orthanc_reference_id) das imagens que devem continuar ativas."""
    with open(caminho, encoding="utf-8-sig", newline="") as arquivo:
        primeira = arquivo.readline()
        arquivo.seek(0)
        if "orthanc_reference_id" in primeira:
            ids = set()
            for linha in csv.DictReader(arquivo):
                valor = (linha.get("orthanc_reference_id") or "").strip()
                if linha.get("resultado", "").strip() in RESULTADOS_QUE_FICAM and valor.isdigit():
                    ids.add(int(valor))
            return ids
        return {int(t) for t in (linha.strip() for linha in arquivo) if t.isdigit()}


def _parar(mensagem: str) -> None:
    print(f"PARADO: {mensagem} Nada foi alterado.")
    raise SystemExit(1)


def executar(db: Session, ids_manter: set[int], email_admin: str, aplicar: bool,
             limitar_a: set[int] | None = None) -> dict:
    """limitar_a: so considera estas imagens (testes automaticos usam para nao
    mexer em outras imagens do banco de teste). Sem ele, vale para todas."""
    from app.modules.images_router import _alterar_ativo_imagem
    from app.modules.orthanc_references import OrthancReference
    from app.modules.users import User, UserRole

    admin = db.query(User).filter(User.email == email_admin).first()
    if not admin or admin.perfil != UserRole.administrador or not getattr(admin, "ativo", True):
        _parar(f"'{email_admin}' nao e um administrador ativo.")
    if not ids_manter:
        _parar("a lista do que deve ficar esta vazia.")

    encontradas = db.query(OrthancReference).filter(OrthancReference.id.in_(ids_manter)).all()
    nao_encontradas = sorted(ids_manter - {r.id for r in encontradas})
    if not any(r.ativo for r in encontradas):
        _parar("nenhuma imagem da lista existe (ativa) neste Radix.")

    # o exame inteiro da tomografia fica, mesmo que a lista traga so um corte
    series_que_ficam = {r.series_instance_uid for r in encontradas if r.em_volume and r.series_instance_uid}

    def fica(ref) -> bool:
        return ref.id in ids_manter or (ref.em_volume and ref.series_instance_uid in series_que_ficam)

    consulta = db.query(OrthancReference).filter(OrthancReference.ativo.is_(True))
    if limitar_a is not None:
        consulta = consulta.filter(OrthancReference.id.in_(limitar_a))
    ativas = consulta.order_by(OrthancReference.id).all()
    manter = [r for r in ativas if fica(r)]
    desativar: list[int] = []  # um ID por exame (o 1o corte, na tomografia)
    por_tipo: dict[str, int] = {}
    series_vistas: set[str] = set()
    for ref in ativas:
        if fica(ref):
            continue
        if ref.em_volume and ref.series_instance_uid:
            if ref.series_instance_uid in series_vistas:
                continue
            series_vistas.add(ref.series_instance_uid)
        desativar.append(ref.id)
        tipo = ref.tipo_preliminar or "nao informado"
        por_tipo[tipo] = por_tipo.get(tipo, 0) + 1

    print("=" * 60)
    print(f"MANTER SO O ACERVO - {'APLICANDO' if aplicar else 'SIMULACAO (nada sera alterado)'}")
    print("=" * 60)
    print(f"Ficam ativas: {len(manter)} imagens/cortes")
    print(f"Serao desativados: {len(desativar)} exames")
    for tipo, total in sorted(por_tipo.items()):
        print(f"  {tipo}: {total}")
    if nao_encontradas:
        print(f"Atencao: {len(nao_encontradas)} IDs da lista nao existem neste Radix: {nao_encontradas[:20]}")

    if aplicar:
        for ref_id in desativar:
            _alterar_ativo_imagem(db, ref_id, False, admin)
        print(f"Pronto: {len(desativar)} exames desativados (reversivel pela tela de Imagens).")
    else:
        print("Nada foi alterado. Para gravar, rode de novo com --aplicar.")

    return {
        "manter": len(manter),
        "desativar": desativar,
        "exames_desativados": len(desativar) if aplicar else 0,
        "por_tipo": por_tipo,
        "nao_encontradas": nao_encontradas,
    }


def _argumento(nome: str) -> str | None:
    if nome in sys.argv:
        i = sys.argv.index(nome)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else None
    return None


if __name__ == "__main__":
    import app.main  # noqa: F401 - carrega TODAS as tabelas do sistema
    from app.core.database import SessionLocal

    caminho = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else None
    email = _argumento("--admin")
    if not caminho or not email:
        print(__doc__)
        raise SystemExit(2)
    sessao = SessionLocal()
    try:
        executar(sessao, ler_ids_a_manter(caminho), email, aplicar="--aplicar" in sys.argv)
    finally:
        sessao.close()
