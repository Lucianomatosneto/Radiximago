#!/usr/bin/env python3
"""Aplica um CSV de mudanças (ex.: mudancas_2026-11-12.csv) à matriz ASVS completa.

Uso:  python3 aplicar_mudancas_matriz.py matriz_asvs.csv mudancas.csv saida.csv

- Casa as linhas pelo campo id_interno (ex.: RX-ASVS-101).
- Troca: aplicabilidade, resultado_obtido, situacao, criticidade, recomendacao,
  revisao_humana, data_avaliacao, versao_codigo (a partir dos campos *_nova do CSV de mudanças).
- Mantém separador ';', BOM e quebras de linha CRLF da matriz original.
- Imprime a contagem por situação ANTES e DEPOIS. Não altera o arquivo de entrada.
"""
import csv, sys
from collections import Counter

MAPA = {  # coluna da matriz <- coluna do CSV de mudanças
    "aplicabilidade": "aplicabilidade_nova",
    "resultado_obtido": "resultado_obtido_novo",
    "situacao": "situacao_nova",
    "criticidade": "criticidade",
    "recomendacao": "recomendacao",
    "revisao_humana": "revisao_humana",
    "data_avaliacao": "data_avaliacao",
    "versao_codigo": "versao_codigo",
}

def ler(caminho):
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f, delimiter=";")
        return leitor.fieldnames, list(leitor)

def contar(linhas):
    return Counter(l["situacao"] for l in linhas)

def main(matriz, mudancas, saida):
    campos, linhas = ler(matriz)
    _, novas = ler(mudancas)
    for col in MAPA:
        if col not in campos:
            sys.exit(f"Coluna ausente na matriz: {col}")
    por_id = {l["id_interno"]: l for l in linhas}
    antes = contar(linhas)
    ausentes = [n["id_interno"] for n in novas if n["id_interno"] not in por_id]
    if ausentes:
        sys.exit(f"Ids das mudanças que não existem na matriz: {ausentes}")
    trocadas = 0
    for n in novas:
        alvo = por_id[n["id_interno"]]
        for col, origem in MAPA.items():
            alvo[col] = n[origem]
        trocadas += 1
    depois = contar(linhas)
    with open(saida, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, delimiter=";", lineterminator="\r\n")
        w.writeheader()
        w.writerows(linhas)
    print(f"Linhas trocadas: {trocadas} de {len(linhas)}")
    for s in sorted(set(antes) | set(depois)):
        print(f"{s:45s} antes={antes.get(s,0):4d} depois={depois.get(s,0):4d} ({depois.get(s,0)-antes.get(s,0):+d})")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
