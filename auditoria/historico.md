# Histórico de auditorias

Estados: **NOVO**, **RECORRENTE**, **RESOLVIDO** (só após reteste), **AGRAVADO**, **ABERTO**.

## Auditoria 01 — 11/11/2026 — commit `8112dd5`

Backend: 604/604 testes. Frontend: 181/181 testes. TypeScript OK. `npm audit` 0 vulnerabilidades.

| ID | Gravidade | Assunto | Estado |
|---|---|---|---|
| A-01 | ALTO | Pillow 12.3.0 com 40 vulnerabilidades (corrige em 13.0.0) | NOVO |
| M-01 | MÉDIO | Senha antiga do banco no histórico público (≠ senha atual) | RECORRENTE (já conhecido pelo projeto) |
| M-02 | MÉDIO | Falha silenciosa ao apagar original na anonimização | NOVO (a confirmar impacto) |
| M-03 | MÉDIO | Orthanc em `:latest` | NOVO |
| M-04 | MÉDIO | Portas expostas no host (4242, 8000, 8042, 3001) | NOVO (suspeita) |
| M-05 | MÉDIO | Pré-checklist de produção pendente | RECORRENTE |
| B-01..03, S-01 | BAIXO | Qualidade do código (Ruff) | NOVO |
| — | — | Conflito `yarn.lock` × `package-lock.json` | RESOLVIDO (conferido no código) |
