# Radix Imago — Regras de negócio, limites e funções pesadas

| Campo | Valor |
|---|---|
| Versão do documento | 1.25 — 23/11/2026 |
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
| **Achados e termos numa lista só** (08/11/2026): o achado de cada marcação vem de uma única lista (achados padronizados + termos do vocabulário marcados "nas curadorias"); escolher um termo liga a ficha a ele (e é isso que faz a imagem aparecer na Pesquisa avançada); tirar a marcação desliga. "Outros" acrescenta um termo novo e o curador escolhe se ele aparece na Pesquisa avançada (`na_busca`) e nas próximas curadorias (`nas_curadorias`); dá para mudar depois na tela Vocabulário. Só curador e administrador acrescentam termos | `curation/ficha.py`, `vocabulario_router.py`, `busca_termos.py` |
| **Definição de cada termo** (22/11/2026, pedido do vídeo): curador e administrador escrevem a definição do termo na tela Vocabulário, **sempre com a fonte** (o servidor recusa definição sem fonte; apagar a definição apaga a fonte). Por direito autoral (Lei 9.610/98), a fonte é o DeCS (BIREME/OPAS, com a menção da edição) ou o texto do próprio curador. Qualquer pessoa logada vê a definição no **"?"** de cada marcação do visualizador; o termo é achado pelo nome ou por um sinônimo; termo inativo ou sem definição recebe o mesmo aviso | `vocabulario_router.py` |
| **Informações adicionais e anexos** (08/11/2026): na caixa "Achados" o curador pode ligar um texto livre e anexar imagens (JPEG, PNG ou WebP; até 10 por ficha, 10 MB cada; o servidor regrava a imagem sem metadados). **Não entram na Pesquisa avançada**; só aparecem para quem abre a imagem curada (ícone de clipe), e só de ficha aprovada. Acrescenta e remove quem pode editar a ficha | `anexos_curadoria.py`, `curation/ficha.py` |
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
- **Regiões que a imagem mostra:** a ficha tem o campo "Regiões que a imagem mostra" (`curations.regioes_imagem`), separado das regiões dos achados. **Desde 22/11/2026 ele não aparece mais na tela da Curadoria** (decisão do Luciano): o curador não marca nem desmarca; o campo é preenchido sozinho pelo padrão do tipo de exame.
  - Panorâmica e tomografia já vêm com as regiões do exame (`REGIOES_PADRAO_POR_EXAME`). Panorâmica: maxila, mandíbula, osso alveolar, canal mandibular, seio maxilar e ATM. Tomografia: maxila, mandíbula e osso alveolar, porque o campo de visão varia.
  - Periapical, interproximal e oclusal começam vazias. Senão, toda periapical "teria" coroa e raiz, e o filtro não separaria nada.
  - Ficha antiga, sem o campo: a busca usa o padrão do tipo de exame.
  - O filtro "Região anatômica" da Pesquisa avançada e o termo `regiao:` usam a mesma regra: achado na região, região padrão do achado ou região que a imagem mostra.
- **Termo inativo:** um termo desativado no Vocabulário sai da busca. O termo `vocab:` responde 422 ("está inativo"), a busca por texto ignora os seus sinônimos e a contagem "na busca" fica 0. As ligações com as fichas continuam guardadas.
- **Curadoria × Busca:** o teste `tests/test_curadoria_x_busca.py` confere duas coisas: que as listas da Curadoria (achados, regiões, erros técnicos e grupos) são as mesmas da Busca e do servidor, e que cada valor gravado é encontrado pela `/search`.
- **Relatório "Fichas por achado":** conta as **alterações observadas** marcadas na Curadoria. O antigo campo "achado principal" não é mais preenchido. Uma ficha com vários achados conta em cada um deles.
- **"Dificuldade" removida do relatório:** a Curadoria não tem campo para preenchê-la, então o cartão mostrava sempre vazio. Se um dia for necessária, deve entrar primeiro como campo da ficha e filtro da busca.

### 1.2 Envio da prancha por e-mail (01/11/2026)

- **Confirmação antes de enviar:** a tela mostra o e-mail do destinatário. O próprio e-mail aparece **completo**; o de outra pessoa aparece **mascarado** (`g•••o@hotmail.com`), com o domínio inteiro para conferir erros de digitação. A regra geral do sistema é que nenhuma tela mostra o e-mail completo de outro usuário (`test_exposicao_de_dados.py`). A tela mostra também o que vai anexado (1 PDF, N imagens, F folhas). O envio só sai depois de clicar em **Confirmar envio**. O botão fica desabilitado durante o envio, para não mandar duas vezes.
- **Para quem (mudou em 08/11/2026, etapa E — decisão do Luciano):**
  - **para o próprio e-mail**: vai o **PDF anexado**, como antes (`prancha_enviada_email`);
  - **para outras pessoas**: **qualquer perfil** escolhe **qualquer usuário cadastrado e ativo**, pelo nome ou pelo e-mail (busca a partir de 3 letras; e-mail mascarado), ou um dos próprios grupos. Vai **só um link que exige login** — a imagem não sai do sistema. O recado de quem enviou fica só dentro do Radix, não vai no e-mail. Quem recebe abre em **Pranchas recebidas**; a prancha é montada na hora, só com as imagens que continuam aprovadas (`prancha_enviada_link`, `prancha_recebida_aberta`). Até 30 pessoas por envio.

  Nunca há e-mail digitado livre para fora do sistema.
- **Escolhas em todas as saídas (baixar, imprimir, e-mail):** 1, 2 ou 3 imagens por folha; **quais dados** vão ao lado da imagem (tipo e qualidade, região/dentes, achados, descrição didática, lista de marcadores); e se os marcadores aparecem **sobre** a imagem. Formato: PDF ou imagem (PNG).
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
- O mesmo erro técnico não pode ser registrado duas vezes na mesma ficha: a API responde **409**.

### 1.4 Contagens de imagens em cada tela (01/11/2026)

As telas contam coisas diferentes, de propósito, e cada uma explica o seu número:

| Tela | O que conta |
|---|---|
| Relatórios: "Imagens" | **Todas** as imagens ativas, em qualquer situação (`contar_imagens_por_situacao`). |
| Imagens recebidas: "Aguardando curadoria" | Sem ficha, pendentes e em análise. O detalhe separa quantas ainda **esperam o recorte da moldura** (`aguarda_recorte`). |
| Curadoria: "Imagem X de Y" | Só imagens **sem ficha e já sem moldura** (recortada ou sem borda). A dica ao passar o mouse informa quantas esperam o recorte (`aguardando_recorte` em `/curation/pending`). |

### 1.6 Imagens recebidas por perfil (01/11/2026)

- **Curador, administrador e suporte:** veem a lista de todas as imagens recebidas.
- **Professor:** vê só as imagens DICOM que **ele mesmo enviou**. Desde 08/11/2026 quem enviou fica na coluna `orthanc_references.enviado_por_id` (antes, só no registro de auditoria `upload_imagem`). É o princípio do mínimo necessário (LGPD), decidido pelo Luciano no QA com perfil professor.
- Nenhum desses perfis vê, pela lista, imagens ainda não aprovadas: a prévia continua bloqueada.

### 1.11 Termos de Uso e Política de Privacidade (10/11/2026)

- Documentos: **Termos de Uso** (gerais), um **Anexo por perfil** (estudante, professor, curador, pesquisador, suporte, administrador) e a **Política de Privacidade**. Textos em `backend/app/termos_texto/`; responsável e controlador: Luciano de Matos Neto (pessoa física); canal do titular: privacidade@radiximago.com.br.
- **Aceite obrigatório** no primeiro acesso, a cada **nova versão** e quando o **perfil muda** (o anexo muda). A caixa "Li e concordo" só libera depois de rolar os textos até o fim. Sem o aceite, o servidor recusa tudo (403 `termos_uso_pendentes`), menos os próprios termos, o termo de ciência, `/auth/me` e `/auth/logout`. "Não aceito" encerra a sessão.
- Cada aceite fica em `aceites_termos_uso` com versão, perfil, data e o resumo SHA-256 do texto exato aceito, e na auditoria.
- Os textos ficam **sempre disponíveis, também sem login**, em `/termos` (link no rodapé do login e no menu do usuário), com impressão em PDF.
- Nova versão: alterar os textos, `TERMOS_VERSAO`, `TERMOS_VIGENCIA` e `TERMOS_MUDANCAS` em `termos_uso.py`.

### 1.10 Termo de ciência após o login (10/11/2026)

- A **cada login** (cada sessão nova), depois da senha e do segundo fator, a pessoa marca: *"Estou ciente de que as imagens são usadas exclusivamente para ensino e pesquisa e não têm validade para diagnóstico."*
- **Sem o aceite, não entra:** o servidor responde 403 (`termo_ciencia_pendente`) a tudo, menos ao próprio termo, a `/auth/me` e a `/auth/logout`. "Não aceito" encerra a sessão e volta ao login.
- O aceite fica na sessão (data e versão do texto) e na auditoria. Se o texto mudar, a versão (`TERMO_CIENCIA_VERSAO`, em `termo_ciencia.py`) é trocada.

### 1.9 Envio de imagens por todos os perfis e foto pelo celular (08 e 10/11/2026)

**Quem envia e para onde** (decisões do Luciano, 08/11/2026, mantidas em 10/11):

| Perfil | Destinos | Como |
|---|---|---|
| Estudante | **Só para mim** (Minhas imagens) ou **Enviar para análise** de UM professor ou curador | só pela **foto** (o envio de DICOM bruto continua restrito à equipe) |
| Professor, curador, administrador | **Fila de curadoria** ou **Só para mim** | arquivo DICOM ou foto |
| Pesquisador, suporte | não enviam | — |

- Quem analisa (professor ou curador escolhido) coloca na fila de curadoria ou devolve com recado. **Só o curador publica** no banco geral, aprovando a ficha.
- Imagem ainda não aprovada é vista só pelo **dono**, por **quem foi escolhido para analisar**, pela **curadoria** (se estiver na fila) e pelo administrador. Qualquer outra pessoa recebe "não encontrada" (404), sem saber que ela existe (`visivel_para`).
- O dono pode **retirar** a própria imagem enquanto ela está "só para mim" **ou em análise** (desde 10/11/2026). Depois que entra na fila de curadoria, não.
- **Aviso com aceite (22/11/2026):** ao entrar em Enviar imagem, a pessoa lê que a imagem não tem finalidade diagnóstica e que a original deve ser anexada ao prontuário do paciente conforme o protocolo da instituição, e marca **Estou ciente**. Sem isso a tela não libera o envio. O aceite fica na auditoria (`aviso_envio_ciente`, com a versão `AVISO_ENVIO_VERSAO`).
- **Arquivar (desde 18/11/2026):** curador ou administrador pode **arquivar** uma ficha **aprovada**, com motivo obrigatório. A imagem sai da pesquisa, do visualizador dos estudantes, das pranchas, dos compartilhamentos e dos grupos (toda liberação exige ficha aprovada), mas **nada é apagado**. **Desarquivar** devolve a ficha a "aprovada". Ficha arquivada não pode ser aprovada nem descartada direto; para corrigir, reabre-se para edição. Fica no histórico e na auditoria (`arquivamento`, `desarquivamento`).
- **Tomografia (exame em volume, desde 18/11/2026):** os cortes da mesma série entram na fila como **um item só** (o primeiro corte que chegou, com o selo "TC · N cortes"). A ficha, a aprovação e a pesquisa valem para o **exame inteiro**, e o visualizador abre todos os cortes. O aviso de texto na imagem considera **todos os cortes** (pior caso). Cortes não são girados nem recortados um a um (desalinharia o volume). Radiografias, inclusive séries de periapicais, continuam uma imagem por item.
  - O agrupamento vale também para **Imagens recebidas**, **Minhas imagens**, **Para analisar** e as **contagens dos painéis** (um exame conta uma vez). Retirar, desativar/reativar, mandar para análise, colocar na fila ou devolver valem para **todos os cortes** do exame.

**Foto do negatoscópio pelo celular — Fase 1 (10/11/2026, `docs/ESPECIFICACAO_FASE1_FOTO_CELULAR.md`):**

- Toda foto (JPG, PNG) entra **só** por `/envios/foto`. O envio comum (`/envios`) aceita **só DICOM**: não há atalho que pule as regras abaixo.
- **Janela de 5 minutos:** ao tocar em "Enviar foto da radiografia", o servidor abre uma janela e devolve um comprovante de **uso único** e a hora de término pelo **relógio do servidor** (mudar a hora do celular não muda nada). O envio precisa chegar até o término **mais 30 segundos** de folga para rede lenta. Depois disso: recusado (410), "O tempo para enviar acabou. Comece de novo." Abrir uma nova janela cancela a anterior (uma por conta). Comprovante já usado, de outra pessoa ou cancelado é recusado. Se a foto for recusada por problema do **arquivo**, a janela volta a valer dentro do tempo que resta. Valores em `FOTO_JANELA_MINUTOS` e `FOTO_JANELA_TOLERANCIA_SEGUNDOS` (`.env`).
- **No celular:** girar, recortar e **tarja** gravada nos pixels; a foto é reduzida (lado maior até 2048 px) e regravada em JPEG, o que descarta os dados do celular. A versão sem tarja não sai do aparelho.
- **Confirmação obrigatória:** "Confirmo que a imagem não mostra dados que identifiquem o paciente." Sem ela, o servidor recusa (422).
- **No servidor:** confere o tipo real pelos primeiros bytes; até **10 MB** (`FOTO_TAMANHO_MAX_MB`) e 40 megapixels; reconstrói a imagem, converte em tons de cinza e monta um DICOM **Secondary Capture**, modalidade **OT**, sem escala (`PixelSpacing`) e sem nenhum dado do usuário. O **texto gravado na foto é procurado e tarjado antes** de qualquer gravação no Orthanc; depois segue o caminho de sempre (anonimização, leitura de texto, recorte da moldura, registro).
- A ficha de uma foto nasce com **modalidade OT**. A foto não tem escala real: nenhuma medida em milímetros vale para ela.
- O destinatário é **reconferido no envio** (precisa continuar professor ou curador ativo).
- Foto de exame de **paciente real** só depois da aprovação do CEP e do checklist de dados reais (a tela avisa).

### 1.7 Proteção das contas de administrador (01/11/2026)

- Ninguém **bloqueia** nem **exclui a própria conta**. A API responde 422, e na tela a própria linha mostra "(você)" no lugar de Bloquear, Encerrar acessos e Excluir.
- Ninguém bloqueia nem exclui o **último administrador ativo**: a API responde 409 "Cadastre outro administrador antes".
- **Bloquear** e **Encerrar acessos** pedem confirmação, que diz quem será afetado e o que acontece. **Excluir** já tinha uma janela própria de confirmação. "Encerrar acessos de todos" também pede confirmação. Tudo fica na Auditoria.

### 1.8 Pedido de acesso de quem já tem conta (01/11/2026, M2)

- Um pedido feito antes de a conta existir e confirmado depois, com a conta já ativa, **não vai para a fila**: fica "rejeitado" com o motivo "Este e-mail já tem conta" (auditoria `solicitacao_duplicada_descartada`). A pessoa recebe a orientação de entrar com a conta existente ou usar "Esqueci a senha".
- Na tela Usuários, um pedido pendente cujo e-mail já tem conta mostra "Este e-mail já tem conta (perfil)", e o botão **Aprovar** fica desligado. Aprovar criaria uma conta duplicada ou trocaria o perfil por esse caminho. Para mudar o perfil, edite a conta existente.

### 1.12 Dentição, decíduos, odontograma de situação e estruturas fora dos dentes (23/11/2026)

- **Dentição** (decídua, mista ou permanente) vale em **todos os tipos** de exame. É opcional.
- Os **dentes decíduos** (notação FDI 51–55, 61–65, 71–75, 81–85) valem em todos os tipos: na ficha, nos achados, na segunda opinião e na pesquisa (inclusive nos filtros de arcada, lado e quadrante). Eles aparecem na tela com dentição **mista** ou **decídua**.
- Dente decíduo **não combina** com dentição **permanente**: o servidor recusa (422). Na tela, trocar para "Permanente" tira os decíduos da ficha e do odontograma.
- **Odontograma de situação** (só na tela da **panorâmica**): o curador clica no dente e escolhe como ele está (ausente, incluso/impactado, cárie, restaurado, tratamento endodôntico, implante, prótese, supranumerário). Um dente pode ter mais de uma situação. Situação repetida e dente sem situação são limpos; dente fora da notação FDI é recusado (422).
- **Estruturas e achados fora dos dentes** (seios maxilares, ATM/côndilos, canal mandibular, perda óssea generalizada, ateroma carotídeo, sialolito, tonsilolito, processo estiloide alongado, lesão óssea radiolúcida ou radiopaca): **só na panorâmica**. Em outro tipo de exame o servidor recusa (422); lista vazia sempre pode (limpar).
- Pesquisa: filtros `denticao`, `situacao_dente` (algum dente com aquela situação) e `estrutura`, só sobre fichas aprovadas, como os demais. Na tela da Pesquisa avançada são três listas, e o odontograma da busca mostra os decíduos ao clicar em **Decíduos (51–85)**.
- O dente de cada **achado** também pode ser decíduo quando a dentição da ficha é mista ou decídua.
- São dados da **imagem anonimizada**, não do paciente: nada identifica a pessoa.

### 1.5 Acesso negado (01/11/2026)

Toda tela restrita leva à mesma página `/acesso-negado?de=<página>`. Ela mostra a página pedida e o "erro 403", e o botão volta para o início **do perfil**. Antes, `/usuarios` ia para o login e o botão levava ao painel do administrador.

## 2. Fluxo da ficha (estados permitidos)

```
pendente ─┐
          ├─(editar)→ em_analise ─┬─ aprovar ──→ aprovada   (final)
          │                       ├─ descartar → descartada (final)
          │                       └─ pedir 2ª opinião → segunda_opiniao ─┬─ aprovar → aprovada
          │                                                              └─ descartar → descartada
aprovada ── pedir 2ª opinião (continua aprovada e na Pesquisa) ─┬─ manter → aprovada
                                                                └─ arquivar → arquivada
```

| Regra | Onde |
|---|---|
| Só se edita ficha **pendente** ou **em análise** | `curation/common.py` (`STATUS_EDITAVEIS`) |
| **Aprovar exige "anonimização validada"** marcada pelo curador (LGPD) | `curation/common.py` (`_executar_aprovacao`) |
| **Aprovar exige os campos mínimos preenchidos** (tipo de radiografia, dente ou região, achado, qualidade e descrição; desde 22/11/2026, como a região da imagem só vem do padrão de panorâmica e tomografia, nas outras radiografias o curador precisa marcar os dentes). Faltando algum, o servidor recusa (422) e registra a tentativa na auditoria; o botão da tela não é a única barreira (02/11/2026) | `curation/common.py` (`_campos_minimos_faltando`) |
| **Só administrador e curador gravam na curadoria** (editar ficha, achados, aprovar, descartar, segunda opinião, voz, macros, vocabulário). O **suporte só lê** (02/11/2026) | `auth.py` (`PERFIS_CURADORIA_ESCRITA`) |
| Descartar exige justificativa | `curation/common.py` |
| Ficha aprovada ou descartada não é reprocessada (exceção: a decisão de uma segunda opinião pedida para ficha aprovada, abaixo) | `aprovacao_descarte.py`, `segunda_opiniao.py` |
| Fila da Curadoria: só imagens ativas, sem ficha e **sem moldura** (enquadramento `recortada` ou `sem_borda`); as incertas, não verificadas ou anteriores ao recorte automático só entram depois de passar por `recortar_molduras.py` | `curation/consultas.py` |
| **Modalidade da fila** (23/11/2026, pedido do Luciano; Manual do Bloco 6, item 7): cada imagem entra com uma modalidade preliminar — a informada por quem enviou (opcional, um dos tipos de radiografia) ou a reconhecida na entrada (tomografia = DICOM CT; panorâmica = DICOM PX ou imagem bem mais larga que alta; o resto = "intraoral", porque periapical, interproximal e oclusal têm o mesmo DICOM). Com mais de uma modalidade na fila, a Curadoria **pergunta qual o curador quer curar** antes de abrir a 1ª imagem; a caixa "Modalidade" troca depois. A ficha nova começa com o tipo informado por quem enviou (o curador confere). Imagens anteriores ficam "não informado" até o roteiro `preencher_tipo_preliminar.py` | `curation/consultas.py`, `images_router.py`, `envios_router.py` |
| **Triagem da modalidade** (23/11/2026): periapical, interproximal e oclusal só se separam olhando a imagem. Na tela Curadoria → Triagem, curador ou administrador seleciona várias imagens da fila e diz o tipo de uma vez (até 100 por vez). Só mudam imagens ativas, na fila e sem ficha; fica na auditoria (`triagem_modalidade`) e vira o tipo inicial da ficha | `curation/triagem.py` |
| Segunda opinião: exige motivo; uma em aberto por ficha; **quem pediu não pode responder** | `curation/segunda_opiniao.py` |
| Segunda opinião de **ficha já aprovada** (22/11/2026, pedida por curador ou administrador em Minhas imagens, uma por ficha): a ficha **continua aprovada e na Pesquisa** durante a revisão; quem pediu pode acrescentar as anotações à ficha; a decisão é **manter aprovada** ou **arquivar** (com motivo; sai de circulação, nada é apagado). Descartada e arquivada continuam sem segunda opinião | `curation/segunda_opiniao.py` |
| Segunda opinião por item: o revisor avalia cada item da ficha (concordo / ajustar / discordo, com anotação e, nos itens com lista de valores, um valor proposto) e dá uma avaliação geral em escala tipo RADPEER (concordo / discordância menor / discordância importante); toda anotação que não seja "concordo" precisa de texto, valor proposto ou marcação sugerida; no item **Marcações na imagem** o revisor pode **desenhar novas marcações** (até o mesmo limite de marcações da ficha), que quem pediu vê **tracejadas em rosa** na imagem enquanto a anotação está a decidir e, se acrescentar à curadoria, passam a fazer parte das marcações da ficha (22/11/2026); **só quem pediu (ou o administrador) acrescenta ou dispensa** cada anotação, enquanto a ficha aguarda a decisão; nada é apagado | `curation/segunda_opiniao.py` |
| Toda mudança de estado fica no histórico (`curation_history`) e na auditoria | `curation/common.py` |

**Outras regras de negócio:**
- Pedido de acesso: o e-mail precisa ser confirmado (link de 24 h, invalidado após 5 senhas erradas). Desde 01/11/2026 (auditoria do administrador, A3, decisão do Luciano), **só estudante** entra assim que confirma o e-mail (auditoria `aprovacao_automatica_solicitacao`, quem aprovou: o sistema). **Professor, curador e pesquisador** sempre dependem da aprovação do administrador (`aprovacao_solicitacao_acesso`, com o nome de quem aprovou), porque professor e curador trabalham com a curadoria e o envio de imagens. Entre 28/10 e 01/11, professor e pesquisador também entravam sozinhos. O administrador pode bloquear a conta ou trocar o perfil a qualquer momento.
- Compartilhamento: só imagem aprovada; não se compartilha consigo mesmo; o destinatário precisa ter conta. Desde 22/11/2026 a pessoa é escolhida **pelo nome** (a mesma busca da prancha, com o e-mail mascarado; vai o `usuario_id`) ou pelo e-mail, como antes; pessoa inativa ou inexistente recebe a mesma resposta neutra. Quem recebe vê só a anotação escrita na caixa do compartilhamento (as "Minhas anotações" de quem enviou são privadas e não vão junto) e pode escondê-la só da própria visão, sem apagar os dados de quem enviou. **Responder** a quem compartilhou só é possível se quem compartilhou marcou **"Permitir que a pessoa responda"** (`permite_resposta`; desmarcado por padrão; os compartilhamentos anteriores a 22/11/2026 continuam permitindo; a resposta volta permitindo resposta, para a conversa seguir).
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
| **Grupos** (17/11/2026): procurar grupo pelo nome (só estudantes; pelo menos 3 letras, até 20 resultados) | 30 por minuto | conta | `grupos_router.py` |
| **Grupos**: pedir para entrar (estudante) e convidar (dono do grupo) | 20 por minuto; um convite ou pedido pendente por pessoa em cada grupo; vencem em 30 dias | conta | `grupos_router.py` |
| **Grupos**: enviar imagem ao grupo (modo aula; só imagem aprovada e ativa; mensagem até 1.000 letras, até 50 marcações) | 30 por minuto | conta | `grupos_aula_router.py` |
| **Grupos**: comentar uma imagem do grupo e responder (comentário particular, até 500 letras) | 20 por minuto | conta | `grupos_aula_router.py` |
| **Grupos** (22/11/2026): gerar link de convite (só o dono; um ativo por grupo; vale 7 dias) | 10 por minuto | conta | `grupos_router.py` |
| **Grupos**: ver o grupo pelo link de convite (antes de confirmar) | 20 por minuto | conta | `grupos_router.py` |
| **Grupos**: entrar no grupo pelo link de convite (só com login e confirmando) | 10 por minuto | conta | `grupos_router.py` |
| Transcrição de voz | 120 trechos por minuto; áudio de até 10 MB | conta | `voz_router.py` |
| **E-mail com uma imagem** (para o próprio e-mail) | 20 por hora | conta | `search_router.py` |
| **E-mail com várias imagens** | 5 por hora; até 10 imagens por e-mail | conta | `search_router.py` |
| **Download `.zip` de série** (imagens ou DICOM, somados) | 20 por hora; até 1.000 cortes no ZIP de imagens | conta | `search_router.py` |
| **Prancha** (folha com as imagens à esquerda e as informações à direita; baixar ou imprimir) | 60 por hora; até 30 imagens por prancha; montagem conta como trabalho pesado (no máximo 2 ao mesmo tempo) | conta | `prancha_router.py` |
| **Prancha por e-mail** (PDF para o próprio e-mail, ou link para outras pessoas) | 5 envios por hora; até 15 imagens por prancha (PDF) e até 30 pessoas por envio (link); busca de pessoas: 60 por minuto | conta | `prancha_router.py` |
| **Envio de DICOM** | 300 por hora; 50 MB por arquivo; compactados recusados | conta | `images_router.py` |
| **Foto pelo celular** (Fase 1) | 30 por hora; 10 MB e 40 megapixels por foto; abrir a janela de envio: 30 por hora | conta | `envios_router.py` |
| **Sincronizar com o Orthanc** | 10 por hora | conta (administrador/suporte) | `images_router.py` |
| **Sugestão de melhoria** | 10 por hora | conta | `sugestoes.py` |
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
| 1.7 | 01/11/2026 | Erro técnico repetido (409), termo inativo fora da busca, teste Curadoria × Busca |
| 1.8 | 01/11/2026 | Contagens explicadas em cada tela, página única de acesso negado, explicação de quem pode receber um compartilhamento |
| 1.9 | 01/11/2026 | Professor vê em Imagens recebidas só o que enviou; texto "Só para mim" trocado (a equipe vê todas as pastas) |
| 1.10 | 01/11/2026 | Proteção das contas de administrador (M1); só estudante é aprovado automaticamente (A3) |
| 1.11 | 02/11/2026 | Suporte só lê a curadoria; aprovação exige os campos mínimos no servidor |
| 1.12 | 08/11/2026 | Prancha: escolha dos dados e 1 por folha; envio a qualquer usuário só por link com login (seção 1.2) |
| 1.13 | 08/11/2026 | Achados das marcações e termos do vocabulário numa lista só, com "Outros" (seção 1) |
| 1.14 | 08/11/2026 | Informações adicionais e anexos de imagem na curadoria, fora da Pesquisa avançada (seção 1) |
| 1.15 | 10/11/2026 | Envio por todos os perfis (08/11) e foto do negatoscópio pelo celular com janela de 5 minutos (seção 1.9); limite da foto (seção 3); professor identificado por `enviado_por_id` (seção 1.6) |
| 1.16 | 10/11/2026 | Termo de ciência a cada login (seção 1.10) |
| 1.17 | 10/11/2026 | Termos de Uso, anexos por perfil e Política de Privacidade com aceite versionado (seção 1.11) |
| 1.18 | 22/11/2026 | Pedidos do vídeo das telas: Regiões da imagem fora da Curadoria (seção 1); compartilhar escolhendo a pessoa pelo nome; aviso com aceite em Enviar imagem (seção 1.9) |
| 1.19 | 22/11/2026 | Grupos: tela única (Grupos que criei / Grupos de que participo) e link de convite (7 dias, um ativo por grupo, só o resumo do código no banco, entrar só confirmando; limites na seção 3) |
| 1.20 | 22/11/2026 | Compartilhadas comigo: filtro por tipo, recebidas de colegas em grade e responder só com permissão de quem compartilhou; Minhas imagens: filtro por tipo e enviadas por mim em grade |
| 1.21 | 22/11/2026 | Segunda opinião: o revisor desenha marcações sugeridas no item Marcações na imagem (seção 2) |
| 1.22 | 22/11/2026 | Segunda opinião de ficha já aprovada: continua na Pesquisa; manter ou arquivar (seção 2) |
| 1.23 | 22/11/2026 | Definição de cada termo do vocabulário, com fonte, no "?" das marcações (seção 1) |
| 1.24 | 23/11/2026 | Modalidade da fila da Curadoria: escolher o tipo de exame antes de abrir; tipo informado no envio (seção 2) |
| 1.25 | 23/11/2026 | Triagem da modalidade em lote (periapical, interproximal, oclusal) (seção 2) |
| 1.26 | 23/11/2026 | Dentição, dentes decíduos, odontograma de situação e estruturas fora dos dentes na ficha (seção 1.12) |
