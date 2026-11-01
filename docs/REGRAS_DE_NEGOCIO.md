# Radix Imago — Regras de negócio, limites e funções pesadas

| Campo | Valor |
|---|---|
| Versão do documento | 1.2 — 20/10/2026 |
| Base | OWASP ASVS 5.0: 2.1.2, 2.1.3, 2.2.3, 2.3.2, 2.4.1, 15.1.3 e 15.2.2 |
| Conferido com | `backend/app/modules/curation/*.py`, `auth.py`, `compartilhamentos_router.py`, `search_router.py`, `voz_router.py`, `images_router.py`, `app/core/limites.py`, `app/core/rate_limit.py`, `docker-compose.yml` |

Regra de ouro: **toda regra abaixo é aplicada no servidor**. A tela pode ajudar, mas não decide. Quando uma regra é violada, a resposta é **422** (dado inválido), **409** (estado não permite) ou **429** (excesso de pedidos), e **nada é gravado pela metade**. Um pedido inteiro é uma única transação no banco, comprovada por `test_2_3_3_operacao_invalida_nao_grava_nada_pela_metade`.

## 1. Consistência entre campos (ASVS 2.1.2)

| Regra | Onde |
|---|---|
| `idade_min` ≤ `idade_max`; as duas entre 0 e 120 (na ficha **e na busca**) | `curation/ficha.py`, `search_router.py` |
| Cada marcação tem as coordenadas do próprio formato: oval e retângulo → posição e tamanho; seta → cauda e ponta | `curation/schemas.py` (`Marcacao`) |
| Dentes só na numeração FDI de permanentes (11–18, 21–28, 31–38, 41–48), sem repetição | `curation/ficha.py`, `curation/achados.py` |
| Achado com "dente não identificado" **não pode** informar dentes | `curation/achados.py` |
| Achado do tipo "Outro" **exige** descrição | `curation/achados.py` |
| Imagem com achados registrados **não pode** ser marcada como "sem alterações" | `curation/ficha.py` |
| Os resumos `dentes` e `alteracoes_observadas` da ficha **são calculados** a partir dos achados (o usuário não os define em separado) | `curation/ficha.py` (`_sincronizar_achados`) |
| Termos do vocabulário ligados à ficha precisam existir | `curation/ficha.py` |
| Uma imagem tem **no máximo uma** ficha; imagem desativada não recebe ficha | `curation/ficha.py` |
| Limites de tamanho de textos e listas | `app/core/limites.py` (ver `SEGURANCA.md`, seção 2.1) |

### 1.1 Vocabulário, busca e relatórios (01/11/2026)

- **O que entra na busca:** só fichas **aprovadas** com a imagem **ativa**. O Vocabulário mostra, para cada termo:
  - quantas fichas estão ligadas (em qualquer situação);
  - quantas delas já estão aprovadas;
  - quantas imagens a busca devolve, pela mesma regra da Pesquisa avançada. Esse número inclui o nome ou sinônimo escrito no texto da ficha.

  Uma ficha ligada mas ainda pendente aparece com o aviso "ainda não aprovada".
- **Região anatômica padrão:** se o curador não escolher a região de um achado, vale a região padrão do tipo de achado (`REGIAO_PADRAO_POR_ACHADO` em `backend/app/modules/achados.py`). Exemplos:
  - perdas ósseas, cálculo e alargamento do ligamento → Periodonto;
  - lesão periapical → Região periapical;
  - cáries, restaurações e coroa → Coroa;
  - reabsorções e fratura radicular → Raiz;
  - alteração do seio maxilar → Seio maxilar.

  A escolha do curador sempre prevalece. A busca por região também acha as fichas antigas pelo mesmo mapa.
- **Regiões que a imagem mostra:** a ficha tem o campo "Regiões que a imagem mostra" (`curations.regioes_imagem`), separado das regiões dos achados.
  - Panorâmica e tomografia já vêm com as regiões do exame (`REGIOES_PADRAO_POR_EXAME`). Panorâmica: maxila, mandíbula, osso alveolar, canal mandibular, seio maxilar e ATM. Tomografia: maxila, mandíbula e osso alveolar, porque o campo de visão varia. O curador marca ou desmarca.
  - Periapical, interproximal e oclusal começam vazias. Senão, toda periapical "teria" coroa e raiz, e o filtro não separaria nada.
  - Ficha antiga, sem o campo: a busca usa o padrão do tipo de exame.
  - O filtro "Região anatômica" da Pesquisa avançada e o termo `regiao:` usam a mesma regra: achado na região, região padrão do achado ou região que a imagem mostra.
- **Relatório "Fichas por achado":** conta as **alterações observadas** marcadas na Curadoria. O antigo campo "achado principal" não é mais preenchido. Uma ficha com vários achados conta em cada um deles.
- **"Dificuldade" removida do relatório:** a Curadoria não tem campo para preenchê-la, então o cartão mostrava sempre vazio. Se um dia for necessária, deve entrar primeiro como campo da ficha e filtro da busca.

### 1.2 Envio da prancha por e-mail (01/11/2026)

- **Confirmação antes de enviar:** a tela mostra o e-mail do destinatário. O próprio e-mail aparece **completo**; o de outra pessoa aparece **mascarado** (`g•••o@hotmail.com`), com o domínio inteiro para conferir erros de digitação. A regra geral do sistema é que nenhuma tela mostra o e-mail completo de outro usuário (`test_exposicao_de_dados.py`). A tela mostra também o que vai anexado o que vai anexado (1 PDF, N imagens, F folhas). O envio só sai depois de clicar em **Confirmar envio**. O botão fica desabilitado durante o envio, para não mandar duas vezes.
- **Para quem:**
  - o estudante, o pesquisador e o administrador enviam só para o próprio e-mail;
  - o professor e o curador também podem escolher outro professor ou curador **cadastrado e ativo**.

  Nunca há e-mail digitado livre, para evitar o envio de imagens a terceiros. O registro de auditoria `prancha_enviada_email` guarda o destinatário (`para_id`).
- **Provável erro de digitação:** domínios como `hotmai.com` ou `gmial.com` geram o aviso "você quis dizer …?". A lista fica em `app/core/email_digitacao.py` e `lib/emailDigitacao.ts`, e um teste confere que as duas são iguais. O aviso aparece:
  - no cadastro;
  - na criação de usuário;
  - na lista de usuários, para cadastros que já existem;
  - na confirmação da prancha.

  Ele só avisa, **não bloqueia**, porque o domínio pode existir. A correção de um cadastro é feita pelo administrador.

### 1.3 Erro técnico × tipo de exame (01/11/2026)

- A API aceita só os erros técnicos do tipo de exame da ficha. A regra é a mesma da tela: `ERROS_POR_EXAME` em `app/modules/achados.py` e `errosParaTipo` em `lib/errosTecnicos.ts`, e um teste confere as duas.
  - Periapical, interproximal e oclusal aceitam os erros gerais.
  - A panorâmica aceita os gerais, menos o corte de cone, e mais os erros próprios da panorâmica.
  - A tomografia aceita só os erros de tomografia.
  - Os valores antigos (legado) continuam válidos nos exames intraorais e na panorâmica.
- Erro incompatível recebe **422** com a mensagem "O erro técnico … não se aplica a …". Vale para o POST, para o PATCH do erro e para a lista completa no PATCH da ficha. Nunca há "sucesso sem salvar".
- Ao trocar o tipo de exame na Curadoria, os erros que não valem para o novo tipo saem da ficha.

## 2. Fluxo da ficha (estados permitidos)

```
pendente ─┐
          ├─(editar)→ em_analise ─┬─ aprovar ──→ aprovada   (final)
          │                       ├─ descartar → descartada (final)
          │                       └─ pedir 2ª opinião → segunda_opiniao ─┬─ aprovar → aprovada
          │                                                              └─ descartar → descartada
```

| Regra | Onde |
|---|---|
| Só se edita ficha **pendente** ou **em análise** | `curation/common.py` (`STATUS_EDITAVEIS`) |
| **Aprovar exige "anonimização validada"** marcada pelo curador (LGPD) | `curation/common.py` (`_executar_aprovacao`) |
| Descartar exige justificativa | `curation/common.py` |
| Ficha aprovada ou descartada não é reprocessada | `aprovacao_descarte.py`, `segunda_opiniao.py` |
| Fila da Curadoria: só imagens ativas, sem ficha e **sem moldura** (enquadramento `recortada` ou `sem_borda`); as incertas, não verificadas ou anteriores ao recorte automático só entram depois de passar por `recortar_molduras.py` | `curation/consultas.py` |
| Segunda opinião: exige motivo; uma em aberto por ficha; **quem pediu não pode responder** | `curation/segunda_opiniao.py` |
| Segunda opinião por item: o revisor avalia cada item da ficha (concordo / ajustar / discordo, com anotação e, nos itens com lista de valores, um valor proposto) e dá uma avaliação geral em escala tipo RADPEER (concordo / discordância menor / discordância importante); toda anotação que não seja "concordo" precisa de texto ou valor proposto; **só quem pediu (ou o administrador) acrescenta ou dispensa** cada anotação, enquanto a ficha aguarda a decisão; nada é apagado | `curation/segunda_opiniao.py` |
| Toda mudança de estado fica no histórico (`curation_history`) e na auditoria | `curation/common.py` |

**Outras regras de negócio:**
- Pedido de acesso: o e-mail precisa ser confirmado (link de 24 h, invalidado após 5 senhas erradas). Desde 28/10/2026, **estudante, professor e pesquisador** entram assim que confirmam o e-mail (auditoria `aprovacao_automatica_solicitacao`); só **curador** continua dependendo da aprovação do administrador. O administrador pode bloquear a conta ou trocar o perfil a qualquer momento.
- Compartilhamento: só imagem aprovada; não se compartilha consigo mesmo; o destinatário precisa ter conta. Quem recebe vê só a anotação escrita na caixa do compartilhamento (as "Minhas anotações" de quem enviou são privadas e não vão junto) e pode escondê-la só da própria visão, sem apagar os dados de quem enviou.
- Conta: o administrador não pode excluir a própria conta. Conta bloqueada, inativa ou excluída perde o acesso na hora, em qualquer sessão.

## 3. Limites por usuário e globais (ASVS 2.1.3, 2.3.2 e 2.4.1)

**Quem é contado:** com login, a **conta** (assim a turma inteira atrás do mesmo endereço de rede da UFSC não divide o mesmo limite, e um robô não escapa trocando de endereço); sem login, o **endereço de rede**. Valores em `app/core/rate_limit.py`; o teste `test_limites_anti_abuso_documentados_sao_os_do_codigo` confere esta tabela com o código. Acima do limite, a resposta é **429** com a mensagem "Muitos pedidos em pouco tempo…".

| Função | Limite | Por quem | Onde |
|---|---|---|---|
| **Qualquer rota da API** (limite geral) | 600 por minuto | conta (ou endereço) | `app/core/rate_limit.py` (`limite_geral`) |
| Login | 5 por minuto | endereço de rede | `auth.py` |
| Esqueci a senha | 3 por minuto | endereço de rede | `auth.py` |
| Redefinir senha | 10 por minuto | endereço de rede | `auth.py` |
| Pedir acesso | 5 por minuto | endereço de rede | `auth.py` |
| Confirmar e-mail | 10 por minuto; 5 senhas erradas invalidam o link | endereço de rede / pedido | `auth.py` |
| Compartilhar / responder | 20 por minuto | conta | `compartilhamentos_router.py` |
| Transcrição de voz | 120 trechos por minuto; áudio de até 10 MB | conta | `voz_router.py` |
| **E-mail com uma imagem** (para o próprio e-mail) | 20 por hora | conta | `search_router.py` |
| **E-mail com várias imagens** | 5 por hora; até 10 imagens por e-mail | conta | `search_router.py` |
| **Download `.zip` de série** (imagens ou DICOM, somados) | 20 por hora; até 1.000 cortes no ZIP de imagens | conta | `search_router.py` |
| **Prancha** (folha com as imagens à esquerda e as informações à direita; baixar ou imprimir) | 60 por hora; até 30 imagens por prancha; montagem conta como trabalho pesado (no máximo 2 ao mesmo tempo) | conta | `prancha_router.py` |
| **Prancha por e-mail** (PDF, para o próprio e-mail) | 5 por hora; até 15 imagens por prancha | conta | `prancha_router.py` |
| **Envio de DICOM** | 300 por hora; 50 MB por arquivo; compactados recusados | conta | `images_router.py` |
| **Sincronizar com o Orthanc** | 10 por hora | conta (administrador/suporte) | `images_router.py` |
| **Sugestão de melhoria** | 10 por hora | conta | `sugestoes.py` |
| **Pasta de paciente nova** (fotos do negatoscópio) | 30 por hora; até 30 fotos por pasta | conta | `casos_router.py` |
| **E-mail com o link de uma pasta de paciente** (só o link, que exige login) | 10 por hora | conta | `casos_router.py` |
| **Girar imagem** (Curadoria) | 30 por minuto; um giro por vez em cada imagem | conta (curadoria) | `curation/orientacao.py` |
| Foto de perfil | 5 MB; JPG/PNG/WebP | por pedido | `users_router.py` |
| Busca | até 200 resultados por página | por pedido | `search_router.py` |
| Sessão | 60 min de inatividade; 12 h no máximo | por sessão | `app/core/sessao.py` |

**Fora do limite geral, de propósito:**
- a portaria das imagens (`/visualizador/autorizar`): o visualizador pede um corte por vez, e uma tomografia tem centenas. A rota só responde "pode/não pode";
- as checagens de saúde (`/health`).

**Por que o limite geral é um "vigia" próprio:** o modo automático da biblioteca `slowapi` não encontra as rotas na versão do FastAPI usada (0.143) e deixava tudo passar. O teste `test_2_4_1_limite_geral_em_todas_as_rotas` revelou isso; a correção usa o mesmo contador da biblioteca.

## 4. Funções pesadas e como evitar indisponibilidade (ASVS 15.1.3)

| Função | Por que pesa | Proteção (ASVS 15.2.2) |
|---|---|---|
| Transcrição de voz (Whisper) | modelo de IA, CPU e memória | serviço separado com teto de 1,6 GB de RAM e 4 CPUs; 120 trechos/min; o modelo é descarregado após 10 min parado |
| Anonimização + OCR do texto na imagem | leitura completa da imagem (cerca de 1 a 10 s por imagem) | 1 imagem por envio; 50 MB por arquivo; 300 envios por hora; chegada pelo aparelho em ciclos de 60 s |
| Download `.zip` de uma série (vários cortes) | monta o arquivo na memória | só fichas aprovadas; 20 por hora; até 1.000 cortes no ZIP de imagens (acima disso, o DICOM); no máximo **2 ao mesmo tempo** no servidor inteiro, e o terceiro recebe 503 ("tente de novo em instantes") em vez de esperar na fila |
| E-mail com imagens (individual e lote) | renderiza imagens e envia por SMTP | 20 por hora (uma imagem); 5 por hora com até 10 imagens por e-mail (lote); sempre para o e-mail da própria conta |
| Prancha (PDF/PNG) | busca as imagens e desenha as folhas | só fichas aprovadas; 60 por hora (baixar/imprimir) com até 30 imagens; 5 por hora por e-mail com até 15 imagens; divide as 2 vagas de trabalho pesado com os ZIPs |
| Sincronizar com o Orthanc | percorre todo o acervo | só administrador/suporte; 10 por hora |
| Girar imagem / recortar moldura | lê e regrava o arquivo DICOM inteiro (cerca de 1 s) | giro: só curadoria, 30 por minuto, um por vez em cada imagem (trava do registro); recorte das imagens antigas: só pelo roteiro no servidor |
| Busca com texto livre | consulta com `ILIKE` | texto até 150 caracteres; 200 por página; limite geral |

O teto de **2 ZIPs ao mesmo tempo** (`MAX_ZIPS_SIMULTANEOS`) vale para o servidor inteiro, não por pessoa.

**Conduta em caso de sobrecarga:**
- o Whisper fora do ar não derruba a API: a curadoria segue sem voz;
- o Orthanc fora do ar não derruba a API (`test_16_5_2`);
- o administrador pode bloquear um usuário abusivo na hora.

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 18/10/2026 | Criação (auditoria OWASP ASVS 5.0, Nível 2) |
| 1.1 | 18/10/2026 | Grupo 4: limites de e-mail, ZIP, envio e sincronização; limite geral por conta; teto de ZIPs simultâneos; coerência de idade na busca e de marcações |
| 1.2 | 20/10/2026 | Limite do giro de imagem na Curadoria; recorte da moldura branca |
| 1.3 | 01/11/2026 | Vocabulário × busca, região anatômica padrão, relatório por achado, Dificuldade removida do relatório |
| 1.4 | 01/11/2026 | Regiões que a imagem mostra (campo da Curadoria e padrão por tipo de exame) no filtro de região |
| 1.5 | 01/11/2026 | Prancha por e-mail: confirmação com destino visível, destinatário cadastrado e aviso de erro de digitação |
| 1.6 | 01/11/2026 | Erro técnico recusado (422) quando não combina com o tipo de exame |
