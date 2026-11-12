# Auditoria 01 — Adendo: resultados das ferramentas implantadas

Data: 11/11/2026 · Commit analisado: `8112dd5` · Complementa `2026-11-11_auditoria-01.md`.
Ambiente: contêiner de nuvem isolado, PostgreSQL 16 descartável, dados sintéticos. Nada de produção.

## Testes executados (acumulado)

| Suíte | Executados | Aprovados | Reprovados |
|---|---|---|---|
| Backend `pytest` | 604 | 604 | 0 |
| Auditoria da API (HTTPX) | 9 | 9 | 0 |
| Frontend (testes do projeto) | 181 | 181 | 0 |
| Vitest (funções da Curadoria) | 11 | 11 | 0 |
| Playwright (Chrome real, telas públicas) | 4 | 4 | 0 |
| `next build` de produção | 1 | 1 | 0 |
| k6 (25 usuários, rotas públicas) | 1.240 requisições | 1.240 | 0 |

Observação de método: o primeiro teste Playwright de área restrita reprovou. A causa era do **teste** (a API estava desligada e ele não esperava o redirecionamento), não do Radix. O teste foi corrigido e rodado de novo com API e site no ar.

## Resultados por ferramenta

- **Autorização (HTTPX):** 185 combinações de rota e método; **173 exigem login** e **12 são públicas, todas esperadas** (login, cadastro, redefinição de senha, saúde, termos). Teste de mutação: removida uma rota da lista aprovada, o teste falhou apontando exatamente essa rota.
- **CORS:** a API aceita a origem do frontend e **recusa** uma origem desconhecida. Pendência M-05 (CORS fixo em localhost) **RESOLVIDA** (reteste executado).
- **Cabeçalhos:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, CSP restritiva e `Cache-Control: no-store` na API; HSTS configurado no Caddy (proxy de produção). Rota inexistente não vaza rastro de erro. A documentação `/docs` fica desligada em produção.
- **Mypy:** 143 erros de tipo em 43 arquivos (mais: `envios_router.py` 19, `search_router.py` 13, `auth.py` 12).
- **ESLint:** 6 erros (5 `prefer-const`, 1 `no-useless-escape`) e 22 avisos em 166 arquivos.
- **k6:** p95 = 7,9 ms, 0% de falhas, 25 usuários simultâneos. Cobre só `/health` e `/termos`; **não** representa rotas autenticadas nem processamento de imagem.
- **Lighthouse (login):** Acessibilidade 100, Boas práticas 100, SEO 100. Desempenho 61, com Total Blocking Time muito alto.

## Novos achados

| ID | Gravidade | Situação | Descrição |
|---|---|---|---|
| S-02 | MÉDIO | **Suspeita** | Desempenho da tela de login (globo 3D). O tempo de script é baixo (1,2 s) e a thread principal passa ~28 s em "Other", típico de renderização 3D por software num ambiente **sem placa de vídeo** (2 CPUs). Provável artefato do ambiente. **Confirmar em notebook real e em celular de entrada**, relevante porque o Radix será usado no celular. |
| B-04 | BAIXO | Confirmado | 143 erros de tipo (Mypy). |
| B-05 | BAIXO | Confirmado | 6 erros e 22 avisos de ESLint. |
| B-06 | BAIXO | Confirmado (por leitura de código) | `/uploads` (fotos de perfil) é servido **sem login**, por decisão documentada. São dados pessoais; a proteção depende de o nome do arquivo ser imprevisível. **Não verificado** se o nome é aleatório. |
| B-07 | BAIXO | Confirmado | `/health/database` e `/health/orthanc` respondem **HTTP 200** mesmo com o serviço fora do ar (o corpo diz `"erro"`). Monitores que olham só o código HTTP não detectam a falha. Não vaza detalhes. |

## Pendências

Ver `INVENTARIO.md`: primeira execução dos workflows no GitHub (Gitleaks, Semgrep, ZAP, ação reutilizável), SonarCloud, decisão sobre Sentry, medição de desempenho em dispositivo real, auditoria do Docker em execução.
