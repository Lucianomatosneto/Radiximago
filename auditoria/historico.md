# Histórico de auditorias

Estados: **NOVO**, **RECORRENTE**, **RESOLVIDO** (só após reteste), **AGRAVADO**, **ABERTO**.

## Auditoria 01 — 11/11/2026 — commit `8112dd5`

Backend: 604/604 testes. Auditoria da API: 9/9. Frontend: 181/181 + Vitest 11/11 + Playwright 4/4. TypeScript OK. `npm audit` 0 vulnerabilidades. k6: 0 falhas, p95 7,9 ms. Detalhes: `relatorios/2026-11-11_auditoria-01.md` e `..._adendo-infraestrutura.md`.

| ID | Gravidade | Assunto | Estado |
|---|---|---|---|
| A-01 | ALTO | Pillow 12.3.0 com 40 vulnerabilidades (corrige em 13.0.0) | NOVO |
| M-01 | MÉDIO | Senha antiga do banco no histórico público (≠ senha atual) | RECORRENTE (já conhecido pelo projeto) |
| M-02 | MÉDIO | Falha silenciosa ao apagar original na anonimização | NOVO (a confirmar impacto) |
| M-03 | MÉDIO | Orthanc em `:latest` | NOVO |
| M-04 | MÉDIO | Portas expostas no host (4242, 8000, 8042, 3001) | NOVO (suspeita) |
| M-05 | MÉDIO | Pré-checklist de produção pendente (restam: rotação de credenciais, Next.js 14.2.35). **CORS: RESOLVIDO** (reteste: origem desconhecida recusada) | RECORRENTE / parcialmente RESOLVIDO |
| B-01..03, S-01 | BAIXO | Qualidade do código (Ruff) | NOVO |
| S-02 | MÉDIO | Desempenho da tela de login (globo 3D), a confirmar em dispositivo real | NOVO (suspeita) |
| B-04 | BAIXO | 403 erros de tipo em 50 arquivos (Mypy, referência oficial = GitHub Actions) | NOVO |
| B-05 | BAIXO | 6 erros e 22 avisos (ESLint) | NOVO |
| B-06 | BAIXO | `/uploads` (fotos de perfil) público por decisão; nomes imprevisíveis não verificados | NOVO |
| B-07 | BAIXO | `/health/*` responde 200 mesmo com serviço fora do ar | NOVO |
| — | — | Conflito `yarn.lock` × `package-lock.json` | RESOLVIDO (conferido no código) |

## 2026-11-11 — Validação na esteira do GitHub (PR #2, código bebd516)
- Rodaram com sucesso: testes-backend (604/604 + 9/9 auditoria), testes-frontend (181/181 + Vitest 11/11), E2E Playwright (4/4), qualidade, segurança.
- Segurança: pip-audit 40, npm audit 0, Gitleaks 0, Semgrep 0, ESLint 6 erros/22 avisos, Mypy 403/50 arquivos.
- Gitleaks 0 não contradiz M-01 (regra padrão não reconhece senha dentro de URL de banco).
- VALIDADOS pelo canário (commit bc9164e): Gitleaks varreu 426 commits (0 achados; canário = 1). Semgrep rodou 231 regras em 261 arquivos (0 achados; canário = 1).
- Ainda não executados no GitHub: desempenho, zap-passivo, sonarcloud, auditoria-semanal.

## 2026-11-11 — SonarCloud integrado (modo automático, branch main). Achados dele ficam como SUSPEITA até verificação no código.

## 2026-11-12 — Leitura do relatório ZAP passivo (Radix isolado, localhost:3000)
ZAP 2.17.0: 2 Médios (CSP unsafe-inline em script e style), 6 Baixos, 9 Informativos. Nenhum Alto. Nada foi corrigido.
| ID | Severidade | Status | Achado |
|---|---|---|---|
| Z-01 | MÉDIO | CONFIRMADO (código) / impacto real = SUSPEITA | Formulários de login, esqueci-senha e solicitar-acesso sem `method="post"` (só `onSubmit` em JS). Se enviados antes de o JS carregar (ou com JS falhando), o navegador usa GET e e-mail/senha vão para a URL (histórico, logs, Referer). O ZAP, que não executa JS, enviou GET com `senha=ZAP`. |
| Z-02 | BAIXO | CONFIRMADO | Cabeçalho `X-Powered-By: Next.js` exposto (falta `poweredByHeader: false` no next.config). |
| Z-03 | MÉDIO | CONFIRMADO, limite já declarado | CSP com `'unsafe-inline'` em script-src e style-src (documentado em docs/SEGURANCA.md). |
| Z-04 | BAIXO | CONFIRMADO | Faltam COEP, COOP, CORP e Permissions-Policy. |
| Z-05 | INFO | PROVÁVEL FALSO POSITIVO | "Base64 Disclosure" em imagens .webp (texto aleatório de bytes). |
| Z-06 | INFO | NÃO VERIFICÁVEL | "Big Redirect" na raiz; requer análise na 1ª auditoria. |

## 2026-11-12 — Auditoria 02 (autenticação, permissões, anonimização DICOM) — relatório em relatorios/2026-11-12_auditoria-02-*.md
- M-02: CONFIRMADO (código + teste com Orthanc falso). Novos: A-02 (login sem limite por conta, BAIXO/MÉDIO), A-03 (enumeração por tempo, BAIXO). Z-01 e Z-02 ligados ao escopo.
- Nenhum CRÍTICO. Nada foi corrigido; correções aguardam autorização.
- Adendo da Auditoria 02 (máquina do responsável): proxy do Orthanc devolve 401 sem login (5 rotas), banco/Whisper não expostos, Orthanc só aceita aparelhos cadastrados. M-03 CONFIRMADO (orthanc:latest). M-04 reduzido a BAIXO (resta modo túnel). I-04: portas em 0.0.0.0 no modo dev (suspeita).

## 2026-11-12 — Auditoria 03 (geral)
- Relatorio: auditoria/relatorios/2026-11-12_auditoria-03-geral.md. ASVS reavaliado (22 reprovados na matriz 18-19/10; L1 so TLS, a retestar), radon, tamanhos, S-01, Q-01/Q-02. Nada alterado no Radix.

## 2026-11-12 — Fechamento da Auditoria 03
- Correções fundidas em redesign-ui (PRs #3, #26, #4 e Dependabot seguro). Auditoria semanal 43280023341 verde. Login: Lighthouse 61→89, TBT 8,7 s→0,27 s. pip-audit: 0.
- S-01 medido com dados sintéticos: texto livre escala linearmente (3 s com 30 mil fichas e erro de digitação); filtros normais rápidos. Registrado como melhoria futura (índice GIN em coluna de texto normalizado). Ferramenta: auditoria/scripts/medir_busca.py (PR #34).

## 2026-11-12 — Registro de 10 a 12/11 (Termos v1.1, autoria, Sonar lotes 1–3)
- Fonte: handoff do Claude Code (Project: claude/auditoria/HANDOFF_auditoria_continua_2026-11-12.md e RELATORIO_sonar_lotes_1_2_3_2026-11-12.md). Detalhes na seção 10 do relatório 2026-11-12_auditoria-03-geral.md.
- Autoria (retirada de PPGINFOS/UFSC dos textos do usuário): já no GitHub. Termos v1.1 (6 commits), Sonar lote 1 (19) e lote 3 (17): pacotes .mbox NÃO aplicados em 12/11.
- Sonar 53 problemas: lote 1 = 18 correções seguras; lote 2 = decisões (S3516 falso positivo; autoFocus manter 10, remover 1, aguardando decisão); lote 3 = acessibilidade, exige teste manual. Correção à tarefa: S6848 resolvido com papéis ARIA, não com botão (botão com campo dentro seria HTML inválido).
- Pendências jurídicas e de produção listadas na seção 10 do relatório. Continua valendo: só dados de teste/anonimizados até aprovação do CEP.
