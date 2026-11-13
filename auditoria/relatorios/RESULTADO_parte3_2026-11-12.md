# Resultado da Parte 3 (blocos F, H e J) — 12/11/2026

Base: `redesign-ui` em `712beca` (PRs #46 a #51 já juntados). Os três PRs abaixo estão **abertos e NÃO foram juntados**: aguardam a revisão do Luciano.

| Bloco | PR | Branch | O que faz | Checagens do GitHub |
|---|---|---|---|---|
| F | #52 | `correcoes/acoes-sem-conexao` | Avisa "sem conexão" quando o servidor não responde, em vez de travar o botão | todas verdes |
| H | #53 | `seguranca/registro-conferencia-identidade` | "Redefinir 2 etapas" exige dois meios de conferência e registra quais na auditoria (ASVS 6.4.4) | todas verdes |
| J | #54 | `manutencao/ruff-eslint` | ESLint 6 erros → 0; Ruff 68 → 47 (21 imports sobrando); Mypy só relatado | conferir no PR (algumas ainda rodavam ao escrever) |

## Bloco F — avisar "sem conexão" (PR #52)
- **Problema:** Cerca de 20 funções de ação (gravar, apagar, bloquear) chamavam o servidor sem tratar a falta de conexão. Sem rede, a chamada "estourava" e o botão podia ficar travado sem aviso.
- **Correção:** nova função `fetchOuNulo` (`frontend/src/lib/fetchSeguro.ts`) devolve "nada" quando não há rede; cada tela mostra **um aviso simples** (`Comum.semConexao`, pt e en: "Sem conexão com o servidor. Tente de novo."), destrava o botão e mantém o que a pessoa digitou. Nenhuma mensagem técnica aparece.
- **Telas:** vocabulário (6 ações), macros (3), aparelhos (2), grupos (2), sugestões, usuários (bloquear), login (cadastro do 2º fator), envios, 2º fator (ligar e confirmar) e pintura (`segmentacoes.ts`, 4 chamadas). Duas funções já tratavam o erro (`reabrir` e `remover`) e não foram mexidas.
- **Teste novo:** `frontend/testes/fetchSeguro.teste.ts` (rede caindo devolve nada; a pintura mostra a mensagem simples; resposta 500 do servidor continua passando).
- **Verificação:** `tsc --noEmit` limpo, todos os testes `tsx` OK, `next build` OK.

## Bloco H — conferência de identidade no sistema (PR #53, ASVS 6.4.4)
- **Problema (lacuna da seção 3.4.1 do SEGURANCA.md):** a auditoria registrava **que** o segundo fator foi redefinido, mas não **como** a identidade foi conferida.
- **Correção:** a janela "Redefinir 2 etapas" (tela Usuários) pede **dois meios** de uma lista fechada (e-mail cadastrado, presencial, videochamada, responsável acadêmico) e a confirmação do procedimento. O servidor confere de novo: **422** se vier menos de dois meios, meio repetido, meio fora da lista, ou sem a confirmação. A ação `segundo_fator_redefinido_pelo_admin` guarda os meios usados, **sem texto livre, sem documento e sem dado pessoal**.
- **Permissões:** continua só administrador (403 para os demais) e o administrador não redefine o próprio (409).
- **Testes:** 6 novos em `backend/tests/test_segundo_fator.py` (sem corpo, 1 meio, meio repetido, meio fora da lista, sem confirmação, 2 meios válidos com registro na auditoria, só administrador). O teste de contrato `test_1_3_3_todo_texto_recebido_tem_tamanho_maximo` apontou a falta de `maxItems` na lista; corrigido.
- **Verificação:** suíte completa do backend com PostgreSQL local: **646 passaram** (1 ignorado) e o único teste que falhou foi corrigido (34 OK nos dois arquivos afetados).
- **Documentos:** `SEGURANCA.md` v1.22 (3.4.1 e histórico) e `REGISTROS.md`. O OpenAPI é gerado do novo formulário.
- **Limite:** o sistema registra o que o administrador **declarou**; não prova que a conferência aconteceu. Por isso o passo 7 do procedimento (anotação fora do sistema) continua valendo.
- **Efeito na matriz:** 6.4.4 passa de inconclusivo a aprovado depois que o PR #53 for juntado e retestado.

## Bloco J — limpeza de baixo risco (PR #54)
- **ESLint:** 6 erros → **0** (5 `prefer-const` em `motorMapaMundi.ts` e `vozCuradoria.ts`; 1 escape desnecessário na expressão regular do login). Os 22 avisos (severidade "aviso") ficaram como estão.
- **Ruff:** 68 → **47**. Só a correção segura do próprio Ruff (`--fix`, sem `--unsafe-fixes`): 21 imports não usados (F401) em 13 arquivos. Conferi por busca que nenhum import removido é usado por outro módulo. Restam: B904 (30), B023 (9), B905 (4), S608 (2), S607 (1), S603 (1).
- **Mypy (só relatado, nada corrigido):** 406 com Python 3.13 local (o CI informa 403). Por categoria: `arg-type` 187, `assignment` 175, `var-annotated` 13, `union-attr` 7, `return-value` 7, `call-overload` 7, `call-arg` 3, `attr-defined` 3, `str` 2, `misc` 2, `index` 2. Não analisei as causas de cada uma; fica para uma decisão futura.
- **Verificação:** 641 testes do backend passaram (1 ignorado); `tsc` limpo; testes `tsx` OK.

## Ordem sugerida de junção ("Create a merge commit", nunca squash)
1. #52 (F), 2. #53 (H), 3. #54 (J). Os três mexem em arquivos diferentes, exceto `login/page.tsx` (F e J) e `messages/*.json` (F e H): se o GitHub pedir "Update branch" no segundo, é só atualizar.

## Decisões que continuam com o Luciano
- Juntar #52, #53 e #54 depois de revisar.
- `MFA_TOTP_JANELA`: manter **0** (cumpre o ASVS 6.5.5) ou usar 1 se o relógio dos celulares atrapalhar.
- Testes manuais pendentes: login com os 8 códigos novos (#48); OHIF depois do #47 (`curl.exe -sI http://localhost:3001/ | findstr /i frame-ancestors`); lote 3 (acessibilidade) e Termos v1.1 (#43) ainda esperam o teste dele.
