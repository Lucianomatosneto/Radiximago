# Radix Imago — Inventário de registros (logs)

| Campo | Valor |
|---|---|
| Versão do documento | 1.0 — 18/10/2026 |
| Base | OWASP ASVS 5.0: 16.1.1 (inventário); apoio a 16.2.x, 16.3.x, 16.4.x e 14.2.4 |
| Conferido com | `backend/app/modules/audit_logs.py`, `admin_router.py`, chamadas `AuditLog(...)` e `logger.*` no código, `whisper/app.py`, `docker-compose.yml` |

**Registro** é a anotação automática do que acontece no sistema: quem fez o quê, quando e com que resultado. Serve para investigar incidentes e, no Radix, também como **dado de pesquisa** (rastreabilidade da curadoria).

## 1. Onde ficam (ASVS 16.1.1)

| Registro | Onde | O que contém | Quem acessa | Retenção |
|---|---|---|---|---|
| **Auditoria** | tabela `audit_logs` (PostgreSQL) | quando (`criado_em`, com fuso), quem (`usuario_id`; vazio = o próprio sistema), o quê (`acao`, `entidade`, `entidade_id`), resultado (`sucesso`, `negado`, `erro`), detalhes | **administrador**, pela tela de auditoria (`GET /admin/audit-logs`, só leitura) | indefinida (**definir na implantação**) |
| Histórico das fichas | tabela `curation_history` | mudanças de estado com justificativa | curadoria | permanente (pesquisa) |
| Sessões | tabela `sessoes_usuario` | início, fim e motivo do encerramento | o sistema | 30 dias após encerradas |
| Saída da API | saída padrão do container `radix-api` (`docker compose logs radix-api`) | endereço de rede, método, caminho e código de cada pedido (registro de acesso do uvicorn); erros inesperados com detalhes técnicos | quem administra o servidor | **sem rotação configurada** (pendente) |
| Portaria e visualizador (nginx) | saída de `radix-orthanc-cors` e `radix-ohif` | endereço de rede, caminho (inclui UIDs de estudo **anonimizados**), código | quem administra o servidor | idem |
| Orthanc | saída de `radix-orthanc` | recebimentos DICOM, erros | quem administra o servidor | idem |
| Serviço de voz | saída de `radix-whisper` | carga do modelo, tempo, tipo do erro. **Não registra o que foi falado** | quem administra o servidor | idem |
| Backup | saída de `radix-backup` | início, fim e falhas da cópia diária | quem administra o servidor | idem |

## 2. Eventos registrados na auditoria

| Grupo | Ações (`acao`) |
|---|---|
| Autenticação | `login`, `falha_login`, `logout`, `troca_senha`, `falha_troca_senha`, `solicitacao_redefinicao_senha`, `redefinicao_senha` |
| Cadastro | `solicitacao_acesso_registrada`, `confirmacao_email_solicitacao`, `falha_confirmacao_email`, `aprovacao_solicitacao_acesso`, `rejeicao_solicitacao_acesso` |
| Usuários | `criacao_usuario`, `edicao_usuario`, `bloqueio_usuario`, `exclusao_usuario`, `atualizacao_foto_perfil`, `remocao_foto_perfil` |
| Imagens | `upload_imagem`, `upload_sem_preambulo_dicom`, `importacao_orthanc`, `anonimizacao_automatica`, `acesso_imagem_negado` |
| Curadoria | `edicao_curadoria`, `preenchimento_por_voz`, `aprovacao` (com o resultado da verificação de texto na imagem), `descarte`, `solicitacao_segunda_opiniao`, `resposta_segunda_opiniao`, `aprovacao_pos_segunda_opiniao`, `descarte_pos_segunda_opiniao` |
| Achados e erros técnicos | `criacao_achado`, `edicao_achado`, `exclusao_achado`, `criacao_erro_tecnico`, `edicao_erro_tecnico`, `exclusao_erro_tecnico` |
| Vocabulário e macros | `vocabulario_termo_criado`, `vocabulario_termo_editado`, `vocabulario_sinonimo_criado`, `vocabulario_sinonimo_removido`, `vocabulario_fichas_vinculadas`, `vocabulario_ficha_desvinculada`, `macro_criada`, `macro_editada`, `macro_desativada` |
| Compartilhamento | `compartilhamento_imagem`, `resposta_compartilhamento`, `compartilhamento_desfeito` |
| Voz | `transcricao_voz` (duração e tempo, **sem o texto**), `voz_frase_aprendida`, `voz_frase_esquecida` |

A lista acima é conferida automaticamente com o código (`tests/test_documentacao_confere.py`): ação nova sem documentação faz o teste falhar.

## 3. O que **nunca** vai para os registros (ASVS 16.2.5)

- senhas (nem erradas);
- resumos de senha;
- códigos de link;
- cookie de sessão;
- `jti`;
- conteúdo do `.env`.

Isso é comprovado por:
- `test_16_3_1_e_16_2_5` (o login não guarda a senha);
- `test_16_2_5_sem_smtp_em_producao_o_codigo_do_link_nao_vai_para_o_registro`;
- os códigos dos links vão **depois do `#`**, parte do endereço que nunca chega ao servidor, e por isso não aparecem nos registros de acesso.

**Exceções conhecidas e aceitas:**
- `falha_login` com e-mail não cadastrado guarda o **e-mail digitado**, que serve para detectar ataques. É dado pessoal (N2, `DADOS_E_PRIVACIDADE.md`).
- Em **desenvolvimento**, sem servidor de e-mail, o corpo do e-mail aparece na saída da API, para testes. Em produção, não.

## 4. Lacunas conhecidas (grupo 2 do plano do Nível 2)

| Item ASVS | Lacuna |
|---|---|
| 16.2.1 | a auditoria não guarda **de onde** veio o pedido (endereço de rede) |
| 16.3.2 | acesso negado por perfil (403) não é registrado, exceto nas imagens |
| 16.3.3 | pedidos barrados por excesso (429), validação ou origem não autorizada não são registrados |
| 16.3.4 | erros inesperados ficam só na saída do container, sem visão central |
| 16.2.4 | saída dos containers em texto livre, sem formato estruturado |
| 16.4.2 | quem tem acesso direto ao banco pode alterar a tabela de auditoria |
| 16.4.3 | registros no mesmo servidor e banco da aplicação (implantação) |
| 14.2.4 | prazo de retenção da auditoria e rotação da saída dos containers não definidos |

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 18/10/2026 | Criação (auditoria OWASP ASVS 5.0, Nível 2) |
