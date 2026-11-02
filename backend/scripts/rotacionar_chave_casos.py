"""
Troca a chave das fotos das pastas de pacientes (ver docs/PASTAS_DE_PACIENTES.md).

Uso (dentro do container da API, DEPOIS de fazer backup das fotos):
  simulacao : python scripts/rotacionar_chave_casos.py
  de verdade: python scripts/rotacionar_chave_casos.py --aplicar

Variaveis de ambiente:
  CASOS_CHAVE_ANTIGA  chave em uso hoje (se vazia, usa a CASOS_CHAVE/JWT atual do .env)
  CASOS_CHAVE_NOVA    chave nova (obrigatoria; minimo 32 caracteres)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.modules.casos_arquivos import pasta_casos  # noqa: E402
from app.modules.casos_rotacao import rotacionar  # noqa: E402


def main() -> int:
    aplicar = "--aplicar" in sys.argv
    antiga = os.environ.get("CASOS_CHAVE_ANTIGA", "").strip() or settings.CASOS_CHAVE.strip() or settings.JWT_SECRET_KEY
    nova = os.environ.get("CASOS_CHAVE_NOVA", "").strip()
    if len(nova) < 32:
        print("ERRO: defina CASOS_CHAVE_NOVA com pelo menos 32 caracteres.")
        return 2
    try:
        r = rotacionar(pasta_casos(), antiga, nova, aplicar)
    except ValueError as erro:
        print(f"ERRO: {erro}")
        return 2
    print(f"Modo: {'APLICAR' if aplicar else 'SIMULACAO (nada foi alterado)'}")
    print(f"Arquivos .rx encontrados : {r['total']}")
    print(f"Abrem com a chave antiga : {r['a_trocar']}" + (f"  -> trocados: {r['trocadas']}" if aplicar else ""))
    print(f"Ja estao na chave nova   : {r['ja_na_chave_nova']}")
    print(f"Ilegiveis (nenhuma chave): {len(r['ilegiveis'])}")
    for nome in r["ilegiveis"][:20]:
        print(f"   - {nome}")
    if r["ilegiveis"]:
        print("ATENCAO: ha arquivos que nenhuma chave abre. NAO troque o .env ate resolver.")
        return 1
    if aplicar:
        print("PRONTO. Agora coloque a chave nova em CASOS_CHAVE no .env e reinicie a API.")
    else:
        print("Simulacao OK. Se os numeros estao como esperado, rode de novo com --aplicar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
