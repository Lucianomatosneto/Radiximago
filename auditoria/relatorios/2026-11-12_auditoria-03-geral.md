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
- **SonarCloud, agora na `redesign-ui` (46 mil linhas, CONFIRMADO em 12/11):** Segurança D (2 problemas: 1 crítico de `postMessage` sem checar origem, já corrigido na branch de correções, e 1 IP de exemplo num campo), Confiabilidade D (186; 130 são promessas sem tratamento de erro, 19 acessibilidade), Manutenibilidade A (42), Hotspots 0, Duplicação 3,3%. Cobertura 0,0% é enganosa: o relatório de testes ainda não é enviado ao Sonar. Os números antigos (main, 12 mil linhas) foram descartados.

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

## 8. Atualização de 12/11 (correções aplicadas na branch `auditoria/correcoes-seguranca`)

Corrigidos e testados (backend 611 testes passando): A-01 (Pillow 13.0.0), M-02, Z-01, A-02, A-03, Sonar S2819 (origem do postMessage), Z-04 parcial (Permissions-Policy, COOP, sem X-Powered-By), utcnow e 2 regex lentas. Pendentes: M-03 (aguarda versões do Docker), 130 promessas sem tratamento (revisão por área), refatoração Q-01, cobertura no Sonar. Correção a registrar: o item ASVS 3.5.5 (postMessage) estava como "não aplicável" na matriz, mas o Radix recebe mensagens do OHIF; deve ser reavaliado como aplicável.

## 9. Fechamento de 12/11 (tudo fundido em `redesign-ui`; auditoria semanal completa 43280023341 verde)

**Fundidos:** PR #3 (correções de segurança, testadas à mão: microfone da curadoria e bloqueio de login 401×10 → 429), #26 (login mais leve, S-02), #4 (Dependabot ampliado) e as atualizações seguras do Dependabot (React/react-dom juntos, pytest, GitHub Actions, Sonar 5→6, ferramentas internas).

**Antes e depois medidos (mesmo método, runner sem GPU):**

| Medida | Antes | Depois |
|---|---|---|
| Lighthouse, tela de login (nota) | 61 | 89 |
| Tempo bloqueado (TBT) | 8.670 ms | 270 ms |
| Tempo até ficar interativa | 21,5 s | 1,8 s |
| Speed Index | 4,2 s | 1,4 s |
| k6 (API leve), p95 | 11 ms | 4,9 ms, 0 falhas |
| pip-audit (Pillow) | 1 pacote, 40 avisos | 0 |
| npm audit / Semgrep / Gitleaks | 0 / 0 / 0 | 0 / 0 / 0 |

Canários (falha e senha plantadas) detectados pelos dois detectores: o "0" é confiável.

**S-01 medido (busca com fichas sintéticas, ferramenta `auditoria/scripts/medir_busca.py`, workflow "Medir busca"):**

| Busca | 2.000 fichas | 10.000 | 30.000 |
|---|---:|---:|---:|
| Filtros normais (tipo, dente, achado, idade) | 13–15 ms | 18–28 ms | 30–61 ms |
| Texto livre, 1 palavra | 60 ms | 228 ms | 472 ms |
| Texto livre com erro de digitação | 303 ms | 1.417 ms | 3.008 ms |
| Texto livre + tipo | 53 ms | 108 ms | 242 ms |

Conclusão: filtros estruturados escalam bem; a busca por texto livre cresce linearmente com o acervo (varredura sem índice sobre o texto normalizado de todas as fichas) e chega a ~3 s com 30 mil fichas e tolerância a erro de digitação. Com o acervo atual (~300 imagens) o impacto é desprezível. Limites do teste: texto sintético mais longo que o real; tempos aproximados pelos horários do log.
**Recomendação (S-01, MÉDIO/futuro):** guardar o texto normalizado em coluna própria mantida ao salvar a ficha, com índice GIN `pg_trgm`/`tsvector`; só implementar se o acervo passar de ~5 mil imagens. Repetir a medição depois do ajuste.

**Pendentes:** M-03 parcial (cloudflared:latest do modo túnel); 130 promessas sem tratamento, 19 itens de acessibilidade, Q-01 (refatorar funções D–F e arquivos gigantes), Mypy/Ruff/ESLint; Dependabot em espera por teste manual: Python 3.15, Node 25, OHIF 3.13, numpy 2 / faster-whisper (junto com o ajuste da voz), alembic, slowapi, three; reteste HTTPS/TLS (ASVS L1); reavaliar ASVS 3.5.5 como aplicável.

## 10. Registro de 10 a 12/11 (Termos v1.1, autoria e SonarCloud lotes 1–3)

Fonte: handoff do Claude Code. Estado em 12/11, base `a4559fe`.

### 10.1 Situação das entregas
| Pacote | Conteúdo | Situação |
|---|---|---|
| `autoria-luciano.mbox` (7) | Retira PPGINFOS/UFSC dos textos do usuário | Já no GitHub |
| `termos-v1-1-atualizado.mbox` (6) | Termos de Uso e Privacidade v1.1 | **Não aplicado** (substitui `termos-v1-1.mbox`) |
| `sonar-lote-1.mbox` (19) | 18 correções seguras | **Não aplicado** (`correcoes/sonar-lote-1`) |
| `sonar-lote-3.mbox` (17) | Acessibilidade, 23 itens | **Não aplicado** (`correcoes/sonar-lote-3`); teste manual antes de juntar |

Verificação na mesma base: backend verde (615 testes com o lote 1; 611 com o lote 3), `tsc` sem erros, testes do frontend sem falhas, `next build` compila.

### 10.2 Termos v1.1 e revisão jurídica
- v1.0 (10/11): 17 cláusulas, anexos por perfil, Política de Privacidade, aceite registrado em `aceites_termos_uso` (versão, perfil, SHA-256). v1.1 (11/11): 16 correções procedentes da revisão da minuta "v2.0" do GPT (Marco Civil art. 15 só para pessoa jurídica; art. 7º IV e art. 16 II não valem para pessoa física; controlador/operador; original DICOM é dado sensível, art. 11; transferência internacional, Res. CD/ANPD 19/2024; prazos do art. 19; foro do consumidor; exclusão também nas cópias de segurança). Exige novo aceite.
- Rejeitado na minuta GPT: era rascunho interno; apagava fatos comprovados no código; prometia funções inexistentes; pedia CPF e endereço no texto público.
- Pendências jurídicas: (1) controlador/operador e contrato institucional antes de dados reais; (2) pessoa física ou CNPJ e titularidade junto à SINOVA/UFSC; (3) mecanismo de transferência internacional (Brevo e hospedagem); (4) nome do provedor de hospedagem; (5) redação final do foro e da responsabilidade. PDF de 22 páginas para o advogado.

### 10.3 SonarCloud (53 problemas)
Ponto de partida: Segurança A, **Confiabilidade D**, Manutenção A, cobertura 38,2%.
- **Lote 1 (18 itens):** `Number.parseInt` (5); 5 regex lentas trocadas por laços, com testes de equivalência (4.026 textos no frontend; 20 mil no backend; única diferença: a regex antiga aceitava "a@b.c\n", sem efeito prático); `new Error` em `Promise.reject` (2); `= None` (2); avatar via `run_in_threadpool`; `sort` com `localeCompare`; `ErroDaPagina`; IP de exemplo `192.0.2.10` (única mudança visível).
- **Lote 2 (decisões):** S3516 em `auth.py:375` (`/forgot-password`) é **falso positivo** (resposta idêntica proposital contra enumeração de contas). S9379 `autoFocus` (11): manter 10, remover 1 (`solicitar-acesso/page.tsx:138`); **aguarda decisão**.
- **Lote 3 (acessibilidade):** a tarefa mandava trocar `div` por `button` no S6848; o Claude Code corrigiu: isso poria campos de texto dentro de botões (HTML inválido). Usados `role` adequados (presentation, toolbar, search, group/dialog, region) e a linha da etiqueta de marcações passou a ter acesso por teclado. Limitação conhecida: desenhar/arrastar anotações não tem equivalente de teclado. O Sonar pode continuar acusando alguns itens (marcar Won't fix com justificativa). Roteiro de 8 passos de teste manual no relatório do Claude Code.

### 10.4 Outros registros
- `privacidade@radiximago.com.br` ainda não existe (recomendado: Cloudflare Email Routing, um único SPF juntando Cloudflare e Brevo).
- Anvisa (RDC 657/2022): finalidade de ensino/pesquisa, sem diagnóstico, não é dispositivo médico; qualquer apoio diagnóstico exige avaliação regulatória antes.

### 10.5 Pendências (ordem sugerida)
1. Aplicar e juntar Lote 1 e Termos v1.1; aplicar Lote 3 e fazer o teste manual de 8 passos.
2. Decidir o `autoFocus` do `solicitar-acesso`; marcar no SonarCloud: S3516 = False positive; `autoFocus` mantidos e a11y remanescentes = Won't fix, com justificativa.
3. Rodar workflows Sonarcloud e Auditoria semanal; registrar Confiabilidade D → ?.
4. Enviar cobertura do frontend (`coverage/lcov.info`) ao Sonar (gate de código novo hoje reprova só por cobertura).
5. Advogado revisa o PDF dos Termos v1.1; atualizar `matriz_asvs.csv` (V5/V8/V2); criar e-mail de privacidade.
6. Antes de ir ao ar: servidor, troca de credenciais, HTTPS (retestar itens TLS do ASVS L1), backup fora do servidor com teste de restauração.
7. Backlog técnico: S-01 índice de busca (só se acervo > ~5 mil imagens); Q-01 funções D–F e arquivos gigantes; Mypy 403/Ruff 70/ESLint 6; M-03 `cloudflared:latest` (modo túnel); Dependabot retidos (Python 3.15 #5, Node 25 #7, OHIF 3.13 #6, numpy 2 #13, faster-whisper #16, python-multipart whisper #21, three #19) e Orthanc #33; ajustes da dictação por voz.
