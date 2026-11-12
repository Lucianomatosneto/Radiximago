"""Mede a velocidade da BUSCA de imagens (S-01 da Auditoria 03) com dados sinteticos.

ONDE RODA: so em banco de teste descartavel (o nome do banco precisa conter "test").
O QUE FAZ: cria N fichas aprovadas FALSAS (texto aleatorio, sem nenhum dado real),
chama a rota GET /search com varios tipos de filtro e mede o tempo. Imprime uma
tabela em Markdown (vai para o resumo da execucao) e grava um JSON.
USO (de dentro de backend/):  python ../auditoria/scripts/medir_busca.py 2000 10000 30000
"""
import json
import os
import random
import re
import statistics
import sys
import time

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import settings

banco = make_url(settings.DATABASE_URL).database or ""
if not re.search(r"test", banco, re.IGNORECASE):
    sys.exit(f"RECUSADO: o banco '{banco}' nao parece ser de teste.")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.auth import obter_usuario_atual  # noqa: E402
from app.modules.users import User, UserRole  # noqa: E402

PALAVRAS = ("carie dentina esmalte reabsorcao lesao periapical osso alveolar canal radicular "
            "coroa raiz molar pre-molar incisivo canino fratura calculo restauracao implante "
            "periodonto seio maxilar mandibula cisto granuloma ligamento perda ossea").split()
TIPOS = ["periapical", "interproximal", "oclusal", "panoramica", "tomografia"]
ACHADOS = ["carie", "lesao_periapical", "perda_ossea", "fratura", "nenhum"]


def semear(db, n):
    db.execute(text("DELETE FROM curations WHERE observacoes_internas = 'sintetico-auditoria'"))
    db.execute(text("DELETE FROM orthanc_references WHERE orthanc_id LIKE 'sint-%'"))
    db.commit()
    rnd = random.Random(42)
    t0 = time.time()
    db.execute(text(
        "INSERT INTO orthanc_references (orthanc_id, resource_type, ativo, origem) "
        "SELECT 'sint-' || g, 'instance', true, 'externa' FROM generate_series(1, :n) g"), {"n": n})
    ids = [r[0] for r in db.execute(text("SELECT id FROM orthanc_references WHERE orthanc_id LIKE 'sint-%' ORDER BY id"))]
    linhas = []
    for i in ids:
        frase = lambda k: " ".join(rnd.choice(PALAVRAS) for _ in range(k))  # noqa: E731
        linhas.append({
            "ref": i, "tipo": rnd.choice(TIPOS), "dentes": sorted(rnd.sample(range(11, 49), rnd.randint(1, 3))),
            "ach": rnd.choice(ACHADOS), "det": frase(25), "desc": frase(40),
            "gen": rnd.choice(["feminino", "masculino"]), "imin": rnd.randint(5, 40),
        })
    for ini in range(0, len(linhas), 2000):
        db.execute(text(
            "INSERT INTO curations (orthanc_reference_id, modalidade, tipo_radiografia, dentes, achado_principal, "
            "achados_detalhe, descricao_didatica, observacoes_internas, genero, idade_min, idade_max, status, "
            "anonimizacao_validada, marcacoes) VALUES (:ref, 'RX', :tipo, :dentes, :ach, :det, :desc, "
            "'sintetico-auditoria', :gen, :imin, :imin + 20, 'aprovada', true, '[]'::jsonb)"), linhas[ini:ini + 2000])
    db.commit()
    db.execute(text("ANALYZE curations")); db.execute(text("ANALYZE orthanc_references")); db.commit()
    return time.time() - t0


CASOS = [
    ("sem filtro (lista inicial)", {}),
    ("tipo de radiografia", {"tipo_radiografia": "periapical"}),
    ("um dente", {"dente": 36}),
    ("achado principal + genero", {"achado_principal": "carie", "genero": "feminino"}),
    ("faixa de idade", {"idade_min": 10, "idade_max": 30}),
    ("TEXTO livre: 1 palavra", {"texto": "reabsorcao"}),
    ("TEXTO livre: palavra rara/erro de digitacao", {"texto": "reabsorsao"}),
    ("TEXTO livre + tipo", {"texto": "periapical lesao", "tipo_radiografia": "periapical"}),
]


def medir(client, params, repeticoes=5):
    tempos = []
    total = None
    for _ in range(repeticoes):
        t = time.perf_counter()
        r = client.get("/search", params={**params, "limit": 50})
        tempos.append((time.perf_counter() - t) * 1000)
        if r.status_code != 200:
            return None, r.status_code
        corpo = r.json()
        total = corpo.get("total") if isinstance(corpo, dict) else len(corpo)
    return {"mediana": statistics.median(tempos), "pior": max(tempos), "total": total}, 200


def main():
    tamanhos = [int(x) for x in sys.argv[1:]] or [2000, 10000]
    db = SessionLocal()
    from app.core.security import gerar_hash_senha
    usuario = db.query(User).filter(User.email == "busca-sintetica@example.com").first()
    if usuario is None:
        usuario = User(nome="Medicao sintetica", email="busca-sintetica@example.com",
                       senha_hash=gerar_hash_senha("descartavel-Sint3tica!"), perfil=UserRole.administrador,
                       ativo=True)
        db.add(usuario); db.commit(); db.refresh(usuario)
    app.dependency_overrides[obter_usuario_atual] = lambda: usuario
    client = TestClient(app)
    saida = {}
    print("### Medicao da busca (S-01) - dados sinteticos\n")
    print("| Fichas | Caso | Mediana (ms) | Pior (ms) | Achadas |\n|---:|---|---:|---:|---:|")
    for n in tamanhos:
        seg = semear(db, n)
        saida[n] = {}
        for nome, params in CASOS:
            res, st = medir(client, params)
            if res is None:
                print(f"| {n} | {nome} | erro HTTP {st} | | |")
                continue
            saida[n][nome] = res
            print(f"| {n} | {nome} | {res['mediana']:.0f} | {res['pior']:.0f} | {res['total']} |")
        print(f"\n_(carga de {n} fichas levou {seg:.1f} s)_\n")
    db.execute(text("DELETE FROM curations WHERE observacoes_internas = 'sintetico-auditoria'"))
    db.execute(text("DELETE FROM orthanc_references WHERE orthanc_id LIKE 'sint-%'"))
    db.commit()
    os.makedirs("../relatorios", exist_ok=True)
    json.dump(saida, open("../relatorios/busca-medicao.json", "w"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
