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
| **Auditoria** | tabela `audit_logs` (PostgreSQL) | quando (`criado_em`, com fuso), quem (`usuario_id`; vazio = o próprio sistema), **de onde** (`ip`, `rota`), o quê (`acao`, `entidade`, `entidade_id`), resultado (`sucesso`, `negado`, `alerta` (a verificação de integridade achou problema; desde 01/11/2026), `erro`), detalhes e **lacre** encadeado | **administrador**, pela tela de auditoria (`GET /admin/audit-logs`, só leitura) | **5 anos**, apagados automaticamente depois disso (`app/modules/retencao.py`; mesmo prazo de guarda de dados de pesquisa da Res. CNS 466/2012) |
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
| Cadastro | `solicitacao_acesso_registrada`, `confirmacao_email_solicitacao`, `falha_confirmacao_email`, `aprovacao_solicitacao_acesso`, `aprovacao_automatica_solicitacao` (só estudante, liberado ao confirmar o e-mail, desde 01/11/2026; antes também professor e pesquisador), `rejeicao_solicitacao_acesso`, `solicitacao_duplicada_descartada` (o e-mail confirmado já tinha conta; o pedido não vai para a fila, desde 01/11/2026), `falha_envio_email` (e-mail de confirmação ou de redefinição de senha não saiu — só o tipo do erro, sem o link; desde 01/11/2026, só depois de 3 tentativas quando a falha é passageira; o Painel administrativo mostra as dos últimos 7 dias) |
| Usuários | `criacao_usuario`, `edicao_usuario`, `bloqueio_usuario`, `desbloqueio_usuario` (desde 01/11/2026; antes a reativação também ficava como `bloqueio_usuario`, com "foi desbloqueado" nos detalhes), `exclusao_usuario`, `atualizacao_foto_perfil`, `remocao_foto_perfil` |
| Segurança (automáticos, `app/core/registro_seguranca.py`) | `acesso_negado`, `origem_recusada`, `limite_excedido`, `entrada_recusada`, `erro_inesperado` (desde 01/11/2026, com **código de referência**, o mesmo da mensagem mostrada ao usuário e do registro do servidor; `banco_desatualizado` quando falta a atualização do banco e a resposta é 503), `verificacao_integridade_auditoria` |
| Imagens | `upload_imagem`, `upload_sem_preambulo_dicom`, `importacao_orthanc`, `anonimizacao_automatica`, `acesso_imagem_negado`, `imagem_girada` (curador, com o ângulo e os arquivos antigo e novo), `moldura_recortada` (roteiro `recortar_molduras.py`), `curadorias_zeradas` (roteiro `zerar_curadorias.py`, com a quantidade apagada de cada tabela), `prancha_gerada` e `prancha_enviada_email` (prancha de estudo: quantas imagens, quantas por folha e quais fichas) |
| Curadoria | `edicao_curadoria`, `preenchimento_por_voz`, `aprovacao` (com o resultado da verificação de texto na imagem), `descarte`, `solicitacao_segunda_opiniao`, `resposta_segunda_opiniao`, `aprovacao_pos_segunda_opiniao`, `descarte_pos_segunda_opiniao`, `anotacao_segunda_opiniao_incorporada` e `anotacao_segunda_opiniao_dispensada` (o que quem pediu a segunda opinião fez com cada anotação do revisor; o efeito na ficha fica também no histórico da curadoria) |
| Achados e erros técnicos | `criacao_achado`, `edicao_achado`, `exclusao_achado`, `criacao_erro_tecnico`, `edicao_erro_tecnico`, `exclusao_erro_tecnico` |
| Segmentação (pintura de estruturas) | `segmentacao_criada`, `segmentacao_alterada`, `segmentacao_apagada` (estrutura, dente e quantos pixels foram pintados — **sem a imagem**) |
| Vocabulário e macros | `vocabulario_termo_criado`, `vocabulario_termo_editado`, `vocabulario_sinonimo_criado`, `vocabulario_sinonimo_removido`, `vocabulario_fichas_vinculadas`, `vocabulario_ficha_desvinculada`, `macro_criada`, `macro_editada`, `macro_desativada` |
| Pastas de pacientes (dados identificados) | `caso_criado`, `caso_visualizado` (cada abertura da pasta; nas fotos, no máximo uma linha a cada 10 min por pessoa), `caso_acesso_negado`, `caso_foto_baixada`, `caso_revisado` (versão), `caso_dados_alterados` (quais campos, nunca os valores), `caso_compartilhado`, `caso_compartilhamento_removido` (deixar de compartilhar; quem compartilhou, quem recebeu ou curador), `caso_link_enviado`, `caso_encaminhado_curador`, `caso_classificado`, `caso_encaminhado_aluno`, `caso_concluido`, `caso_tratamento_reaberto` (desfaz o "concluído"; só professor/curador), `caso_acesso_justificado` (administrador informa o motivo para abrir uma pasta; o motivo vai nos detalhes; vale 30 min, só aquela pasta, somente leitura), `caso_fila_supervisao` e `caso_tratamentos_supervisao` (administrador consultou a fila e os tratamentos, sem dados do paciente). Consultados em `/casos/registro-acessos` (administrador, curador, professor), sem o nome do paciente |
| Limpeza de dados de demonstração | `limpeza_dados_demo` (gravada pelo script `scripts/limpar_dados_demo.py` quando roda com `--executar`; detalhes: quantos usuários, pastas, compartilhamentos e arquivos saíram — nunca nomes) |
| Curadoria reaberta | `curadoria_reaberta` e, no histórico da ficha, `reabertura_edicao` (curador reabre uma ficha aprovada ou descartada para editar depois do envio; status anterior e novo) |
| Sugestões de melhoria | `sugestao_enviada` (com o perfil de quem enviou), `sugestao_andamento_alterado` (administrador; andamento anterior e novo) |
| Compartilhamento | `compartilhamento_imagem`, `resposta_compartilhamento`, `compartilhamento_desfeito` |
| Voz | `transcricao_voz` (duração e tempo, **sem o texto**), `voz_frase_aprendida`, `voz_frase_esquecida` |

A lista acima é conferida automaticamente com o código (`tests/test_documentacao_confere.py`): ação nova sem documentação faz o teste falhar.

**Endereço de rede (01/11/2026, M6):**
- No **servidor** e no **túnel**, a API grava o endereço real de quem acessou. Ela confia no endereço informado pelo Caddy ou pela Cloudflare (`FORWARDED_ALLOW_IPS`), porque só esses intermediários alcançam a API.
- O Nginx do visualizador agora repassa esse endereço na conferência de acesso às imagens. Antes, a auditoria do visualizador gravava o endereço do próprio Nginx (172.18.0.2).
- No **computador de desenvolvimento**, o Docker não repassa o endereço real, e todos os acessos aparecem como 172.18.0.1. A tela mostra esses endereços com "(rede interna do Docker – acesso local)".
- **"Abriu a pasta"** é gravado no máximo uma vez a cada 30 segundos por pessoa e por pasta. A tela pede a pasta de novo logo depois de cada ação, e isso gerava registros duplicados no mesmo segundo.

**Na tela Auditoria (01/11/2026, M3):**
- Toda ação aparece com nome em português, como "Pasta aberta" ou "Usuário reativado", em vez do código. Os nomes ficam em `frontend/src/lib/acoesAuditoria.ts`, e o teste `test_auditoria_legivel.py` falha se uma ação documentada acima ficar sem nome.
- O filtro agrupa as ações por tema e mostra quantas vezes cada uma aparece. Ações antigas fora desta lista entram em "Outras".
- Também dá para filtrar por usuário e por período.
- "Agrupar registros iguais no mesmo segundo" junta, só na leitura, eventos repetidos, como várias recusas de acesso disparadas por uma mesma página. Todos os registros continuam gravados.
- A coluna "Sobre o quê" usa nomes padronizados, como "Ficha nº 12" ou "Pasta de paciente nº 1".
- Os detalhes aparecem rotulados: o que aconteceu, o pedido (rota), o endereço de rede e o número do registro.

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
| 16.4.2 — proteção contra alteração | **(a)** o banco **recusa** alterar qualquer registro e só deixa apagar os que passaram do prazo de guarda (gatilho `radix_auditoria_protegida`); **(b)** cada registro tem um **lacre** (SHA-256 do conteúdo + lacre do anterior), calculado **pelo banco**. Se alguém com superusuário desligar a proteção e mudar um registro, a corrente quebra e `GET /admin/audit-logs/integridade` aponta qual. **(c) Gravações simultâneas (01/11/2026):** o número (`id`) do registro passou a ser dado **dentro** da trava do lacre (migração `f5d1b3a7c9e2`). Antes, dois pedidos ao mesmo tempo podiam entrar na corrente fora da ordem dos números. Foi isso que gerou os 4 "problemas" vistos em 25/10 (registros 6309 a 6316), sem nenhum registro alterado. Esses elos antigos **não foram reescritos**: a verificação confere cada um com o lacre de um vizinho próximo (até 20 registros antes ou depois) e informa à parte, como "fora de ordem por pedidos simultâneos". Conteúdo alterado ou registro apagado continua sendo denunciado. A Auditoria e o Painel administrativo mostram o resultado da última verificação e o botão **Verificar agora** | `test_16_4_2_...` (2 testes, inclusive adulteração simulada); `test_auditoria_integridade_concorrente.py` (corrida com 6 gravadores, elo antigo fora de ordem, adulteração desse elo) |
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
