# Resultado: pendências da auditoria contínua (12/11/2026)

Base de todos os itens: `origin/redesign-ui` em `b3ddbf8` (PR #39), conferida com `git fetch` antes de cada item.
Commits em nome do Luciano, um por arquivo. O push e a abertura dos PRs ficam com o Luciano.

**Verificação ao fim de cada item:**
- `pytest`: backend completo, em banco de teste;
- `npx tsc --noEmit`;
- `npx tsx testes/*.teste.ts`;
- `next build`.

| Item | Branch | Commits | pytest | tsc | tsx | build |
|---|---|---|---|---|---|---|
| 1. Sonar lote 1 | `correcoes/sonar-lote-1` | 19 | 615 ok | ok | 7 ok | ok |
| 2. Termos v1.1 | `termos-v1-1` | 7 | 614 ok | ok | 6 ok | ok |
| 3. Lote 3 + autoFocus | `correcoes/sonar-lote-3` (sobre o lote 1) | 18 | 615 ok | ok | 7 ok | ok |
| 4. Cobertura do frontend | `auditoria/cobertura-frontend` | 7 | 611 ok | ok | 6 ok | ok |
| 5. Matriz ASVS | `auditoria/matriz-asvs-2026-11-12` | 3 | 611 ok | ok | 6 ok | ok |
| 6. Carregadores com try/catch | `correcoes/loaders-try-catch` | 5 | 611 ok | ok | 6 ok | ok |

Os números de testes variam porque cada branch traz os seus próprios testes novos:
- o lote 1 traz 4 testes no backend e 1 arquivo no frontend;
- os Termos v1.1 trazem 3 testes no backend.

## Item 1: Lote 1 do Sonar
- `git am` dos 19 commits sobre `b3ddbf8`, **sem conflito**: da `a4559fe` para a ponta atual só mudaram arquivos de `auditoria/`.
- **Como testar:**
  1. No **Painel do administrador**, a "última falha de e-mail" aparece sem ponto duplo.
  2. Na **Auditoria**, a lista "Outras ações" aparece em ordem.
  3. Em **Termos e privacidade**, os títulos aparecem normalmente.
  4. **Compartilhar imagem** com e-mail válido funciona; com `a@b`, `a b@c.d` ou `@b.c` aparece "Digite um e-mail válido".
  5. **Trocar a foto de perfil** funciona.
  6. Em **Aparelhos**, o exemplo de IP no campo agora é `192.0.2.10`.

## Item 2: Termos v1.1
- 6 commits do pacote `termos-v1-1-atualizado.mbox`. Ele substitui o pacote antigo `termos-v1-1.mbox`, que não foi aplicado.
- Novo teste `backend/tests/test_termos_v11.py` (3 testes) comprova que:
  - a versão em vigor é **1.1** (vigência 11/11/2026);
  - quem aceitou a 1.0 recebe 403 `termos_uso_pendentes` no próximo login, até aceitar a 1.1; a 1.0 é recusada com 409; o aceite antigo fica no histórico;
  - o aceite grava em `aceites_termos_uso.resumo_textos` o **SHA-256** de 64 caracteres, igual a `resumo_do_perfil()`;
  - `GET /termos`, a página pública, entrega o texto novo: desidentificação, operador, Res. ANPD 19/2024, foro do consumidor, sem as bases legais retiradas e sem PPGINFOS.
- **Migração:** nenhuma nova. Mesmo assim, `alembic upgrade head` rodou num banco vazio criado só para isso (e apagado depois), do início até `d6e8f0a2b4c5 (head)`, sem erro.

## Item 3: Lote 3 + autoFocus
- O Lote 1 ainda não foi juntado, então este ramo foi montado **sobre o Lote 1**: os 17 commits do lote 3 mais 1 commit novo.
- Commit novo: retirado o `autoFocus` do campo "nome" em `frontend/src/app/solicitar-acesso/page.tsx`. Os outros 10 ficaram intactos.
- **Não juntar sem o teste manual de 8 passos** (`RELATORIO_sonar_lotes_1_2_3`). Depois que o Lote 1 for juntado, este PR mostra só os 18 commits dele.

## Item 4: Cobertura do frontend no SonarCloud
- **Situação encontrada:** o Vitest tinha 1 único arquivo de teste. Os testes reais do frontend são os 7 scripts de `frontend/testes/`, rodados com `tsx`, que a medição de cobertura não enxergava.
- **O que foi feito:**
  - Novo `auditoria/ferramentas/frontend-testes/vitest/scripts-frontend.test.ts`: roda cada script dentro do Vitest e transforma o `process.exit(1)` em falha de teste. Foi provado com um script de falha proposital, que o adaptador acusou corretamente.
  - `vitest.config.ts`: cobertura V8 de **todo** `frontend/src`, inclusive arquivos sem teste nenhum. O JSX é transformado sem mexer no frontend.
  - `@vitest/coverage-v8` **5.1.0**, a mesma versão do Vitest. É a única dependência nova, como a tarefa pediu.
  - `npm run cobertura` grava `frontend/coverage/lcov.info` e roda `ajustar-lcov.mjs`, que reescreve os caminhos para `frontend/src/...` a partir da raiz, como o Sonar espera.
  - `.github/workflows/sonarcloud.yml`: instala o Node 22, gera a cobertura antes da análise e envia `-Dsonar.javascript.lcov.reportPaths=frontend/coverage/lcov.info`. O `-Dsonar.branch.name=main` foi mantido.
  - `.gitignore`: ignora `frontend/coverage/`.
- **Número medido localmente, sem inventar:** a cobertura de todo `frontend/src` é de **7,7% das linhas** (832 de 10.798). Os testes atuais cobrem funções de texto, voz, orientação, tema e teclado, e não as telas.
  - **Consequência:** a condição "cobertura do código novo ≥ 80%" do portão de qualidade **não deve passar** só com isso. Ela passa a mostrar o número real; o percentual oficial é o que o SonarCloud mostrar.
- **Atenção:** o workflow faz checkout de `ref: redesign-ui`. A cobertura só aparece no Sonar **depois que este PR for juntado**; rodar o workflow a partir do branch do PR ainda analisaria o código antigo.

## Item 5: Matriz ASVS (V5, V8, V2, V6)
A matriz completa (`matriz_asvs.csv`) **não está no repositório**, só nos documentos do Projeto Radix. Por isso, as mudanças ficaram em `auditoria/matriz/mudancas_2026-11-12.csv`, no formato da matriz (`;` e BOM). Cada linha traz a situação anterior, a nova e a evidência com arquivo:linha ou teste. Há também um `README.md` explicando como aplicar.

**Itens que mudaram de situação:**

| Item | Antes | Agora | Evidência resumida |
|---|---|---|---|
| 3.5.5 postMessage | não aplicável | **REPROVADO (baixa)** | O Radix confere origem e formato em todos os pontos que recebem mensagens. Mas o OHIF confia na origem de quem o colocou em moldura (`ohif/app-config.template.js:212/332/346`) e não tem `frame-ancestors` |
| 6.4.4 perda do 2º fator | não aplicável | INCONCLUSIVO | O administrador redefine o segundo fator (`test_segundo_fator.py:170`), mas o procedimento de conferir a identidade da pessoa não está documentado |
| 6.5.1 uso único | não aplicável | APROVADO | `mfa.py:115-119`; `test_segundo_fator.py:90` e `:119` |
| 6.5.2 guarda dos códigos de recuperação | não aplicável | **REPROVADO (média)** | ~39,6 bits, guardados com SHA-256 sem sal (`mfa.py:124-126`, `:132`). O requisito pede hash de senha com sal quando o código tem menos de 112 bits |
| 6.5.3 gerador aleatório | não aplicável | APROVADO | `pyotp.random_base32` usa `SystemRandom`; `secrets.choice`; `token_urlsafe` |
| 6.5.4 entropia mínima | não aplicável | APROVADO | TOTP de 6 dígitos; códigos de recuperação com ~39,6 bits |
| 6.5.5 validade do TOTP | não aplicável | **REPROVADO (baixa)** | Aceita o passo anterior e o seguinte (`mfa.py:115`): o código vale até ~90 s, e o requisito pede 30 s |

Mais 8 itens tiveram a evidência atualizada **sem mudar de situação**:
- 7.5.1: a evidência antiga dizia "não há MFA";
- 6.3.1: trava de login por conta;
- 6.4.3: mesma resposta em `/forgot-password`;
- 5.2.1 e 5.2.2: foto pelo celular e anexos;
- 8.2.1 e 8.2.2: rotas novas;
- 2.3.1: Termos antes do termo de ciência.

O avatar gravado via `run_in_threadpool` (lote 1, ainda não juntado) não muda nenhum item.

## Item 6: Pendências pequenas
- **try/catch:** uma busca automática em `frontend/src` encontrou 24 funções `async` com `await fetch` sem `try`. A tarefa pede corrigir os **carregadores**. Os 5 carregadores foram corrigidos, e o comportamento sem rede ficou igual ao de quando o servidor responde erro:
  - `aparelhos/page.tsx` `carregar()`;
  - `grupos/page.tsx` `carregar()`;
  - `pranchas-recebidas/page.tsx` `carregar()`;
  - `segundoFator/SecaoSegundoFator.tsx` `carregar()`;
  - `curadoria/page.tsx` `carregarFichaCompleta()`.
- As outras **19 são ações** (salvar, apagar, promover etc.) e ficaram como estão, fora do escopo. Elas estão em `aparelhos`, `grupos`, `macros`, `vocabulario`, `usuarios`, `sugestoes`, `login` (`iniciarCadastro`), `AnexosCuradoria` (`remover`), `BotaoEditarCuradoria` (`reabrir`) e `SecaoEnvios` (`chamar`). Hoje, sem rede, a ação simplesmente não acontece e não aparece mensagem. Sugestão: um lote futuro com um aviso único de "sem conexão".
- **ASVS 3.5.5:** reavaliado e anotado na matriz (ver Item 5).

## O que depende do Luciano
1. Fazer o push dos 6 branches e abrir os PRs para `redesign-ui`. **O Lote 3 só deve ser juntado depois do teste manual.**
2. Decidir sobre os achados do segundo fator:
   - **6.5.2:** guardar os códigos de recuperação com Argon2id, como as senhas, e gerar códigos novos para quem já tem;
   - **6.5.5:** reduzir a tolerância do código, ou aceitar o risco e registrar a decisão;
   - **3.5.5:** fazer o OHIF conferir a origem configurada do Radix, mais `frame-ancestors`;
   - **6.4.4:** escrever o procedimento de conferência de identidade.
3. Aplicar o `mudancas_2026-11-12.csv` na matriz do projeto (ou pedir ao chat de auditoria) e, de preferência, versionar a matriz completa no repositório.
4. Fora do Claude Code:
   - marcar o S3516 (falso positivo) e os "Won't fix" no SonarCloud;
   - rodar os workflows Sonarcloud e Auditoria semanal **depois** de juntar o Item 4;
   - advogado;
   - e-mail de privacidade;
   - servidor, HTTPS e backup;
   - Dependabot.
