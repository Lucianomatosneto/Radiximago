# Auditoria 02 — Autenticação, permissões e anonimização DICOM

- **Data:** 12/11/2026
- **Código analisado:** branch `redesign-ui`, commit `bebd516` (leitura do código; nenhum arquivo do Radix foi alterado)
- **Modo:** somente leitura. Sem dados reais, sem acesso à produção, sem testes destrutivos.
- **Base de evidências:** leitura de `core/security.py`, `core/sessao.py`, `core/rate_limit.py`, `core/acesso_imagens.py`, `modules/auth.py`, `mfa.py`, `images_router.py`, `orthanc_client.py`, `anonimizacao_automatica.py`, `texto_na_imagem.py`, `segmentacoes_router.py`, `anotacoes_router.py`, `search_router.py`; varredura das guardas de perfil em todos os roteadores; relatório automático de 12/11 (604/604 testes; Semgrep e Gitleaks validados) e relatório do ZAP passivo.
- **Teste novo desta auditoria:** `auditoria/testes_api/test_anonimizacao_falhas.py` (Orthanc FALSO, sem rede): 2 passam, 2 reprovam de propósito (marcados `xfail`) e comprovam o M-02.

## Resumo

Autenticação e permissões estão **bem construídas** para o porte do projeto. Na anonimização, o desenho é bom, mas há **uma falha de robustez confirmada (M-02)** que, num cenário de falha do Orthanc, pode deixar a imagem ORIGINAL com dados do paciente guardada. Nenhum achado CRÍTICO.

## Pontos fortes (CONFIRMADOS na leitura do código)

| Área | O que está certo |
|---|---|
| Senhas | Argon2id; senhas antigas em bcrypt são regravadas no login; lista de senhas comuns e vazadas; senha igual ao e-mail ou nome é recusada |
| Token | JWT com `exp`, `iss`, `aud`, `tipo` e `jti` obrigatórios; chave mínima de 256 bits imposta na inicialização |
| Sessão | Cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; sessão revogável; logout e redefinição de senha encerram sessões |
| MFA | TOTP obrigatório para administrador, suporte e curador; segredo cifrado (Fernet); “vale” de 5 minutos entre senha e código |
| Recuperação | Token de 32 bytes, só o resumo SHA-256 no banco, código no `#` da URL, validade, uso único, resposta genérica |
| Limite de uso | 5/min no login, 3/min no esqueci-senha, 600/min geral por conta |
| Permissões | Guarda por perfil em 100% das rotas administrativas; só imagens APROVADAS para estudantes/pesquisadores; proxy do Orthanc com `auth_request` e regras por perfil; autor confere a própria anotação |
| Anonimização | Perfil DICOM PS3.15; datas só com ano; idade 90+ agrupada; sequência de equipamento removida; OCR + tarja nos pixels; “anonimização validada” obrigatória na aprovação; limite do OCR declarado honestamente |

## Achados

| ID | Severidade | Status | Achado e evidência |
|---|---|---|---|
| **M-02** | **MÉDIO** (LGPD) | **CONFIRMADO** (código + teste com Orthanc falso) | Em `images_router.py` `_anonimizar_e_excluir_original`: (a) a exclusão do original, nos ramos de erro, está em `try/except: pass` (falha silenciosa, sem log); (b) no caminho normal a exclusão do original NÃO é protegida: se falhar, a exceção sobe, a cópia anonimizada já criada fica **sem registro** no banco e o **original identificável permanece no Orthanc**. Na rotina automática (a cada 60 s), o original não registrado é reprocessado, gerando cópias anonimizadas repetidas enquanto a falha durar. Administrador e suporte conseguem ler esse original (regra de `acesso_imagens.py`). Probabilidade depende de falha do Orthanc/rede no momento da exclusão. |
| **A-02** | **BAIXO/MÉDIO** | **CONFIRMADO no código; impacto SUSPEITA** | Login sem limite **por conta**: só 5/min por endereço de rede. Ataque distribuído (muitos IPs) contra um único e-mail não é freado por contador da conta. Atenuantes reais: MFA obrigatório para os 3 perfis mais sensíveis e política de senha forte. Para estudante, professor e pesquisador o MFA é opcional. |
| **A-03** | **BAIXO** | **CONFIRMADO no código; magnitude NÃO medida** | Enumeração de e-mails por **tempo de resposta**: no login, e-mail inexistente responde sem calcular o hash (rápido), enquanto e-mail existente roda o Argon2 (lento). No “esqueci a senha”, e-mail existente envia e-mail na hora (lento) e inexistente responde logo. As mensagens são idênticas; só o tempo difere. |
| **Z-01** | **MÉDIO** | **CONFIRMADO (código) / impacto SUSPEITA** | (Do ZAP, já registrado) formulários sem `method="post"`: antes de o JS carregar, e-mail e senha podem ir na URL. |
| **Z-02** | BAIXO | CONFIRMADO | Cabeçalho `X-Powered-By: Next.js` exposto. |
| **A-01** | ALTO | CONFIRMADO (aberto) | Pillow 12.3.0 com 40 vulnerabilidades (pip-audit). Pillow é usado na anonimização (tarja e recorte), portanto está no caminho de dados de saúde. Correção pendente de autorização (Pillow 13.0.0, em branch separada). |

## Não verificado nesta auditoria (NÃO VERIFICÁVEL aqui)

- Comportamento **real** do Orthanc, do proxy Nginx/`auth_request` e do OHIF (exige Docker na sua máquina).
- Eficácia da tarja de texto em **radiografias reais** (só dá para medir com imagens de teste; existem sintéticas em `auditoria/testes/`). O limite do OCR já está declarado no código.
- Fluxo de troca de perfil/mass assignment em `users_router.py` e o aprovar-solicitação (lidos apenas por varredura de guardas, não em profundidade).
- `docker-compose.prod.yml`, Caddy e túnel (M-04, continua suspeita).
- Lógica interna de TOTP (janela, reutilização de código).

## Recomendações (nada foi alterado; cada item depende de autorização)

1. **M-02:** tratar a exclusão do original como obrigatória (registrar erro, tentar de novo, alertar a administração) e remover a cópia anonimizada órfã se a exclusão falhar. O teste `test_anonimizacao_falhas.py` vira verde quando corrigido.
2. **Z-01:** `method="post"` nos 3 formulários (e `action` neutro).
3. **Z-02:** `poweredByHeader: false` no `next.config`.
4. **A-02:** contador de falhas por conta com espera progressiva (sem bloquear a conta de vez, para não permitir bloqueio por terceiros).
5. **A-03:** calcular um hash “de mentira” quando o e-mail não existe e enviar o e-mail de redefinição em segundo plano.
6. **A-01:** atualizar o Pillow em branch separada, com os 604 testes.

## Comparação com a auditoria anterior

Continuam abertos: A-01, M-01 (mitigado), M-04 (suspeita), S-02 (suspeita). M-02 passa de “suspeita” para **CONFIRMADO**. M-03 e M-05 não foram reexaminados. Novos: A-02, A-03, Z-01 a Z-06.

> Nenhum problema é considerado resolvido sem reteste. Os resultados do SonarCloud (main) não foram usados como evidência.

---

## Adendo — verificação em execução e configuração de infraestrutura (12/11/2026, máquina do responsável)

**Como foi feito:** o responsável rodou comandos de leitura no PowerShell (`docker compose ps` e 5 pedidos HTTP sem login); a configuração foi lida nos arquivos da pasta do projeto (`docker-compose*.yml`, `orthanc/`, `caddy/Caddyfile`). Nenhuma senha foi exibida. Nada foi alterado.

| ID | Severidade | Status | Achado |
|---|---|---|---|
| I-01 | — (ponto forte) | **CONFIRMADO em execução** | Os 8 serviços estão ativos. Sem login, `GET /patients`, `/studies`, `/instances`, `/system` e `/app/explorer.html` na porta 8042 (proxy do Orthanc) retornam **401**. Banco (5432) e Whisper (9000) não são publicados para fora do Docker. A porta 8042 do Orthanc em si não é publicada. |
| I-02 | — (ponto forte) | **CONFIRMADO na configuração** | Orthanc com autenticação ligada, `DICOM_ALWAYS_ALLOW_STORE=false`, `DICOM_ALWAYS_ALLOW_ECHO=false` e `DICOM_CHECK_MODALITY_HOST=true`: só aparelhos cadastrados e com endereço conferido enviam imagens. |
| I-03 | — (ponto forte) | **CONFIRMADO na configuração** | Em produção (`docker-compose.prod.yml`) todas as portas internas são zeradas (`!reset []`) e só o Caddy publica 80/443; o Caddy bloqueia `/health/database` e `/health/orthanc` com 404. |
| **M-03** | **MÉDIO** | **CONFIRMADO** | Contêiner em execução usa `orthancteam/orthanc:latest` (recriado há 3 dias): a versão do Orthanc pode mudar sem aviso e alterar o comportamento da anonimização, que é testada na 1.12.2. `cloudflare/cloudflared:latest` também sem versão fixa. (OHIF está fixo em v3.9.2.) |
| I-04 | BAIXO | **CONFIRMADO na configuração; impacto SUSPEITA** | No modo de desenvolvimento, as portas 3000, 3001, 4242, 8000 e 8042 são publicadas em `0.0.0.0` (todas as interfaces). Em rede compartilhada, outras máquinas podem alcançá-las, a depender do firewall do Windows. Em produção isso não ocorre. |
| **M-04** | **BAIXO (reduzido)** | **PARCIALMENTE VERIFICADO** | `docker-compose.prod.yml` e `Caddyfile` lidos: bem configurados. Resta o **modo túnel** (`docker-compose.tunel.yml`, demonstração pela internet a partir do PC): ele NÃO zera as portas e não passa pelo Caddy, então o bloqueio de `/health/database` e `/health/orthanc` pode não valer nesse modo (depende das regras no painel da Cloudflare). O túnel estava desligado na verificação; **NÃO VERIFICÁVEL** hoje. Cuidado de processo: no modo túnel o banco local fica acessível pela internet, portanto nunca com dados reais. |

**Ainda não verificado:** versão exata do Orthanc em execução (`docker compose exec radix-orthanc ...`), logs do Orthanc, anonimização de uma imagem de teste ponta a ponta, e o túnel ligado.
