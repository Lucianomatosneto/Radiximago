# Auditoria automática — 2026-11-14

Commit analisado: `4526a83`

## Testes

| Suíte | Executados | Aprovados | Reprovados | Ignorados |
|---|---|---|---|---|
| Backend (suíte do projeto) | 657 | 657 | 0 | 0 |
| Auditoria da API | 13 | 13 | 0 | 0 |
| Frontend (Vitest) | 405 | 405 | 0 | 0 |

## Segurança

- Gitleaks (segredos no histórico): 0 achado(s)
- pip-audit: 0 vulnerabilidade(s) em 0 pacote(s)
- npm audit: {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0}
- Semgrep: 0 achado(s)

## Qualidade

- Ruff: 4 ocorrência(s)
- Mypy: Found 72 errors in 30 files (checked 82 source files)
- ESLint: 0 erro(s), 2 aviso(s)

## Desempenho

- k6: p95 = 5.9 ms; falhas = 0.00%
- Lighthouse (login): Performance 59, Accessibility 100, Best Practices 100, SEO 100

> Resultados automáticos. Problemas só são considerados resolvidos após reteste na Auditoria.
