# Resultado: pendências técnicas (13/11/2026)

**Base:** `origin/redesign-ui` em `439c856` (merge do #58), conferida com `git fetch` antes de começar. Inclui os PRs #46 a #58; os blocos F, H e J não foram refeitos.

**Regras seguidas:**
- um bloco por branch, push sem force;
- nenhum PR aberto e nada juntado;
- commits em nome do Luciano, um por arquivo, com os trailers combinados.

## Visão geral

| Bloco | Branch | Commits | Antes | Depois | Suíte no fim da branch |
|---|---|---|---|---|---|
| K Ruff | `qualidade/ruff` | 17 | 47 avisos | **4** | pytest 648 ok, tsc ok, tsx 9/9, build ok |
| L Mypy | `qualidade/mypy` | 22 | 405 erros (50 arquivos) | **72** (30 arquivos), **−82 %** | pytest 648 ok, tsc ok, tsx 9/9, build ok |
| M ESLint | `qualidade/eslint` | 12 | 22 avisos (0 erros) | **2** | pytest 648 ok, tsc ok, tsx 9/9, build ok |
| N Dependabot | sem branch (só avaliação) | — | — | — | ver seção N |
| O Q-01 | sem branch (só levantamento) | — | — | — | ver seção O |

**Contagens cruzadas:** cada branch só mexe no próprio verificador; nos outros, a contagem fica igual à base.

| Branch | Ruff | Mypy | ESLint |
|---|---|---|---|
| `qualidade/ruff` | 4 | 405 | 22 |
| `qualidade/mypy` | 47 | 72 | 22 |
| `qualidade/eslint` | 47 | 405 | 2 |

**As três juntas:** juntei as três numa branch de teste local (apagada depois). Não houve conflito; deu Ruff 4, Mypy 72 e a suíte completa passou (pytest 648, tsc, tsx 9/9, build). Elas podem ser juntadas em qualquer ordem.

**Como medi:**
- Ruff e Mypy num ambiente Python 3.11 limpo, com só `backend/requirements.txt` + `ruff` 0.17.5 + `mypy` 2.4.1, igual ao workflow `qualidade.yml`. Por isso a base deu 405, o mesmo número do GitHub (o INVENTARIO registra 403).
- Comandos usados, os mesmos do workflow:
  - `ruff check backend --config auditoria/config/ruff.toml`;
  - `python -m mypy app --config-file ../auditoria/config/mypy.ini` (pasta `backend`);
  - `eslint -c auditoria/ferramentas/eslint/eslint.config.mjs frontend/src`.

**Linha de base da suíte** (`redesign-ui` em `439c856`): pytest **648 passed**, `tsc --noEmit` ok, `npx tsx testes/*.teste.ts` 9 arquivos sem falha, `next build` ok.

---

## Bloco K: Ruff (`qualidade/ruff`, 17 commits)

**Antes:** 47 avisos (B904 30, B023 9, B905 4, S608 2, S607 1, S603 1). **Depois:** 4.

| Regra | Qtde | O que foi feito | Muda comportamento? |
|---|---|---|---|
| B904, erro relançado dentro de `except` sem `from` | 30 → 0 (15 arquivos) | `raise HTTPException(...) from causa`. Onde o `except` não tinha nome, ganhou `as causa`. No upload DICOM, o `except` de dentro usa `causa_leitura` para não confundir com o de fora | **Não.** A resposta ao usuário (código e texto) é a mesma. Só o registro técnico do servidor passa a dizer "causado por" em vez de "durante o tratamento de" |
| B905, `zip()` sem `strict=` | 4 → 0 (`prancha_router.py`) | `strict=False` | **Não.** É o comportamento que já existia, agora escrito. `strict=True` mudaria: daria erro com listas de tamanhos diferentes, e isso pode acontecer em `curation_ids`/`numeros` |
| B023, função criada num laço usa variável do laço | 9 → 0 (`recortar_molduras.py`, roteiro fora do sistema) | Os valores da moldura ficam fixados na hora em que a função é criada (`lambda m, c=caixa, ...`) | **Não.** Conferi `substituir_arquivo`: ela chama essas funções na hora, então o resultado já era o certo. A correção só tira a dependência disso |
| S608, SQL montado com texto | 2, **ficou** | — | `zerar_curadorias.py` é roteiro manual. O nome da tabela vem da lista fixa `TABELAS` do próprio arquivo, nunca do usuário. Falso positivo |
| S603 e S607, subprocess | 2, **ficou** | — | `scripts/rodar_testes.py` roda `alembic` e `pytest` com lista fixa de argumentos e sem shell, só no computador de quem testa. Risco aceitável |

**Não havia** avisos F (imports ou variáveis sem uso): eles já tinham sido zerados no #54.

**Proposta, não aplicada (S101 e testes):**
- Hoje `ruff.toml` **exclui a pasta `tests` inteira** (`extend-exclude`). Por isso o S101 (`assert` em teste) não aparece na contagem: as 1.835 ocorrências ficam fora.
- **Proposta:** em vez de excluir a pasta, incluir os testes e ignorar só as regras que são ruído em teste:
  ```toml
  extend-exclude = ["**/alembic/**"]

  [lint.per-file-ignores]
  "**/tests/**" = ["S101", "F811", "S105", "S106", "S311"]
  ```
  - F811 aparece porque o pytest reaproveita o nome das fixtures;
  - S105 e S106 são senhas de teste;
  - S311 é `random` em dado de teste.
- **Medido:** com só o S101 ignorado, os testes passariam a mostrar **46** avisos, dos quais 17 são F811. Os restantes (S603/S607/S108 de testes que ligam o Nginx de verdade, 4 F401, B017 e B007) seriam úteis de revisar.

## Bloco L: Mypy (`qualidade/mypy`, 22 commits)

**Antes:** 405 erros em 50 arquivos. **Depois:** 72 em 30 arquivos (**−82 %**, meta de −30 %). **Nenhum `# type: ignore`.**

**Causa encontrada:**
- 338 dos 405 erros vinham de um só motivo: as colunas do banco estavam escritas no estilo antigo do SQLAlchemy (`nome = Column(String)`).
- No SQLAlchemy 2.0, o verificador entende `usuario.email` como "uma coluna", não como "um texto". Por isso reclamava em quase toda função que recebe ou grava dados da conta.
- **Autenticação, MFA e sessões foram as mais afetadas.**

**Correção (20 arquivos de modelos, um commit por arquivo):**
- Cada coluna passou para o estilo 2.0: `nome: Mapped[str] = mapped_column(String(150), nullable=False)`.
- Os argumentos de cada coluna ficaram **idênticos**; só entrou a "etiqueta" de tipo.
- O `| None` foi posto exatamente nas colunas que o banco aceita vazias (`nullable`) e em mais nenhuma.

**Como foi provado que nada mudou:**
1. **Esquema do banco:** gerei antes e depois um retrato completo do mapeamento: SQL de criação das 29 tabelas, índices, chaves estrangeiras, padrões, `nullable` e atributos de cada uma das 29 classes. Resultado: **idêntico.** A única diferença era o endereço de memória do `func.now()`, que muda a cada execução.
2. **Contrato da API:** `app.openapi()` antes e depois, **byte a byte igual**. Os testes `test_1_3_3_*` e a varredura de contrato passaram.
3. **Suíte completa:** 648 passed, incluindo o teste de migrações em dia.

**Também feito:** etiqueta de tipo em 2 dicionários de `curation/consultas.py` e na constante `PORTUGUES` de `busca_texto.py` (só anotação).

**Tentei e desfiz:** anotar as listas `problemas`/`ordem_concorrente` de `admin_router.py`. Isso criava um erro novo em `(problemas or [None])[0]`, e corrigir exigiria mexer no código.

**Contagem por módulo**, começando pelos críticos:

| Módulo | Antes | Depois |
|---|---:|---:|
| `auth.py` | 55 | 4 |
| `mfa.py` | 15 | 1 |
| `mfa_router.py` | 1 | 0 |
| `sessoes.py` | 1 | 0 |
| `users.py` | 1 | 0 |
| `users_router.py` (permissões de usuários) | 27 | 4 |
| `envios_router.py` | 28 | 11 |
| `curation/ficha.py` | 27 | 1 |
| `vocabulario_router.py` | 26 | 0 |
| `prancha_router.py` | 20 | 3 |
| `macros_router.py` | 20 | 0 |
| `curation/segunda_opiniao.py` | 17 | 2 |
| `substituir_instancia.py` | 15 | 0 |
| `compartilhamentos_router.py` | 11 | 0 |
| `curation/consultas.py` | 11 | 4 |
| `prancha.py` | 10 | 10 |
| `images_router.py` | 10 | 1 |
| `search_router.py` | 10 | 2 |
| `aparelhos_router.py`, `anotacoes_router.py`, `curation/achados.py` | 10 cada | 0 |
| outros 30 módulos | 70 | 29 |
| **Total** | **405** | **72** |

**Os 72 que sobraram:** cada um pede uma decisão ou uma mudança de código, então não foram mexidos nesta rodada:
- **17 `union-attr` e parte dos `arg-type`:** campos que o banco aceita vazios e o código usa como se sempre tivessem valor. Exemplo: `perfil` (`usuario.perfil.value`) e `ativo`. A coluna `users.perfil` é *nullable* no banco, só tem valor padrão. Resolver exige decidir entre:
  - (a) tornar a coluna `NOT NULL`, com migração;
  - (b) tratar o vazio no código.

  As duas mudam algo. **Recomendação:** (a), depois de conferir no banco real que nenhum usuário tem `perfil` vazio.
- **Imagens (Pillow, cerca de 12):** `Image.LANCZOS` (nome antigo; o novo é `Image.Resampling.LANCZOS`) e tipos de fonte e imagem em `prancha.py`, `anexos_curadoria.py` e `search_router.py`. Trocar o nome é seguro, mas mexe no desenho da prancha e merece teste visual. Fica para um lote próprio.
- **Consultas (SQLAlchemy, cerca de 10):** `dict(db.query(...).all())` e `.any(...)`. É limitação de tipo da biblioteca, não erro. Corrigir pede pequenas reescritas de consulta.
- **Outros 3:**
  - `config.py:124`, `Settings()` sem argumentos: o pydantic-settings lê do ambiente, então é falso positivo do mypy. Resolver pede o plugin do pydantic, que é uma dependência nova;
  - `main.py:93`: tipo do tratador de limite de taxa do slowapi;
  - `email.py:65`: variável reaproveitada para dois tipos de anexo.

## Bloco M: ESLint (`qualidade/eslint`, 12 commits)

**Antes:** 22 avisos, 0 erros, 9 corrigíveis automaticamente. **Depois:** 2.

- **9 "corrigíveis automaticamente":** eram comentários `eslint-disable` que não desligavam nada.
  - Rodei o `--fix` e **conferi o diff antes de usar**: ele deixava linhas em branco com espaços no lugar dos comentários. Por isso não usei o `--fix`; apaguei as 8 linhas à mão. O código não muda.
  - No 9º (`MiniaturaImagem.tsx`), o comentário estava **na linha errada**, então o aviso de `<img>` aparecia de qualquer jeito.
  - Ele foi para a linha da `<img>`, com o motivo escrito: a miniatura vem de um endereço `blob:`, baixado com login, que o `<Image>` do Next.js não otimiza. É falso positivo **documentado**, e o comentário só fica valendo no lugar certo.
- **11 variáveis sem uso, retiradas sem mudar a tela:**
  - **Pesquisa:** 1 import (`corCartaoTipoRadiografia`), 2 listas (`OPCOES_ARCADA` e `OPCOES_LADO`) e 3 tradutores (`tErroTecnico`, `traduzirArcada` e `traduzirLado`), sobras de filtros antigos;
  - `useRouter` no menu lateral;
  - `SECOES_FICHA` num import;
  - `statusFicha` deixou de ser desembrulhado na ficha. A propriedade continua no tipo, então quem chama não muda;
  - `aberto` no menu Salvar: só o valor saiu, a função `setAberto` continua.
- **Ficaram 2 (`react-hooks/exhaustive-deps`), documentados e não silenciados:**
  - `VisualizadorSequencial.tsx:660`: o efeito roda **só quando muda a imagem** (`indice`). Acrescentar `atual.curation_id`, `atual.marcacoes` e `atual.viewer_url` como dependências faria a imagem da marcação ser baixada de novo sempre que o objeto da imagem fosse recriado.
  - `MarcadorAchado.tsx:225`: o efeito roda quando muda a imagem (`orthancReferenceId` e `urlImagem`). Acrescentar `onCarregou`, uma função que a tela de cima recria a cada desenho, baixaria a imagem de novo a cada desenho da tela.
  - Os dois são **intencionais** e mudar alteraria o comportamento. A correção "de verdade" seria usar `useCallback` em quem chama, que é outro lote e pede teste na tela.

**Observação:** o frontend não tem configuração própria de ESLint e o `next build` não roda lint. A única régua é a da Central de Auditoria.

## Bloco N: Dependabot retidos (só avaliação; nenhum PR alterado)

**Limite do ambiente:** aqui não há Docker, e a internet não chega ao HuggingFace (modelos de voz) nem ao Docker Hub (Orthanc). Por isso:
- a **transcrição com o modelo de verdade** e o **Orthanc novo** ficam com o Luciano;
- em troca, testei tudo o que dá sem eles, em ambientes Python 3.11 separados (a mesma versão da imagem do serviço de voz).

**Testes rodados em cada conjunto:**
1. **Instalação** com o `requirements.txt` do serviço de voz (`whisper/`) e a versão nova, mais `pip check`.
2. **`whisper/test_app.py`**: 9 testes.
3. **Teste de fumaça:**
   - um WAV de verdade é lido pelo decodificador do faster-whisper (biblioteca `av` + numpy);
   - o detector de fala (VAD, onnxruntime) roda sobre ele;
   - o ctranslate2 recebe um vetor do numpy.
4. **Ponta a ponta:** um WAV vai por formulário multipart com o cabeçalho de chave, como a API do Radix envia, e chega **byte a byte** ao modelo (aqui um modelo de mentira), com o `prompt` e o modo rápido.

| PR | Mudança | Resultado | Conclusão |
|---|---|---|---|
| #13 | numpy 1.26.4 → **2.5.4** | **Quebra:** o numpy 2.5 exige Python ≥ 3.12, e o serviço de voz usa `python:3.11-slim-bookworm`. A instalação nem começa | **Não juntar.** Mesmo o 2.4.6 (o último para 3.11) conflita com `ctranslate2==4.3.1` e `onnxruntime==1.18.1`, que pedem numpy < 2 |
| #16 | faster-whisper 1.0.3 → **1.2.1** | **Passou:** instala com o `ctranslate2==4.3.1` fixado; pip check ok; 9/9; fumaça e ponta a ponta ok. Todos os parâmetros usados em `app.py` existem na 1.2.1 | O "conflito conhecido" com o ctranslate2 4.3.1 **não se confirmou** (a 1.2.1 aceita ctranslate2 de 4.0 até antes do 5). Atenção: a 1.2 mudou os padrões do detector de fala (VAD), então o texto transcrito pode variar um pouco. Testar com áudio real antes de juntar |
| #21 | python-multipart 0.0.32 → **0.0.33** | **Passou:** 9/9 e ponta a ponta ok | Baixo risco. Pode juntar depois do teste de voz no computador |
| #19 | three 0.186.1 → **0.187.0** (e `@types/three`) | **Passou:** tsc ok, tsx 9/9, `next build` ok. A tela de login (globo 3D) abriu num navegador de verdade, com WebGL e sem erro no console | Obs.: o `package-lock.json` do PR foi feito sobre uma `redesign-ui` antiga e **não instala** com `npm ci` hoje (falta `@swc/helpers`). Peça `@dependabot recreate` antes de juntar. O teste foi feito com `npm install three@0.187.0 @types/three@0.187.0` sobre a base atual |
| #33 | Orthanc, digest `83a1f98` → `06b8baa` | **Não testado aqui** (sem Docker e sem acesso ao Docker Hub). Os testes do backend sobre anonimização usam um Orthanc simulado e não dependem da versão | Teste no computador, abaixo |

**Conjunto compatível proposto para o serviço de voz (Python 3.11), testado com o mesmo roteiro (tudo passou):**
```
faster-whisper==1.2.1
ctranslate2==4.9.0
onnxruntime==1.32.0
numpy==2.4.6
```
(os demais iguais).

**Antes de adotar:** construir a imagem Docker no computador e testar a transcrição. O `Dockerfile` fixa Debian 12 por causa de um erro de "pilha executável" do ctranslate2 antigo. Vale conferir se o 4.9 continua precisando disso.

**Teste do Orthanc (#33) no computador (PowerShell), sem juntar o PR:**
```powershell
cd C:\Users\lmnvo\Radiximago
docker pull orthancteam/orthanc@sha256:06b8baab0c63cd58de5474a74b64096a82ea3f7eab2aa471e217cc48c9ae11bf
# trocar o digest só no arquivo local, ligar e testar:
docker compose up -d radix-orthanc
# enviar um DICOM de teste (sintético), conferir a anonimização e abrir no OHIF
# depois voltar: git checkout -- docker-compose.yml ; docker compose up -d radix-orthanc
```

**Não tocados, por decisão do responsável:** #5 (Python 3.15), #7 (Node 25) e #6 (OHIF 3.13).

## Bloco O: Q-01, funções e arquivos grandes (só levantamento)

**Medição:**
- feita com `lizard`, instalado só no ambiente de medição, não no projeto;
- **CCN** = complexidade (quantos caminhos "se/senão/laço" a função tem); **acima de 15 é difícil de testar**. NLOC = linhas de código sem comentários.
- Nas telas React, a função inclui o JSX, o que aumenta as linhas.

**Backend:** 566 funções. As maiores:

| Função | Arquivo | CCN | Linhas |
|---|---|---:|---:|
| `editar_curadoria` | `curation/ficha.py` | 56 | 151 |
| `pesquisar_imagens` | `search_router.py` | 51 | 187 |
| `criar_curadoria` | `curation/ficha.py` | 33 | 97 |
| `_sincronizar_achados` | `curation/ficha.py` | 28 | 47 |
| `responder_segunda_opiniao` | `curation/segunda_opiniao.py` | 25 | 89 |
| `principal` | `diagnostico_email.py` | 24 | 87 |
| `receber_dicom` | `images_router.py` | 21 | 92 |
| `confirmar_email` | `auth.py` | 18 | 104 |

**Maiores arquivos do backend:** `search_router.py` 795 linhas, `auth.py` 774, `users_router.py` 584, `images_router.py` 578, `segunda_opiniao.py` 562, `consultas.py` 550.

**Frontend:** 3.043 funções. As maiores:

| Função | Arquivo | CCN | Linhas |
|---|---|---:|---:|
| `interpretar` | `lib/vozCuradoria.ts` | 155 | 483 |
| `EtiquetaMarcacoes` | `visualizador/EtiquetaMarcacoes.tsx` | 72 | 291 |
| `CuradoriaPage` | `app/curadoria/page.tsx` | 66 | 477 |
| `PintorSegmentacao` | `segmentacao/PintorSegmentacao.tsx` | 63 | 312 |
| `VisualizadorSequencial` | `VisualizadorSequencial.tsx` | 63 | 344 |
| `SegundaOpiniaoPage` | `app/segunda-opiniao/page.tsx` | 50 | 191 |
| `PesquisaConteudo` | `app/pesquisa/page.tsx` | 49 | 402 |
| `UsuariosPage` | `app/usuarios/page.tsx` | 33 | 421 |

**Maiores arquivos do frontend:** `curadoria/page.tsx` 1.846 linhas, `pesquisa/page.tsx` 1.428, `VisualizadorSequencial.tsx` 1.424, `vozCuradoria.ts` 1.419, `usuarios/page.tsx` 1.307, `lib/ajuda/conteudo.ts` 1.153 (este é só texto de ajuda e não precisa dividir), `PintorSegmentacao.tsx` 1.078.

**Ordem proposta para dividir** (menor risco e mais benefício primeiro):

| # | Alvo | Benefício | Risco | Por quê nessa posição |
|---|---|---|---|---|
| 1 | `vozCuradoria.ts` `interpretar` (CCN 155) | Alto | **Baixo** | Função pura (texto entra, comando sai), já tem `testes/vozCuradoria.teste.ts`. Dá para separar por família de comando (navegação, dentes, achados, campos) e conferir com os mesmos testes |
| 2 | `search_router.py` `pesquisar_imagens` (CCN 51) | Alto (é a busca de todos os perfis) | Médio-baixo | Separar a montagem de cada filtro em funções pequenas; a resposta da API não muda e há testes de busca, anti-abuso e contrato. Medir a velocidade antes e depois (`auditoria/scripts/medir_busca.py`) |
| 3 | `curation/ficha.py` `editar_curadoria` + `criar_curadoria` (CCN 56 e 33) | Alto (curadoria é o coração) | Médio | As duas repetem a validação dos campos; extrair um validador comum reduz as duas. Há muitos testes de ficha. Fazer **depois** de decidir o `perfil` nullable (bloco L), porque os dois mexem em regras |
| 4 | `curadoria/page.tsx` (1.846 linhas) | Alto | **Médio-alto** | Tela mais usada pelo curador e sem teste de componente. Dividir só em componentes já identificados (barra, fila, painéis) e testar à mão o roteiro da curadoria. Exige roteiro de teste manual antes |
| 5 | `VisualizadorSequencial.tsx` e `EtiquetaMarcacoes.tsx` | Médio | Médio-alto | Muita troca de mensagens com o OHIF (postMessage); dividir sem teste automático é arriscado. Depois dos itens 1 a 4 |
| 6 | `auth.py` (774 linhas) | Médio | **Alto** | Autenticação e segundo fator: só dividir arquivos (cadastro / login / senha), sem mexer em lógica, e com a suíte de segurança inteira. Por último, por ser a parte mais sensível |

**Não recomendado agora:** `PintorSegmentacao.tsx` (desenho com mouse, difícil de testar) e `lib/ajuda/conteudo.ts` (é conteúdo, não lógica).

---

## O que depende do responsável
1. **Abrir os PRs** (chat de auditoria) das três branches para `redesign-ui`. Elas não conflitam entre si.
2. **Decidir:**
   - `users.perfil` e outras colunas *nullable* usadas como obrigatórias: migração `NOT NULL` ou tratamento no código (bloco L);
   - os 2 `exhaustive-deps`: ficam como estão (recomendado) ou viram lote com `useCallback` e teste de tela (bloco M);
   - a proposta do `ruff.toml` para testes (bloco K);
   - a ordem de divisão do bloco O.
3. **Dependabot:**
   - fechar ou recusar o #13 (incompatível com Python 3.11);
   - testar a transcrição real com o #16 (ou com o conjunto proposto) e o #21 no computador;
   - pedir `@dependabot recreate` no #19;
   - testar o #33 com o roteiro acima.
