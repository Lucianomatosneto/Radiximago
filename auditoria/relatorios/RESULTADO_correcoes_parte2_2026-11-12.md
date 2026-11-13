# Resultado: correções da auditoria, parte 2 (12/11/2026)

Base: `origin/redesign-ui` em `64fc706`, que já tem o lote 1, a cobertura e a matriz.
Commits em nome do Luciano, um por arquivo. O push e os PRs ficam com o Luciano (sempre "Create a merge commit").

Em cada ramo rodaram:
- `pytest` (backend completo);
- `npx tsc --noEmit`;
- `npx tsx testes/*.teste.ts`;
- `next build`.

**Tudo passou em todos os ramos.**

## Ramos e contagem de commits

| Bloco | Ramo | Parte de | Commits próprios | pytest |
|---|---|---|---|---|
| A | `correcoes/sonar-s6439` | `redesign-ui` | 5 | 615 ok |
| B + C | `seguranca/mfa-codigos-recuperacao` | `redesign-ui` | 16 | 627 ok |
| D | `seguranca/ohif-origem-confiavel` | **ramo do B** | 8 | 640 ok |
| E | `docs/verificacao-identidade` | **ramo do D** | 1 | 640 ok |
| F | — | — | **não feito** | — |
| G | `manutencao/pequenos-itens` | `redesign-ui` | 4 (com este relatório) | 617 ok |

**Por que D e E estão empilhados:** B, D e E mudam o mesmo `docs/SEGURANCA.md` (número de versão e histórico). Ramos separados dariam conflito ao juntar. Juntando na ordem **B → D → E**, cada PR passa a mostrar só os próprios commits.

## Bloco A: zeros soltos na tela (S6439), feito
- **Busca:** o verificador de tipos do TypeScript percorreu todo o `frontend/src` atrás de `{x && ...}` com `x` numérico. Achou **exatamente os 6 casos** do Sonar, todos com `proporcao`.
- **Outros resultados, que não mostram "0":**
  - `ReactNode` passados pelo próprio código (`extra`, `rodape`, `topo`, `acoesFinais`, `aoLado`);
  - `quadranteAberto`, que vale de 1 a 4 ou nada.
- **Correção:** `src/lib/proporcao.ts`, função `proporcaoValida()`, que responde sim ou não e diz ao TypeScript que o valor é um número válido (maior que 0 e finito). Usada nas 6 linhas de `compartilhadas-comigo`, `minhas-imagens` e `pesquisa`.
- **Teste:** `frontend/testes/proporcao.teste.ts` (14 verificações). Monta o trecho com o React de verdade e prova que o jeito antigo mostrava `"0"` e o novo não mostra nada.
- **Como conferir na tela:** em Pesquisa, Minhas imagens e Compartilhadas comigo, ligue as marcações e a pintura nas miniaturas. Elas aparecem como antes, sem nenhum "0" solto.

## Blocos B e C: segundo fator (ASVS 6.5.2 e 6.5.5), feitos
### Códigos de recuperação (B)
- **Formato:** 8 códigos de **24 caracteres** em 6 grupos (`ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2`), com alfabeto de 31 símbolos, cerca de **118,9 bits** (o mínimo exigido é 112).
- **Guarda:** só o resumo **Argon2id com sal**, o mesmo das senhas (`pwd_context`).
- **Desempenho:** o código digitado só é conferido contra a lista se tiver o formato longo. Errar o código de 6 números não dispara 8 cálculos pesados.
- **Migração `f1a3c5e7b9d2`:**
  - cria `users.codigos_recuperacao_trocar`;
  - marca quem tem aplicativo e tinha códigos;
  - **apaga todos os resumos antigos**.
- **No próximo login com o aplicativo:** os novos códigos são gerados, mostrados uma vez com o aviso "seus códigos foram substituídos" e registrados como `codigos_recuperacao_regenerados`. O aplicativo do celular continua valendo.
- O caminho de volta da migração remove a coluna. Os códigos antigos não voltam, de propósito.
- O campo de código na tela de login agora aceita o código longo.

### Janela do código do aplicativo (C)
- Nova configuração `MFA_TOTP_JANELA`:
  - **0 (padrão):** só o código do momento, no máximo 30 s;
  - **1:** também o código anterior, até 60 s.
- O código do intervalo seguinte **nunca** é aceito.
- Qualquer valor fora de 0 e 1 impede a API de ligar.
- A proteção contra reutilizar um código já existia e continua (`totp_ultimo_passo`).

### Testes e documentação
- **Testes:** `backend/tests/test_mfa_codigos_fortes.py` (12 testes): entropia, Argon2id com sal diferente em cada código, uso único, código errado, formato antigo recusado, nenhum código em texto puro no banco, na auditoria ou nos registros, troca no login, janela 0/1, reuso, configuração inválida, e a **migração rodada num banco próprio** (antes e depois, e o caminho de volta).
- `test_segundo_fator.py` foi atualizado para o formato novo.
- **Cobertura:** `mfa.py` + `mfa_router.py` = **94%** de linhas.
- **Documentos atualizados:** `SEGURANCA.md` 1.19, `CRIPTOGRAFIA.md` 1.2, `REGISTROS.md` 1.13 e `IMPLANTACAO.md`.

### Riscos e decisão
- **Risco:** com a janela 0, quem digita o código no último segundo pode ser recusado e precisa digitar o seguinte (são 5 tentativas por login). Se isso incomodar em sala de aula, `MFA_TOTP_JANELA=1` no `.env`.
- **Decisão do Luciano:** a tarefa pedia "a confirmar com o Luciano caso haja objeção". Foi implementada a recomendação (Argon2id + 24 caracteres + troca automática).

### Como conferir
1. Depois de `alembic upgrade head`, entre com uma conta de curador. Após o código do aplicativo, aparecem os 8 códigos novos com o aviso azul.
2. Saia e entre com um desses códigos no lugar do código do aplicativo: deve entrar.
3. Em Meus acessos, a contagem mostra 7 códigos.
4. Na Auditoria aparece "Códigos de recuperação trocados por segurança".

## Bloco D: OHIF confia só nas telas do Radix (ASVS 3.5.5 e 3.4.6), feito
- **Novo `ohif/gerar-config.sh`**, chamado pelo Docker Compose ao ligar o OHIF:
  - troca `__RADIX_ORIGEM_CONFIAVEL__` no `app-config.js` pelo endereço das telas (`RADIX_ORIGEM_CONFIAVEL`). O `document.referrer` **saiu**;
  - acrescenta `Content-Security-Policy: frame-ancestors <origem>` **em cada bloco** do Nginx e no servidor. A conferência pelo código-fonte oficial do OHIF 3.9.2 mostrou que o `location /` da imagem tem um `add_header` próprio e, sem isso, ignoraria o do servidor;
  - origem inválida (com barra, caminho, aspas ou outro protocolo) **impede o OHIF de ligar**.
- **`X-Frame-Options` não é enviado, de propósito.** Ele só sabe `DENY` ou `SAMEORIGIN`, e telas e OHIF são origens diferentes, então quebraria o visualizador. O `frame-ancestors` o substitui nos navegadores atuais. Assim, o "X-Frame-Options coerente" da tarefa é **não enviar**.
- **Origem configurada:**
  - computador: `http://localhost:3000` (padrão do `docker-compose.yml`);
  - servidor: `https://app.radiximago.com.br` (`docker-compose.prod.yml`).
- **Testes:** `backend/tests/test_ohif_origem_confiavel.py` (13 testes): template sem referrer, cabeçalho em todos os blocos, origem e porta inválidas, configuração do Compose, e um **Nginx de verdade** ligado pelo teste, conferindo o cabeçalho em `/`, numa rota de tela e no `app-config.js` (`no-store`). A cópia do Nginx da imagem está em `backend/tests/dados/ohif_default.conf.template` (licença MIT).
- **Documentos atualizados:** `SEGURANCA.md` 1.20 (5.1) e `IMPLANTACAO.md`.
- **Como conferir (PowerShell, com o Docker ligado):**
  ```powershell
  docker compose up -d --force-recreate radix-ohif
  curl.exe -sI http://localhost:3001/ | findstr /i frame-ancestors
  ```
  Deve aparecer `frame-ancestors http://localhost:3000`. Depois, abra uma imagem no Radix: o visualizador abre na moldura e as marcações aparecem.
- **Risco:** se as telas forem abertas por outro endereço (por exemplo `http://127.0.0.1:3000`), o OHIF não abre na moldura. Use sempre `localhost:3000`, ou ajuste `RADIX_ORIGEM_CONFIAVEL`.

## Bloco E: conferência de identidade (ASVS 6.4.4), feito (só documentação)
- **`docs/SEGURANCA.md` 1.21, seção 3.4.1:** quem pede, quem autoriza, **dois meios obrigatórios** de conferência, proibições (nunca só por e-mail ou mensagem), prazo de 2 dias úteis, execução e registro sem guardar cópia de documento (LGPD).
- **Adaptação:** a tarefa citava o canal "@ufsc.br". O texto fala em "e-mail cadastrado na conta (o e-mail da instituição dela)", porque o Radix serve a mais de uma instituição e a decisão anterior foi não amarrar o produto à UFSC.
- **Lacuna descrita, não implementada:** a auditoria registra **que** houve redefinição, mas não **como** a identidade foi conferida. Proposta mínima: no botão "Redefinir 2 etapas", escolher os dois meios usados numa lista fechada, que vai para a auditoria. **Aguarda o Luciano.**

## Bloco F: ações sem conexão, não feito
A tarefa manda fazer **depois** que o PR #46 (`correcoes/loaders-try-catch`) for juntado, e o #46 está na lista "não fazer agora". As 19 funções continuam como estão. Quando o #46 for juntado, o F parte da `redesign-ui` atualizada.

## Bloco G: manutenção, feito
1. **M-03:** `cloudflare/cloudflared` fixado em **2026.10.5** (publicada em 27/10/2026; a mais recente, 2026.11.0, saiu em 12/11/2026), com comentário de como atualizar. `docs/TUNEL_CLOUDFLARE.md` avisa para não usar o `:latest` mostrado no painel da Cloudflare. Teste novo `backend/tests/test_imagens_fixadas.py`: falha se alguma imagem dos `docker-compose*.yml` ficar sem versão ou com `:latest`.
   - Observação: `nginx:alpine` e `caddy:2` seguem uma versão principal sem fixar o número exato. O teste aceita isso; fixar por completo é outra decisão.
2. **Cobertura do código novo:**
   - `lib/proporcao.ts` 100% (testada em todos os caminhos);
   - `lib/texto.ts` 7/7 linhas;
   - `mfa.py` + `mfa_router.py` 94%;
   - `ohif/gerar-config.sh` é shell e o Sonar não mede, mas tem 13 testes.
   - As mudanças em telas (`login/page.tsx`, `PartesSegundoFator.tsx`) não têm teste de componente. O frontend não tem biblioteca de teste de telas, e acrescentar uma é dependência nova.
   - O percentual oficial do "código novo" é o que o SonarCloud mostrar depois de juntar.
3. **`auditoria/relatorios`:** sugestão para o Claude do chat registrar:
   - a. 6.5.2 e 6.5.5 corrigidos (reteste para "aprovado");
   - b. 3.5.5 e 3.4.6 do OHIF corrigidos (reteste);
   - c. 6.4.4 com procedimento escrito, ainda inconclusivo até a lacuna ser decidida;
   - d. S6439 = 0;
   - e. M-03 fechado.

## O que depende do Luciano
1. Push dos 5 ramos e PRs para `redesign-ui`, juntando na ordem **A; B; D; E; G** (A e G podem ir em qualquer momento).
2. Depois de juntar o B: `docker compose up -d --build`, `docker compose exec radix-api alembic upgrade head` e o teste de login acima.
3. Depois de juntar o D: recriar o OHIF e conferir o cabeçalho e o visualizador.
4. Decidir: a lacuna do 6.4.4 (registro dos meios de conferência) e se `MFA_TOTP_JANELA` fica em 0.
5. Liberar o Bloco F quando o #46 for juntado.
