# Auditoria Completa — Radix Imago (Backend + Frontend)

> Documento gerado por leitura direta do código-fonte em `backend/app/` (core + modules), `backend/alembic/versions/`, scripts de raiz do backend e `frontend/src/`. Nenhum arquivo foi alterado durante esta auditoria.
>
> Convenção: tudo que está listado foi **encontrado no código**. Quando algo parecia incompleto, ausente ou ambíguo, isso é dito explicitamente em vez de presumido. As seções "Sugestões de frontend" são exatamente isso — sugestões baseadas no que o backend permite hoje, não requisitos novos.
>
> **Atualização (2026-07-15):** aplicadas as 3 correções da sub-fase 6.5.1 do plano de hardening (commit `c9a160d`): validação de senha mínima em `POST /users/`, health checks reais em `/health/database` e `/health/orthanc`, e `decisao_final` convertido para o Enum `DecisaoRevisao`. As seções afetadas foram atualizadas; os itens resolvidos na seção 6 ficam marcados como tal, sem serem removidos, para preservar o histórico da auditoria.
>
> **Atualização (2026-07-16):** aplicada a sub-fase 6.5.2 do plano de hardening: `login`, `falha_login`, `criacao_usuario`, `bloqueio_usuario` e `importacao_orthanc` agora geram registro em `audit_logs` (antes só ações de `curation_router.py` geravam auditoria). Escopo deliberadamente restrito a essas 5 ações — tentativas de acesso negado por perfil incorreto nesses mesmos endpoints (`_exigir_admin`/`_exigir_admin_ou_suporte`) **não** foram incluídas nesta sub-fase (decisão explícita, ver seção 6, item 2).

---

## 0. Visão geral da árvore analisada

```
backend/
  app/
    core/
      config.py        -> configurações (env vars)
      database.py       -> engine, sessão, Base declarativa
      security.py       -> hash de senha, JWT
    modules/
      auth.py               -> login, /auth/me, dependência de usuário atual
      users.py              -> modelo User + enum UserRole
      users_router.py       -> CRUD parcial de usuários
      curations.py          -> modelos Curation, CurationHistory, CurationReview + enums
      curation_router.py    -> fluxo de curadoria (Fase 4)
      orthanc_references.py -> modelo OrthancReference
      orthanc_client.py     -> cliente HTTP para o Orthanc (sem endpoints, sem banco)
      images_router.py      -> sincronização com Orthanc (Fase 3)
      search_router.py      -> busca pública de imagens aprovadas (Fase 5)
      admin_router.py       -> indicadores e auditoria (Fase 6)
      audit_logs.py         -> modelo AuditLog
    main.py             -> registro dos routers, CORS, health checks
  alembic/versions/     -> 3 migrations (users, orthanc_references, curadoria+auditoria)
  criar_admin.py         -> script CLI de bootstrap do 1º admin
  trocar_senha.py        -> script CLI de troca de senha
  verificar_anonimizacao.py -> script CLI de verificação de tags DICOM sensíveis

frontend/
  src/app/page.tsx    -> página estática ("Ambiente Fase 1 funcionando")
  src/app/layout.tsx  -> layout padrão do Next.js (título ainda "Next.js")
  package.json        -> Next.js 14 + React 18, sem nenhuma dependência de UI, auth, ou fetch
```

**Frontend:** não há nada além do scaffold gerado pelo `create-next-app`. Não existe nenhuma tela, componente, chamada de API, roteamento de páginas, gerenciamento de estado ou autenticação no frontend. Toda seção "Sugestão de frontend" abaixo é, portanto, 100% especulativa — não há nada existente para comparar.

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
Isto é o achado mais relevante da auditoria de autorização — **dos 6 perfis, apenas 2 aparecem em alguma regra de acesso**:

| Guardião de permissão | Onde está definido | Perfis permitidos | Usado em |
|---|---|---|---|
| `_exigir_admin` (implícito, inline) | `users_router.py` | `administrador` apenas | `GET/POST /users/`, `PATCH /users/{id}/block` |
| `_exigir_admin` | `admin_router.py` | `administrador` apenas | `GET /admin/stats`, `GET /admin/audit-logs` |
| `_exigir_admin_ou_suporte` | `curation_router.py` | `administrador`, `suporte` | todos os endpoints de `/curation/*` |
| `_exigir_admin_ou_suporte` | `images_router.py` | `administrador`, `suporte` | `POST /images/import-from-orthanc` |
| (nenhum — só exige login) | `search_router.py` | qualquer perfil autenticado | `GET /search` |
| (nenhum — só exige login) | `auth.py` | qualquer perfil autenticado | `GET /auth/me` |

**Perfis `curador`, `professor`, `estudante` e `pesquisador` existem no vocabulário mas não têm nenhuma regra de autorização própria no código atual.** Um usuário com perfil `curador`, por exemplo, **não tem permissão especial para curar** — a curadoria (`/curation/*`) exige `administrador` ou `suporte`. Isso é uma inconsistência entre o nome do perfil e o comportamento real do sistema, e deveria ser esclarecida com quem definiu os requisitos: ou a lógica de autorização está incompleta (faltam regras para esses 4 perfis), ou os nomes dos perfis não correspondem ao desenho final de permissões.

O campo `curador_id` em `Curation` é preenchido com o `id` de quem criou a ficha — que, pelas regras atuais, só pode ser admin ou suporte. Ou seja, hoje `curador_id` nunca aponta para um usuário de perfil `curador`.

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

> **Ambiguidade encontrada:** `finalizada` nunca é setado por nenhum endpoint. O fluxo implementado vai só até `respondida` (`responder_segunda_opiniao`). Não há endpoint para "finalizar" uma revisão.

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

---

### 4.2 `users_router.py` — prefixo `/users`

#### `GET /users/`
- **Acesso:** apenas `administrador`.
- **Retorna:** lista de `UsuarioResposta` (`id, nome, email, perfil, instituicao, ativo, bloqueado`) para **todos** os usuários — sem paginação, sem filtro.

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

**CRUD de usuários:**
| Operação | Existe? |
|---|---|
| Create | Sim (`POST /users/`) |
| Read (lista) | Sim (`GET /users/`) |
| Read (um usuário por id) | **Não existe** — não há `GET /users/{id}` |
| Update (dados como nome/e-mail/instituição/perfil) | **Não existe** — só o toggle de bloqueio |
| Delete | **Não existe** |
| Alterar senha via API | **Não existe** (só via script CLI) |

---

### 4.3 `curation_router.py` — prefixo `/curation`

Todos os endpoints deste módulo exigem `administrador` ou `suporte` (`_exigir_admin_ou_suporte`).

#### `GET /curation/pending`
- **Query params:** `skip` (default 0), `limit` (default 50, máx 200).
- **O que faz:** lista imagens do Orthanc (`orthanc_references`) que **ainda não têm ficha de curadoria** (`LEFT JOIN` + `WHERE curation.id IS NULL`).
- **Retorna:** `{total_pendentes, skip, limit, quantidade_retornada, itens: [{orthanc_reference_id, orthanc_id, study_instance_uid, series_instance_uid, sop_instance_uid, resource_type, dicomweb_url}]}`.

#### `GET /curation/{orthanc_reference_id}/viewer-url`
- **O que faz:** monta a URL do visualizador OHIF para uma imagem, usando `OHIF_BASE_URL` + `StudyInstanceUIDs`.
- **Retorna:** se a imagem tem `study_instance_uid`: `{abrivel: true, orthanc_reference_id, orthanc_id, study_instance_uid, viewer_url}`. Se não tem: `{abrivel: false, motivo, ..., viewer_url: null}`.
- **Erros:** 404 se a `orthanc_reference` não existe.

#### `POST /curation/{orthanc_reference_id}`
- **O que faz:** cria a ficha de curadoria de uma imagem.
- **Corpo (JSON, `CurationCreate`):** `tipo_radiografia` (obrigatório, enum), `dentes` (lista de int, opcional, validada contra FDI 11-48), `idade_min`/`idade_max` (opcional, 0-120, min≤max), `genero` (opcional), `achado_principal` (opcional), `achados_detalhe` (texto opcional), `qualidade_tecnica` (opcional), `dificuldade` (opcional), `descricao_didatica` (texto opcional), `observacoes_internas` (texto opcional), `finalidade` (opcional).
- **Regras:** 404 se imagem não existe; 409 se já existe ficha para essa imagem; 422 se dentes ou idades inválidos. Ficha nasce com `status = em_analise`, `anonimizacao_validada = False`, `curador_id = usuário logado`. Grava em `curation_history` (ação `"criacao"`).
- **Retorna:** `{mensagem, curation_id, orthanc_reference_id, status, tipo_radiografia, dentes}`.

#### `POST /curation/{curation_id}/approve`
- **Corpo (`CurationApprove`):** `anonimizacao_validada` (bool, obrigatório), `observacoes` (opcional).
- **Regra de negócio (LGPD):** só aprova se `anonimizacao_validada = true`; se `false`, bloqueia com 422 **e ainda assim grava um log de auditoria de tentativa negada**. 409 se a ficha já está em status final (`aprovada` ou `descartada`).
- **Efeito:** `status → aprovada`, grava histórico e auditoria (`resultado: sucesso`).
- **Retorna:** `{mensagem, curation_id, status, anonimizacao_validada}`.

#### `POST /curation/{curation_id}/discard`
- **Corpo (`CurationDiscard`):** `motivo` (str, obrigatório e não pode ser vazio/whitespace).
- **Regra:** 409 se já está em status final; 422 se motivo vazio.
- **Efeito:** `status → descartada`, grava histórico e auditoria.
- **Retorna:** `{mensagem, curation_id, status, motivo}`.

#### `POST /curation/{curation_id}/request-review`
- **Corpo (`ReviewRequest`):** `motivo` (obrigatório), `primeiro_parecer` (opcional).
- **Regras:** 409 se ficha já em status final; 422 se motivo vazio; 409 se já existe uma revisão com status `solicitada` aberta para essa ficha (não permite duas solicitações simultâneas).
- **Efeito:** cria `CurationReview` (`status: solicitada`), muda `Curation.status → segunda_opiniao`, grava histórico e auditoria.
- **Retorna:** `{mensagem, review_id, curation_id, status_ficha, status_review}`.

#### `POST /curation/reviews/{review_id}/respond`
- **Corpo (`ReviewRespond`):** `parecer_revisor` (obrigatório, não pode ser vazio), `concordancia` (obrigatório, deve ser exatamente `"concorda"` ou `"discorda"`), `decisao_final` (opcional, enum `DecisaoRevisao`: `aprovar`/`descartar`/`manter` — validado pelo Pydantic desde 2026-07-15, sub-fase 6.5.1; antes era texto livre), `observacoes` (opcional).
- **Regra de imparcialidade:** 403 se `usuario.id == review.solicitante_id` (quem pediu não pode responder) — e essa tentativa **é registrada em auditoria como `resultado: negado`**. 404 se review não existe. 409 se já foi respondida.
- **Efeito:** preenche `revisor_id`, `parecer_revisor`, `concordancia`, `decisao_final`, `observacoes`, `respondido_em`; `CurationReview.status → respondida`. Grava histórico e auditoria.
- **Ambiguidade:** este endpoint **não altera `Curation.status`** de volta (ele fica travado em `segunda_opiniao` mesmo depois de respondido) — não há nenhum endpoint que leve a ficha de `segunda_opiniao` para `aprovada`/`descartada` depois da resposta do revisor. Isso parece um elo faltante no fluxo: após a segunda opinião ser respondida, não há um passo formal de "decisão final aplicada à ficha".

**CRUD de curadoria (`Curation`):**
| Operação | Existe? |
|---|---|
| Create | Sim (`POST /curation/{orthanc_reference_id}`) |
| Read (lista pendente) | Sim (`GET /curation/pending`) |
| Read (uma ficha por id) | **Não existe** — não há `GET /curation/{id}` para ver uma ficha específica com todos os campos e histórico |
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
- **Não existe upload direto de arquivo DICOM via API** — a única forma de imagens entrarem no sistema é já estarem no Orthanc e serem então "puxadas" por este endpoint.

**CRUD de imagens (`OrthancReference`):**
| Operação | Existe? |
|---|---|
| Create | Sim, mas só via sincronização em lote (`POST /images/import-from-orthanc`), não upload individual |
| Read (lista) | Indireto, via `GET /curation/pending` (só as sem ficha) e `GET /search` (só as aprovadas) — **não há um `GET /images` genérico que liste todas as `orthanc_references` sem filtro** |
| Read (uma imagem por id) | **Não existe** endpoint dedicado (existe indiretamente dentro de `viewer-url`, que retorna alguns campos) |
| Update | **Não existe** |
| Delete | **Não existe** |

---

### 4.5 `search_router.py` — prefixo `/search`

#### `GET /search`
- **Acesso:** qualquer usuário autenticado (nenhuma checagem de perfil).
- **Regra de ouro:** só retorna `Curation` com `status == "aprovada"` (join com `OrthancReference`).
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
- Público. **Desde 2026-07-15 (sub-fase 6.5.1):** abre uma sessão via `SessionLocal` e executa `SELECT 1` de verdade. Retorna `{status: "ok", database: "conectado"}` se a consulta funcionar, ou `{status: "erro", database: "<mensagem da exceção>"}` se falhar. Nenhuma exceção sobe sem tratamento — o endpoint sempre responde 200.

#### `GET /health/orthanc`
- Público. **Desde 2026-07-15 (sub-fase 6.5.1):** chama `orthanc_client.listar_instancias()` (reaproveita o cliente já existente, com autenticação). Retorna `{status: "ok", orthanc: "conectado"}` se funcionar, ou `{status: "erro", orthanc: "<mensagem da exceção>"}` se falhar.

> `GET /health` continua sem verificar nada de fato (só confirma que o processo da API responde). Os dois health checks de dependências externas (banco e Orthanc) agora refletem o estado real.

---

## 5. Matriz CRUD consolidada por entidade

| Entidade | Create | Read (lista) | Read (item único) | Update | Delete |
|---|---|---|---|---|---|
| **User** | ✅ `POST /users/` | ✅ `GET /users/` | ❌ não existe | ⚠️ só toggle de bloqueio (`PATCH /users/{id}/block`), nada mais | ❌ não existe |
| **OrthancReference** (imagem) | ⚠️ só via sync em lote (`POST /images/import-from-orthanc`) | ⚠️ só filtrado (pendentes ou aprovadas), sem listagem geral | ❌ não existe endpoint dedicado | ❌ não existe | ❌ não existe |
| **Curation** (ficha) | ✅ `POST /curation/{orthanc_reference_id}` | ⚠️ só pendentes (`GET /curation/pending`) e aprovadas (`GET /search`) | ❌ não existe `GET /curation/{id}` | ⚠️ só mudança de status (approve/discard/request-review), não há edição de campos | ❌ não existe |
| **CurationHistory** | ✅ (automático, interno) | ❌ não há endpoint para consultar o histórico de uma ficha | ❌ | ❌ (é log, não deveria ter) | ❌ |
| **CurationReview** | ✅ `POST /curation/{id}/request-review` | ❌ não há endpoint de listagem de reviews | ❌ não há `GET /curation/reviews/{id}` | ✅ `POST /curation/reviews/{id}/respond` (única transição permitida) | ❌ |
| **AuditLog** | ✅ (automático, só em ações de curadoria) | ✅ `GET /admin/audit-logs` | ❌ não há `GET /admin/audit-logs/{id}` | ❌ (correto, log não deve ser editável) | ❌ (correto) |

---

## 6. Lacunas e ambiguidades a esclarecer (resumo consolidado)

1. **Perfis sem regra própria:** `curador`, `professor`, `estudante`, `pesquisador` existem no enum mas não têm nenhuma checagem de autorização específica em nenhum endpoint — precisa confirmar se isso é intencional (roadmap futuro) ou lacuna.
2. ~~**Auditoria parcial:** `AuditLog` só é populado por ações dentro de `curation_router.py`. Login/falha de login, criação/bloqueio de usuário e importação de imagens do Orthanc não geram registro de auditoria, apesar dos comentários no código sugerirem essa intenção.~~ **✅ PARCIALMENTE RESOLVIDO em 2026-07-16 (sub-fase 6.5.2):** `login`, `falha_login`, `criacao_usuario`, `bloqueio_usuario` e `importacao_orthanc` agora geram `AuditLog`. **Ainda em aberto (decisão explícita de escopo, não pendência técnica):** tentativas de acesso negado por perfil incorreto (403 de `_exigir_admin`/`_exigir_admin_ou_suporte` em `users_router.py` e `images_router.py`) continuam sem log — só as ações bem-sucedidas (e, no caso do login, as falhas de credencial) foram cobertas nesta sub-fase.
3. **Sem DELETE em nenhuma entidade** do sistema.
4. **Sem edição de dados de usuário** (nome, e-mail, instituição, perfil) depois de criado — só o toggle de bloqueio.
5. **Sem troca de senha ou logout via API** — só scripts CLI internos ao container.
6. **Sem GET de item único** para usuário, imagem (`OrthancReference`) ou ficha de curadoria (`Curation`) — só listagens filtradas.
7. **Sem consulta ao histórico de uma ficha** (`CurationHistory`) nem à lista de segundas opiniões (`CurationReview`) via nenhum endpoint.
8. **Fluxo de segunda opinião incompleto:** depois que o revisor responde (`status → respondida`), não existe endpoint que aplique a "decisão final" de volta à ficha (`Curation.status` permanece em `segunda_opiniao` indefinidamente). O enum `StatusRevisao.finalizada` nunca é usado.
9. **`StatusCuradoria.pendente` e `.baixa_qualidade`** nunca são produzidos por nenhum endpoint atual — parecem valores reservados para funcionalidade futura.
10. ~~**Health checks (`/health/database`, `/health/orthanc`) retornam valores fixos**, não testam a conexão real.~~ **✅ RESOLVIDO em 2026-07-15 (sub-fase 6.5.1, commit `c9a160d`):** ambos agora fazem uma checagem real (`SELECT 1` no banco; `listar_instancias()` no Orthanc) e retornam `status: erro` com a mensagem da exceção se a checagem falhar, sem derrubar a aplicação.
11. **Sem upload direto de arquivo DICOM** — imagens só entram via sincronização em lote assumindo que já estão no Orthanc por outro meio (não documentado no código lido).
12. **`arcada`/`lado` (query params de `/search`)** continuam sendo strings livres sem validação de vocabulário fechado — valor fora de `superior`/`inferior`/`direito`/`esquerdo` é silenciosamente ignorado. *(A parte de `decisao_final` desta lacuna foi resolvida em 2026-07-15, sub-fase 6.5.1 — ver item 13 e a seção 3.)*
13. ~~**Validação de senha inconsistente:** scripts CLI exigem ≥8 caracteres; o endpoint `POST /users/` não tem essa validação.~~ **✅ RESOLVIDO em 2026-07-15 (sub-fase 6.5.1, commit `c9a160d`):** `POST /users/` agora rejeita senha com menos de 8 caracteres (422), alinhado com os scripts CLI. Também foi resolvido, no mesmo commit, que `decisao_final` (`POST /curation/reviews/{id}/respond`) deixou de ser texto livre e passou a validar contra o Enum `DecisaoRevisao` (`aprovar`/`descartar`/`manter`) — note que isso **não** resolve a lacuna nº 8 (o `Curation.status` continua não sendo atualizado automaticamente a partir da decisão do revisor).
14. **Frontend:** não há nada implementado além do scaffold padrão do Next.js — nenhuma tela, autenticação, ou chamada de API.

---

## 7. Sugestões de frontend por funcionalidade

> Reforçando: estas são **sugestões de interface baseadas no que o backend já permite**, não novos recursos. Onde o backend tem uma lacuna (seção 6), a sugestão de UI é marcada como **bloqueada** até a lacuna ser resolvida, ou descrita como "desabilitada"/"não aplicável".

### 7.1 Autenticação
- Tela de login (e-mail + senha) chamando `POST /auth/login`; guardar token em memória/storage seguro.
- Exibir nome e perfil do usuário logado (via `GET /auth/me`) no cabeçalho.
- Botão "Sair" que apenas descarta o token localmente (não há endpoint de logout no backend).
- **Bloqueado:** tela de "esqueci minha senha" ou troca de senha pelo próprio usuário — não há endpoint para isso hoje.

### 7.2 Gestão de usuários (só visível para perfil `administrador`)
- Tabela listando usuários (`GET /users/`): nome, e-mail, perfil, instituição, ativo/bloqueado.
- Formulário/modal de criação de usuário (`POST /users/`): nome, e-mail, senha, perfil (select com os 6 valores), instituição. Validar no client que a senha tem ao menos 8 caracteres antes de enviar, já que o backend rejeita com 422 abaixo disso (desde 2026-07-15).
- Botão de alternar bloqueio por linha (`PATCH /users/{id}/block`), com confirmação, já que é toggle e não uma ação unidirecional.
- **Bloqueado/ausente:** botão de editar dados de um usuário existente, botão de excluir usuário, tela de detalhe de um usuário individual — nenhum desses tem endpoint de suporte.

### 7.3 Fila de curadoria (perfis `administrador`/`suporte`)
- Lista/fila das imagens pendentes (`GET /curation/pending`), com paginação (skip/limit).
- Botão "Abrir no visualizador" por item, usando `GET /curation/{id}/viewer-url` — se `abrivel: false`, desabilitar o botão e mostrar o `motivo`.
- Formulário de criação de ficha de curadoria (`POST /curation/{orthanc_reference_id}`) com todos os campos do `CurationCreate`: tipo de radiografia (select fixo), seletor de dentes (ex.: odontograma clicável restrito a FDI 11–48), faixa de idade, gênero, achado principal, texto de achados, qualidade técnica, dificuldade, descrição didática, observações internas, finalidade.
- **Bloqueado/ausente:** tela de "ver ficha existente" com todos os campos e o histórico de alterações — não há `GET /curation/{id}` nem endpoint de histórico. Sem isso, não dá para construir uma tela de detalhe/edição da ficha.

### 7.4 Aprovação / descarte
- Botão "Aprovar" abrindo modal que exige marcar explicitamente "anonimização validada" (checkbox obrigatório) + campo de observações opcional (`POST /curation/{id}/approve`) — a UI deve deixar claro que sem esse checkbox marcado a aprovação será rejeitada pelo backend.
- Botão "Descartar" abrindo modal com campo de motivo obrigatório (`POST /curation/{id}/discard`) — validar não-vazio no client, já que o backend rejeita motivo vazio.
- Indicar visualmente que ambas as ações são **definitivas** (não há endpoint para reverter de `aprovada`/`descartada` de volta a outro status).

### 7.5 Segunda opinião
- Botão "Solicitar segunda opinião" com campo de motivo obrigatório e parecer inicial opcional (`POST /curation/{id}/request-review`).
- Fila de solicitações pendentes de resposta — **ausente no backend**: não há `GET` que liste `CurationReview` por status; a UI precisaria ser alimentada de outra forma (ex.: derivar da lista de fichas com `status == segunda_opiniao`, se um endpoint de listagem de fichas por status existir — hoje não existe um `GET /curation?status=` genérico).
- Tela/modal de resposta do revisor: parecer, concordância (`concorda`/`discorda` como radio/select fechado), decisão final (select fechado com os 3 valores do Enum `DecisaoRevisao`: `aprovar`/`descartar`/`manter` — validado pelo backend desde 2026-07-15), observações. A UI deve impedir que o próprio solicitante veja o botão de responder (embora o backend já bloqueie com 403, é melhor UX esconder a ação).
- **Observação importante para a UI:** como o backend não fecha o ciclo (não há passo que aplique a decisão final de volta à ficha), a interface precisa deixar claro ao usuário que responder a segunda opinião **não muda o status da ficha automaticamente** — pode ser necessário um aviso ou um botão adicional de "aplicar decisão" apontando para os endpoints de approve/discard já existentes, como passo manual seguinte.

### 7.6 Sincronização com Orthanc / imagens
- Botão "Sincronizar com Orthanc" (`POST /images/import-from-orthanc`), mostrando resultado resumido (total, novas, já existentes, erros) e, se houver erros, uma lista expansível com `orthanc_id` + mensagem.
- **Bloqueado/ausente:** tela de upload direto de arquivo DICOM pela interface — não existe endpoint para isso; qualquer upload teria que ser feito diretamente no Orthanc por fora do sistema atual.
- **Bloqueado/ausente:** listagem geral de todas as imagens (aprovadas, descartadas, pendentes, em segunda opinião juntas) — hoje só existem visões filtradas (pendentes sem ficha, ou aprovadas via busca).

### 7.7 Pesquisa pública de imagens aprovadas (todos os perfis autenticados)
- Tela de busca com filtros: tipo de radiografia, dente (seletor FDI), arcada, lado, achado principal, gênero, qualidade técnica, dificuldade, finalidade, faixa de idade — todos opcionais e combináveis.
- Grade/lista de cards de resultado com os campos retornados (`tipo_radiografia`, `dentes`, `achado_principal`, `qualidade_tecnica`, `dificuldade`, `finalidade`, `descricao_didatica`) + botão "Abrir no visualizador" usando o `viewer_url` já retornado (quando não for `null`).
- Paginação usando `total`/`skip`/`limit`.
- **Nota:** já que `arcada`/`lado` aceitam qualquer string sem validação de erro, a UI deveria restringir esses campos a um select fechado com exatamente os 2 valores válidos de cada, para não mandar valores que o backend simplesmente ignora silenciosamente.

### 7.8 Painel administrativo / indicadores (perfil `administrador`)
- Dashboard com KPIs (`GET /admin/stats`): total de imagens, total de fichas, e gráficos/contagens por status, tipo de radiografia, achado principal e dificuldade.
- Tela de auditoria (`GET /admin/audit-logs`) com filtros por usuário, ação, resultado e intervalo de datas, tabela paginada com `criado_em`, `usuario_id`, `acao`, `entidade`, `entidade_id`, `resultado`, `detalhes`.
- **Aviso atualizado (2026-07-16):** desde a sub-fase 6.5.2, o painel também mostra `login`, `falha_login`, `criacao_usuario`, `bloqueio_usuario` e `importacao_orthanc`, além das ações de curadoria. Ainda **não** aparecem tentativas de acesso negado por perfil incorreto (403) nem qualquer ação futura do frontend — a tela não deve ser vendida como "auditoria completa do sistema" até essas lacunas serem fechadas (ver seção 6, item 2).

### 7.9 Visualizador DICOM (OHIF)
- Onde quer que `viewer_url` seja retornado (curadoria e busca), abrir em nova aba/iframe apontando para o OHIF (`OHIF_BASE_URL` + `StudyInstanceUIDs=...`).
- Tratar explicitamente o caso `abrivel: false` (imagem sem `StudyInstanceUID`) com uma mensagem — não simplesmente esconder o botão sem explicação, já que o backend já devolve o motivo pronto para exibição.

---

## 8. Scripts de suporte (fora da API, mas parte do repositório)

- `criar_admin.py`: script CLI interativo para criar o primeiro administrador (roda dentro do container `radix-api`, pede nome/e-mail/senha via terminal, exige senha ≥8 caracteres e confirmação).
- `trocar_senha.py`: script CLI para trocar a senha de um usuário existente por e-mail (mesma validação de ≥8 caracteres e confirmação).
- `verificar_anonimizacao.py`: script CLI utilitário que lê um arquivo DICOM fixo (`/app/dicom_teste/DICOM/I6`) e imprime o valor de 14 tags sensíveis (nome do paciente, ID, data de nascimento, etc.) para conferência manual de anonimização — não é chamado pela API, é uma ferramenta de verificação manual.

Nenhum destes três scripts está exposto como endpoint HTTP nem é acionável pelo frontend.
