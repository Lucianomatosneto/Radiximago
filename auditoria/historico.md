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
| B-04 | BAIXO | 143 erros de tipo (Mypy) | NOVO |
| B-05 | BAIXO | 6 erros e 22 avisos (ESLint) | NOVO |
| B-06 | BAIXO | `/uploads` (fotos de perfil) público por decisão; nomes imprevisíveis não verificados | NOVO |
| B-07 | BAIXO | `/health/*` responde 200 mesmo com serviço fora do ar | NOVO |
| — | — | Conflito `yarn.lock` × `package-lock.json` | RESOLVIDO (conferido no código) |
