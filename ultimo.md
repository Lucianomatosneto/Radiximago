# Auditoria automática — 2026-11-12

Commit analisado: `57f5450`

## Testes

| Suíte | Executados | Aprovados | Reprovados | Ignorados |
|---|---|---|---|---|
| Backend (suíte do projeto) | 604 | 604 | 0 | 0 |
| Auditoria da API | 9 | 9 | 0 | 0 |
| Frontend (Vitest) | 11 | 11 | 0 | 0 |

## Segurança

- Gitleaks (segredos no histórico): 0 achado(s)
- pip-audit: 40 vulnerabilidade(s) em 1 pacote(s): pillow 12.3.0 (40)
- npm audit: {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0}
- Semgrep: 0 achado(s) {}

## Qualidade

- Ruff: 70 ocorrência(s)
- Mypy: Found 403 errors in 50 files (checked 82 source files)
- ESLint: 6 erro(s), 22 aviso(s)

## Desempenho

- k6: p95 = 2.4 ms; falhas = 0.00%
- Lighthouse (login): Performance 73, Accessibility 100, Best Practices 100, SEO 100

> Resultados automáticos. Problemas só são considerados resolvidos após reteste na Auditoria.
