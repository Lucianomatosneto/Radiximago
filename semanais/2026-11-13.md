# Auditoria automática — 2026-11-13

Commit analisado: `64fc706`

## Testes

| Suíte | Executados | Aprovados | Reprovados | Ignorados |
|---|---|---|---|---|
| Backend (suíte do projeto) | 615 | 615 | 0 | 0 |
| Auditoria da API | 13 | 13 | 0 | 0 |
| Frontend (Vitest) | 11 | 11 | 0 | 0 |

## Segurança

- Gitleaks (segredos no histórico): 0 achado(s)
- pip-audit: 0 vulnerabilidade(s) em 0 pacote(s)
- npm audit: {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0}
- Semgrep: 0 achado(s)

## Qualidade

- Ruff: 68 ocorrência(s)
- Mypy: Found 403 errors in 50 files (checked 82 source files)
- ESLint: 6 erro(s), 22 aviso(s)

## Desempenho

- k6: p95 = 4.5 ms; falhas = 0.00%
- Lighthouse (login): Performance 63, Accessibility 100, Best Practices 100, SEO 100

> Resultados automáticos. Problemas só são considerados resolvidos após reteste na Auditoria.
