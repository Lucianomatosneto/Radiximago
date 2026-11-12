# Avaliação: Sentry e MCP (Etapas 7 e 8)

## Sentry (monitoramento de erros)

**O que é:** serviço que recebe os erros do sistema em tempo real (com contexto de onde ocorreram) e avisa a equipe.

**Situação:** não implantado, por três motivos objetivos:
1. Exige **conta externa** (há plano gratuito limitado) e uma chave (DSN): serviço externo e credencial exigem sua autorização.
2. Exige **alterar o código da aplicação** (backend e frontend), o que a auditoria não pode fazer sozinha.
3. **Risco LGPD:** o Sentry envia dados para fora do servidor. Em um sistema com imagens médicas anonimizadas, os rastros de erro **podem conter** nomes de arquivos, identificadores, trechos de requisições e IP.

**Se você decidir implantar, condições mínimas (checklist):**
- `send_default_pii=False` (não enviar dados pessoais por padrão).
- Filtro `before_send` que remove cabeçalhos `Cookie`/`Authorization`, corpo de requisições e variáveis locais.
- Nunca enviar conteúdo de DICOM, nomes de arquivo de pacientes ou e-mails.
- Preferir região da União Europeia ou instância própria (Sentry pode ser auto-hospedado).
- Avaliar com o encarregado de dados antes do uso com dados reais; registrar no RIPD.
- Testar com um erro proposital e **conferir o que saiu** antes de ligar em produção.

**Alternativa sem serviço externo (já existe):** o backend gera logs estruturados em JSON e uma tabela de auditoria (`audit_logs`). Para o piloto, isso pode bastar.

## MCP (integração do Claude com ferramentas)

**Decisão: nenhum MCP adicional foi instalado.** A regra do projeto é não instalar MCP desnecessário.

| Ferramenta | Como o Claude a usa | MCP necessário? |
|---|---|---|
| pytest, Ruff, Mypy, ESLint, tsc, Vitest, Playwright, k6, Lighthouse, pip-audit, npm audit | Linha de comando, no ambiente isolado de nuvem | Não |
| Gitleaks, Semgrep, ZAP, Dependabot | Rodam no GitHub Actions; o resumo vai para a branch `auditoria/resultados` e para a aba Actions | Não |
| GitHub (ler código, branches) | Clone por git + app Claude do GitHub | Não (já integrado) |
| SonarCloud | Interface/relatório do serviço, se você criar a conta | Existe MCP oficial; só avaliar **depois** de a conta existir |
| Sentry | Existe MCP oficial; só avaliar depois de decidir usar Sentry | Adiado |

**Como o Claude lê os resultados das automações:** artefatos do GitHub exigem login, então o workflow semanal grava um resumo em Markdown na branch `auditoria/resultados` (somente relatórios). O Claude lê essa branch por git, sem credencial especial.

## Limite conhecido
O serviço Docker não roda no ambiente de nuvem do Claude. Auditar o **Orthanc, o OHIF e o Docker Compose em execução** exige o Docker Desktop do seu computador ligado, com a pasta do projeto conectada ao app.
