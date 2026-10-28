# Radix Imago — Inventário de registros (logs)

| Campo | Valor |
|---|---|
| Versão do documento | 1.3 — 20/10/2026 |
| Base | OWASP ASVS 5.0: 16.1.1 (inventário); apoio a 16.2.x, 16.3.x, 16.4.x e 14.2.4 |
| Conferido com | `backend/app/modules/audit_logs.py`, `admin_router.py`, chamadas `AuditLog(...)` e `logger.*` no código, `whisper/app.py`, `docker-compose.yml` |

**Registro** é a anotação automática do que acontece no sistema: quem fez o quê, quando e com que resultado. Serve para investigar incidentes e, no Radix, também como **dado de pesquisa** (rastreabilidade da curadoria).

## 1. Onde ficam (ASVS 16.1.1)

| Registro | Onde | O que contém | Quem acessa | Retenção |
|---|---|---|---|---|
| **Auditoria** | tabela `audit_logs` (PostgreSQL) | quando (`criado_em`, com fuso), quem (`usuario_id`; vazio = o próprio sistema), **de onde** (`ip`, `rota`), o quê (`acao`, `entidade`, `entidade_id`), resultado (`sucesso`, `negado`, `erro`), detalhes e **lacre** encadeado | **administrador**, pela tela de auditoria (`GET /admin/audit-logs`, só leitura) | **5 anos**, apagados automaticamente depois disso (`app/modules/retencao.py`; mesmo prazo de guarda de dados de pesquisa da Res. CNS 466/2012) |
| Histórico das fichas | tabela `curation_history` | mudanças de estado com justificativa | curadoria | permanente (pesquisa) |
| Sessões | tabela `sessoes_usuario` | início, fim e motivo do encerramento | o sistema | 30 dias após encerradas |
| Saída da API | saída padrão do container `radix-api` (`docker compose logs radix-api`) | em **JSON**, uma linha por evento (`app/core/registro_json.py`): horário UTC, nível, origem e mensagem. Inclui endereço de rede, método, caminho e código de cada pedido (uvicorn) e erros inesperados com o rastro técnico | quem administra o servidor | **até 5 arquivos de 10 MB por serviço** (`x-registros` no `docker-compose.yml`); os mais antigos são descartados |
| Portaria e visualizador (nginx) | saída de `radix-orthanc-cors` e `radix-ohif` | endereço de rede, caminho (inclui UIDs de estudo **anonimizados**), código | quem administra o servidor | idem |
| Orthanc | saída de `radix-orthanc` | recebimentos DICOM, erros | quem administra o servidor | idem |
| Serviço de voz | saída de `radix-whisper` | carga do modelo, tempo, tipo do erro. **Não registra o que foi falado** | quem administra o servidor | idem |
| Backup | saída de `radix-backup` | início, fim e falhas da cópia diária | quem administra o servidor | idem |

## 2. Eventos registrados na auditoria

| Grupo | Ações (`acao`) |
|---|---|
| Autenticação | `login` (com "com segundo fator" nos detalhes quando houve código), `falha_login`, `logout`, `troca_senha`, `falha_troca_senha`, `solicitacao_redefinicao_senha`, `redefinicao_senha` |
| Login em duas etapas | `falha_segundo_fator`, `segundo_fator_ativado`, `segundo_fator_desativado`, `codigo_recuperacao_usado`, `novos_codigos_recuperacao`, `segundo_fator_redefinido_pelo_admin`, `segundo_fator_redefinido_pelo_servidor` (roteiro `redefinir_segundo_fator.py`) |
| Sessões | `encerramento_sessao_pelo_usuario`, `encerramento_outras_sessoes` ("Meus acessos"), `encerramento_sessoes_pelo_admin`, `encerramento_sessoes_de_todos` |
| Cadastro | `solicitacao_acesso_registrada`, `confirmacao_email_solicitacao`, `falha_confirmacao_email`, `aprovacao_solicitacao_acesso`, `aprovacao_automatica_solicitacao` (estudante, professor e pesquisador liberados ao confirmar o e-mail), `rejeicao_solicitacao_acesso` , `falha_envio_email` (e-mail de confirmação ou de redefinição de senha não saiu — só o tipo do erro, sem o link) |
| Usuários | `criacao_usuario`, `edicao_usuario`, `bloqueio_usuario`, `exclusao_usuario`, `atualizacao_foto_perfil`, `remocao_foto_perfil` |
| Segurança (automáticos, `app/core/registro_seguranca.py`) | `acesso_negado`, `origem_recusada`, `limite_excedido`, `entrada_recusada`, `erro_inesperado`, `verificacao_integridade_auditoria` |
| Imagens | `upload_imagem`, `upload_sem_preambulo_dicom`, `importacao_orthanc`, `anonimizacao_automatica`, `acesso_imagem_negado`, `imagem_girada` (curador, com o ângulo e os arquivos antigo e novo), `moldura_recortada` (roteiro `recortar_molduras.py`), `curadorias_zeradas` (roteiro `zerar_curadorias.py`, com a quantidade apagada de cada tabela), `prancha_gerada` e `prancha_enviada_email` (prancha de estudo: quantas imagens, quantas por folha e quais fichas) |
| Curadoria | `edicao_curadoria`, `preenchimento_por_voz`, `aprovacao` (com o resultado da verificação de texto na imagem), `descarte`, `solicitacao_segunda_opiniao`, `resposta_segunda_opiniao`, `aprovacao_pos_segunda_opiniao`, `descarte_pos_segunda_opiniao`, `anotacao_segunda_opiniao_incorporada` e `anotacao_segunda_opiniao_dispensada` (o que quem pediu a segunda opinião fez com cada anotação do revisor; o efeito na ficha fica também no histórico da curadoria) |
| Achados e erros técnicos | `criacao_achado`, `edicao_achado`, `exclusao_achado`, `criacao_erro_tecnico`, `edicao_erro_tecnico`, `exclusao_erro_tecnico` |
| Segmentação (pintura de estruturas) | `segmentacao_criada`, `segmentacao_alterada`, `segmentacao_apagada` (estrutura, dente e quantos pixels foram pintados — **sem a imagem**) |
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
- segredo do aplicativo autenticador, códigos de 6 números e códigos de recuperação;
- conteúdo do `.env`.

Isso é comprovado por:
- `test_16_3_1_e_16_2_5` (o login não guarda a senha);
- `test_16_2_5_sem_smtp_em_producao_o_codigo_do_link_nao_vai_para_o_registro`;
- os códigos dos links vão **depois do `#`**, parte do endereço que nunca chega ao servidor, e por isso não aparecem nos registros de acesso.

**Exceções conhecidas e aceitas:**
- `falha_login` com e-mail não cadastrado guarda o **e-mail digitado**, que serve para detectar ataques. É dado pessoal (N2, `DADOS_E_PRIVACIDADE.md`).
- Em **desenvolvimento**, sem servidor de e-mail, o corpo do e-mail aparece na saída da API, para testes. Em produção, não.

## 4. Proteções dos registros (grupo 2 do Nível 2, 18/10/2026)

| Item ASVS | Como é atendido | Comprovação |
|---|---|---|
| 16.2.1 — quando, onde, quem, o quê | todo registro de auditoria ganha `ip` e `rota` automaticamente, a partir do pedido em andamento (`app/core/contexto_pedido.py`) | `test_16_2_1_registro_guarda_ip_e_rota` |
| 16.3.2 — acesso negado | resposta 403 → `acesso_negado`, com usuário e rota; as imagens já tinham `acesso_imagem_negado` | `test_16_3_2_acesso_negado_por_perfil_e_registrado` |
| 16.3.3 — tentativas de burlar controles | 429 → `limite_excedido`; pedido de outro site → `origem_recusada`; dado recusado (422) → `entrada_recusada`. **Freio:** o mesmo evento, do mesmo endereço e na mesma rota, é gravado no máximo **1 vez por minuto**, para que um ataque não lote o banco | `test_16_3_3_...` (2 testes) |
| 16.3.4 — erros inesperados | erro 500 → `erro_inesperado` na auditoria (visível ao administrador). O rastro técnico vai só para a saída do servidor; o usuário vê mensagem genérica | `test_16_3_4_...` |
| 16.2.4 — formato legível por ferramentas | auditoria em colunas (consultável) e saída dos containers em JSON | `test_16_2_4_saida_do_servidor_em_json` |
| 16.2.3 — só nos destinos documentados | tabela `audit_logs` + saída dos containers com tamanho limitado (seção 1) | este documento |
| 16.4.2 — proteção contra alteração | **(a)** o banco **recusa** alterar qualquer registro e só deixa apagar os que passaram do prazo de guarda (gatilho `radix_auditoria_protegida`); **(b)** cada registro tem um **lacre** (SHA-256 do conteúdo + lacre do anterior), calculado **pelo banco**. Se alguém com superusuário desligar a proteção e mudar um registro, a corrente quebra e `GET /admin/audit-logs/integridade` aponta qual | `test_16_4_2_...` (2 testes, inclusive adulteração simulada) |
| 14.2.4 — retenção | auditoria por 5 anos; sessões por 30 dias; saída dos containers limitada a 50 MB por serviço | `test_14_2_4_prazo_de_guarda_igual_no_codigo_e_no_banco` |

**Ainda pendente (implantação):**
- **16.4.3:** enviar os registros para um sistema **separado** do servidor do Radix. Hoje ficam no mesmo banco e no mesmo disco; o lacre detecta adulteração, mas não impede quem controla o servidor inteiro;
- **13.2.2:** a aplicação usar um usuário do banco **sem** permissão de superusuário. Hoje ela poderia, em tese, desligar os gatilhos, e o lacre denunciaria.

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 18/10/2026 | Criação (auditoria OWASP ASVS 5.0, Nível 2) |
| 1.1 | 18/10/2026 | Grupo 2: ip/rota, eventos de segurança, lacre e proteção, JSON, retenção |
| 1.2 | 19/10/2026 | Ações do login em duas etapas |
| 1.3 | 20/10/2026 | Giro da imagem pelo curador e recorte da moldura branca |
