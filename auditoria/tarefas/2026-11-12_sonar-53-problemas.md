# Tarefa para o Claude Code — 53 problemas abertos no SonarCloud (redesign-ui)

Origem: Auditoria 03 (12/11/2026), SonarCloud branch `main` (código da `redesign-ui`). Responsável: Luciano de Matos Neto (não é programador: explique tudo em português simples, um passo por vez).
Estado de partida: Segurança A (1), Confiabilidade D (51), Manutenção A (39), cobertura 38,2%. Meta: Confiabilidade A/B sem quebrar nada.

## Regras (valem para todos os lotes)
1. Uma branch e um PR por lote, a partir de `redesign-ui`. Nome: `correcoes/sonar-lote-N`.
2. Antes de abrir o PR: `cd backend && python scripts/rodar_testes.py` (ou pytest em banco de teste) e, no frontend, `npx tsc --noEmit` e `npm run build`. Tudo verde.
3. Nunca mudar comportamento visível sem avisar. Lotes 1 e 2 não devem mudar nada que o usuário veja. O lote 3 muda interação (teclado/leitor de tela) e exige teste manual do Luciano antes de fundir.
4. Nada de `// NOSONAR` ou `eslint-disable` para silenciar sem justificar no PR. Falsos positivos: explique e deixe para o Luciano marcar como "Won't fix / False positive" no SonarCloud.
5. Não tocar em: anonimização DICOM, login/MFA (além do item 6 abaixo), permissões.
6. Ao final de cada lote, relatar: o que mudou, por que é seguro, como testar.

## Lote 1 — ajustes pequenos e seguros (18 itens)
| Regra | Arquivo:linha | O que fazer |
|---|---|---|
| S7773 (5×) | `frontend/src/components/segmentacao/PintorSegmentacao.tsx:72` e `:614`; `frontend/src/lib/conferenciaFicha.ts:47`; `frontend/src/lib/vozCuradoria.ts:252`; `frontend/src/components/detalhe/CamadaMarcacoes.tsx:115` | trocar `parseInt(` por `Number.parseInt(` (manter a base 10 explícita) |
| S8786 (4× TS) | `frontend/src/components/termos/TextoTermos.tsx:49`; `frontend/src/app/painel-admin/page.tsx:236`; `frontend/src/lib/acoesAuditoria.ts:271`; `frontend/src/components/curadoria/PainelVoz.tsx:249` | regex com desempenho super-linear: reescrever sem backtracking (ou trocar por laço, como já feito em `limparLivre`). Cobrir com teste de equivalência antes/depois |
| S8786 (1× Py) | `backend/app/modules/compartilhamentos_router.py:74` | idem |
| S6671 (2×) | `frontend/src/app/termos/page.tsx:43`; `frontend/src/components/anexos/AnexosCuradoria.tsx:32` | `Promise.reject(...)`/`throw` deve usar `new Error(...)` |
| S8396 (2×) | `backend/app/modules/users_router.py:100` e `:102` | campos `Optional[str]` sem valor padrão: acrescentar `= None` (conferir o schema OpenAPI e os testes) |
| S7493 | `backend/app/modules/users_router.py:159` | `open()` síncrono dentro de função async: mover para `run_in_threadpool`/`asyncio.to_thread` ou tornar a função síncrona |
| S2871 | `frontend/src/app/auditoria/page.tsx:250` | `sort()` sem comparador: usar `localeCompare('pt-BR')` |
| S2137 | `frontend/src/app/error.tsx:6` | renomear o componente `Error` (ex.: `ErroDaPagina`); manter `export default` (o Next.js só exige isso) |
| S1313 | `frontend/src/app/aparelhos/page.tsx:236` | IP `192.168.0.25` é texto de exemplo na tela: trocar por faixa reservada de documentação (`192.0.2.10`) ou mover para a tradução |

## Lote 2 — decisões (só relatar; não mudar sem o Luciano)
- `backend/app/modules/auth.py:375` (S3516, BLOCKER): a rota `/forgot-password` devolve sempre a mesma mensagem **de propósito** (não revelar quais e-mails existem; ASVS). É falso positivo. NÃO alterar o código. Pedir ao Luciano que marque como "False positive" no SonarCloud.
- S9379 `autoFocus` (11×): `PainelAchadosFicha.tsx:71`, `usuarios/page.tsx:1066`, `PartesSegundoFator.tsx:50`, `MenuMacros.tsx:76` e `:108`, `CompartilharImagem.tsx:159`, `confirmar-email/page.tsx:125`, `AnotacoesImagem.tsx:668`, `solicitar-acesso/page.tsx:138`, `esqueci-senha/page.tsx:98`, `redefinir-senha/page.tsx:126`. Em telas de campo único (esqueci/redefinir senha, confirmar e-mail, código do segundo fator) o foco automático é boa prática; no fluxo da curadoria ele serve ao ditado por voz. Para cada um, classificar "manter (justificativa)" ou "remover e dar foco via `useEffect` com `ref` só quando o usuário abrir o painel". Entregar a tabela ao Luciano decidir.

## Lote 3 — acessibilidade (muda interação; teste manual do Luciano antes de fundir)
- S6848 (19×, elementos clicáveis que não são botões): `AnexosCuradoria.tsx:260`, `FiltroErrosTecnicos.tsx:73`, `ResponderCompartilhamento.tsx:84`, `MenuPrancha.tsx:493`, `BuscaTermos.tsx:138`, `CamadaMarcacoes.tsx:142`, `ColunaFichaCuradoria.tsx:82`, `PainelDadosSobrepostos.tsx:59`, `AnotacoesImagem.tsx:403`, `:416`, `:653`, `EtiquetaMarcacoes.tsx:289`, `:587`, `pesquisa/page.tsx:693`, `:735`, `SeletorDentesGrupos.tsx:78`, `MenuMacros.tsx:71`, `CompartilharImagem.tsx:117`, `NotasVisualizador.tsx:151`. Preferir trocar `<div onClick>` por `<button type="button">` mantendo as classes (sem mudar o visual). Onde for sobreposição em canvas/mapa (CamadaMarcacoes, EtiquetaMarcacoes) usar `role` + `tabIndex` + `onKeyDown` (Enter/Espaço) e explicar.
- S6853 (2×): `EnvioFotoCelular.tsx:269`, `enviar-imagem/page.tsx:220` — rótulo `<label>` sem texto acessível: associar `htmlFor` e texto (traduzir via next-intl).
- S6845: `AceiteTermosUso.tsx:105` — `tabIndex` em elemento não interativo (área rolável): manter a rolagem por teclado com `role="region"` + `aria-label`.
- S6825: `FundoMapaMundi.tsx:94` — `aria-hidden` em elemento focável: remover o foco (`tabIndex={-1}`) ou o aria-hidden.

## Depois dos lotes
- Rodar o workflow `Auditoria semanal` e o `Sonarcloud` (workflow_dispatch em `redesign-ui`) e conferir o painel. Informar a nova nota de Confiabilidade.
- Condição do quality gate que ainda falha: cobertura do código novo (frontend sem relatório de cobertura). Ver tarefa separada: enviar `coverage/lcov.info` do Vitest ao Sonar (`sonar.javascript.lcov.reportPaths`).
