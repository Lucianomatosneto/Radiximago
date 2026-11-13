# Resultado: cobertura de testes do frontend no SonarCloud (13/11/2026)

**Base:** `origin/redesign-ui` em `d1fafdc` (inclui #59 a #65). Ramo `qualidade/cobertura-frontend`.

**Legenda:**
- **[MEDIDO]** = número tirado de um log ou de uma execução;
- **[DEDUÇÃO]** = conta feita a partir de números medidos;
- **[HIPÓTESE]** = ainda não comprovado.

## Em uma frase
O relatório de cobertura do frontend **já chegava certo ao SonarCloud**: o 7,2% é a cobertura real. O workflow **não foi alterado**. Foram escritos 5 arquivos de teste para a lógica pura de `frontend/src/lib`, e a cobertura de linhas do frontend subiu de **8,1% para 13,4%** (medição local, igual à do GitHub).

## 1. Diagnóstico

### 1.1 Última execução do workflow SonarCloud (run 43491289200, 13/11 19:20 UTC, `redesign-ui` em `d1fafdc`) [MEDIDO]
- O passo "Cobertura do frontend (Vitest + testes de frontend/testes)" **terminou com sucesso**: 2 arquivos e 20 testes passaram.
- **Resumo do Vitest:** linhas 8,11% (887/10.927), instruções 8,22%, ramos 7,25% (717/9.884) e funções 5,75%.
- **O `lcov.info` foi gerado:** o `ajustar-lcov.mjs` registrou "168 arquivos com caminho a partir da raiz". Os 168 são exatamente todos os `.ts`/`.tsx` de `frontend/src` (sem os `.d.ts`). Localmente o arquivo tem 398.385 bytes.
- **O SonarCloud leu o arquivo:** "Sensor JavaScript/TypeScript Coverage … Analysing frontend/coverage/lcov.info", sem nenhum aviso de arquivo não encontrado.
- **Caminhos:** começam por `SF:frontend/src/...`, conferido no arquivo, então batem com `sonar.sources=backend/app,frontend/src`.

### 1.2 Mesma medição aqui [MEDIDO]
`npm run cobertura` deu **exatamente** os mesmos números do GitHub (887/10.927 linhas).

| Pasta de `frontend/src` | Linhas | Cobertas (antes) |
|---|---:|---:|
| `app/` (telas) | 3.488 | 0 (0%) |
| `components/` | 5.617 | 11 (0,2%) |
| `lib/` (lógica) | 1.822 | 876 (48,1%) |

**Os 10 maiores arquivos sem nenhuma linha coberta:**

| Arquivo | Linhas |
|---|---:|
| `app/curadoria/page.tsx` | 581 |
| `components/segmentacao/PintorSegmentacao.tsx` | 483 |
| `components/VisualizadorSequencial.tsx` | 429 |
| `app/usuarios/page.tsx` | 319 |
| `components/curadoria/PainelVoz.tsx` | 300 |
| `app/pesquisa/page.tsx` | 295 |
| `components/fundo/motorMapaMundi.ts` | 275 |
| `lib/pinturaAlgoritmos.ts` | 233 |
| `components/login/motorCenaLogin.ts` | 210 |
| `app/segunda-opiniao/page.tsx` | 209 |

**Cobertura alta já antes:**
- `lib/vozCuradoria.ts` 91%;
- `conferenciaFicha.ts` 95%;
- `opcoesTeclado.ts` 88%;
- `ajuda/busca.ts`, `orientacao.ts`, `texto.ts`, `fetchSeguro.ts` e `proporcao.ts`: 100%.

### 1.3 Por que o total caiu de 38,2% para 27,7%

**O que foi medido** [MEDIDO], nos logs das execuções do SonarCloud:

| Execução | Commit | Cobertura do backend enviada? | `lcov.info` do frontend enviado? |
|---|---|---|---|
| 12/11 03:58 e 04:02 | `ac9ed0f`, `687618d` | não | não |
| 12/11 10:35 e 20:37 | `45becb9`, `48c8ddd` | **sim** | **não** |
| 13/11 00:01 | `64fc706` (depois do #44) | sim | **sim** (166 arquivos) |
| 13/11 19:20 | `d1fafdc` | sim | sim (168 arquivos) |

- `sonar.sources` **não mudou** em nenhuma execução (`backend/app,frontend/src`).
- `ajustar-lcov.mjs` só reescreve o caminho (`SF:`) e não mexe nos números.
- **Backend** (pytest local com `--cov`): 6.677 de 7.474 linhas = **89,34%**, igual aos 89,3% do Sonar.

**A conta** [DEDUÇÃO]:
- O Sonar calcula cobertura = (linhas cobertas + condições cobertas) ÷ (linhas a cobrir + condições a cobrir).
- **Sem o `lcov.info`**, o frontend entrava com as linhas que o próprio Sonar conta como executáveis e **0 cobertas**:
  - 6.677 ÷ 38,2% ≈ 17,5 mil, então o frontend entrava com cerca de 10 mil linhas.
- **Com o `lcov.info`** (PR #44), entram também as **condições** (os "ramos" do lcov, 9.884), e o frontend passa a ter cerca de 20,8 mil itens no denominador. Os cobertos subiram só cerca de 1,6 mil.
- Conferência:
  - frontend: (887 + 717) ÷ (10.927 + 9.884) ≈ 7,7%, perto dos 7,2% do Sonar;
  - total: (6.677 + 1.604) ÷ (7.474 + 20.811) ≈ 29%, perto dos 27,7%.
- A pequena diferença vem de como o Sonar conta linhas e condições, que não pude consultar.

**Conclusão:** a queda **não é defeito**. A medição ficou honesta: antes, o frontend era contado de forma incompleta (sem as condições). Os números exatos por pasta no Sonar **não foram consultados**, porque o `sonarcloud.io` está bloqueado neste ambiente. Por isso a causa está **demonstrada pela conta, não comprovada no painel**.

## 2. Correção
Nenhum defeito no relatório nem nos caminhos, então **workflow e scripts não foram alterados**.

## 3. Ganho de cobertura com baixo risco
Foram criados 5 arquivos de teste, todos de **lógica pura de `lib/`** (nenhuma tela). Cada verificação confere um resultado conhecido de antemão. Seguem o padrão de `frontend/testes/*.teste.ts`, que já roda no workflow "testes-frontend" e no Vitest da auditoria.

| Arquivo novo | Verificações | O que confere |
|---|---:|---|
| `testes/pinturaAlgoritmos.teste.ts` | 41 | Pincel (área ≈ πr², limiar não pinta o fundo), traço sem falhas, varinha (pega exatamente o quadrado de 100 px; clique no fundo passa do limite), laço, preencher buracos, suavizar, borda, Otsu, dilatar, "pontos nas extremidades" com e sem ajuste |
| `testes/marcacoes.teste.ts` | 47 | Contorno e giro respeitando a proporção da imagem, número da marcação, geometria em pixels, qual marcação está sob o mouse (a menor ganha), holofote. **Cores por achado iguais no backend (`marcacoes_imagem.py`) e no OHIF**, como pede o comentário "mudar nos três lugares" |
| `testes/fichaCuradoria.teste.ts` | 80 | Ordem das seções e etapas, seção concluída ou pendente ("nada a registrar" só vale nas opcionais), achados sem duplicar, resumo legado, formato da API, erros técnicos por tipo de exame. **Listas iguais às do backend** (`RegiaoAnatomica`, `TipoErroTecnico`, regiões padrão) |
| `testes/catalogoBusca.teste.ts` | 18 | Busca por termos: iniciais ("car den"), sem acento, sinônimo, ordem de relevância, dentes só com número, filtro do vocabulário. **Grupos iguais aos de `busca_termos.py`** |
| `testes/utilitarios.teste.ts` | 51 | Dentes FDI, região do globo, navegação, **todo segmento da trilha tem texto em pt e en**, sugestão de e-mail, cores, pintura (tamanho da máscara, mensagens de erro da API), leitura com repetição (sem esperar de verdade), **ZIP conferido byte a byte** (CRC32 de referência `0xCBF43926`), verificação de serviços |
| `testes/apoio/repositorio.ts` | — | Apoio: acha a raiz do repositório e lê enums e dicionários do backend |

**Resultado** [MEDIDO] (`npm run cobertura`, mesma ferramenta do GitHub):

| Frontend | Antes | Depois |
|---|---:|---:|
| Linhas | 8,11% (887/10.927) | **13,38% (1.463/10.927)** |
| Ramos (condições) | 7,25% (717) | 11,19% (1.107) |
| Funções | 5,75% | 9,73% |
| `lib/` (linhas) | 48,1% | **79,7%** |

**Por pasta, para o SonarCloud:**

| Pasta | Antes (Sonar 13/11 16h25) | Depois |
|---|---:|---|
| `backend/app` | 89,3% | 89,3% [MEDIDO localmente: 89,34%; o backend não mudou] |
| `frontend/src` | 7,2% | **≈ 12%** [HIPÓTESE: (1.463 + 1.107) ÷ 20.811 = 12,3% pela fórmula do Sonar] |
| Total | 27,7% | **≈ 32%** [HIPÓTESE: (6.677 + 2.570) ÷ 28.285 = 32,7%] |

O número oficial é o que o SonarCloud mostrar depois do merge e de rodar o workflow.

**Arquivos que mais subiram** (linhas): `pinturaAlgoritmos.ts` 0 → 233/233, `marcacoes.ts` 0 → 114/120, `zip.ts` 0 → 57/77, `catalogoTermos.ts` 0 → 33/33, `achadosFicha.ts` 29 → 48/48, `progressoFicha.ts` 0 → 18/19, `segmentacoes.ts` 9 → 25/27, `coresAchados.ts`, `healthCheck.ts`, `repetir.ts`, `navegacao.ts`, `secoesCuradoria.ts`, `achados.ts`, `emailDigitacao.ts`, `regiaoGeografica.ts`, `errosTecnicos.ts` e `dentesFdi.ts`, todos a 100%.

**Ficaram de fora, por depender do navegador:**
- `escutaContinua.ts` (microfone), `recorteImagem.ts` e `ampliacaoGrade.ts` (canvas e tela);
- `codigoDoLink.ts` (hook do React), `sessao.ts`, a parte "salvar como" do `zip.ts` e parte do `tema.ts`.

Testá-los pede um navegador simulado, que é uma dependência nova.

**Por que a cobertura total ainda é baixa:** 9.105 das 10.927 linhas do frontend estão em telas e componentes (`app/` e `components/`), que esta tarefa não cobre. Subir esse número exige testes de componente (biblioteca de teste de tela, que é dependência nova) ou ampliar os testes no navegador (Playwright). A decisão é do Luciano.

## 4. Verificação final no ramo [MEDIDO]
- **Testes e build:**
  - `npx tsc --noEmit` ok;
  - `npx tsx testes/*.teste.ts`: 14 arquivos, 0 falhas;
  - `npm run cobertura`: 25 testes Vitest passaram;
  - `next build` ok.
- **Backend:** `pytest` com 651 passed. O backend não mudou.
- **Qualidade:**
  - Ruff 4, Mypy 72 e ESLint 2 avisos: **os mesmos da base** (nenhum aviso novo);
  - nenhum `type: ignore` e nenhuma regra desativada.

## 5. Observações encontradas (nada foi alterado: código de produção intocado)
1. **`lib/errosTecnicos.ts`, linha 49:** a forma falada `'ring-3 artifact'` parece erro de digitação de `'ring artifact'`. O efeito é pequeno: só a voz deixa de reconhecer essa expressão em inglês; "artefato em anel" e "anel" funcionam. Corrigir é uma linha. **Aguarda decisão.**
2. **`components/curadoria/PainelErroTecnico.tsx`** não é usado por nenhuma tela e ainda lista os tipos de erro antigos (`TIPOS_ERRO_TECNICO` de `lib/achados.ts`). Não causa defeito (o backend aceita os valores antigos), mas é código morto. Candidato a remoção num lote de limpeza.
3. **Testes com partes assíncronas** (`utilitarios.teste.ts`, como o `fetchSeguro.teste.ts` já existente): dentro do Vitest da auditoria, a parte assíncrona termina depois que o teste é dado como concluído. A falha ainda aparece, porque o processo sai com erro, mas não fica ligada ao nome do teste. Melhorar isso exige mudar o adaptador da auditoria, e fica como sugestão.

Próximo passo do chat: abrir o PR e conferir os checks.
