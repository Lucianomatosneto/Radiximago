# Radix Imago — Dados, classificação e privacidade

| Campo | Valor |
|---|---|
| Versão do documento | 1.0 — 18/10/2026 |
| Responsável | Luciano de Matos Neto (PPGINFOS/UFSC) |
| Base | OWASP ASVS 5.0: 14.1.1, 14.1.2, 8.1.2 e 14.2.4; LGPD (Lei 13.709/2018), art. 5º, 6º, 11, 12, 13 e 46 |
| Conferido com | código do commit em que este arquivo entrou: modelos em `backend/app/modules/*.py`, rotas e `docker-compose.yml` |

O Radix Imago é uma plataforma **acadêmica** de ensino e pesquisa com radiografias odontológicas **anonimizadas**. Não é sistema assistencial, não emite laudo e não substitui prontuário.

## 1. Níveis de proteção

| Nível | O que é | Exemplos no Radix |
|---|---|---|
| **N4 — Dado pessoal sensível de saúde identificável** (LGPD art. 5º II e art. 11) | imagem ou dado que permite saber **de quem** é o exame | arquivo DICOM **original**, antes da anonimização (nome, ID, nascimento, texto gravado na imagem) |
| **N3 — Segredo** | permite se passar por alguém ou entrar no sistema | resumo da senha, código de redefinição/confirmação, sessão (JWT e `jti`), chaves e senhas do `.env` |
| **N2 — Dado pessoal** (LGPD art. 5º I) | identifica um usuário do sistema | nome, e-mail, instituição, foto de perfil, registros de auditoria com e-mail digitado |
| **N1 — Dado acadêmico interno** | conteúdo de trabalho, não identifica paciente | fichas de curadoria, observações internas, pareceres, anotações, recados de compartilhamento |
| **N0 — Dado acadêmico liberado** | pode ser visto por todos os usuários logados | imagem **anonimizada** com ficha **aprovada** (descrição didática, achados) |

> Imagem anonimizada (ano do exame, idade e sexo) é tratada no Radix como **dado anonimizado**. A LGPD (art. 12) só a considera fora do seu alcance se a reidentificação não for possível "com esforço razoável". Por isso a análise formal de risco de reidentificação continua **pendente**, com o orientador e o CEP, antes de imagens de pacientes reais (ver `claude/auditoria/resultados_testes_dicom.md`).

## 2. Inventário: onde cada dado fica

| Dado | Onde fica | Nível | Retenção |
|---|---|---|---|
| DICOM original identificável | Orthanc, **por segundos ou minutos**: apagado logo após a anonimização; imagens do aparelho são anonimizadas em até `ANONIMIZACAO_AUTOMATICA_SEGUNDOS` (60 s) | N4 | não é retido |
| DICOM anonimizado | Orthanc (volume `orthanc_data`); referência em `orthanc_references` | N0/N1 | enquanto houver uso acadêmico; desativação lógica (`ativo=false`) |
| Usuário: nome, e-mail, instituição, perfil, foto | `users`; foto em `backend/uploads/avatars` (nome gerado pelo servidor) | N2 | conta excluída fica marcada (`excluido`), sem apagar o histórico |
| Resumo da senha | `users.senha_hash` (bcrypt, custo 12) | N3 | substituído a cada troca |
| Código de redefinição de senha | `users.reset_token` — **só o resumo SHA-256** | N3 | 60 min, uso único |
| Pedido de acesso (nome, e-mail, instituição, motivo, resumo da senha) | `access_requests` — código de confirmação só como resumo SHA-256 | N2/N3 | mantido como histórico da decisão |
| Sessões (`jti`, início, fim, motivo) | `sessoes_usuario` | N3 | apagadas 30 dias após encerradas |
| Fichas, achados, erros técnicos, histórico, segunda opinião | `curations`, `achados`, `erros_tecnicos`, `curation_history`, `curation_reviews` | N0/N1 | permanente (rastreabilidade científica) |
| Observações internas da ficha | `curations.observacoes_internas` | N1 | permanente |
| Anotações pessoais | `anotacoes_imagem` (de cada usuário) | N1 | até o usuário apagar |
| Imagens salvas e compartilhamentos (recados) | `saved_images`, `compartilhamentos_imagem` | N1 | até o usuário apagar/desfazer |
| Vocabulário, macros, frases de voz | `termos_vocabulario`, `sinonimos_termo`, `macros_curadoria`, `frases_aprendidas_voz` | N1 | permanente |
| Áudio da curadoria por voz | **não é gravado**: vai à memória do serviço de voz, vira texto e é descartado | N1 | não é retido |
| Registros de auditoria (inclui endereço de rede de quem agiu) | `audit_logs` (ver `docs/REGISTROS.md`) | N2 | **5 anos**, apagados automaticamente; protegidos contra alteração (lacre) |
| Cópias de segurança | `./backups` no servidor (Postgres e Orthanc), diárias, 14 mais recentes | igual à origem (até N3) | 14 dias; **sem criptografia e sem cópia fora do servidor** (pendente) |

## 3. Requisitos de proteção por nível (ASVS 14.1.2)

| Proteção | N4 | N3 | N2 | N1 | N0 |
|---|---|---|---|---|---|
| Quem acessa | ninguém pela aplicação | ninguém lê o valor; só o sistema confere | o próprio usuário e o administrador | perfis da curadoria (e o dono, nas anotações e nos recados) | todos os logados |
| Criptografia em trânsito | rede interna; **HTTPS na implantação** (risco aceito) | idem | idem | idem | idem |
| Guardado como | não é guardado | resumo (bcrypt/SHA-256) ou só no `.env` | texto no banco | texto no banco | texto no banco |
| Cache do navegador | — | cookie `HttpOnly` | `no-store` | `no-store` | `no-store`; imagens com cache próprio |
| Pode ir para registro (log) | nunca | nunca | só o necessário (e-mail em falha de login) | não | não |
| Pode sair do sistema | nunca | nunca | e-mail transacional ao próprio dono | não | sim: download e e-mail, pelo próprio usuário |
| Retenção | apagado na anonimização | prazos da seção 2 | seção 2 | seção 2 | seção 2 |

**Testes que comprovam parte desta tabela:**
- `test_exposicao_de_dados.py`: N3 nunca sai em resposta; N1 não sai para estudante ou professor;
- `test_anonimizacao_regras.py` e `resultados_testes_dicom.md`: N4 não é retido;
- `test_politica_senha.py` e `test_password_reset.py`: N3 só como resumo.

## 4. Acesso por campo (ASVS 8.1.2)

Perfis (`backend/app/modules/auth.py`):
- administrador;
- suporte;
- curador;
- professor;
- pesquisador;
- estudante.

| Recurso / campo | Estudante, pesquisador | Professor | Curador, suporte | Administrador |
|---|---|---|---|---|
| Imagem e ficha **aprovada**: tipo, dentes, achados, descrição didática, marcações | ver | ver | ver | ver |
| Ficha: **observações internas**, histórico, curador, segunda opinião | — | — | ver e editar | ver e editar |
| Ficha pendente, em análise ou descartada | — | — | ver e editar | ver e editar |
| Enviar imagem DICOM | — | sim | sim | sim |
| Sincronizar, ativar ou desativar imagens | — | — | só suporte | sim |
| Própria conta: nome, instituição, foto, senha | editar | editar | editar | editar |
| Outros usuários: nome, e-mail, perfil, situação | — | — | — | ver e editar |
| Anotações | só as **suas**; as do remetente, em leitura, quando lhe compartilham uma imagem | idem | idem | idem |
| Compartilhamento: o remetente vê o **e-mail que ele mesmo digitou**; o destinatário vê só o **nome** do remetente | | | | |
| Registros de auditoria | — | — | — | ver (nunca editar ou apagar pela aplicação) |
| Resumo da senha, códigos, `jti` | nunca | nunca | nunca | nunca |

**Implementação:**
- **por função:** `exigir_perfis(PERFIS_*)` em cada rota;
- **por dado:** filtro de dono, como `AnotacaoImagem.usuario_id == usuario.id`, e filtro de status `aprovada` na busca;
- **por campo:** cada rota monta a resposta com campos escolhidos, sem devolver o objeto inteiro do banco.

**Prova automática:** `tests/test_exposicao_de_dados.py`.

## 5. Direitos do titular (LGPD art. 18) — situação atual

| Direito | Como é atendido hoje |
|---|---|
| Confirmação, acesso e correção | o usuário vê e edita nome, instituição e foto; o administrador corrige o restante |
| Eliminação | exclusão de conta pelo administrador (marca `excluido`, bloqueia o acesso e mantém a trilha de auditoria por obrigação de rastreabilidade) |
| Informação sobre compartilhamento | não há compartilhamento com terceiros; o e-mail sai pelo servidor SMTP configurado |

**Pendências registradas:**
- criptografia e cópia externa dos backups;
- termo de uso e privacidade para os usuários;
- análise de risco de reidentificação (orientador/CEP).

## 6. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 18/10/2026 | Criação (auditoria OWASP ASVS 5.0, Nível 2) |
