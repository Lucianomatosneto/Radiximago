# Radix Imago — Especificação da Fase 1: foto do negatoscópio pelo celular

| Campo | Valor |
|---|---|
| Versão | 1.0 (decisões validadas e implementadas) — 10/11/2026 |
| Responsável | Luciano de Matos Neto (PPGINFOS/UFSC) |
| Status | **Decisões D1–D8 e as quatro da Etapa 1 validadas pelo Luciano em 10/11/2026; implementado.** Teste em aparelho real (seção 7) pendente. |
| Base | `REGRAS_DE_NEGOCIO.md` v1.2, `DADOS_E_PRIVACIDADE.md` v1.3, decisões de 08/11/2026 (papéis e envio), Bloco 4 (prioridade desktop > tablet > celular) |

> **Resultado da conferência com o código (Etapa 1, 10/11/2026).** Boa parte da Fase 1 já existia desde a etapa B (08/11): `/envios`, `foto_para_dicom.py` (Secondary Capture, OT, tons de cinza, sem EXIF), destinos, fila de análise e visibilidade. Para **não criar caminho paralelo**, a rota ficou em `/envios/foto` (e `/envios/foto/iniciar`), e não em `/images/foto`. Decisões do Luciano na Etapa 1:
> 1. destinos por perfil continuam os de 08/11 (estudante: só para mim ou análise; equipe: fila ou só para mim);
> 2. `/envios` passa a aceitar **só DICOM**; toda foto vai pela janela de 5 minutos;
> 3. o dono pode retirar a imagem também enquanto ela está **em análise**;
> 4. o texto na foto é procurado e tarjado **antes** de gravar no Orthanc.
>
> Outras confirmações: a modalidade é texto simples no banco (sem tipo enumerado no PostgreSQL), então "OT" não precisou de migração; a migração `b3e5f7a9c1d2` só cria `janelas_envio_foto` e `orthanc_references.formato_entrada` (volta testada). Ao implementar, o comprovante **não** foi guardado no navegador (seção 4.2, "Limite honesto"): o teste de segurança ASVS 14.3.3 só permite preferências no armazenamento do navegador. Depois de recarregar a página, a tela pergunta ao servidor (`GET /envios/foto/janela`) e recebe a mesma janela, com o mesmo prazo. O comportamento do OHIF 3.9 sem `PixelSpacing` (medida em pixels) ainda precisa ser confirmado num teste real. Os testes automáticos do projeto eram 572 (não 241).

## 1. Objetivo e escopo

**Objetivo:** permitir que, pelo celular (iOS ou Android, no navegador), um usuário tire uma foto de uma radiografia no negatoscópio, ou envie uma foto que já tem, e a encaminhe ao seu professor ou curador. A foto vira um arquivo DICOM e entra no mesmo fluxo de anonimização e curadoria que já existe.

**Dentro da Fase 1**
- Tela mobile de envio: tirar foto (câmera) ou escolher arquivo (galeria).
- Recorte, giro e **tarja** (cobrir áreas com dados de identificação) no próprio celular, antes de enviar.
- Conversão da foto em DICOM (*Secondary Capture*, ver seção 4) no servidor.
- Passagem pelo pipeline existente (anonimização, leitura de texto na imagem, registro no Orthanc, auditoria).
- Escolha do destino: "só para mim" (Minhas imagens) ou "enviar para análise" a um professor ou curador.
- **Janela de 5 minutos** para concluir o envio, controlada pelo servidor (seção 4.2).

**Fora da Fase 1** (ver seção 10): banco de imagens, filtros e busca avançada adaptados ao celular (Fase 2); grupos e compartilhamento com colegas (Fase 3).

## 2. Decisões a validar antes de implementar

| # | Decisão | Recomendação | Motivo |
|---|---|---|---|
| D1 | **Estudante poderá enviar imagem?** Hoje a matriz diz que só professor, curador e administrador enviam DICOM. | Sim, **somente por esta rota de foto**. O envio de DICOM bruto continua restrito. | Já decidido em 08/11; muda a matriz de permissões, então precisa constar nos documentos. |
| D2 | **Quem vê uma foto ainda não aprovada?** Hoje imagem pendente só aparece para a curadoria. | O **dono** (em Minhas imagens) e o **destinatário escolhido**; curadoria e administrador como já é hoje. Nenhum outro estudante. | Mantém a regra "estudante só vê aprovada", abrindo uma única exceção: a própria foto. |
| D3 | **Modalidade da foto.** O banco só aceita `RX`. | Acrescentar o valor **`OT`** (outros / foto), com migração Alembic mínima. | É a "mudança mínima necessária" já documentada; a tabela de referência fica para a expansão multidomínio. |
| D4 | **Foto de exame de paciente real.** Projeto sem aprovação do CEP; imagens atuais vêm da internet. | Construir e testar com imagens **sem paciente** (da internet ou sintéticas). Liberar foto de exame real **somente após** o checklist de dados reais e o CEP. | LGPD e `checklist_antes_de_dados_reais`. |
| D5 | **Cor ou tons de cinza?** | Converter para **tons de cinza** (8 bits). | Radiografia não tem cor; o arquivo fica menor e padronizado. |
| D6 | **O dono pode apagar a própria foto enquanto não aprovada?** | Sim. | Atende ao direito de eliminação (LGPD art. 18) sem depender do administrador. |
| D7 | **Janela de 5 minutos: para quem?** | Para **todos** que usam a rota de foto (estudante, professor, curador, administrador), não só o estudante. | O risco de dados inconsistentes é o mesmo em qualquer perfil, e uma regra única é mais simples de testar e de explicar. |
| D8 | **Tolerância de rede.** | Os 5 minutos contam até o servidor **receber** o envio, com **30 segundos extras** só para o envio terminar em rede lenta. Valor configurável. | Em 4G fraco a foto pode demorar a subir; sem tolerância, o usuário perderia o envio por culpa da rede e não por demora dele. |

## 3. Fluxo do usuário (celular)

1. Abre o link do Radix no navegador do celular e entra com e-mail e senha.
2. Toca em **Enviar imagem**. **Aqui começa a contagem de 5 minutos**, visível na tela.
3. Escolhe **Tirar foto** (abre a câmera do aparelho) ou **Escolher arquivo**.
4. A foto aparece na tela de ajuste. O usuário pode **girar** de 90 em 90°, **recortar** e **cobrir com tarja** qualquer área com nome, número ou data.
5. Marca a confirmação: *"Confirmo que a imagem não mostra dados que identifiquem o paciente."*
6. Escolhe o destino: **Só para mim** ou **Enviar para análise** (e seleciona o professor ou curador).
7. Toca em **Enviar**. Aparece o resultado: "Recebida e em processamento" ou o motivo da recusa, em linguagem simples.

Se os 5 minutos acabarem antes do envio, a foto é descartada do celular e o usuário recomeça do passo 2 (seção 4.2).

Textos da tela passam pelo `next-intl` (como o resto do sistema) e o visual segue o padrão aprovado (fundo azul-marinho, turquesa, leitura confortável).

## 4. Arquitetura (fluxo de dados)

```
Celular (navegador)                         Servidor Radix
───────────────────                         ──────────────
Câmera / galeria
   │
Ajuste: girar, recortar, TARJA
(tarja gravada nos pixels, no celular)
   │
Reduz (lado maior ≤ 2048 px)
e reconverte em JPEG  ───────────────►  POST /images/foto  (FastAPI)
(a reconversão já descarta o EXIF)        1. confere perfil, limite e tamanho
                                          2. confere que é mesmo JPEG/PNG
                                          3. reconstrói a imagem (Pillow), remove EXIF
                                          4. converte para tons de cinza
                                          5. monta o DICOM (pydicom): Secondary Capture
                                          6. entrega ao MESMO pipeline do envio de DICOM:
                                             anonimização → leitura de texto (OCR) →
                                             Orthanc → orthanc_references → auditoria
                                          7. grava dono, destino e status (pendente)
```

**O que é "Secondary Capture":** é o tipo de arquivo DICOM criado para imagens que **não saíram direto de um aparelho** de raios X, como uma captura ou fotografia. Identificador padrão: `1.2.840.10008.5.1.4.1.1.7`. Usar o padrão, em vez de inventar um formato, ajuda a defender a decisão na dissertação.

**Princípio:** não criar um segundo caminho. A foto convertida **reaproveita** o pipeline atual. Menos código novo, menos risco e a curadoria, a busca e o OHIF funcionam sem alteração.

### 4.1 O papel do Orthanc e a ordem da anonimização

O Orthanc anonimiza as **etiquetas** do arquivo DICOM (nome, ID, nascimento etc.). Ele **não enxerga texto desenhado dentro da imagem**. Numa foto de filme, o risco está justamente aí: um nome impresso no canto da radiografia faz parte dos pixels. Por isso a anonimização da foto tem **três camadas**, e o Orthanc sozinho não substitui nenhuma delas:

1. **Tarja no celular**, antes do envio (seção 3).
2. **Leitura do texto na imagem (OCR) no servidor**, que o Radix já faz hoje (seção 6).
3. **Validação humana do curador**: a ficha só é aprovada com "anonimização validada" marcada (regra já existente).

As etiquetas da foto já nascem limpas, porque o servidor as cria do zero (seção 5.2).

**A foto não vai "direto" ao Orthanc.** O Orthanc é interno e não tem login, perfis, limites nem auditoria do Radix. Todo envio passa pela API do Radix, que depois fala com ele.

**Ordem preferida:** verificar os pixels (OCR) **antes** de gravar no Orthanc, para que um dado identificável nunca fique guardado lá. **(a confirmar no código:** hoje, segundo `DADOS_E_PRIVACIDADE.md`, o DICOM original fica no Orthanc por segundos ou minutos até ser anonimizado. O Claude Code deve dizer se a foto pode passar pela verificação antes.)

**Foto "só para mim":** nunca é publicada no banco geral sem a validação de um curador.

### 4.2 Janela de 5 minutos para concluir o envio

**Por quê:** evitar que alguém abra o processo, deixe para terminar depois e acabe enviando com dados que já não valem (destinatário trocado, foto antiga, confirmação de privacidade feita muito antes).

**Como funciona, passo a passo:**
1. Ao tocar em **Enviar imagem**, o celular pede ao servidor para **abrir uma janela** (`POST /images/foto/iniciar`). O servidor responde com um **comprovante assinado** e com a **hora exata em que a janela termina** (hora do servidor + 5 minutos).
2. A tela mostra a contagem regressiva calculada a partir dessa hora de término, e **não** de um cronômetro do celular. Assim, se o navegador for para segundo plano enquanto a câmera está aberta, o tempo continua correto na volta.
3. No envio final, o servidor confere o comprovante: precisa ser **do mesmo usuário**, estar **dentro do prazo** (mais a tolerância da D8) e **ainda não ter sido usado**. Só então processa a foto.
4. Fora do prazo, o servidor recusa (resposta 410, "não existe mais") com uma mensagem simples: "O tempo para enviar acabou. Comece de novo."

**Regras:**
- **Quem decide é o servidor.** Mudar a hora do celular não adianta.
- **A foto só chega ao servidor no envio final.** Antes disso ela existe apenas na memória do celular. Se o tempo acabar, não há nada para apagar no servidor e nenhum rascunho fica guardado.
- **Uma janela aberta por vez por conta:** abrir uma nova cancela a anterior. Abrir janelas também tem limite (sugestão: 30 por hora, junto do limite de fotos).
- **Reconferir no envio:** destinatário ainda ativo e com perfil de professor ou curador, e confirmação de "sem dados de identificação" marcada **dentro** da janela.
- Aviso na tela quando faltar **1 minuto**. Sem prorrogação automática: para ter mais tempo, o usuário recomeça.
- **Valores configuráveis:** duração (5 minutos) e tolerância (30 segundos) ficam em variáveis de ambiente (`.env` para `config.py`), para ajustar depois dos testes reais sem mexer no código.
- **Auditoria:** `foto_janela_aberta`; tentativas vencidas ou repetidas entram como `foto_recusada`, com motivo `tempo_esgotado` ou `comprovante_reutilizado`.

**Limite honesto:** ao voltar da câmera, alguns celulares (principalmente com pouca memória) podem recarregar a página e perder a foto que estava na tela. Por isso o comprovante deve ficar guardado na sessão do navegador: a janela continua valendo e o usuário só refaz a foto, dentro do tempo restante. **(a testar em aparelho real.)** Se os testes mostrarem que cinco minutos é pouco para a tarja em tela pequena, o ajuste é só mudar o valor configurável.


## 5. Requisitos técnicos

### 5.1 Frontend (Next.js / TypeScript / Tailwind)
- Dois botões: câmera (`<input type="file" accept="image/*" capture="environment">`) e galeria (mesmo campo, sem `capture`). O atributo `capture` abre o aplicativo de câmera do próprio aparelho, o que é mais estável em iOS e Android do que controlar a câmera pelo código.
- Editor simples em **canvas** (recurso nativo do navegador): girar, recortar, tarja. A tarja é **gravada nos pixels** antes do envio; nunca como camada sobreposta.
- Reduzir o lado maior para 2048 px e reconverter para JPEG (qualidade ≈ 0,85). Alvo: 0,5 a 2 MB por foto.
- Mostrar o resultado da recusa em português claro; nunca mensagem técnica.
- **Não adicionar dependência nova** sem perguntar (há conflito `yarn.lock` x `package-lock.json` ainda pendente; e só bibliotecas de licença livre, sem patente).

### 5.2 Backend (FastAPI / Python)
- Nova rota `POST /images/foto` (multipart): `arquivo`, `destino` (`so_para_mim` ou `analise`), `destinatario_id` (obrigatório se `analise`; precisa ser professor ou curador ativo), `confirmacao_sem_identificacao` (obrigatório = verdadeiro).
- **Perfis permitidos:** estudante, professor, curador, administrador. Pesquisador e suporte: não.
- Validação: tipo real do arquivo pelos primeiros bytes (JPEG ou PNG), nunca pela extensão; tamanho máximo **10 MB**; limite de pixels (proteção contra "bomba de descompressão"); a imagem é **reconstruída** pelo Pillow, e o arquivo recebido não é guardado.
- DICOM gerado: Secondary Capture, `Modality = OT`, imagem em tons de cinza (`MONOCHROME2`, 8 bits), **UIDs novos**, descrição "Foto de negatoscópio", **sem nome, e-mail ou qualquer dado do usuário nas etiquetas** (o autor fica só no banco), data conforme a política vigente (só o ano). **Sem `PixelSpacing`:** a imagem não tem escala real, e isso deve estar registrado no comentário do arquivo.
- Passar o arquivo à função que o envio de DICOM já usa. **(a confirmar no código: nome e local dessa função.)**
- **Atomicidade:** se qualquer etapa falhar (inclusive o Orthanc), nada fica gravado pela metade (mesma regra de `REGRAS_DE_NEGOCIO.md`).

### 5.3 Banco de dados
- Migração Alembic: valor `OT` na modalidade (D3). Em PostgreSQL, acrescentar valor a um tipo enumerado tem restrições dentro de transação; o Claude Code deve tratar isso e **testar o caminho de volta (rollback)**.
- Registrar origem ("foto de negatoscópio"), dono, destino e destinatário. **(a confirmar:** se `orthanc_references` comporta esses campos ou se precisa de campos novos; o Claude Code propõe o mínimo na Etapa 1.)

### 5.4 Visibilidade (D2)
- Dono vê as próprias fotos em **Minhas imagens** (inclusive pendentes). **(a confirmar:** como Minhas imagens funciona hoje; ela guarda imagens aprovadas salvas, então a foto própria é um conceito novo.)
- Destinatário vê em sua fila de análise, com o nome de quem enviou.
- Professor classifica e marca, mas **não publica**; só o **curador** publica no banco geral (decisão de 08/11).
- Qualquer outra pessoa recebe **404**, sem revelar que a foto existe.

### 5.5 Limites e auditoria
- Limite novo sugerido: **30 fotos por hora por conta**, com resposta 429 acima disso. Deve entrar na tabela da seção 3 de `REGRAS_DE_NEGOCIO.md` (o teste `test_limites_anti_abuso_documentados_sao_os_do_codigo` compara a tabela com o código).
- Eventos de auditoria: `foto_recebida`, `foto_convertida_dicom`, `foto_enviada_analise`, `foto_recusada` (com o motivo, **sem** o conteúdo).

## 6. Privacidade, LGPD e segurança

- **Privacidade na origem:** a tarja é aplicada no celular; a versão sem tarja **nunca sai do aparelho**. Mesmo assim o servidor **não confia** nisso: o pipeline continua lendo o texto da imagem (OCR) e recusa ou sinaliza o que parecer identificação.
- **O arquivo original não é retido** (mesmo princípio do nível N4 em `DADOS_E_PRIVACIDADE.md`). Só o DICOM já tratado fica no Orthanc.
- **EXIF removido** no celular e de novo no servidor (localização GPS, modelo do aparelho).
- **Limite honesto:** o OCR não garante achar todo nome escrito à mão ou em letra pequena. A análise formal de risco de reidentificação continua pendente (orientador e CEP). Por isso D4.
- Enumeração: acesso a foto de outro usuário por número sequencial retorna 404 (como já se testa nas anotações).
- Referências ASVS a registrar na matriz: upload de arquivos (V5), controle de acesso (V8) e limites (V2).

## 7. Testes obrigatórios

**Unitários:** a conversão gera DICOM legível pelo `pydicom`; tons de cinza; UIDs únicos; nenhuma etiqueta com dado pessoal; sem EXIF; sem `PixelSpacing`.

**Integração:** cada perfil (estudante, professor, curador, administrador aceitos; pesquisador e suporte recusados); destinatário que não é professor/curador recusado; arquivo grande recusado; tipo errado recusado; limite 429; falha do Orthanc não deixa registro pela metade.

**Janela de 5 minutos:** envio aos 4:59 aceito; aos 5:31 recusado (410); comprovante reutilizado recusado; comprovante de outro usuário recusado; mudar a hora do celular não altera o resultado; abrir uma segunda janela cancela a primeira; destinatário desativado durante a janela é recusado.

**Segurança:** arquivo HTML ou executável disfarçado de `.jpg`; imagem gigante (descompressão); foto com GPS no EXIF; estudante tentando abrir foto de outro estudante (404); campos "escondidos" no pedido (como o teste 8.2.3); foto com texto gravado, para confirmar que o OCR reage.

**Manual em aparelho real** (a ferramenta de teste não muda o tamanho da tela): iPhone com Safari e Android com Chrome, em Wi-Fi e em 4G; câmera, galeria, giro, recorte, tarja, envio, resultado e fila do professor.

## 8. Documentação a atualizar

- `REGRAS_DE_NEGOCIO.md`: limite novo, regras da foto, janela de 5 minutos, histórico (v1.3).
- `DADOS_E_PRIVACIDADE.md`: inventário (foto original não retida), matriz de acesso (estudante envia **foto**; dono vê a própria), histórico (v1.4).
- `SEGURANCA.md`, se a validação de arquivo criar regra nova.
- Swagger/OpenAPI e README.
- `matriz_asvs.csv`, se algum requisito mudar de situação.

## 9. Critérios de aceite

1. Em iPhone e Android reais, o fluxo completo funciona do começo ao fim.
2. A foto enviada aparece no Orthanc como DICOM *Secondary Capture*, modalidade `OT`, sem dado pessoal nas etiquetas.
3. O destinatário vê a foto na fila; o dono, em Minhas imagens; ninguém mais.
4. Todos os testes da seção 7 passam, **inclusive os 241 que já existem**, sem regressão.
5. Nenhuma foto fica gravada pela metade após falha.
6. Documentos da seção 8 atualizados e conferidos com o código.
7. A migração tem caminho de volta testado.
8. A janela de 5 minutos é aplicada pelo servidor e testada (expirada, reutilizada, de outro usuário, relógio do celular alterado).

## 10. Fora do escopo (próximas fases) e riscos

- **Fase 2:** banco de imagens, filtros e busca avançada no celular (lista em uma coluna, filtros em gaveta, visualizador simples com zoom por pinça; marcação e curadoria seguem no notebook). O teste de responsividade (375, 768 e 1440 px) ainda não foi feito.
- **Fase 3:** grupos e compartilhamento com colegas.
- **Tarefa separada (não faz parte da Fase 1): termo de ciência no login.** Depois da senha, o usuário marca uma caixa confirmando que está ciente de que as imagens do sistema são usadas **exclusivamente para ensino e pesquisa e não têm validade para diagnóstico**. Pontos a decidir quando a tarefa for especificada: pedir a cada login ou só no primeiro e quando o texto mudar; onde registrar o aceite (usuário, data e hora, versão do texto, na auditoria); o que acontece com quem não aceita (não entra). Isso se relaciona com a pendência já registrada de "termo de uso e privacidade para os usuários" em `DADOS_E_PRIVACIDADE.md`.
- **Risco 1 — qualidade da foto:** reflexo, perspectiva e interferência de tela. A tela de envio deve mostrar dicas ("sem flash", "centralize"). O uso é educacional, nunca diagnóstico.
- **Risco 2 — medidas falsas:** sem escala real, **nenhuma medida em milímetros** pode ser exibida para esse tipo de imagem. **(a confirmar:** como o OHIF 3.9.2 se comporta sem `PixelSpacing`; bloquear as ferramentas de medida se necessário.)
- **Risco 3 — moldura:** o recorte automático atual foi feito para moldura branca de leitor de placa. Em foto de negatoscópio ele tende a "ficar na dúvida" e não cortar, o que é seguro; confirmar em teste.
- **Risco 4 — política do Bloco 6:** o documento proíbe fotografar a tela do Radix sem autorização. Esta função fotografa o **filme físico**, que é outra coisa. Vale deixar isso escrito no termo de uso.

## 11. Justificativa para a dissertação

- **Mudança mínima necessária:** reutiliza o pipeline de anonimização e curadoria em vez de criar um caminho paralelo; a única alteração estrutural é o valor `OT` na modalidade.
- **Padrão aberto:** DICOM *Secondary Capture* em vez de formato próprio, o que preserva a interoperabilidade (princípio FAIR).
- **Privacidade desde a concepção (LGPD art. 46):** tarja no aparelho, original não retido, EXIF removido, confirmação do usuário e leitura de texto no servidor como segunda barreira.
- **Escopo declarado de dispositivos:** notebook como prioridade; celular com funções simples e justificadas, conforme o Bloco 4.
