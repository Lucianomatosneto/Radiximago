# Auditoria 03 — Geral (velocidade, segurança, nível OWASP, qualidade de código)

Data: 12/11/2026 · Branch auditada: `redesign-ui` (commit bebd516) · Auditor: Claude (independente) · Modo: somente leitura

Legenda: **CONFIRMADO** (visto em código/teste/execução) · **SUSPEITA** (indício, sem prova) · **NÃO VERIFICÁVEL** (precisa de ambiente que não temos aqui).

## 1. Resumo em linguagem simples

| Pergunta | Resposta honesta |
|---|---|
| Está seguro contra as principais ameaças? | **Boa base, nota B+.** Injeção, XSS, CSRF, sessão, senhas, permissões e anonimização têm defesa e teste automatizado. Os pontos fracos são de **infraestrutura** (versões "latest", portas abertas em desenvolvimento, uma biblioteca de imagem vulnerável), não de lógica. |
| Qual nível OWASP? | **ASVS 5.0 — meta Nível 2.** Pelo registro de 18–19/10 (253 itens): nenhum item de Nível 1 de código está reprovado; os 5 itens de Nível 1 reprovados eram todos de HTTPS/TLS, que **depois** foram tratados no Caddy (não testados em produção). **Não posso declarar "Nível 1 ou 2 conforme"** sem testar o ambiente HTTPS real. Declaração defensável: *"Nível 1 atendido em código; Nível 2 majoritariamente atendido, com 17 itens L2 pendentes, quase todos de implantação."* |
| Está rápido? | **NÃO VERIFICÁVEL por inteiro.** Não há medição em aparelho real. Há 1 indício ruim (Lighthouse 73 na tela de login, globo 3D) e 1 risco de projeto (rotas gigantes). |
| Código nos melhores padrões? | **Parcial, nota B-.** Backend limpo e muito testado; frontend tem arquivos enormes; tipagem (Mypy 403 erros) e lint (Ruff 70, ESLint 6 erros) ainda não zerados. |

## 2. Notas por dimensão

| Dimensão | Nota | Base |
|---|---|---|
| Segurança de aplicação (código) | **A-** | 560 testes backend, incluindo varreduras de contrato (OpenAPI) e ataques simulados; Semgrep 0 achados reais com canário válido; Gitleaks 0 |
| Segurança de infraestrutura | **C+** | A-01 Pillow, M-03 `:latest`, I-04 portas 0.0.0.0, CSP `unsafe-inline`, falta COEP/COOP/Permissions-Policy |
| Conformidade ASVS | **B** | ver seção 3 |
| Desempenho | **sem nota** | falta medição real (seção 5) |
| Estrutura/qualidade de código | **B-** | seção 4 |
| Testes | **A-** | 560 funções de teste backend (11 mil linhas de teste para 16,5 mil de app) |

## 3. Nível OWASP ASVS 5.0 (reavaliação com a matriz de 18–19/10)

A matriz antiga (15/10: L1 63%, L2 44%) **está desatualizada**: desde então foram corrigidos MFA, Argon2id, listas de senhas comuns/vazadas, revogação de sessão, claims do JWT, CSP/cabeçalhos, anti-CSRF por origem, retenção/auditoria encadeada, SBOM, Tailwind 4, etc.

Situação na matriz mais recente (253 itens ASVS):
- **Reprovados: 22** (5 de L1 + 17 de L2). **Inconclusivos: 2 ASVS + 1 DICOM.** O restante: aprovado ou não aplicável com justificativa.
- **L1 reprovados (5):** cookie Secure (3.3.1), HSTS (3.4.1), TLS (12.1.1, 12.2.1, 12.2.2). Todos dependiam de HTTPS. **SUSPEITA de resolvidos**: `Caddyfile` e `docker-compose.prod.yml` tratam HTTPS/HSTS, mas **nunca foram testados em execução** (NÃO VERIFICÁVEL aqui). Até o reteste, contam como pendentes.
- **L2 reprovados (17):** MFA para todos os perfis (6.3.3, decisão consciente: só 3 perfis obrigatórios), antivírus (5.4.3), TLS interno, cofre de segredos (13.3.1), usuário do banco com privilégio mínimo (13.2.2), logs em sistema separado (16.4.3), prefixo `__Host-` do cookie, IP por proxy confiável (15.3.4), imagem de produção sem código de teste (15.2.3), `/docs` e debug em produção (13.4.2/13.4.5, **provavelmente já corrigidos** no código de produção: SUSPEITA), hosts separados (3.5.4), outros.

**Leitura honesta:** o sistema passou de ~63% para algo perto de **L1 completo + ~80% do L2**, mas o fechamento depende de **testar o ambiente de implantação** (HTTPS real). Recomendo reexecutar os itens TLS/cookie/HSTS/docs em produção antes de qualquer afirmação em dissertação.

**OWASP Top 10 (2021) — cobertura:**

| # | Categoria | Situação |
|---|---|---|
| A01 Controle de acesso | Forte (portaria Orthanc 401 confirmado, testes IDOR) |
| A02 Falhas criptográficas | Forte (Argon2id, Fernet, SHA-256); TLS pendente de teste real |
| A03 Injeção | Forte (ORM, LIKE escapado, sem eval/shell) |
| A04 Design inseguro | Bom; M-02 (falha ao apagar original → cópia órfã) |
| A05 Configuração insegura | **Fraca**: `:latest`, portas 0.0.0.0 em dev, CSP `unsafe-inline` |
| A06 Componentes vulneráveis | **Fraca**: Pillow 12.3.0 (A-01, ALTO) |
| A07 Autenticação | Boa; A-02 (sem limite por conta), A-03 (tempo revela e-mail) |
| A08 Integridade | Boa (auditoria encadeada, SBOM) |
| A09 Registro/monitoramento | Boa; logs no mesmo banco (16.4.3) |
| A10 SSRF | Forte (destinos só da configuração) |

## 4. Qualidade e estrutura do código

Medido por radon, contagem de linhas e ferramentas do CI (CONFIRMADO):

- **Tamanho:** backend 16,5 mil linhas, frontend 40,3 mil, testes backend 11 mil.
- **Complexidade média (backend): A (3,6)**, excelente. Mas **funções muito complexas**:
  - `editar_curadoria` (ficha.py): F (56)
  - `pesquisar_imagens` (search_router.py): F (51) — também é o ponto mais provável de lentidão
  - `criar_curadoria`: E (33); `_sincronizar_achados`: D (28); `responder_segunda_opiniao`: D (25); `diagnostico_email.principal`: D (24); `receber_dicom`: D (21)
- **Arquivos gigantes no frontend (padrão de mercado: <300–400 linhas):** `curadoria/page.tsx` 1.839, `pesquisa/page.tsx` 1.427, `VisualizadorSequencial.tsx` 1.424, `vozCuradoria.ts` 1.413, `usuarios/page.tsx` 1.225. Dificultam manutenção e revisão.
- **Tipagem/lint:** Mypy 403 erros em 50 arquivos; Ruff 70; ESLint 6 erros/22 avisos.
- **Defeitos de prática:** 4 blocos `except: pass` (um deles na anonimização, M-02); `main.py` com BOM (U+FEFF) que quebra ferramentas.
- **Pontos positivos:** camadas separadas (core/modules), limites de entrada centralizados (`limites.py`), documentação conferida por teste (`test_documentacao_confere.py`), 4 dos 493 endpoints são `async`, o resto síncrono (aceitável no FastAPI: roda em pool de threads).
- **SonarCloud** (D/C/A) analisa só a `main` (12 mil linhas): **não representa** a `redesign-ui` (SUSPEITA, não usar como nota).

## 5. Velocidade (análise estática; sem medição real)

- **S-01 (SUSPEITA, MÉDIA):** `pesquisar_imagens` com complexidade 51 e 81 usos de `.all()` no backend: risco de carregar listas grandes na memória. Há 61 usos de `limit/offset/page_size` (paginação existe em parte). **Verificar com `EXPLAIN` e k6 numa base com milhares de imagens.**
- **S-02 (SUSPEITA):** tela de login com globo 3D, Lighthouse 73 (CI, máquina fraca). Medir em celular/PC reais antes de mexer.
- **S-03:** 81 índices/Index declarados: bom sinal; falta confirmar índices nas colunas usadas em filtros da busca.
- **S-04:** imagens DICOM via Orthanc/OHIF dependem de rede e disco; não medido.
- Limitação: nenhum teste de carga em ambiente com dados volumosos.

## 6. Achados consolidados (todas as auditorias)

| ID | Gravidade | Estado | Resumo |
|---|---|---|---|
| A-01 | ALTO | CONFIRMADO | Pillow 12.3.0 com 40 vulnerabilidades; subir para 13.0.0 |
| M-02 | MÉDIO | CONFIRMADO | Falha ao apagar original deixa cópia anonimizada órfã; `except: pass` |
| M-03 | MÉDIO | CONFIRMADO | `orthanc:latest` e `cloudflared:latest` sem versão fixa |
| Z-01 | MÉDIO | SUSPEITA | Formulários sem `method="post"` |
| Z-03 | MÉDIO | Conhecido | CSP com `unsafe-inline` |
| S-01 | MÉDIO | SUSPEITA | Busca complexa pode ser lenta com muitos dados |
| Q-01 | MÉDIO | CONFIRMADO | 8 funções com complexidade D–F e 5 arquivos >1.200 linhas |
| Q-02 | BAIXO | CONFIRMADO | Mypy 403, Ruff 70, ESLint 6 |
| A-02 / A-03 | BAIXO | CONFIRMADO | Login sem limite por conta; tempo revela e-mail |
| I-04, Z-02, Z-04 | BAIXO | CONFIRMADO | Portas 0.0.0.0 (dev), cabeçalhos faltantes |

## 7. Plano de melhoria (ordem sugerida, nada aplicado)

1. **Segurança rápida (1 dia):** M-02, M-03 (fixar versões), Z-01/Z-02, Pillow 13.
2. **Provar o HTTPS real** (reteste dos itens L1 TLS/HSTS/cookie) e então redeclarar o nível ASVS.
3. **Medir velocidade** com 1–5 mil imagens sintéticas (k6 + EXPLAIN) e só então otimizar `pesquisar_imagens`.
4. **Refatorar** as 8 funções D–F e quebrar os 5 arquivos gigantes (com testes protegendo).
5. **Zerar Ruff/ESLint** e reduzir Mypy em etapas; apontar SonarCloud para `redesign-ui`.

Nenhuma correção foi feita no Radix. Para iniciar, preciso da autorização para a branch `auditoria/correcoes-seguranca`.
