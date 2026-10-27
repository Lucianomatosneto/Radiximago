"""vocabulario odontologico inicial (busca por termos)

Carrega no vocabulario controlado uma lista inicial de termos de radiologia
odontologica (achados, variacoes anatomicas, tratamentos e estruturas), com
sinonimos - para a caixa "Buscar por termos" da Pesquisa avancada sugerir
termos enquanto se digita, e para o curador ligar termos a ficha.

So ACRESCENTA: termo ou sinonimo que ja exista (mesmo texto normalizado) e
pulado; nada existente e alterado. Os codigos DeCS ficam vazios de proposito
- devem ser conferidos e preenchidos pela curadoria na tela Vocabulario
(nunca inventados).

Revision ID: b4d6f8a1c3e5
Revises: a3c5e7f9b2d4
"""
import re
import unicodedata

import sqlalchemy as sa
from alembic import op

revision = "b4d6f8a1c3e5"
down_revision = "a3c5e7f9b2d4"
branch_labels = None
depends_on = None

# (termo, categoria, [sinonimos]) - categorias: achado / alteracao / outro
TERMOS = [
    # carie e estrutura dental
    ("Cárie oclusal", "achado", ["cárie de fóssulas e fissuras"]),
    ("Cárie proximal", "achado", ["cárie interproximal", "cárie de contato"]),
    ("Cárie radicular", "achado", ["cárie de raiz"]),
    ("Cárie rampante", "achado", []),
    ("Cárie recorrente", "achado", ["cárie recidivante"]),
    ("Hipoplasia de esmalte", "alteracao", []),
    ("Amelogênese imperfeita", "alteracao", []),
    ("Dentinogênese imperfeita", "alteracao", []),
    ("Desgaste dentário", "achado", ["atrição", "abrasão dentária", "erosão dentária"]),
    ("Fratura coronária", "achado", ["fratura de coroa"]),
    ("Fratura radicular vertical", "achado", []),
    ("Fratura radicular horizontal", "achado", []),
    # polpa e endodontia
    ("Nódulo pulpar", "achado", ["cálculo pulpar", "pedra pulpar"]),
    ("Calcificação pulpar", "achado", ["obliteração pulpar", "calcificação do canal radicular"]),
    ("Reabsorção cervical invasiva", "achado", ["reabsorção cervical"]),
    ("Instrumento fraturado no canal", "achado", ["lima fraturada"]),
    ("Sobreobturação", "achado", ["extravasamento de material obturador"]),
    ("Subobturação", "achado", ["obturação curta"]),
    ("Perfuração radicular", "achado", []),
    ("Desvio de canal", "achado", ["transporte do canal"]),
    ("Lesão endo-periodontal", "achado", ["lesão endoperiodontal"]),
    ("Rizogênese incompleta", "alteracao", ["ápice aberto"]),
    # periapice
    ("Abscesso periapical", "achado", ["abscesso dentoalveolar"]),
    ("Granuloma periapical", "achado", []),
    ("Cisto radicular", "achado", ["cisto periapical"]),
    ("Periodontite apical", "achado", ["pericementite apical"]),
    ("Osteíte condensante", "achado", ["osteíte esclerosante"]),
    ("Hipercementose", "achado", []),
    ("Displasia cemento-óssea", "achado", ["displasia óssea periapical", "displasia cementária"]),
    # periodonto
    ("Lesão de furca", "achado", ["envolvimento de furca", "lesão de bifurcação"]),
    ("Defeito ósseo angular", "achado", ["defeito infraósseo"]),
    ("Perda da lâmina dura", "achado", ["descontinuidade da lâmina dura"]),
    ("Periodontite crônica", "achado", []),
    ("Excesso de restauração", "achado", ["excesso marginal", "degrau na restauração"]),
    ("Contato proximal aberto", "achado", []),
    # desenvolvimento e erupcao
    ("Dente impactado", "achado", ["dente retido"]),
    ("Terceiro molar incluso", "achado", ["siso incluso", "siso impactado"]),
    ("Canino incluso", "achado", ["canino impactado"]),
    ("Mesiodente", "alteracao", []),
    ("Hipodontia", "alteracao", ["oligodontia"]),
    ("Taurodontismo", "alteracao", []),
    ("Dilaceração radicular", "alteracao", ["raiz dilacerada"]),
    ("Dens in dente", "alteracao", ["dente invaginado"]),
    ("Fusão dentária", "alteracao", []),
    ("Geminação dentária", "alteracao", []),
    ("Microdontia", "alteracao", []),
    ("Macrodontia", "alteracao", []),
    ("Raiz supranumerária", "alteracao", []),
    ("Anquilose dentária", "achado", []),
    ("Erupção ectópica", "achado", []),
    ("Germe dentário", "outro", ["folículo dentário"]),
    ("Dente decíduo", "outro", ["dente de leite"]),
    ("Dentição mista", "outro", []),
    ("Raiz residual", "achado", ["resto radicular"]),
    ("Pericoronarite", "achado", []),
    # lesoes osseas
    ("Cisto dentígero", "achado", ["cisto folicular"]),
    ("Ceratocisto odontogênico", "achado", ["queratocisto"]),
    ("Ameloblastoma", "achado", []),
    ("Odontoma", "achado", ["odontoma composto", "odontoma complexo"]),
    ("Osteoesclerose idiopática", "alteracao", ["enostose", "ilha de osso denso"]),
    ("Lesão central de células gigantes", "achado", ["granuloma central de células gigantes"]),
    ("Displasia fibrosa", "achado", []),
    ("Cisto ósseo simples", "achado", ["cisto ósseo traumático"]),
    ("Cisto do ducto nasopalatino", "achado", ["cisto do canal incisivo"]),
    ("Osteomielite", "achado", []),
    ("Osteonecrose dos maxilares", "achado", ["osteonecrose"]),
    ("Sequestro ósseo", "achado", []),
    ("Lesão osteolítica", "achado", ["lesão lítica"]),
    ("Alvéolo pós-exodontia", "outro", ["alvéolo de extração"]),
    ("Fratura de mandíbula", "achado", ["fratura mandibular"]),
    ("Fratura alveolar", "achado", []),
    # seio maxilar
    ("Espessamento da mucosa sinusal", "achado", ["sinusite"]),
    ("Pneumatização do seio maxilar", "alteracao", []),
    ("Pseudocisto antral", "achado", ["cisto de retenção do seio maxilar"]),
    ("Comunicação bucossinusal", "achado", ["comunicação oroantral"]),
    ("Septo do seio maxilar", "alteracao", []),
    # tecidos moles e calcificacoes
    ("Sialolito", "achado", ["cálculo salivar"]),
    ("Calcificação de artéria carótida", "achado", ["ateroma calcificado"]),
    ("Linfonodo calcificado", "achado", []),
    ("Tonsilolito", "achado", []),
    ("Processo estiloide alongado", "alteracao", ["síndrome de Eagle"]),
    # ATM
    ("Reabsorção condilar", "achado", []),
    ("Hiperplasia condilar", "achado", []),
    ("Osteoartrose da ATM", "achado", ["artrose da articulação temporomandibular"]),
    # tratamentos e materiais
    ("Implante dentário", "outro", ["implante osseointegrado"]),
    ("Peri-implantite", "achado", ["perda óssea peri-implantar"]),
    ("Enxerto ósseo", "outro", []),
    ("Prótese parcial fixa", "outro", ["ponte fixa"]),
    ("Prótese removível", "outro", []),
    ("Restauração de amálgama", "outro", ["amálgama"]),
    ("Restauração de resina composta", "outro", ["resina composta"]),
    ("Selante", "outro", []),
    ("Aparelho ortodôntico", "outro", ["bráquete", "braquete"]),
    ("Contenção ortodôntica", "outro", []),
    ("Pino de fibra de vidro", "outro", []),
    ("Núcleo metálico fundido", "outro", ["pino metálico"]),
    ("Instrumento de osteossíntese", "outro", ["placa e parafusos de fixação"]),
    # anatomia (estruturas que confundem na leitura)
    ("Forame mentual", "outro", ["forame mentoniano"]),
    ("Forame incisivo", "outro", ["canal incisivo", "canal nasopalatino"]),
    ("Canal mandibular", "outro", ["canal alveolar inferior"]),
    ("Espinha nasal anterior", "outro", []),
    ("Fossa nasal", "outro", ["cavidade nasal"]),
    ("Processo coronoide", "outro", []),
    ("Côndilo mandibular", "outro", []),
    ("Linha oblíqua externa", "outro", []),
    ("Linha milo-hióidea", "outro", []),
    ("Toro mandibular", "alteracao", ["tórus mandibular"]),
    ("Toro palatino", "alteracao", ["tórus palatino"]),
    ("Tuberosidade maxilar", "outro", []),
    ("Arco zigomático", "outro", []),
    ("Osso hioide", "outro", []),
    ("Fóvea submandibular", "outro", ["fossa da glândula submandibular"]),
    ("Sombra da língua", "outro", ["sombra lingual"]),
    ("Via aérea", "outro", ["espaço aéreo faríngeo"]),
]


def _normalizar(texto: str) -> str:
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sem_acento.lower()).strip().strip(" .,;:!?-\"'")


def upgrade() -> None:
    conexao = op.get_bind()
    existentes = {r[0] for r in conexao.execute(sa.text("SELECT termo_normalizado FROM termos_vocabulario"))}
    existentes |= {r[0] for r in conexao.execute(sa.text("SELECT sinonimo_normalizado FROM sinonimos_termo"))}
    for termo, categoria, sinonimos in TERMOS:
        n = _normalizar(termo)
        if n in existentes:
            continue
        termo_id = conexao.execute(
            sa.text(
                "INSERT INTO termos_vocabulario (termo, termo_normalizado, categoria, ativo, criado_em) "
                "VALUES (:t, :n, :c, true, now()) RETURNING id"
            ),
            {"t": termo, "n": n, "c": categoria},
        ).scalar()
        existentes.add(n)
        for s in sinonimos:
            ns = _normalizar(s)
            if ns in existentes:
                continue
            conexao.execute(
                sa.text("INSERT INTO sinonimos_termo (termo_id, sinonimo, sinonimo_normalizado) VALUES (:i, :s, :n)"),
                {"i": termo_id, "s": s, "n": ns},
            )
            existentes.add(ns)


def downgrade() -> None:
    # remove so os termos desta carga que nao foram ligados a nenhuma ficha
    conexao = op.get_bind()
    for termo, _categoria, _s in TERMOS:
        conexao.execute(
            sa.text(
                "DELETE FROM termos_vocabulario WHERE termo_normalizado = :n "
                "AND id NOT IN (SELECT termo_id FROM curation_termos) AND criado_por_id IS NULL"
            ),
            {"n": _normalizar(termo)},
        )
