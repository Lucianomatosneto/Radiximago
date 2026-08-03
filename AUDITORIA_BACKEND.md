# Auditoria Completa — Radix Imago (Backend + Frontend)

> Documento gerado por leitura direta do código-fonte em `backend/app/` (core + modules), `backend/alembic/versions/`, scripts de raiz do backend e `frontend/src/`. Nenhum arquivo foi alterado durante esta auditoria.
>
> Convenção: tudo que está listado foi **encontrado no código**. Quando algo parecia incompleto, ausente ou ambíguo, isso é dito explicitamente em vez de presumido. As seções "Sugestões de frontend" são exatamente isso — sugestões baseadas no que o backend permite hoje, não requisitos novos.
>
> **Atualização (2026-07-15):** aplicadas as 3 correções da sub-fase 6.5.1 do plano de hardening (commit `c9a160d`): validação de senha mínima em `POST /users/`, health checks reais em `/health/database` e `/health/orthanc`, e `decisao_final` convertido para o Enum `DecisaoRevisao`. As seções afetadas foram atualizadas; os itens resolvidos na seção 6 ficam marcados como tal, sem serem removidos, para preservar o histórico da auditoria.
>
> **Atualização (2026-07-16):** aplicada a sub-fase 6.5.2 do plano de hardening: `login`, `falha_login`, `criacao_usuario`, `bloqueio_usuario` e `importacao_orthanc` agora geram registro em `audit_logs` (antes só ações de `curation_router.py` geravam auditoria). Escopo deliberadamente restrito a essas 5 ações — tentativas de acesso negado por perfil incorreto nesses mesmos endpoints (`_exigir_admin`/`_exigir_admin_ou_suporte`) **não** foram incluídas nesta sub-fase (decisão explícita, ver seção 6, item 2).
>
> **Atualização (2026-07-16):** aplicada a sub-fase 6.5.3 do plano de hardening: 4 novos endpoints de consulta de item único — `GET /users/{id}`, `GET /images/{id}`, `GET /curation/{id}` e `GET /curation/{id}/reviews`. Nenhum deles grava em `audit_logs` (são leituras, mesmo padrão dos demais `GET`s do sistema). `GET /curation/{id}/reviews` lista as segundas opiniões de **uma** ficha específica — ainda não existe uma listagem de todas as reviews do sistema, nem um `GET /curation/reviews/{review_id}` para uma review isolada, e `CurationHistory` continua sem nenhum endpoint de consulta (ver seção 6, item 7).
>
> **Atualização (2026-07-16):** aplicada a sub-fase 6.5.4 do plano de hardening: novo endpoint `POST /curation/{curation_id}/apply-review-decision`, que fecha o ciclo da segunda opinião — depois que a review mais recente de uma ficha está `respondida`, este endpoint aplica a decisão final (`aprovar`/`descartar`) reaproveitando as mesmas regras de `/approve` (anonimização validada) e `/discard` (justificativa obrigatória), extraídas para funções privadas compartilhadas (`_executar_aprovacao`/`_executar_descarte`). Marca a `CurationReview` correspondente como `finalizada` — primeiro uso real desse valor do enum `StatusRevisao`. Novo enum `DecisaoFinalRevisao` (`aprovar`/`descartar`) criado especificamente para esta rota, distinto de `DecisaoRevisao` (que inclui `manter`, usado só para registrar a opinião do revisor). Resolve a lacuna #8.
>
> **Atualização (2026-07-16):** aplicada a sub-fase 6.5.5 do plano de hardening: `PATCH /users/{id}` (edita `nome`/`instituicao`; **não** aceita trocar `perfil` — decisão deliberada de segurança), `POST /auth/logout` (logout simbólico, só grava auditoria — o JWT continua stateless, sem lista de revogação) e `POST /auth/change-password` (autotroca de senha, exige senha atual + nova senha ≥8 caracteres). Resolve as lacunas #4 e #5.
>
> **Atualização (2026-07-16):** aplicado o item 1 da sub-fase 6.5.6 (estratégia de exclusão/soft delete), decidido entidade por entidade: **User** — nenhuma mudança; `PATCH /users/{id}/block` já alterna `bloqueado` nos dois sentidos, então já cobre o caso de uso, sem precisar de um campo novo. **OrthancReference** — nova coluna `ativo` (migration `acf13f5ff44c`) + `PATCH /images/{id}/deactivate` e `/activate` (admin/suporte, com auditoria); `GET /curation/pending` e `GET /search` agora ignoram imagens com `ativo=false`; consultas de item único (`GET /images/{id}`, `GET /curation/{id}/viewer-url`) continuam acessíveis mesmo para imagens inativas, deliberadamente. **Curation** — nenhuma mudança; `status: "descartada"` já é o soft delete desta entidade (final, auditado, com justificativa obrigatória) e um campo separado criaria duas fontes de verdade para a mesma coisa.
>
> **Atualização (2026-07-16):** aplicado o item 2 da sub-fase 6.5.6 (perfil `curador`). `curador` passou a ter acesso igual a `administrador`/`suporte` em **todos** os endpoints de `/curation/*`, inclusive aprovar, descartar e aplicar a decisão final da segunda opinião — decisão tomada em duas etapas: primeiro um esquema parcial (só criar ficha + segunda opinião, sem aprovar/descartar), depois revertido para acesso completo por confirmação explícita do usuário. `curador` **não** ganhou acesso a `/images/*` (sincronizar, desativar/ativar, consultar imagem) — isso continua exclusivo de `administrador`/`suporte`. `professor`, `estudante` e `pesquisador` permanecem sem nenhuma regra própria, por decisão deliberada. Guardião antigo `_exigir_admin_ou_suporte` de `curation_router.py` foi removido (ficou sem uso depois que todos os 10 endpoints passaram a usar `_exigir_admin_suporte_ou_curador`).
>
> **Atualização (2026-07-16):** aplicado o item 3 da sub-fase 6.5.6 (upload direto de DICOM) — **fecha a sub-fase 6.5.6 por completo**. Novo `POST /images/upload` (`administrador`/`suporte`, mesmo limite de acesso do resto de `/images/*`): recebe um arquivo, valida com `pydicom`, envia para o Orthanc (`orthanc_client.enviar_instancia`, nova função) e registra a referência reaproveitando `_registrar_referencia_se_nova` (extraída do loop de `import-from-orthanc`, sem mudar o comportamento deste). Decisões tomadas: **sem anonimização automática** (a segurança de LGPD continua 100% na checagem manual humana já existente no fluxo de curadoria); limite de tamanho configurável via `settings.MAX_UPLOAD_SIZE_MB` (padrão 50MB); arquivos aceitos com `force=True` (sem o preâmbulo DICOM padrão de 128 bytes) geram um registro de auditoria **distinto** (`acao: "upload_sem_preambulo_dicom"`), além do log normal de upload. **Bug encontrado e corrigido durante o teste:** `pydicom.dcmread(..., force=True)` é permissivo demais — chegou a "ler com sucesso" um arquivo de texto puro (interpretando os bytes como uma tag privada qualquer), o que inicialmente vazava como erro genérico do Orthanc (502). Corrigido tratando o Orthanc como autoridade final: uma resposta 4xx dele agora vira 422 ("arquivo inválido"), reservando 502 só para falhas reais de conexão/infraestrutura.
>
> **Atualização (2026-07-16):** rodada `/code-review` (8 ângulos automatizados + verificação manual direta) na branch antes de fechar o plano de hardening. 4 achados corrigidos (mais 1 bônus do mesmo lote): (1) `/approve`/`/discard` agora bloqueiam explicitamente uma ficha em `segunda_opiniao`, que antes podia ser aprovada/descartada diretamente, pulando todo o fluxo de revisão; (2) `apply-review-decision` agora valida `dados.decisao` contra `review.decisao_final` quando este for `aprovar`/`descartar` (409 se divergir) — a segunda opinião passa a ter poder de veto real, sem quebrar o caso em que o revisor deixa `decisao_final` em branco; (3) a trava contra segunda solicitação de revisão agora cobre `respondida`, não só `solicitada`, evitando que uma review já respondida (mas ainda não aplicada) fique órfã ao permitir uma nova solicitação; (4) `POST /images/upload` ganhou `try/except` ao redor de `_registrar_referencia_se_nova` (que antes podia lançar sem tratamento, deixando um upload "órfão" no Orthanc sem referência nem auditoria no Postgres), com log de auditoria de falha (`resultado: "erro"`) e resposta 502 estruturada; (5, bônus) `criar_curadoria` agora rejeita criar ficha para uma imagem desativada (`ativo=False`), consistente com o filtro já aplicado em `/curation/pending` e `/search`. Outros 5 achados da revisão (endpoints de health pública vazando texto de exceção; padrão de dois commits separados entre mudança de estado e log de auditoria; leitura do arquivo de upload inteiro antes de checar o limite de tamanho; duplicação de guardiões de permissão entre módulos; `desativar_imagem`/`ativar_imagem` quase duplicados) ficaram registrados mas não foram corrigidos nesta rodada — não comprometem as garantias centrais de imparcialidade/rastreabilidade do fluxo de curadoria.
>
> **Atualização (2026-07-16):** corrigidos os 5 achados restantes da rodada `/code-review` anterior. **Mudança estrutural principal:** nova dependência central `exigir_perfis(*perfis)` em `auth.py`, que substitui os 4 guardiões de permissão manuais e independentes que existiam em `users_router.py` (checagem inline repetida 5x), `admin_router.py` (`_exigir_admin`), `images_router.py` (`_exigir_admin_ou_suporte`) e `curation_router.py` (`_exigir_admin_suporte_ou_curador`) — agora é usada como `Depends(exigir_perfis(UserRole.administrador, ...))` diretamente na assinatura de cada endpoint (~20 endpoints em 4 arquivos), e as 4 funções antigas foram removidas. Demais correções: `/health/database` e `/health/orthanc` continuam públicos (decisão deliberada, para não quebrar monitoramento externo) mas pararam de devolver `str(e)` — só `"status": "erro"` genérico; `criar_usuario`, `bloquear_usuario`, `atualizar_usuario` (`users_router.py`) e `trocar_senha_propria` (`auth.py`) passaram de 2 commits para 1 (mudança de estado + log de auditoria na mesma transação — `criar_usuario` usa `db.flush()` para obter o `id` do novo usuário antes do commit único); `POST /images/upload` passou a ler o arquivo em pedaços de 1MB, abortando com 413 assim que ultrapassa `MAX_UPLOAD_SIZE_MB`, em vez de ler tudo antes de checar; `desativar_imagem`/`ativar_imagem` (`images_router.py`) foram unificados em uma função privada compartilhada, `_alterar_ativo_imagem` (que de brinde já aplica o commit único).
>
> **Atualização (2026-07-17):** segunda rodada de `/code-review` (mesmo processo de 8 ângulos), agora sobre o diff das duas correções anteriores. **Nenhum dos 10 achados originais voltou** — todos confirmados corretos e completos por múltiplos ângulos independentes. 7 achados novos e menores encontrados e corrigidos: (1) condição de corrida (TOCTOU) em `solicitar_segunda_opiniao` — duas requisições concorrentes podiam ambas passar pela checagem de "já existe revisão aberta" antes de qualquer uma commitar; corrigido com um **índice único parcial no Postgres** (`uq_curation_reviews_aberta`, migration `5e12b4071d59`, só permite 1 review com status `solicitada`/`respondida` por ficha) + captura de `IntegrityError` traduzida no mesmo 409 amigável; (2) upload concorrente do mesmo arquivo (mesmo `orthanc_id`) agora é reconhecido como sucesso (`ja_existente`) em vez de virar erro 502 quando a colisão de unicidade é detectada; (3) checagem de `segunda_opiniao` duplicada entre `aprovar_curadoria`/`descartar_curadoria` extraída para `_exigir_fora_de_segunda_opiniao`; (4) `_alterar_ativo_imagem` não recebe mais `acao` como parâmetro solto — deriva de `ativo`, eliminando o risco de dessincronia; (5) `upload_imagem` libera o `bytearray` (`del partes`) logo após converter para `bytes`, reduzindo o pico de memória; (6) as 4 tabelas de perfis fragmentadas por arquivo foram centralizadas em `PERFIS_ADMIN`/`PERFIS_IMAGENS`/`PERFIS_CURADORIA` (em `auth.py`, ao lado de `exigir_perfis`); (7) `/health/database` e `/health/orthanc` passaram a logar a exceção real via `logging` (`logger.exception(...)`, visível em `docker logs`) mesmo continuando a esconder o texto da resposta HTTP. **Bug introduzido e corrigido durante o próprio teste desta correção:** ao extrair `_exigir_fora_de_segunda_opiniao`, uma operação de busca-e-substituição em massa acabou reescrevendo o corpo da própria função como uma chamada recursiva a si mesma, causando `RecursionError` (500) em `/approve`/`/discard`. Detectado pelo teste funcional (não pela leitura de código) e corrigido antes do commit. Um ponto sinalizado por dois ângulos desta rodada — `apply-review-decision` não validar `decisao_final == "manter"`/`None` — **não** foi tratado como achado: é a decisão deliberada já confirmada ao corrigir o achado 2 da rodada anterior.
>
> **Revisão de 2026-08-03 — atualização de escopo restrito.** As seções 0 e 7 foram reescritas por releitura direta e completa do backend e do frontend atuais (nenhum arquivo foi alterado durante a releitura). Contexto do que mudou desde a última passada: (1) `curation_router.py` foi dividido no pacote `backend/app/modules/curation/` (mesmo comportamento externo — refactor puro, ver histórico de commits); (2) o backend cresceu bastante desde a versão original deste documento — novos módulos `access_requests.py` e `saved_images.py`/`saved_images_router.py`, e vários endpoints novos em `auth.py` (`/forgot-password`, `/reset-password`, `/request-access`), `users_router.py` (avatar, exclusão suave, `/access-requests/*`), `images_router.py` (`GET /images/`), `search_router.py` (`/counts`, `/send-email-lote`, `/serie-info`, `/series`, `/download/*.zip`, `/preview`, `/send-email`) e `admin_router.py` (`/settings`) — **nenhum desses endpoints novos foi documentado em detalhe nas seções 1-6**, que continuam refletindo o escopo da auditoria original; eles só entraram na árvore da seção 0 (inventário) e na comparação da seção 7 (checagem frontend×backend). Uma auditoria formal das seções 1-6 cobrindo esses módulos fica como trabalho futuro. (3) O frontend, que na versão original não existia (só o scaffold do `create-next-app`), hoje tem 22 páginas completas — a seção 7 foi inteiramente reescrita para descrever o que existe de fato, não mais uma sugestão especulativa.

---

## 0. Visão geral da árvore analisada

```
backend/
  app/
    core/
      config.py         -> configurações (env vars)
      database.py        -> engine, sessão, Base declarativa
      security.py         -> hash de senha, JWT
      email.py             -> envio de e-mail via SMTP (redefinição de senha, solicitação de
                              acesso recebida/aprovada/rejeitada, imagens de pesquisa avulsa/lote)
      rate_limit.py         -> limiter (slowapi), usado em /auth/login, /forgot-password, /reset-password
    modules/
      auth.py                -> login, /auth/me, logout (simbólico), troca/redefinição de senha,
                                 solicitação pública de acesso, exigir_perfis (guardião central)
      users.py                -> modelo User + enum UserRole
      users_router.py          -> CRUD de usuários, avatar (upload/remoção), exclusão suave,
                                   revisão de solicitações de acesso (aprovar/rejeitar)
      access_requests.py        -> modelo AccessRequest + enums StatusSolicitacaoAcesso/IntencaoPerfil
      curations.py                -> modelos Curation, CurationHistory, CurationReview + enums
      curation/                    -> pacote do fluxo de curadoria (Fase 4), dividido por sub-fluxo
                                       (refatorado em 2026-08 a partir do antigo curation_router.py,
                                       um único arquivo de 1086 linhas - mesmo comportamento externo):
        __init__.py                   -> router compartilhado + registro dos submódulos abaixo
        router.py                      -> só a instância do APIRouter (prefix "/curation")
        common.py                       -> helpers/constantes compartilhados entre sub-fluxos
                                           (status, histórico, auditoria, aprovação/descarte internos)
        schemas.py                       -> schemas Pydantic de entrada dos endpoints
        consultas.py                      -> leitura: fila pendente, fila de reviews pendentes,
                                             viewer-url, séries/preview de imagem pendente, ficha,
                                             histórico de reviews de uma ficha
        ficha.py                           -> criação e edição da ficha
        aprovacao_descarte.py               -> aprovar/descartar
        segunda_opiniao.py                   -> solicitar/responder/aplicar decisão da 2ª opinião
      orthanc_references.py     -> modelo OrthancReference
      orthanc_client.py          -> cliente HTTP para o Orthanc (sem endpoints, sem banco)
      images_router.py            -> sincronização, upload direto, listagem e ativação/desativação
                                     de imagens (Fase 3)
      search_router.py             -> busca pública de imagens aprovadas + contagens, downloads
                                      (ZIP de imagens/DICOM) e envio por e-mail (Fase 5)
      admin_router.py               -> indicadores, consulta de auditoria e configurações não
                                       sensíveis do backend (Fase 6)
      audit_logs.py                  -> modelo AuditLog
      saved_images.py                 -> modelo SavedImage ("Minhas imagens")
      saved_images_router.py           -> salvar/remover/listar imagens salvas do usuário logado
    main.py                -> registro dos routers, CORS, rate limit, estáticos (/uploads), health checks
  alembic/versions/     -> 14 migrations: criação de users, orthanc_references, curadoria+auditoria;
                           ativo em orthanc_references; índice único parcial contra reviews duplicadas;
                           anonimizacao_status em orthanc_references; reset_token em users; tabela
                           access_requests; alteracoes_observadas em curations; exclusão suave em
                           users; foto de perfil em users; tabela saved_images; marcação (única, depois
                           múltiplas com forma) em curations
  criar_admin.py                    -> script CLI de bootstrap do 1º administrador
  trocar_senha.py                    -> script CLI de troca de senha de um usuário existente
  backfill_study_instance_uid.py      -> script CLI utilitário de backfill de dado histórico
  verificar_anonimizacao.py            -> script CLI de verificação de tags DICOM sensíveis

frontend/
  package.json         -> Next.js 14.2 + React 18.3 + Tailwind 3.4 - sem biblioteca de auth, HTTP
                          client ou state management (fetch nativo + localStorage direto)
  src/
    app/
      layout.tsx                 -> layout raiz (script anti-flash de tema claro/escuro)
      page.tsx                    -> landing pública (apresentação do produto, sem dados/API)
      login/page.tsx               -> tela de login
      solicitar-acesso/page.tsx     -> formulário público de solicitação de acesso ("Cadastrar")
      esqueci-senha/page.tsx         -> solicitar redefinição de senha (usuário deslogado)
      redefinir-senha/page.tsx        -> concluir a redefinição, a partir do token recebido por e-mail
      dashboard/page.tsx                -> início do administrador (indicadores gerais)
      banco-imagens/page.tsx             -> galeria de categorias de imagens aprovadas (todos os perfis)
      pesquisa/page.tsx                   -> busca avançada com filtros (todos os perfis)
      minhas-imagens/page.tsx              -> imagens salvas pelo usuário logado (autoatendimento)
      visualizar/[id]/page.tsx              -> visualizador de uma imagem aprovada (a partir da pesquisa)
      curadoria/page.tsx                     -> fila de curadoria: criar ficha, aprovar, descartar,
                                                solicitar 2ª opinião
      segunda-opiniao/page.tsx                -> fila de segundas opiniões + formulário de resposta
      imagens/page.tsx                         -> tabela somente leitura de imagens recebidas do Orthanc
      usuarios/page.tsx                         -> gestão de usuários + revisão de solicitações de acesso
      relatorios/page.tsx                        -> indicadores agregados de curadoria (gráficos de barra)
      auditoria/page.tsx                          -> consulta filtrada da trilha de auditoria
      painel-admin/page.tsx                        -> painel operacional: atalhos, saúde dos serviços,
                                                      alertas de login recente
      integracoes/page.tsx                          -> saúde dos serviços externos (banco, Orthanc, OHIF)
      configuracoes/page.tsx                         -> configurações não sensíveis do backend (leitura)
      acesso-negado/page.tsx                          -> tela de bloqueio por perfil sem permissão
      erro-tecnico/page.tsx, error.tsx                 -> tela genérica de erro (+ error boundary do Next.js)
    components/           -> Sidebar, Topbar, Logo, ThemeToggle, StatusBadge, DashboardCard,
                             MiniaturaImagem, MiniaturaFila, VisualizadorSequencial,
                             RadiografiaIlustrativa, SecaoModalidades, GradeCategoriasImagens, ErroTecnico
      curadoria/             -> FilaCuradoria, PainelVisualizador, BarraSuperiorCuradoria,
                                FichaCuradoriaForm, MarcadorAchado, ModalMotivo, SegundaOpiniaoBanner
      detalhe/                -> BarraClassificacao, MarcacaoAchado, ImagemPrincipalMarcada,
                                 FormasMarcacoes, ColunaEstudos, NavegacaoCasos, Chip
      visualizador/             -> ColunaSeries
    lib/                  -> alteracoesObservadas.ts, marcacoes.ts, useHoverMarcacao.ts, healthCheck.ts
```

**Frontend:** ao contrário da versão original desta auditoria (quando só existia o scaffold do `create-next-app`), o frontend hoje tem 22 páginas completas, cobrindo praticamente toda a superfície do backend — autenticação completa (login, cadastro, esqueci/redefinir senha), curadoria, segunda opinião, pesquisa/banco de imagens, minhas imagens, e um bloco administrativo inteiro (usuários, imagens recebidas, relatórios, auditoria, painel, integrações, configurações). A comparação detalhada, tela por tela, contra o que o backend permite está na seção 7 — que deixou de ser especulativa e agora descreve o que existe de fato, incluindo os pontos onde frontend e backend não batem exatamente.

---

## 1. Autenticação e Autorização

### 1.1 Como o login funciona
- Endpoint: `POST /auth/login` (`auth.py`), usando `OAuth2PasswordRequestForm` (form-urlencoded, campos `username` e `password` — **`username` é o e-mail**, não um campo separado).
- Fluxo: busca `User` por `email == username` → verifica `senha_hash` com bcrypt (`verificar_senha`) → verifica `bloqueado` (403 se true) → verifica `ativo` (403 se false) → gera JWT.
- Token JWT contém `sub` (id do usuário como string) e `perfil` (valor do enum `UserRole`), expira em `JWT_EXPIRE_MINUTES` (padrão 60 min, config `JWT_ALGORITHM=HS256`, `JWT_SECRET_KEY` fixo no `config.py` — **valor padrão `"chave-secreta-trocar"` hardcoded no código-fonte**, presumivelmente sobrescrito por `.env` em produção, mas o fallback está no repositório).
- Resposta: `{access_token, token_type: "bearer", perfil, nome}`.

### 1.2 Como o token é validado
- `obter_usuario_atual` (dependência FastAPI em `auth.py`, usada por praticamente todos os endpoints protegidos): decodifica o JWT (`decodificar_token`), busca o `User` pelo `id` do claim `sub`, rejeita se usuário não existe, está `bloqueado` ou não está `ativo`. Não há verificação de expiração explícita além da que a própria lib `jose` já faz ao decodificar (`exp` no payload).
- **Não há revogação/blacklist de token.** Um token emitido continua válido até expirar, mesmo que o usuário seja bloqueado *depois* — na prática o bloqueio é checado a cada request (`obter_usuario_atual` reconsulta o banco), então bloquear um usuário efetivamente invalida o acesso na próxima chamada, mas o token em si não é revogado.
- **Não há endpoint de logout.** É stateless: "logout" seria só o cliente descartar o token localmente.
- **Não há endpoint de troca de senha ou recuperação de senha via API.** As únicas formas de trocar senha são os scripts CLI `criar_admin.py` (cria usuário) e `trocar_senha.py` (troca senha de usuário existente), ambos rodados manualmente dentro do container, nunca expostos via HTTP.

### 1.3 Perfis existentes (`UserRole`, em `users.py`)
```
administrador
curador
professor
estudante
pesquisador
suporte
```
Valor padrão ao criar usuário sem perfil explícito: `estudante`.

### 1.4 Onde cada perfil é de fato checado no código
Dos 6 perfis, **3** aparecem em regras de acesso (`administrador`, `suporte` e `curador`).

**Atualizado em 2026-07-16 (correção do achado 9 da revisão de código):** os 4 guardiões manuais e independentes que existiam (um por arquivo, cada um com sua própria lista de perfis permitidos como literal Python) foram consolidados em uma única dependência central, `exigir_perfis(*perfis_permitidos)` (definida em `auth.py`, ao lado de `obter_usuario_atual`). Ela é usada diretamente na assinatura de cada endpoint via `Depends(exigir_perfis(UserRole.administrador, ...))` — o próprio FastAPI barra com 403 antes do corpo do endpoint rodar, sem precisar de uma chamada manual dentro da função. As 4 funções antigas (`_exigir_admin` em `users_router.py` e `admin_router.py`, `_exigir_admin_ou_suporte` em `images_router.py`, `_exigir_admin_suporte_ou_curador` em `curation_router.py`) foram removidas.

**Atualizado em 2026-07-17 (achado de `/code-review`):** mesmo com `exigir_perfis` centralizado, cada arquivo ainda declarava sua própria tupla local de perfis permitidos (`_PERFIS_IMAGENS`, `_PERFIS_CURADORIA`, e literais inline em `admin_router.py`/`users_router.py`) — quatro convenções diferentes para a mesma tabela de política. Agora existem três constantes únicas em `auth.py`, ao lado de `exigir_perfis`: `PERFIS_ADMIN`, `PERFIS_IMAGENS`, `PERFIS_CURADORIA`. Os 4 routers importam dali em vez de declarar a própria cópia — um único lugar para consultar "quem pode fazer o quê" (útil para uma auditoria de LGPD).

| Perfis exigidos | Usado em (via `Depends(exigir_perfis(...))`) |
|---|---|
| `administrador` apenas | `GET/POST /users/`, `GET/PATCH /users/{id}`, `PATCH /users/{id}/block`, `GET /admin/stats`, `GET /admin/audit-logs` |
| `administrador`, `suporte` | `POST /images/import-from-orthanc`, `POST /images/upload`, `GET /images/{id}`, `PATCH /images/{id}/deactivate`\|`activate` — `curador` **não** tem acesso aqui, por decisão deliberada |
| `administrador`, `suporte`, `curador` | **todos** os endpoints de `/curation/*` (`curador` tem acesso igual a `suporte` em todo o módulo, inclusive aprovar/descartar/aplicar decisão final) |
| (nenhum — só exige login) | `GET /search`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password` |

**Perfis `professor`, `estudante` e `pesquisador` continuam sem nenhuma regra de autorização própria** — decisão deliberada nesta sub-fase (não uma lacuna esquecida): permanecem apenas consumidores genéricos de `/search`, como qualquer usuário autenticado. Só `curador` ganhou uma regra distinta até agora.

O campo `curador_id` em `Curation` (preenchido com o `id` de quem criou a ficha) agora pode, pela primeira vez, apontar de fato para um usuário de perfil `curador` — antes só podia ser admin/suporte, o que era uma inconsistência entre o nome do perfil e o comportamento real do sistema (apontada nesta auditoria antes da correção).

---

## 2. Modelos de dados (tabelas SQLAlchemy)

Confirmado por leitura cruzada dos modelos Python **e** das migrations Alembic — schema do banco bate com os modelos.

### 2.1 `users` (`users.py`)
| Coluna | Tipo | Notas |
|---|---|---|
| id | Integer, PK | |
| nome | String(150), not null | |
| email | String(150), unique, not null, indexado | |
| senha_hash | String(255), not null | bcrypt |
| perfil | Enum(UserRole), default `estudante` | |
| instituicao | String(200), nullable | |
| ativo | Boolean, default True | |
| bloqueado | Boolean, default False | |
| criado_em | DateTime(tz), server_default now() | |
| atualizado_em | DateTime(tz), onupdate now() | |

Sem relacionamentos declarados (`relationship()`) — outras tabelas referenciam `users.id` via `ForeignKey`, mas `User` não expõe back-references.

### 2.2 `orthanc_references` (`orthanc_references.py`)
| Coluna | Tipo | Notas |
|---|---|---|
| id | Integer, PK | |
| orthanc_id | String(255), unique, not null, indexado | ID interno do Orthanc |
| study_instance_uid | String(255), nullable, indexado | UID DICOM do estudo |
| series_instance_uid | String(255), nullable, indexado | UID DICOM da série |
| sop_instance_uid | String(255), nullable, indexado | UID DICOM da instância |
| resource_type | String(50), not null | sempre `"instance"` no código atual |
| dicomweb_url | String(500), nullable | URL montada para DICOMweb |
| ativo | Boolean, not null, default `true` | adicionado em 2026-07-16 (sub-fase 6.5.6) — soft delete; `false` = desativada, some de `/curation/pending` e `/search` |
| criado_em | DateTime(tz), server_default now() | |

Sem FK de saída, sem `relationship()`. É referenciada por `Curation.orthanc_reference_id`.

### 2.3 `curations` (`curations.py`)
| Coluna | Tipo | Notas |
|---|---|---|
| id | Integer, PK | |
| orthanc_reference_id | Integer, **FK → orthanc_references.id**, not null, indexado | |
| modalidade | String(20), not null, default `"RX"` | |
| tipo_radiografia | String(30), nullable | valores do enum `TipoRadiografia` |
| dentes | ARRAY(Integer), nullable | notação FDI, validada contra `DENTES_PERMANENTES` (11–48) |
| idade_min / idade_max | Integer, nullable | validados 0–120 e min ≤ max na criação |
| genero | String(15), nullable | valores do enum `Genero` |
| achado_principal | String(40), nullable | valores do enum `AchadoPrincipal` |
| achados_detalhe | Text, nullable | texto livre |
| qualidade_tecnica | String(20), nullable | valores do enum `QualidadeTecnica` |
| dificuldade | String(20), nullable | valores do enum `Dificuldade` |
| descricao_didatica | Text, nullable | texto livre |
| observacoes_internas | Text, nullable | texto livre (não exposto na busca pública) |
| finalidade | String(15), nullable | valores do enum `Finalidade` |
| status | String(25), not null, default `"pendente"`, indexado | valores do enum `StatusCuradoria` |
| anonimizacao_validada | Boolean, not null, default False | trava obrigatória para aprovar |
| curador_id | Integer, **FK → users.id**, nullable, indexado | quem criou a ficha |
| criado_em | DateTime(tz), server_default now() | |
| atualizado_em | DateTime(tz), onupdate now() | |

Nota: os campos "controlados" (tipo_radiografia, genero, achado_principal, etc.) são guardados como `String` no banco, não como `Enum` nativo do Postgres — a validação de valores só acontece na camada Pydantic/aplicação (comentário explícito no código: isso é proposital, para permitir adicionar valores novos sem migração de schema).

### 2.4 `curation_history` (`curations.py`)
| Coluna | Tipo | Notas |
|---|---|---|
| id | Integer, PK | |
| curation_id | Integer, **FK → curations.id**, not null, indexado | |
| usuario_id | Integer, **FK → users.id**, nullable | quem fez a ação |
| acao | String(50), not null | texto livre: `"criacao"`, `"aprovacao"`, `"descarte"`, `"solicitacao_segunda_opiniao"`, `"resposta_segunda_opiniao"` (valores vistos no código, não um Enum fechado) |
| status_anterior | String(25), nullable | |
| status_novo | String(25), nullable | |
| justificativa | Text, nullable | |
| criado_em | DateTime(tz), server_default now() | |

Histórico é **append-only**: não há update nem delete de registros de histórico em nenhum endpoint.

### 2.5 `curation_reviews` (segunda opinião, `curations.py`)
| Coluna | Tipo | Notas |
|---|---|---|
| id | Integer, PK | |
| curation_id | Integer, **FK → curations.id**, not null, indexado | |
| solicitante_id | Integer, **FK → users.id**, not null | |
| motivo | Text, not null | justificativa obrigatória ao solicitar |
| primeiro_parecer | Text, nullable | opinião de quem solicitou |
| revisor_id | Integer, **FK → users.id**, nullable | preenchido só ao responder |
| parecer_revisor | Text, nullable | |
| concordancia | String(15), nullable | só `"concorda"` ou `"discorda"` (validado na aplicação) |
| decisao_final | String(25), nullable | valores do enum `DecisaoRevisao` (desde 2026-07-15, sub-fase 6.5.1) |
| observacoes | Text, nullable | |
| status | String(20), not null, default `"solicitada"` | valores do enum `StatusRevisao` |
| criado_em | DateTime(tz), server_default now() | |
| respondido_em | DateTime(tz), nullable | |

**Índice único parcial (desde 2026-07-17, correção de achado de `/code-review`):** `uq_curation_reviews_aberta` — `UNIQUE (curation_id) WHERE status IN ('solicitada', 'respondida')` (migration `5e12b4071d59`). Impede, a nível de banco, que uma ficha tenha mais de uma review "em aberto" ao mesmo tempo — fecha uma condição de corrida onde duas requisições concorrentes de `POST /curation/{id}/request-review` passavam pela checagem da aplicação antes de qualquer uma commitar. O endpoint captura a violação (`IntegrityError`) e devolve o mesmo 409 amigável de sempre.

### 2.6 `audit_logs` (`audit_logs.py`)
| Coluna | Tipo | Notas |
|---|---|---|
| id | Integer, PK | |
| usuario_id | Integer, **FK → users.id**, nullable, indexado | nulo permitido (ex.: falha de login sem usuário identificado — embora essa gravação não ocorra hoje, ver seção 6) |
| acao | String(60), not null, indexado | texto livre |
| entidade | String(40), nullable | ex.: `"curation"` |
| entidade_id | Integer, nullable | |
| resultado | String(15), not null, default `"sucesso"` | enum Python `ResultadoAuditoria` existe (`sucesso`, `negado`, `erro`) mas a coluna é String livre, não Enum do banco |
| detalhes | Text, nullable | |
| criado_em | DateTime(tz), server_default now(), indexado | |

---

## 3. Vocabulários controlados (Enums) — valores exatos

### `UserRole` (`users.py`)
`administrador`, `curador`, `professor`, `estudante`, `pesquisador`, `suporte`

### `Modalidade` (`curations.py`)
`RX` — único valor existente hoje.

### `TipoRadiografia` (`curations.py`)
`panoramica`, `interproximal`, `periapical`, `oclusal`

### `Genero` (`curations.py`)
`masculino`, `feminino`

### `AchadoPrincipal` (`curations.py`)
`normal`, `carie`, `lesao_periapical`, `perda_ossea`, `dente_incluso`, `tratamento_endodontico`, `erro_tecnico`, `outro`

### `QualidadeTecnica` (`curations.py`)
`otima`, `boa`, `regular`, `insatisfatoria`

### `Dificuldade` (`curations.py`)
`basico`, `intermediario`, `avancado`

### `Finalidade` (`curations.py`)
`ensino`, `pesquisa`, `ambos`

### `StatusCuradoria` (`curations.py`)
`pendente`, `em_analise`, `aprovada`, `descartada`, `segunda_opiniao`, `baixa_qualidade`

> **Ambiguidade encontrada:** `pendente` e `baixa_qualidade` existem no enum, mas **nenhum endpoint no código atual seta esse valor**. Uma ficha nasce direto com `em_analise` (`criar_curadoria`), e os únicos status de destino usados são `aprovada`, `descartada` e `segunda_opiniao`. `pendente` parece ser conceitualmente o estado "imagem sem ficha ainda" (tratado à parte, via `GET /curation/pending`, que na verdade consulta imagens *sem registro em `curations`*, não fichas com `status="pendente"`). `baixa_qualidade` não tem nenhum caminho de código que o produza — pode ser um valor planejado para uma funcionalidade futura ainda não implementada.

### `StatusRevisao` (`curations.py`)
`solicitada`, `respondida`, `finalizada`

> ~~**Ambiguidade encontrada:** `finalizada` nunca é setado por nenhum endpoint...~~ **✅ RESOLVIDO em 2026-07-16 (sub-fase 6.5.4):** `POST /curation/{curation_id}/apply-review-decision` agora seta `finalizada` ao aplicar a decisão final da segunda opinião.

### `DecisaoFinalRevisao` (`curations.py`) — adicionado em 2026-07-16 (sub-fase 6.5.4)
`aprovar`, `descartar`

Usado em `POST /curation/{curation_id}/apply-review-decision`. Distinto de `DecisaoRevisao` (que tem 3 valores, incluindo `manter`, usado só para registrar a opinião do revisor em `CurationReview.decisao_final` — "manter" não mapeia para nenhuma transição de status real, então este endpoint usa um enum próprio com só as 2 opções que de fato fecham o ciclo).

### `DecisaoRevisao` (`curations.py`) — adicionado em 2026-07-15 (sub-fase 6.5.1)
`aprovar`, `descartar`, `manter`

Usado em `decisao_final` no schema `ReviewRespond` (`POST /curation/reviews/{id}/respond`). Antes desta correção era uma string livre sem validação.

### `ResultadoAuditoria` (`audit_logs.py`)
`sucesso`, `negado`, `erro`

### `DENTES_PERMANENTES` (não é Enum, é lista de inteiros — `curations.py`)
Notação FDI válida: `11–18`, `21–28`, `31–38`, `41–48` (32 dentes permanentes, 4 quadrantes).

---

## 4. Endpoints — detalhamento completo

### 4.1 `auth.py` — prefixo `/auth`

#### `POST /auth/login`
- **Acesso:** público (não exige token).
- **Corpo:** form-urlencoded (`OAuth2PasswordRequestForm`): `username` (e-mail), `password`.
- **Regras:** usuário deve existir, senha deve bater (bcrypt), não pode estar bloqueado, deve estar ativo.
- **Retorna:** `{access_token, token_type: "bearer", perfil, nome}`.
- **Erros:** 401 (credenciais inválidas), 403 (bloqueado/inativo).
- **Auditoria (desde 2026-07-16, sub-fase 6.5.2):** grava `AuditLog` em todo caso — `acao: "login"` / `resultado: "sucesso"` quando autentica; `acao: "falha_login"` / `resultado: "negado"` nos 4 casos de rejeição (e-mail não cadastrado, senha incorreta, bloqueado, inativo). Quando o e-mail nem existe, `usuario_id` fica `null`.

#### `GET /auth/me`
- **Acesso:** qualquer usuário autenticado.
- **Parâmetros:** nenhum (usuário vem do token).
- **Retorna:** `{id, nome, email, perfil}`.

#### `POST /auth/logout` — adicionado em 2026-07-16 (sub-fase 6.5.5)
- **Acesso:** qualquer usuário autenticado.
- **O que faz:** grava `AuditLog` (`acao: "logout"`, `resultado: "sucesso"`) e retorna uma mensagem de confirmação.
- **Importante:** isto é um **logout simbólico**. O JWT deste sistema é stateless e não existe lista de revogação — o token emitido continua tecnicamente válido até expirar (`JWT_EXPIRE_MINUTES`, padrão 60 min), mesmo depois de chamar este endpoint. Ele serve para fins de auditoria (saber quando um usuário encerrou a sessão) e como um sinal para o frontend descartar o token localmente — não revoga o acesso do lado do servidor. Uma blacklist de tokens de verdade (nova tabela + checagem em `obter_usuario_atual` a cada request) foi avaliada e descartada nesta sub-fase por ser uma mudança de escopo maior, candidata a uma sub-fase própria caso necessário no futuro.

#### `POST /auth/change-password` — adicionado em 2026-07-16 (sub-fase 6.5.5)
- **Acesso:** qualquer usuário autenticado — troca a **própria** senha (autotroca), não a de terceiros. Reset administrativo de senha de outro usuário não existe (só via script CLI `trocar_senha.py`).
- **Corpo (`TrocarSenha`):** `senha_atual` (obrigatório), `nova_senha` (obrigatório, mesma regra de `POST /users/`: mínimo 8 caracteres).
- **Regras:** 401 se `senha_atual` não bate (grava auditoria `acao: "falha_troca_senha"`, `resultado: "negado"`); 422 se `nova_senha` tiver menos de 8 caracteres.
- **Efeito:** re-hasheia e substitui `senha_hash`. Grava auditoria (`acao: "troca_senha"`, `resultado: "sucesso"`).

---

### 4.2 `users_router.py` — prefixo `/users`

#### `GET /users/`
- **Acesso:** apenas `administrador`.
- **Retorna:** lista de `UsuarioResposta` (`id, nome, email, perfil, instituicao, ativo, bloqueado`) para **todos** os usuários — sem paginação, sem filtro.

#### `GET /users/{user_id}` — adicionado em 2026-07-16 (sub-fase 6.5.3)
- **Acesso:** apenas `administrador` (mesma regra de `GET /users/`).
- **Retorna:** `UsuarioResposta` de um único usuário.
- **Erros:** 404 se o usuário não existe.

#### `POST /users/`
- **Acesso:** apenas `administrador`.
- **Corpo (JSON):** `nome` (str), `email` (EmailStr), `senha` (str), `perfil` (UserRole, default `estudante`), `instituicao` (opcional).
- **Regras:** rejeita senha com menos de 8 caracteres (422, desde 2026-07-15 — sub-fase 6.5.1, alinhado com os scripts CLI). Rejeita e-mail duplicado (400). Senha é hasheada com bcrypt antes de salvar.
- **Retorna:** `UsuarioResposta` do usuário criado.
- **Auditoria (desde 2026-07-16, sub-fase 6.5.2):** grava `AuditLog` (`acao: "criacao_usuario"`, `resultado: "sucesso"`, `entidade_id` = id do usuário criado, `usuario_id` = quem criou) após o commit da criação. Tentativas negadas (403 por perfil incorreto, 400 e-mail duplicado, 422 senha curta) **não** geram log — escopo restrito à ação bem-sucedida.

#### `PATCH /users/{user_id}/block`
- **Acesso:** apenas `administrador`.
- **Parâmetro:** `user_id` (path).
- **Regra:** alterna (`toggle`) o campo `bloqueado` — não é "bloquear", é "inverter o estado atual". Não recebe corpo.
- **Retorna:** `{mensagem: "Usuário bloqueado/desbloqueado com sucesso"}`.
- **Erros:** 404 se usuário não existe.
- **Auditoria (desde 2026-07-16, sub-fase 6.5.2):** grava `AuditLog` (`acao: "bloqueio_usuario"`, `resultado: "sucesso"`, `detalhes` informa se ficou bloqueado ou desbloqueado) a cada toggle.

#### `PATCH /users/{user_id}` — adicionado em 2026-07-16 (sub-fase 6.5.5)
- **Acesso:** apenas `administrador`.
- **Corpo (`UsuarioAtualizar`):** `nome` (opcional), `instituicao` (opcional). Ambos os campos são atualizados só se enviados (`None` = não mexe).
- **Deliberadamente fora do escopo deste endpoint:** `email` e `perfil` **não** fazem parte do schema — trocar o perfil de um usuário é sensível demais para um PATCH simples (permitiria, por exemplo, promover alguém a `administrador` sem nenhuma fricção extra) e foi deixado de fora por decisão de segurança. Se o cliente enviar `perfil` no corpo, o Pydantic ignora silenciosamente (mesmo comportamento padrão já usado no resto do projeto — sem `extra="forbid"`).
- **Erros:** 404 se usuário não existe.
- **Auditoria:** grava `AuditLog` (`acao: "edicao_usuario"`, `resultado: "sucesso"`) a cada chamada bem-sucedida — inclusive se nenhum campo foi de fato alterado (corpo vazio é um PATCH válido, tratado como no-op).

**CRUD de usuários:**
| Operação | Existe? |
|---|---|
| Create | Sim (`POST /users/`) |
| Read (lista) | Sim (`GET /users/`) |
| Read (um usuário por id) | Sim (`GET /users/{id}`, desde 2026-07-16 — sub-fase 6.5.3) |
| Update (nome/instituição) | Sim (`PATCH /users/{id}`, desde 2026-07-16 — sub-fase 6.5.5). **Não inclui** `email` nem `perfil` (fora de escopo deliberado); toggle de bloqueio continua em endpoint próprio |
| Delete | **Não existe** |
| Alterar senha via API | Sim, mas só **autotroca** (`POST /auth/change-password`, desde 2026-07-16 — sub-fase 6.5.5). Reset administrativo de senha de terceiros continua só via script CLI |

---

### 4.3 `curation_router.py` — prefixo `/curation`

Todos os endpoints deste módulo exigem `administrador`, `suporte` ou `curador` (`Depends(exigir_perfis(UserRole.administrador, UserRole.suporte, UserRole.curador))`, desde 2026-07-16 — sub-fase 6.5.6, item 2; antes só admin/suporte, e por um breve período dentro da mesma sub-fase `curador` teve acesso parcial sem aprovar/descartar, revertido para acesso completo por decisão explícita do usuário). A partir de 2026-07-16 (correção do achado 9 da revisão de código), esse guardião deixou de ser uma função local (`_exigir_admin_suporte_ou_curador`) e passou a ser a dependência central `exigir_perfis` de `auth.py`, compartilhada com os outros módulos.

#### `GET /curation/pending`
- **Query params:** `skip` (default 0), `limit` (default 50, máx 200).
- **O que faz:** lista imagens do Orthanc (`orthanc_references`) que **ainda não têm ficha de curadoria** (`LEFT JOIN` + `WHERE curation.id IS NULL`) **e** que estão `ativo=true` (filtro adicionado em 2026-07-16 — sub-fase 6.5.6; uma imagem desativada some desta fila mesmo sem ficha).
- **Retorna:** `{total_pendentes, skip, limit, quantidade_retornada, itens: [{orthanc_reference_id, orthanc_id, study_instance_uid, series_instance_uid, sop_instance_uid, resource_type, dicomweb_url}]}`.

#### `GET /curation/{orthanc_reference_id}/viewer-url`
- **O que faz:** monta a URL do visualizador OHIF para uma imagem, usando `OHIF_BASE_URL` + `StudyInstanceUIDs`.
- **Retorna:** se a imagem tem `study_instance_uid`: `{abrivel: true, orthanc_reference_id, orthanc_id, study_instance_uid, viewer_url}`. Se não tem: `{abrivel: false, motivo, ..., viewer_url: null}`.
- **Erros:** 404 se a `orthanc_reference` não existe.

#### `GET /curation/{curation_id}` — adicionado em 2026-07-16 (sub-fase 6.5.3)
- **O que faz:** retorna todos os campos de uma ficha de curadoria específica (inclusive `observacoes_internas` e `curador_id`, que **não** aparecem em `GET /search` — aqui é apropriado porque o endpoint já é restrito a admin/suporte).
- **Não inclui:** o histórico de alterações (`CurationHistory`) — esse continua sem nenhum endpoint de consulta (ver seção 6, item 7).
- **Erros:** 404 se a ficha não existe.

#### `GET /curation/{curation_id}/reviews` — adicionado em 2026-07-16 (sub-fase 6.5.3)
- **O que faz:** lista todas as `CurationReview` (segundas opiniões) associadas a **uma** ficha específica, ordenadas por `id`.
- **Retorna:** `{curation_id, quantidade, itens: [{id, solicitante_id, motivo, primeiro_parecer, revisor_id, parecer_revisor, concordancia, decisao_final, observacoes, status, criado_em, respondido_em}]}`.
- **Erros:** 404 se a ficha não existe.
- **Ambiguidade:** isto é uma listagem *por ficha*, não uma fila global de revisões pendentes no sistema — não substitui a lacuna descrita na seção 7.5 (não há como listar todas as `CurationReview` com `status: solicitada` de todas as fichas de uma vez).

#### `POST /curation/{orthanc_reference_id}`
- **O que faz:** cria a ficha de curadoria de uma imagem.
- **Corpo (JSON, `CurationCreate`):** `tipo_radiografia` (obrigatório, enum), `dentes` (lista de int, opcional, validada contra FDI 11-48), `idade_min`/`idade_max` (opcional, 0-120, min≤max), `genero` (opcional), `achado_principal` (opcional), `achados_detalhe` (texto opcional), `qualidade_tecnica` (opcional), `dificuldade` (opcional), `descricao_didatica` (texto opcional), `observacoes_internas` (texto opcional), `finalidade` (opcional).
- **Regras:** 404 se imagem não existe; 409 se a imagem está desativada (`ativo=False`, checagem adicionada em 2026-07-16 via `/code-review` — consistente com o filtro já aplicado em `/curation/pending` e `/search`); 409 se já existe ficha para essa imagem; 422 se dentes ou idades inválidos. Ficha nasce com `status = em_analise`, `anonimizacao_validada = False`, `curador_id = usuário logado`. Grava em `curation_history` (ação `"criacao"`).
- **Retorna:** `{mensagem, curation_id, orthanc_reference_id, status, tipo_radiografia, dentes}`.

#### `POST /curation/{curation_id}/approve`
- **Corpo (`CurationApprove`):** `anonimizacao_validada` (bool, obrigatório), `observacoes` (opcional).
- **Regra de negócio (LGPD):** só aprova se `anonimizacao_validada = true`; se `false`, bloqueia com 422 **e ainda assim grava um log de auditoria de tentativa negada**. 409 se a ficha já está em status final (`aprovada` ou `descartada`). 409 se a ficha está em `segunda_opiniao` (checagem adicionada em 2026-07-16 via `/code-review` — antes disso era possível aprovar/descartar diretamente enquanto uma segunda opinião estava em andamento, pulando o fluxo de revisão por completo; agora o único caminho para sair de `segunda_opiniao` é `POST /curation/{id}/apply-review-decision`). **Desde 2026-07-17:** essa checagem foi extraída para `_exigir_fora_de_segunda_opiniao` (estava duplicada verbatim entre `/approve` e `/discard`).
- **Efeito:** `status → aprovada`, grava histórico e auditoria (`resultado: sucesso`).
- **Retorna:** `{mensagem, curation_id, status, anonimizacao_validada}`.

#### `POST /curation/{curation_id}/discard`
- **Corpo (`CurationDiscard`):** `motivo` (str, obrigatório e não pode ser vazio/whitespace).
- **Regra:** 409 se já está em status final; 409 se a ficha está em `segunda_opiniao` (mesma correção de 2026-07-16 descrita acima, em `/approve`, via `_exigir_fora_de_segunda_opiniao` desde 2026-07-17); 422 se motivo vazio.
- **Efeito:** `status → descartada`, grava histórico e auditoria.
- **Retorna:** `{mensagem, curation_id, status, motivo}`.

#### `POST /curation/{curation_id}/request-review`
- **Corpo (`ReviewRequest`):** `motivo` (obrigatório), `primeiro_parecer` (opcional).
- **Regras:** 409 se ficha já em status final; 422 se motivo vazio; 409 se já existe uma revisão **em aberto** para essa ficha — desde 2026-07-16 (`/code-review`) isso cobre `status` `solicitada` **ou** `respondida` (antes só cobria `solicitada`, permitindo criar uma segunda solicitação enquanto a primeira já estava `respondida` mas ainda não tinha sido aplicada; como `apply-review-decision` sempre pega a review mais recente, isso deixava a resposta da primeira review permanentemente órfã e sem erro). **Desde 2026-07-17:** a checagem da aplicação sozinha não fechava uma condição de corrida (duas requisições concorrentes podiam passar por ela antes de qualquer uma commitar) — agora há também um índice único parcial no banco (`uq_curation_reviews_aberta`, ver seção 2.5) como última linha de defesa; se a corrida acontecer, o endpoint captura a violação e devolve o mesmo 409.
- **Efeito:** cria `CurationReview` (`status: solicitada`), muda `Curation.status → segunda_opiniao`, grava histórico e auditoria.
- **Retorna:** `{mensagem, review_id, curation_id, status_ficha, status_review}`.

#### `POST /curation/reviews/{review_id}/respond`
- **Corpo (`ReviewRespond`):** `parecer_revisor` (obrigatório, não pode ser vazio), `concordancia` (obrigatório, deve ser exatamente `"concorda"` ou `"discorda"`), `decisao_final` (opcional, enum `DecisaoRevisao`: `aprovar`/`descartar`/`manter` — validado pelo Pydantic desde 2026-07-15, sub-fase 6.5.1; antes era texto livre), `observacoes` (opcional).
- **Regra de imparcialidade:** 403 se `usuario.id == review.solicitante_id` (quem pediu não pode responder) — e essa tentativa **é registrada em auditoria como `resultado: negado`**. 404 se review não existe. 409 se já foi respondida.
- **Efeito:** preenche `revisor_id`, `parecer_revisor`, `concordancia`, `decisao_final`, `observacoes`, `respondido_em`; `CurationReview.status → respondida`. Grava histórico e auditoria.
- ~~**Ambiguidade:** este endpoint não altera `Curation.status` de volta...~~ **✅ RESOLVIDO em 2026-07-16 (sub-fase 6.5.4):** ver `POST /curation/{curation_id}/apply-review-decision` abaixo, que fecha esse ciclo.

#### `POST /curation/{curation_id}/apply-review-decision` — adicionado em 2026-07-16 (sub-fase 6.5.4)
- **O que faz:** fecha o ciclo da segunda opinião, aplicando a decisão final (`aprovar` ou `descartar`) à ficha depois que a review mais recente já foi respondida.
- **Corpo (`AplicarDecisaoRevisao`):** `decisao` (obrigatório, enum `DecisaoFinalRevisao`: `aprovar`/`descartar`), `anonimizacao_validada` (bool, obrigatório *de fato* só se `decisao == aprovar`), `motivo` (obrigatório *de fato* só se `decisao == descartar`), `observacoes` (opcional).
- **Regras:** 409 se a ficha já está em status final; 409 se a ficha não tem nenhuma `CurationReview`; 409 se a review mais recente (por `id` decrescente) não está com `status == respondida`. Se `decisao == aprovar`, reaproveita a mesma trava de `anonimizacao_validada` do endpoint `/approve` (422 se ausente/falsa, com log `negado`). Se `decisao == descartar`, reaproveita a mesma exigência de `motivo` não vazio do `/discard` (422 caso contrário).
- **Reaproveitamento de código:** a lógica de transição de status (aprovar/descartar) foi extraída de `aprovar_curadoria`/`descartar_curadoria` para duas funções privadas compartilhadas, `_executar_aprovacao` e `_executar_descarte` — usadas tanto pelos endpoints originais quanto por este. O comportamento externo de `/approve` e `/discard` não mudou.
- **Efeito:** aplica `Curation.status → aprovada`/`descartada` (mesmas regras de LGPD/justificativa); marca a `CurationReview` mais recente como `status → finalizada` (primeiro uso real desse valor do enum `StatusRevisao`). Grava histórico e auditoria com `acao` distinto (`aprovacao_pos_segunda_opiniao`/`descarte_pos_segunda_opiniao`) e uma nota citando o `review_id` de origem, para diferenciar de uma aprovação/descarte direto.
- **Trava contra reprocessamento:** automática — o status final resultante já cai em `STATUS_FINAIS`, checado por todos os endpoints de transição de status deste módulo. Nenhuma lógica adicional de bloqueio foi necessária.
- ~~**Não valida:** se `decisao` bate com o `decisao_final` que o revisor registrou em `respond()`...~~ **✅ RESOLVIDO em 2026-07-16 (via `/code-review`):** se `review.decisao_final` for `aprovar` ou `descartar`, `dados.decisao` **precisa** ser igual (409 se divergir — `"A decisao enviada ('X') diverge do parecer do revisor ('Y')..."`). Se `review.decisao_final` for `None` (campo opcional em `respond()`, o revisor pode deixar em branco) ou `manter` (valor que não existe em `DecisaoFinalRevisao`), nenhuma validação cruzada é feita — não há uma recomendação concreta do revisor para comparar.

**CRUD de curadoria (`Curation`):**
| Operação | Existe? |
|---|---|
| Create | Sim (`POST /curation/{orthanc_reference_id}`) |
| Read (lista pendente) | Sim (`GET /curation/pending`) |
| Read (uma ficha por id) | Sim (`GET /curation/{id}`, desde 2026-07-16 — sub-fase 6.5.3; retorna todos os campos, mas não o histórico de alterações) |
| Update (editar campos já preenchidos) | **Não existe** — só mudanças de status via approve/discard/request-review |
| Delete | **Não existe** |

---

### 4.4 `images_router.py` — prefixo `/images`

#### `POST /images/import-from-orthanc`
- **Acesso:** `administrador` ou `suporte`.
- **Corpo:** nenhum.
- **O que faz:** chama o Orthanc (`orthanc_client.listar_instancias()`), para cada instância verifica se já existe em `orthanc_references`; se não existe, busca detalhes (`obter_detalhes_instancia`), extrai `SOPInstanceUID`/`ParentSeries`/`ParentStudy`, monta `dicomweb_url` e insere. Cada imagem é processada e commitada individualmente (rollback isolado por item em caso de erro).
- **Retorna:** `{total_no_orthanc, novas_importadas, ja_existentes, erros, detalhes: [{orthanc_id, status, mensagem?}]}`.
- **Auditoria (desde 2026-07-16, sub-fase 6.5.2):** grava **um único** `AuditLog`-resumo por chamada (não um por imagem, para não inflar a tabela): `acao: "importacao_orthanc"`, `entidade: "orthanc_reference"`, `resultado: "erro"` se `erros > 0` no lote, senão `"sucesso"`, `detalhes` com os totais (`total/novas/ja_existentes/erros`).
- Internamente reaproveita `_registrar_referencia_se_nova` (desde 2026-07-16, sub-fase 6.5.6) — a mesma função usada pelo endpoint de upload abaixo, para não duplicar a lógica de "criar referência se ainda não existe".

#### `POST /images/upload` — adicionado em 2026-07-16 (sub-fase 6.5.6, item 3)
- **Acesso:** `administrador` ou `suporte` (mesma regra do resto do módulo — `curador` **não** tem acesso, decisão deliberada do item 2 desta sub-fase).
- **Corpo:** `multipart/form-data`, campo `arquivo` (arquivo DICOM bruto).
- **O que faz:** lê o arquivo, valida com `pydicom` (tentando primeiro sem `force`, depois com `force=True` se faltar o preâmbulo padrão), envia para o Orthanc via `orthanc_client.enviar_instancia()` (novo — `POST {ORTHANC_URL}/instances` com o binário), e registra a referência com `_registrar_referencia_se_nova` (mesma função usada por `import-from-orthanc`).
- **Regras:** 413 se o arquivo exceder `settings.MAX_UPLOAD_SIZE_MB` (padrão 50MB); 422 se o pydicom rejeitar completamente (nem com `force=True`) **ou** se o Orthanc responder 4xx (o Orthanc é a autoridade final sobre validade — ver nota abaixo); 502 se a falha for de conexão/infraestrutura com o Orthanc (5xx ou erro de rede).
- **Leitura em pedaços (desde 2026-07-16, correção do achado 8 da revisão de código):** o arquivo é lido em blocos de 1MB, abortando com 413 assim que a soma ultrapassa o limite — antes disso o arquivo inteiro era lido para memória (`arquivo.file.read()`) antes de checar o tamanho, então o limite não protegia contra o custo de memória de um upload muito maior que o permitido. **Desde 2026-07-17:** o `bytearray` intermediário é liberado (`del partes`) logo após a conversão para `bytes`, evitando manter as duas cópias do arquivo em memória simultaneamente por mais tempo que o necessário.
- **Retorna:** `{mensagem, orthanc_reference_id, orthanc_id, status: "importada"|"ja_existente", preambulo_dicom_ausente: bool}`.
- **Duplicata:** se o mesmo conteúdo (mesmo `SOPInstanceUID`) já tiver sido enviado antes, o Orthanc devolve o mesmo `orthanc_id` de sempre — o endpoint reconhece isso via `_registrar_referencia_se_nova` e retorna `status: "ja_existente"` sem duplicar nada.
- **Sem anonimização automática (decisão deliberada):** o arquivo é armazenado exatamente como enviado. A segurança de LGPD continua sendo 100% a checagem manual humana já existente no fluxo de curadoria (`anonimizacao_validada`, só liberado por um humano antes de aprovar) — este endpoint não muda esse modelo de confiança.
- **Auditoria:** grava `AuditLog` (`acao: "upload_imagem"`, `resultado: "sucesso"`) sempre. Se o arquivo foi aceito sem o preâmbulo DICOM padrão (via `force=True`), grava **um segundo registro distinto** (`acao: "upload_sem_preambulo_dicom"`), para ficar rastreável separadamente em `GET /admin/audit-logs`.
- **Achado importante sobre validação:** `pydicom.dcmread(..., force=True)` é permissivo demais para servir como único filtro de "isto é um DICOM válido" — ele consegue "ler com sucesso" até um arquivo de texto puro (interpreta os bytes como uma tag privada qualquer, sem levantar exceção). Por isso o Orthanc é tratado como a autoridade final: uma rejeição 4xx do Orthanc vira 422, não 502.
- **Tratamento de falha ao registrar a referência (corrigido em 2026-07-16 via `/code-review`):** a chamada a `_registrar_referencia_se_nova` (que faz uma segunda chamada HTTP ao Orthanc e um `db.commit()`) está envolvida em `try/except` — antes disso, uma falha aqui (ex.: timeout do Orthanc, ou corrida de unicidade em `orthanc_id` sob upload concorrente) subia sem tratamento como 500 cru, com o arquivo já gravado no Orthanc mas sem referência no Postgres nem log de auditoria (um "upload órfão"). Agora: `db.rollback()`, grava `AuditLog` com `resultado: "erro"`, e responde 502 com uma mensagem clara. A reconciliação de um arquivo que fica órfão no Orthanc continua manual — fora do escopo desta correção.
- **Refinamento de 2026-07-17 (achado de `/code-review`):** o `try/except` acima tratava **toda** falha (inclusive uma colisão benigna de unicidade) como erro genuíno. Como `orthanc_id` é único no banco, se dois uploads do mesmo arquivo chegarem quase ao mesmo tempo, o segundo pode colidir na hora do commit mesmo já tendo passado pela checagem de "não existe" — isso não é uma falha de verdade, é a mesma imagem sendo registrada por duas requisições concorrentes. Agora esse caso específico (`IntegrityError`) é capturado separadamente: a referência já existente é reconsultada e o endpoint responde `status: "ja_existente"` normalmente, em vez de 502 "contate o suporte".

#### `GET /images/{orthanc_reference_id}` — adicionado em 2026-07-16 (sub-fase 6.5.3)
- **Acesso:** `administrador` ou `suporte` (mesma regra do endpoint de sincronização).
- **Retorna:** todos os campos de uma `orthanc_reference` (`id, orthanc_id, study_instance_uid, series_instance_uid, sop_instance_uid, resource_type, dicomweb_url, ativo, criado_em` — campo `ativo` adicionado em 2026-07-16, sub-fase 6.5.6).
- **Erros:** 404 se a imagem não existe.
- **Importante:** este endpoint funciona **independente** do valor de `ativo` — mostra a imagem normalmente mesmo se ela estiver desativada (decisão deliberada: só as listagens `/curation/pending` e `/search` filtram por `ativo`, não as consultas de item único).

#### `PATCH /images/{orthanc_reference_id}/deactivate` — adicionado em 2026-07-16 (sub-fase 6.5.6)
- **Acesso:** `administrador` ou `suporte`.
- **O que faz:** soft delete — marca `ativo=false`. A imagem some de `/curation/pending` e `/search`, mas continua acessível via `GET /images/{id}` e `GET /curation/{id}/viewer-url`.
- **Erros:** 404 se a imagem não existe.
- **Auditoria:** grava `AuditLog` (`acao: "desativacao_imagem"`, `resultado: "sucesso"`).
- **Implementação (desde 2026-07-16, correção dos achados 7 e 10 da revisão de código):** reaproveita `_alterar_ativo_imagem(db, id, ativo, usuario)`, compartilhada com `/activate` — evita duplicar a lógica de buscar/404/alterar/auditar, e faz a mudança de estado + o log de auditoria na mesma transação (1 commit, não 2). **Desde 2026-07-17:** o `acao` da auditoria deixou de ser um parâmetro separado passado por cada chamador (risco de dessincronia com `ativo`) — agora é derivado internamente a partir do próprio `ativo`.
- **Não valida:** se já existe uma `Curation` `aprovada` para essa imagem — desativar não é bloqueado nesse caso (decisão consciente, não uma omissão; ver seção 6).

#### `PATCH /images/{orthanc_reference_id}/activate` — adicionado em 2026-07-16 (sub-fase 6.5.6)
- **Acesso:** `administrador` ou `suporte`.
- **O que faz:** reverte o soft delete — marca `ativo=true`. A imagem volta a aparecer em `/curation/pending`/`/search` se as demais condições baterem.
- **Erros:** 404 se a imagem não existe.
- **Auditoria:** grava `AuditLog` (`acao: "reativacao_imagem"`, `resultado: "sucesso"`).
- **Nota:** `POST /images/import-from-orthanc` não reativa automaticamente uma imagem desativada que reapareça numa nova sincronização — o soft delete é "pegajoso": só um `PATCH /activate` explícito reverte.

**CRUD de imagens (`OrthancReference`):**
| Operação | Existe? |
|---|---|
| Create | Sim — sincronização em lote (`POST /images/import-from-orthanc`) **ou** upload individual (`POST /images/upload`, desde 2026-07-16) |
| Read (lista) | Indireto, via `GET /curation/pending` (só as sem ficha) e `GET /search` (só as aprovadas) — **não há um `GET /images` genérico que liste todas as `orthanc_references` sem filtro** |
| Read (uma imagem por id) | Sim (`GET /images/{id}`, desde 2026-07-16 — sub-fase 6.5.3) |
| Update | **Não existe** |
| Delete | **Não existe** |

---

### 4.5 `search_router.py` — prefixo `/search`

#### `GET /search`
- **Acesso:** qualquer usuário autenticado (nenhuma checagem de perfil).
- **Regra de ouro:** só retorna `Curation` com `status == "aprovada"` (join com `OrthancReference`) **e** com a imagem subjacente `ativo=true` (filtro adicionado em 2026-07-16 — sub-fase 6.5.6; desativar a imagem some com o resultado da busca mesmo que a ficha continue `aprovada`).
- **Query params (todos opcionais):** `tipo_radiografia`, `dente` (int FDI), `arcada` (`"superior"`/`"inferior"`), `lado` (`"direito"`/`"esquerdo"`), `achado_principal`, `genero`, `qualidade_tecnica`, `dificuldade`, `finalidade`, `idade_min`, `idade_max` (0-120), `skip` (default 0), `limit` (default 50, máx 200). Filtros combinados com E lógico.
- **Retorna:** `{total, skip, limit, quantidade_retornada, itens: [{curation_id, orthanc_reference_id, orthanc_id, modalidade, tipo_radiografia, dentes, achado_principal, qualidade_tecnica, dificuldade, finalidade, descricao_didatica, viewer_url}]}`.
- **Nota de privacidade:** campos internos como `observacoes_internas` e `curador_id` **não** são expostos neste endpoint — só os campos "de card" listados acima.
- **Ambiguidade:** `arcada` e `lado` são strings livres sem `Enum`/`Literal` no parâmetro (aceita qualquer string; só compara com `"superior"`/`"inferior"`/`"direito"`/`"esquerdo"`, qualquer outro valor é silenciosamente ignorado sem erro nem filtro aplicado).

---

### 4.6 `admin_router.py` — prefixo `/admin`

Todos os endpoints exigem `administrador`.

#### `GET /admin/stats`
- **Retorna:** `{total_imagens_orthanc, total_fichas_curadoria, por_status: {status: total}, por_tipo_radiografia: {...}, por_achado_principal: {...}, por_dificuldade: {...}}` — contagens agrupadas (valores nulos viram chave `"nao_informado"`).

#### `GET /admin/audit-logs`
- **Query params (opcionais):** `usuario_id`, `acao`, `resultado`, `data_de` (ISO datetime), `data_ate` (ISO datetime), `skip`, `limit` (máx 200).
- **Retorna:** `{total, skip, limit, quantidade_retornada, itens: [{id, usuario_id, acao, entidade, entidade_id, resultado, detalhes, criado_em}]}`, ordenado do mais recente para o mais antigo.
- **Cobertura de auditoria (atualizado 2026-07-16, sub-fase 6.5.2):** além das ações de curadoria (`curation_router.py`), esta tela agora também mostra `login`, `falha_login`, `criacao_usuario`, `bloqueio_usuario` e `importacao_orthanc`. **Ainda não** ficam registradas: tentativas de acesso negado por perfil incorreto (403 dos guardiões `_exigir_admin`/`_exigir_admin_ou_suporte`), edição/exclusão de dados (que também não existem como endpoint) e qualquer ação no frontend (que ainda não existe) — ver seção 6, item 2.

---

### 4.7 `main.py` — endpoints soltos

#### `GET /health`
- Público. Retorna `{status: "ok", service: "radix-api"}`. Não verifica nada de fato.

#### `GET /health/database`
- Público (deliberadamente sem autenticação, para permitir monitoramento externo/load balancer). **Desde 2026-07-15 (sub-fase 6.5.1):** abre uma sessão via `SessionLocal` e executa `SELECT 1` de verdade. Retorna `{status: "ok", database: "conectado"}` se a consulta funcionar, ou `{status: "erro", database: "indisponivel"}` se falhar. Nenhuma exceção sobe sem tratamento — o endpoint sempre responde 200. **Desde 2026-07-16 (correção do achado 6 da revisão de código):** não devolve mais o texto cru da exceção (`str(e)`, que podia vazar host/porta/nome do banco internos) — só o status genérico. **Desde 2026-07-17:** a exceção real passou a ser logada no servidor via `logging` (`logger.exception(...)`, visível em `docker logs`) — sanitizar a resposta HTTP não deveria significar que um operador perde a visibilidade da causa real da falha. Este é o único uso de `logging` em todo o backend (o resto do código não usa esse módulo).

#### `GET /health/orthanc`
- Público (mesma justificativa acima). **Desde 2026-07-15 (sub-fase 6.5.1):** chama `orthanc_client.listar_instancias()` (reaproveita o cliente já existente, com autenticação). Retorna `{status: "ok", orthanc: "conectado"}` se funcionar, ou `{status: "erro", orthanc: "indisponivel"}` se falhar — mesma correção de 2026-07-16 (não vaza mais a URL interna do Orthanc via texto de exceção) e o mesmo `logger.exception(...)` de 2026-07-17.

> `GET /health` continua sem verificar nada de fato (só confirma que o processo da API responde). Os dois health checks de dependências externas (banco e Orthanc) agora refletem o estado real.

---

## 5. Matriz CRUD consolidada por entidade

| Entidade | Create | Read (lista) | Read (item único) | Update | Delete |
|---|---|---|---|---|---|
| **User** | ✅ `POST /users/` | ✅ `GET /users/` | ✅ `GET /users/{id}` (2026-07-16) | ✅ nome/instituição via `PATCH /users/{id}` + bloqueio via `PATCH /users/{id}/block` (ambos 2026-07-16 e antes) — **exclui** `email`/`perfil` de propósito | ❌ não existe |
| **OrthancReference** (imagem) | ✅ sync em lote (`POST /images/import-from-orthanc`) **ou** upload individual (`POST /images/upload`, 2026-07-16) | ⚠️ só filtrado (pendentes ativas ou aprovadas ativas), sem listagem geral | ✅ `GET /images/{id}` (2026-07-16), funciona mesmo se `ativo=false` | ❌ não existe | ✅ soft delete via `PATCH /images/{id}/deactivate`/`activate` (2026-07-16) |
| **Curation** (ficha) | ✅ `POST /curation/{orthanc_reference_id}` | ⚠️ só pendentes (`GET /curation/pending`) e aprovadas (`GET /search`) | ✅ `GET /curation/{id}` (2026-07-16) | ⚠️ só mudança de status (approve/discard/request-review), não há edição de campos | ❌ não existe |
| **CurationHistory** | ✅ (automático, interno) | ❌ não há endpoint para consultar o histórico de uma ficha | ❌ | ❌ (é log, não deveria ter) | ❌ |
| **CurationReview** | ✅ `POST /curation/{id}/request-review` | ✅ `GET /curation/{id}/reviews` (2026-07-16 — lista por ficha, não é uma listagem global do sistema) | ❌ não há `GET /curation/reviews/{id}` isolado | ✅ `POST /curation/reviews/{id}/respond` (solicitada→respondida) e, desde 2026-07-16, `POST /curation/{id}/apply-review-decision` (respondida→finalizada) | ❌ |
| **AuditLog** | ✅ (automático, só em ações de curadoria) | ✅ `GET /admin/audit-logs` | ❌ não há `GET /admin/audit-logs/{id}` | ❌ (correto, log não deve ser editável) | ❌ (correto) |

---

## 6. Lacunas e ambiguidades a esclarecer (resumo consolidado)

1. **Perfis sem regra própria:** `curador`, `professor`, `estudante`, `pesquisador` existem no enum mas não têm nenhuma checagem de autorização específica em nenhum endpoint — precisa confirmar se isso é intencional (roadmap futuro) ou lacuna.
2. ~~**Auditoria parcial:** `AuditLog` só é populado por ações dentro de `curation_router.py`. Login/falha de login, criação/bloqueio de usuário e importação de imagens do Orthanc não geram registro de auditoria, apesar dos comentários no código sugerirem essa intenção.~~ **✅ PARCIALMENTE RESOLVIDO em 2026-07-16 (sub-fase 6.5.2):** `login`, `falha_login`, `criacao_usuario`, `bloqueio_usuario` e `importacao_orthanc` agora geram `AuditLog`. **Ainda em aberto (decisão explícita de escopo, não pendência técnica):** tentativas de acesso negado por perfil incorreto (403 de `_exigir_admin`/`_exigir_admin_ou_suporte` em `users_router.py` e `images_router.py`) continuam sem log — só as ações bem-sucedidas (e, no caso do login, as falhas de credencial) foram cobertas nesta sub-fase.
3. ~~**Sem DELETE em nenhuma entidade** do sistema.~~ **✅ PARCIALMENTE RESOLVIDO em 2026-07-16 (sub-fase 6.5.6, item 1 — estratégia de exclusão decidida entidade por entidade):**
   - **OrthancReference:** soft delete real via `PATCH /images/{id}/deactivate`/`activate` + coluna `ativo`. **Decisão em aberto, não implementada:** desativar uma imagem não é bloqueado mesmo que já exista uma `Curation` `aprovada` referenciando ela — a ficha continua `aprovada` no banco, só some do resultado de `/search` porque a imagem ficou inativa.
   - **User:** decisão deliberada de **não** criar soft delete separado — `bloqueado` (já existente, já reversível via `PATCH /users/{id}/block`) cobre o caso de uso.
   - **Curation:** decisão deliberada de **não** criar soft delete separado — `status: "descartada"` (já existente, final, auditado, com justificativa obrigatória) já cobre o caso de uso.
   - **CurationHistory, CurationReview e AuditLog** continuam sem qualquer mecanismo de exclusão — são logs/histórico e não deveriam ter.
   - Sub-fase 6.5.6 completa: item 2 (perfil `curador`) e item 3 (upload direto de DICOM) tratados nas atualizações seguintes desta seção.
4. ~~**Sem edição de dados de usuário** (nome, e-mail, instituição, perfil) depois de criado — só o toggle de bloqueio.~~ **✅ PARCIALMENTE RESOLVIDO em 2026-07-16 (sub-fase 6.5.5):** `PATCH /users/{id}` permite editar `nome` e `instituicao`. **Continua em aberto, por decisão deliberada:** `email` e `perfil` não são editáveis por nenhum endpoint — trocar o perfil de um usuário foi julgado sensível demais para um PATCH simples.
5. ~~**Sem troca de senha ou logout via API** — só scripts CLI internos ao container.~~ **✅ RESOLVIDO em 2026-07-16 (sub-fase 6.5.5):** `POST /auth/change-password` (autotroca, exige senha atual) e `POST /auth/logout` (simbólico — ver nota na seção 4.1 sobre JWT stateless sem revogação real). **Continua em aberto:** reset administrativo de senha de outro usuário (só via script CLI `trocar_senha.py`).
6. ~~**Sem GET de item único** para usuário, imagem (`OrthancReference`) ou ficha de curadoria (`Curation`) — só listagens filtradas.~~ **✅ RESOLVIDO em 2026-07-16 (sub-fase 6.5.3):** `GET /users/{id}`, `GET /images/{id}` e `GET /curation/{id}` adicionados.
7. ~~**Sem consulta ao histórico de uma ficha** (`CurationHistory`) nem à lista de segundas opiniões (`CurationReview`) via nenhum endpoint.~~ **✅ PARCIALMENTE RESOLVIDO em 2026-07-16 (sub-fase 6.5.3):** `GET /curation/{id}/reviews` lista as segundas opiniões de uma ficha específica. **Ainda em aberto:** `CurationHistory` continua sem nenhum endpoint de consulta, e não há listagem global de `CurationReview` (todas as fichas) nem `GET /curation/reviews/{review_id}` para uma review isolada.
8. ~~**Fluxo de segunda opinião incompleto:** depois que o revisor responde (`status → respondida`), não existe endpoint que aplique a "decisão final" de volta à ficha (`Curation.status` permanece em `segunda_opiniao` indefinidamente). O enum `StatusRevisao.finalizada` nunca é usado.~~ **✅ RESOLVIDO em 2026-07-16 (sub-fase 6.5.4):** `POST /curation/{curation_id}/apply-review-decision` aplica a decisão final (`aprovar`/`descartar`) depois que a review mais recente está `respondida`, e marca a review como `finalizada`.
9. **`StatusCuradoria.pendente` e `.baixa_qualidade`** nunca são produzidos por nenhum endpoint atual — parecem valores reservados para funcionalidade futura.
10. ~~**Health checks (`/health/database`, `/health/orthanc`) retornam valores fixos**, não testam a conexão real.~~ **✅ RESOLVIDO em 2026-07-15 (sub-fase 6.5.1, commit `c9a160d`):** ambos agora fazem uma checagem real (`SELECT 1` no banco; `listar_instancias()` no Orthanc) e retornam `status: erro` com a mensagem da exceção se a checagem falhar, sem derrubar a aplicação.
11. ~~**Sem upload direto de arquivo DICOM** — imagens só entram via sincronização em lote assumindo que já estão no Orthanc por outro meio (não documentado no código lido).~~ **✅ RESOLVIDO em 2026-07-16 (sub-fase 6.5.6, item 3):** `POST /images/upload` (admin/suporte) recebe o arquivo, valida, envia para o Orthanc e registra a referência. Sem anonimização automática — decisão deliberada, a segurança de LGPD continua sendo a checagem manual humana já existente.
12. **`arcada`/`lado` (query params de `/search`)** continuam sendo strings livres sem validação de vocabulário fechado — valor fora de `superior`/`inferior`/`direito`/`esquerdo` é silenciosamente ignorado. *(A parte de `decisao_final` desta lacuna foi resolvida em 2026-07-15, sub-fase 6.5.1 — ver item 13 e a seção 3.)*
13. ~~**Validação de senha inconsistente:** scripts CLI exigem ≥8 caracteres; o endpoint `POST /users/` não tem essa validação.~~ **✅ RESOLVIDO em 2026-07-15 (sub-fase 6.5.1, commit `c9a160d`):** `POST /users/` agora rejeita senha com menos de 8 caracteres (422), alinhado com os scripts CLI. Também foi resolvido, no mesmo commit, que `decisao_final` (`POST /curation/reviews/{id}/respond`) deixou de ser texto livre e passou a validar contra o Enum `DecisaoRevisao` (`aprovar`/`descartar`/`manter`) — note que isso **não** resolve a lacuna nº 8 (o `Curation.status` continua não sendo atualizado automaticamente a partir da decisão do revisor).
14. **Frontend:** não há nada implementado além do scaffold padrão do Next.js — nenhuma tela, autenticação, ou chamada de API.

---

## 7. Frontend implementado — tela por tela, comparado com o backend

> Reescrita em 2026-08-03. Esta seção era 100% especulativa na versão original (o frontend não existia). Agora descreve o que **de fato está implementado**, tela por tela: rota, perfis com acesso, endpoints chamados (confirmados por leitura direta de cada `fetch(...)` no código-fonte, não por inferência) e qualquer descompasso encontrado entre frontend e backend. Convenção: **✅ implementado e alinhado**, **⚠️ implementado com ressalva** (funciona, mas há uma inconsistência), **❌ endpoint do backend sem tela correspondente**.
>
> Autenticação/autorização no frontend é toda client-side: o token JWT e o perfil ficam em `localStorage` (`access_token`, `perfil`, `nome`, `foto_perfil_url`); cada página faz sua própria checagem em `useEffect` (token ausente → `/login`; perfil fora da lista permitida → `/acesso-negado`) antes de buscar dados. Não há middleware/route guard central do Next.js — a proteção real e definitiva continua sendo o backend (`exigir_perfis`), como já era de se esperar de um guardião só client-side.

### 7.1 Autenticação e cadastro (`/login`, `/solicitar-acesso`, `/esqueci-senha`, `/redefinir-senha`) ✅
- `/login`: formulário e-mail+senha chamando `POST /auth/login`; guarda `access_token`/`perfil`/`nome`/`foto_perfil_url` no `localStorage` e redireciona para `/dashboard` (administrador) ou `/banco-imagens` (demais perfis).
- `/solicitar-acesso`: formulário público (nome, e-mail, senha, instituição, perfil pretendido, motivo) chamando `POST /auth/request-access` — cobre a lacuna que a versão original desta auditoria apontava como "bloqueada" (script CLI só).
- `/esqueci-senha` → `POST /auth/forgot-password` e `/redefinir-senha` → `POST /auth/reset-password` (token vem por query string do e-mail) — cobre a segunda lacuna que a versão original apontava como bloqueada.
- Troca de senha do próprio usuário (`POST /auth/change-password`) e foto de perfil (`POST`/`DELETE /users/me/avatar`) ficam no menu do `Topbar`, não numa página própria.
- Logout (`Sidebar`, botão "Sair") é só client-side: `localStorage.removeItem(...)` das 4 chaves + redirecionamento — **não chama `POST /auth/logout`**. O endpoint de logout simbólico existe no backend (grava auditoria) mas não tem nenhum chamador no frontend hoje. ⚠️

### 7.2 Navegação e controle de acesso por perfil (`Sidebar.tsx`) ⚠️
- O menu lateral (`ITENS_MENU`) filtra os itens por perfil: alguns (Início, Pesquisa avançada, Banco de imagens, Minhas imagens) aparecem para qualquer perfil autenticado; os demais têm uma lista de perfis (`PERFIS_ADMIN_APENAS` ou `PERFIS_ADMIN_E_CURADOR`).
- **Inconsistência encontrada:** `PERFIS_ADMIN_E_CURADOR = ['administrador', 'curador']` é usada para **4** itens do menu — "Imagens recebidas" (`/imagens`), "Curadoria", "Segunda opinião" e "Relatórios" — mas em todos os 4 casos o **backend permite `suporte` também** (`GET /images/` e `/curation/*` exigem `PERFIS_CURADORIA` = administrador+suporte+curador; `GET /admin/stats`, usado por Relatórios, também aceita `PERFIS_CURADORIA`). Ou seja, um usuário `suporte` tem permissão de backend para essas 4 áreas mas **não vê o link no menu** para chegar lá — só alcançaria digitando a URL diretamente. Não é uma falha de segurança (o backend continua sendo a autoridade), mas é uma lacuna de navegação/UX que provavelmente não foi intencional, já que `/integracoes` (também usado por `suporte`) está corretamente incluído no seu próprio perfil permitido.

### 7.3 Banco de imagens e pesquisa avançada (`/banco-imagens`, `/pesquisa`, `/visualizar/[id]`) — todos os perfis autenticados ✅
- `/banco-imagens`: galeria de categorias (`GradeCategoriasImagens`) usando `GET /search/counts` para mostrar quantidade por tipo de radiografia/achado/qualidade técnica.
- `/pesquisa`: filtros completos (tipo de radiografia, dente, arcada, lado, achado principal, gênero, qualidade técnica, dificuldade, finalidade, faixa de idade) chamando `GET /search?...` com paginação (`skip`/`limit`), mais `GET /search/counts` pros contadores dos filtros.
- `/visualizar/[id]`: abre uma imagem aprovada específica, usando `GET /search?limit=200` (para navegação entre casos) e `GET /search/{id}/series`; a exibição em si é feita pelo `VisualizadorSequencial` (ver 7.9).
- Os filtros `arcada`/`lado` no formulário de pesquisa já usam `<select>` fechado com os 2 valores válidos de cada — a lacuna apontada na versão original desta auditoria (campos de texto livre no frontend) não existe: a UI já restringe corretamente.

### 7.4 Minhas imagens (`/minhas-imagens`) — autoatendimento, todos os perfis autenticados ✅
- Lista as imagens salvas do usuário (`GET /saved-images/`), com seleção múltipla, navegação sequencial e tela cheia (reaproveitando `VisualizadorSequencial`).
- Remover da lista: `DELETE /saved-images/{curation_id}`.
- Envio em lote por e-mail: `POST /search/send-email-lote` (mais `GET /search/{id}/serie-info` por item, pra saber se é uma imagem única ou uma série com vários cortes antes de habilitar o envio).
- Salvar uma imagem (a partir da pesquisa/visualizador) é `POST /saved-images/{curation_id}`, chamado de dentro do `VisualizadorSequencial` (não desta página).

### 7.5 Fila de curadoria (`/curadoria`) — perfis `administrador`/`suporte`/`curador` na checagem client-side… mas ver 7.2 ✅
- Fila de imagens pendentes: `GET /curation/pending`.
- Abrir visualizador: `GET /curation/{orthanc_reference_id}/viewer-url`; miniatura/série via `GET /curation/{orthanc_reference_id}/series` e `GET /curation/{orthanc_reference_id}/preview`.
- Criar ficha: `POST /curation/{orthanc_reference_id}`, com todos os campos de `CurationCreate` (tipo de radiografia, dentes via odontograma clicável, faixa de idade, gênero, achado principal, achados detalhados, alterações observadas, qualidade técnica, dificuldade, descrição didática, observações internas, finalidade) — o `FichaCuradoriaForm`/`MarcadorAchado` também cobre a ferramenta de marcação de lesões (oval/retângulo/seta) sobre a miniatura, gravada em `Curation.marcacoes` via `PATCH /curation/{id}`.
- Ver ficha existente: `GET /curation/{id}`; histórico de segundas opiniões da ficha: `GET /curation/{id}/reviews`.
- Editar ficha (campos de classificação, enquanto `pendente`/`em_analise`): `PATCH /curation/{id}` — cobre a lacuna que a versão original apontava como "não existe endpoint de update"; hoje existe e o frontend usa.
- Aprovar/descartar: `POST /curation/{id}/approve` (checkbox obrigatório de anonimização validada) e `POST /curation/{id}/discard` (motivo obrigatório) — ambos por trás de um modal de confirmação (`ModalMotivo`) que decide o `caminho` (`approve`/`discard`/`request-review`) dinamicamente.
- Solicitar segunda opinião: mesmo fluxo acima, `POST /curation/{id}/request-review`.
- **Ainda ausente no backend**, como já apontava a versão original: não há listagem de fichas por `status` genérica (`GET /curation?status=`) — a fila de curadoria só enxerga imagens sem ficha (`/pending`), não fichas em qualquer status.

### 7.6 Segunda opinião (`/segunda-opiniao`) — mesma checagem de perfil de 7.5 ⚠️
- Fila de revisões pendentes: `GET /curation/reviews/pending`. Abrir visualizador: `GET /curation/{orthanc_reference_id}/viewer-url`.
- Responder: `POST /curation/reviews/{review_id}/respond` (parecer do revisor, concordância `concorda`/`discorda`, decisão final sugerida opcional com os 3 valores de `DecisaoRevisao`, observações).
- **Lacuna confirmada nesta revisão:** depois que o revisor responde, a review some da fila (`status → respondida`) mas **nenhuma tela chama `POST /curation/{id}/apply-review-decision`** — grep completo no frontend não encontrou nenhuma ocorrência de `apply-review-decision`. Isso significa que, na prática, o ciclo da segunda opinião **nunca é fechado pela UI**: a ficha fica presa em `status = segunda_opiniao` indefinidamente (não pode ser aprovada/descartada diretamente — o backend bloqueia isso de propósito, `_exigir_fora_de_segunda_opiniao`) até alguém aplicar a decisão manualmente por fora da interface (ex.: um script, ou uma futura tela). Este é o achado mais importante desta revisão: o backend implementa o fluxo completo (endpoint dedicado, desde a sub-fase 6.5.4), mas o frontend só cobre metade dele.

### 7.7 Imagens recebidas (`/imagens`) — somente leitura ❌ (grande parte do backend sem UI)
- A única chamada desta tela é `GET /images/` (lista as imagens ativas + status de curadoria mais recente), com filtros client-side por status de anonimização e de curadoria.
- **Sem checagem de perfil no frontend** (`PERFIS_PERMITIDOS` não existe nesta página — só verifica se há token) — na prática só é alcançável por quem tem o link no menu (administrador/curador, ver 7.2) ou sabe a URL; o backend (`PERFIS_CURADORIA`) continua sendo quem de fato barra outros perfis.
- **Nenhuma ação de gestão de imagens tem UI hoje**, apesar de o backend suportar todas: `POST /images/import-from-orthanc` (sincronizar), `POST /images/upload` (upload direto de DICOM), `PATCH /images/{id}/deactivate`/`activate` (soft delete) e `GET /images/{id}` (detalhe de uma imagem) — nenhum desses 4 endpoints tem qualquer chamador no frontend. A tela de "Imagens recebidas" hoje é puramente uma tabela de consulta; toda a gestão do ciclo de vida de imagens (sincronização, upload manual, ativar/desativar) só é operável hoje por fora da UI (Swagger/`curl`, ou os scripts CLI do backend). Esta é a maior lacuna funcional encontrada nesta revisão.

### 7.8 Gestão de usuários e solicitações de acesso (`/usuarios`) — administrador ⚠️
- Lista usuários ativos: `GET /users/`; usuários excluídos (soft delete): `GET /users/deleted`.
- Criar usuário: `POST /users/`. Editar nome/instituição: `PATCH /users/{id}`. Alternar bloqueio: `PATCH /users/{id}/block`. Excluir (soft delete): `DELETE /users/{id}`.
- Solicitações de acesso pendentes: `GET /users/access-requests?status_filtro=pendente`; aprovar (`POST /users/access-requests/{id}/approve`, escolhendo o perfil concedido) e rejeitar (`POST /users/access-requests/{id}/reject`, com motivo obrigatório).
- Cobre integralmente a "Gestão de usuários" que a versão original desta auditoria descrevia como tendo lacunas (exclusão e edição não existiam então) — hoje ambas existem e têm tela.
- **Mesma ressalva de `/imagens`:** esta página **não tem `PERFIS_PERMITIDOS` nem redirecionamento para `/acesso-negado`** — só verifica presença de token, ao contrário de praticamente todas as outras telas administrativas (`/auditoria`, `/painel-admin`, `/configuracoes`, `/relatorios`, `/integracoes`, que todas fazem essa checagem). Dado que esta tela expõe dados de todos os usuários e permite excluir contas, é a inconsistência de UX/segurança mais visível encontrada nesta revisão — mesmo sem risco real (o backend exige `administrador` em todo endpoint chamado aqui), um usuário sem permissão que chegasse nesta URL veria a tela tentar carregar e falhar com erros 403 crus, em vez do redirecionamento limpo que as outras telas administrativas fazem.

### 7.9 Relatórios / indicadores (`/relatorios`) — perfis `administrador`/`curador` (ver 7.2 sobre `suporte`) ✅
- `GET /admin/stats` (contagens por status, tipo de radiografia, achado principal, dificuldade, qualidade técnica e curador) + `GET /users/` (só para montar o mapa id→nome dos curadores nos gráficos de barra horizontal).

### 7.10 Painel administrativo (`/painel-admin`) — administrador ✅
- Atalhos para as 6 telas de gestão (Usuários, Imagens recebidas, Curadoria, Relatórios, Auditoria, Integrações).
- `GET /admin/stats` (indicadores resumidos), `GET /health/database` + `GET /health/orthanc` (mesma checagem client-side de `/integracoes`, duplicada aqui) e `GET /admin/audit-logs?acao=falha_login&resultado=negado&limit=5` (alerta de tentativas de login recentes negadas).

### 7.11 Auditoria (`/auditoria`) — administrador ✅
- `GET /admin/audit-logs` com todos os filtros do backend (usuário, ação, resultado, intervalo de datas), paginado.
- `GET /users/` só para resolver `usuario_id` → nome na tabela.
- O catálogo de 19 valores de `acao` usados na UI (`CATEGORIAS_ACAO`, no próprio arquivo) foi conferido contra o código-fonte de `auth.py`, `users_router.py`, `images_router.py` e do pacote `curation/` — bate com o que os módulos de fato gravam. Continua valendo a ressalva já registrada na seção 6, item 2: tentativas de acesso negado por perfil incorreto (403) não geram `AuditLog`, então não aparecem aqui.

### 7.12 Integrações — saúde dos serviços (`/integracoes`) — perfis `administrador`/`suporte` ✅
- `GET /health/database` e `GET /health/orthanc` (backend). A checagem do OHIF é feita **direto do navegador** para a URL pública do OHIF (não passa pelo backend — não existe um `/health/ohif` no backend, então esta é uma verificação puramente client-side de alcançabilidade).

### 7.13 Configurações (`/configuracoes`) — administrador, somente leitura ✅
- `GET /admin/settings` — mostra URL do Orthanc, DICOMweb, OHIF, tamanho máximo de upload, ambiente, algoritmo/expiração do JWT. Corretamente **não** expõe nenhum segredo (nem o backend devolve `DATABASE_URL`/`JWT_SECRET_KEY`/credenciais do Orthanc — ver docstring de `admin_router.obter_configuracoes`). Também lista os vocabulários fechados (modalidades, status de curadoria, perfis de usuário) como referência estática, sem chamada adicional ao backend.

### 7.14 Telas de suporte (`/acesso-negado`, `/erro-tecnico`, `error.tsx`) ✅
- `/acesso-negado`: exibida quando o `perfil` do `localStorage` não está na lista permitida da página de destino.
- `/erro-tecnico` e o `error.tsx` (error boundary do Next.js): tela genérica de erro técnico, sem chamada a API.

### 7.15 Visualizador DICOM (OHIF) — componente `VisualizadorSequencial` ✅
- Reaproveitado por `/visualizar/[id]`, `/minhas-imagens`, `/curadoria` (via `PainelVisualizador`) e `/segunda-opiniao`: abre `viewer_url` (quando `abrivel: true`) num iframe apontando pro OHIF, com navegação entre séries/estudos, tela cheia, download em ZIP (`GET /search/{id}/download/imagens.zip` e `/dicom.zip`, condicionais a existir mais de um corte) e envio individual por e-mail (`POST /search/{id}/send-email`).
- Trata explicitamente `abrivel: false` (mostra o `motivo` devolvido pelo backend) em vez de simplesmente esconder o botão — exatamente como a versão original desta auditoria recomendava.

### 7.16 Resumo — o que ficou de fora ou incoerente nesta comparação

Checagem feita nos dois sentidos: (a) todo `fetch()` do frontend foi conferido contra a lista real de endpoints do backend — **nenhum frontend chama um endpoint que não existe**; (b) todo endpoint do backend foi conferido contra os `fetch()` do frontend, para achar o inverso. Achados de (b), por ordem de relevância:

1. **`POST /curation/{id}/apply-review-decision` não tem chamador em lugar nenhum do frontend** (seção 7.6) — o fluxo de segunda opinião fica incompleto na prática, mesmo o backend suportando o ciclo inteiro desde a sub-fase 6.5.4.
2. **`POST /images/import-from-orthanc`, `POST /images/upload`, `PATCH /images/{id}/deactivate`, `PATCH /images/{id}/activate` e `GET /images/{id}` não têm chamador** (seção 7.7) — a tela `/imagens` é somente leitura; toda a gestão do ciclo de vida das imagens no Orthanc não tem UI.
3. **`POST /auth/logout` não tem chamador** (seção 7.1) — o botão "Sair" só limpa o `localStorage`, sem avisar o backend (perde-se o registro de auditoria de logout, que existe mas nunca é gravado por essa via).
4. **`suporte` não aparece no menu para 4 áreas que o backend libera pra esse perfil** (seção 7.2) — Imagens recebidas, Curadoria, Segunda opinião e Relatórios.
5. **`/usuarios` e `/imagens` não têm checagem de perfil client-side** (seções 7.7 e 7.8), diferente de todas as outras telas administrativas — a proteção real continua vindo do backend, mas a experiência de quem chega lá sem permissão é inconsistente com o resto do sistema.

Nenhum desses 5 pontos é uma falha de segurança (o backend, via `exigir_perfis`, continua sendo a autoridade final em todos os casos) — são lacunas de cobertura de UI e de navegação, coerentes com o que a seção 6 já registra sobre o próprio backend: o sistema tende a implementar a regra de negócio corretamente no servidor primeiro, e a interface nem sempre acompanha no mesmo commit.

---

## 8. Scripts de suporte (fora da API, mas parte do repositório)

- `criar_admin.py`: script CLI interativo para criar o primeiro administrador (roda dentro do container `radix-api`, pede nome/e-mail/senha via terminal, exige senha ≥8 caracteres e confirmação).
- `trocar_senha.py`: script CLI para trocar a senha de um usuário existente por e-mail (mesma validação de ≥8 caracteres e confirmação).
- `verificar_anonimizacao.py`: script CLI utilitário que lê um arquivo DICOM fixo (`/app/dicom_teste/DICOM/I6`) e imprime o valor de 14 tags sensíveis (nome do paciente, ID, data de nascimento, etc.) para conferência manual de anonimização — não é chamado pela API, é uma ferramenta de verificação manual.

Nenhum destes três scripts está exposto como endpoint HTTP nem é acionável pelo frontend.
