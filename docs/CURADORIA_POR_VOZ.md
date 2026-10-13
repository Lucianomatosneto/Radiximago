# Curadoria por voz, busca por palavras e vocabulário controlado

Manual técnico do conjunto de funções que permite ao curador **preencher a ficha falando**, encontrar os **textos livres** na Pesquisa avançada e transformar os textos livres mais repetidos em **termos oficiais**.

## 1. Visão geral

```
Curador fala ──► navegador grava (webm/opus) ──► radix-api /voz/transcrever ──► radix-whisper (local)
                                                                                   │
            ficha salva como RASCUNHO ◄── regras fixas (vozCuradoria.ts) ◄── texto ◄┘
                    │
                    └─► auditoria: "transcricao_voz" e "preenchimento_por_voz"

Textos livres ("Outro", achados detalhados, descrição) ──► busca por palavras (/search?texto=)
            └─► tela Vocabulário: termos livres mais usados ──► promover a termo oficial (+ DeCS, sinônimos)
                     └─► ligar fichas antigas (após conferência) ──► filtro "Termo padronizado" + reconhecido pela voz
```

## 2. Componentes

| Parte | Arquivo | Função |
|---|---|---|
| Serviço de transcrição | `whisper/app.py`, `whisper/Dockerfile` | Whisper *small* (faster-whisper, int8, CPU). Modelo baixado na construção da imagem; carregado só no primeiro uso; descarregado após 10 min parado. Sem porta publicada. |
| Ponte no backend | `backend/app/modules/voz_router.py` | `POST /voz/transcrever` (curadoria, 30/min), `GET /voz/saude`. Não grava áudio. |
| Interpretador | `frontend/src/lib/vozCuradoria.ts` | Regras fixas: palavras-guia, valores, números por extenso, semelhança para erros de transcrição, "Não reconhecido". |
| Painel | `frontend/src/components/curadoria/PainelVoz.tsx` | Microfone (clique ou **Alt+V**), "a conferir", "Não reconhecido", desfazer, salvamento como rascunho. |
| Busca por palavras | `backend/app/modules/busca_texto.py` | `unaccent` + busca de texto completo em português + `pg_trgm` (semelhança) + sinônimos. |
| Vocabulário | `backend/app/modules/vocabulario.py`, `vocabulario_router.py`, `frontend/src/app/vocabulario/page.tsx` | Termos oficiais, sinônimos, código DeCS, ligação ficha↔termo. |
| Banco de dados | migração `e1b4c7a9d2f6` | extensões `unaccent`, `pg_trgm`; tabelas `termos_vocabulario`, `sinonimos_termo`, `curation_termos`. |

## 3. Como o curador fala

| Fala | Resultado |
|---|---|
| "periapical", "masculino", "lesão periapical" | valor reconhecido diretamente |
| "qualidade boa", "dente 36 e 37" (ou "três seis"), "idade de 30 a 40", "sexo feminino" | campo correspondente |
| "alteração perda óssea vertical e cálculo" | marca as alterações |
| "marcação dois cárie" / "marcação dois outro: calcificação pulpar" | achado da marcação 2 |
| "achado outro: reabsorção cervical" | texto vai para **Achados detalhados** (se for termo oficial, liga o termo) |
| "descrição: … fim", "achados detalhados: …", "observações internas: …", "continuar descrição: …" | texto corrido |
| "desfazer", "salvar", "corrigir dente 36 para 46", "apagar descrição" | comandos |
| "próxima seção", "seção anterior" | troca a seção em destaque na coluna da ficha |
| (fala sem palavra-guia) com **Descrição**, **Achados detalhados** ou **Observações** em destaque | o texto vai para esse campo (acrescentado), até "fim" |
| "dois cárie" com **Marcações** em destaque | o mesmo que "marcação dois cárie" |

### 3.1 Tela da Curadoria em coluna

A imagem fica à esquerda (mesmo tamanho) e **todas as seções da ficha** ficam numa coluna à direita, com rolagem (`ColunaFichaCuradoria.tsx`, ordem em `lib/secoesCuradoria.ts`): Dados da imagem → Marcações → Alterações observadas → Achados detalhados → Achados por dente/região → Erro técnico → Descrição didática → Observações internas.

- Uma seção fica **em destaque** (borda teal). Setas **↓/↑** do teclado (fora de campos de texto), botões **▼/▲** ou clique trocam o destaque; a coluna rola sozinha.
- O painel de voz fica no topo da coluna e mostra **"A fala vai para: …"** — o curador vê o destino antes de falar. Depois de preencher, a coluna rola até a seção que recebeu o dado.
- Palavra-guia sempre vence o destaque ("dente 36" vai para Dados mesmo com Descrição em destaque).
- "Abrir marcação" (seção Marcações ou tecla **M**) abre a imagem de marcação grande à esquerda; o visualizador vira miniatura.
- O OHIF recebe `radixRecolherEstudos=1` e recolhe a coluna "Studies" (os dados agora estão na coluna do Rádix). Requer `docker compose restart radix-ohif`.

O que não for entendido vai para **Não reconhecido**, com sugestão ("Você quis dizer…?") e botões de destino. Nada é aprovado automaticamente.

## 4. Segurança e LGPD

- **Áudio não sai da máquina do Rádix** e não é gravado (fica só em memória durante a transcrição).
- Serviço de voz **sem porta exposta**; só o backend fala com ele, e o backend exige perfil de curadoria.
- **Auditoria**: `transcricao_voz` (duração e tempo de processamento, sem o conteúdo) e `preenchimento_por_voz`; vocabulário: `vocabulario_*`.
- **Humano no controle**: a voz só gera rascunho; aprovar continua manual; termos só viram oficiais com aprovação.
- Teto de memória do container (1,6 GB) e descarregamento do modelo quando ocioso.

## 5. Instalação

```
docker compose exec radix-api alembic upgrade head      # tabelas e extensões
docker compose build radix-whisper                       # baixa o modelo (precisa de internet, só uma vez; ~500 MB)
docker compose up -d radix-whisper
docker compose restart radix-api radix-frontend
```

Para trocar o modelo (ex.: `base`, mais leve), altere `args: MODELO` no `docker-compose.yml` e reconstrua.

## 6. Testes

- Backend: `docker compose exec radix-api pytest` (inclui `test_vocabulario.py`, `test_voz.py`).
- Serviço de voz (sem baixar modelo): `cd whisper && pytest test_app.py`.
- Interpretador: `cd frontend && npx tsx testes/vozCuradoria.teste.ts`.

## 7. Dados para a dissertação

| Indicador | Como obter |
|---|---|
| Tempo por ficha com e sem voz | `curation_history`/`audit_logs` (criação → aprovação) separando fichas com `preenchimento_por_voz` |
| Tempo de transcrição | `audit_logs.detalhes` de `transcricao_voz` (`processamento_s`, `duracao_s`) |
| Cobertura das regras | proporção de trechos em "Não reconhecido" (registrar em sessões de avaliação) |
| Evolução do vocabulário | nº de termos promovidos e de fichas ligadas ao longo do tempo; proporção de "Outro" |
| Usabilidade | questionário SUS |

Referências de apoio: Whisper (Radford et al., 2022, *Robust Speech Recognition via Large-Scale Weak Supervision*); DeCS/MeSH (BIREME/OPAS); princípio *human-in-the-loop*.
