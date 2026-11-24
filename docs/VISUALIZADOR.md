# Visualizador de imagens (OHIF) — recursos do Rádix

O Rádix Imago usa o **OHIF Viewer v3.9** (motor gráfico cornerstone3D) para
mostrar as imagens DICOM. Os ajustes próprios do Rádix ficam em
`ohif/app-config.template.js`, que é carregado pelo OHIF. Nenhum desses ajustes
muda o arquivo DICOM: eles só mudam a forma de ver a imagem na tela.

## Mouse prático (todos os visualizadores, 23/11/2026)

| Ação | Resultado |
|---|---|
| Roda do mouse | Zoom no ponto do cursor. Na tomografia, a roda passa os cortes e **Ctrl + roda** dá zoom |
| Botão esquerdo (arrastar) | Move a imagem |
| Botão direito (arrastar) | Brilho e contraste (janela/nível) |
| Botão do meio (arrastar) | Zoom |
| Duplo clique | A imagem volta a caber no quadro |

No quadro **3D** da tomografia, o botão esquerdo **gira o volume**, que é o comportamento do OHIF.

## Tamanho real (todos os visualizadores, 23/11/2026)

- **1:1**: um pixel da imagem ocupa um pixel da tela.
- **Tamanho real**: mostra a imagem em milímetros de verdade. Para isso, a
  imagem precisa ter a medida do pixel (`PixelSpacing` ou
  `ImagerPixelSpacing`) e a tela precisa ter sido calibrada uma vez.
- **Medida duvidosa na tomografia** (24/11/2026): se uma tomografia (CT) diz que
  o campo da imagem passa de **35 cm** (o maior lado × a medida do pixel), a
  medida não é confiável, porque é maior que uma cabeça. Nesse caso, o
  "Tamanho real" fica desligado, e a dica explica o motivo e o tamanho que o
  arquivo informa; o 1:1 continua funcionando. É o caso das 2 tomografias do
  acervo (base pública STS-Tooth/Integrity): os arquivos originais informam
  pixel de **1,0 mm** em 512 × 512, ou seja, um campo de 51 cm. A conta estava
  certa, mas o dado não, e por isso a imagem ficava enorme (3,86x).
- **Calibrar tela** (aprimorada em 23/11/2026, conforme a especificação do Luciano). Há três jeitos:
  - **Cartão** (padrão, o mais preciso): um passo a passo guiado. A barra é ajustada até a largura de um cartão bancário (85,6 mm, padrão ISO/IEC 7810), com ajuste fino de 1 px.
  - **Régua**: a barra é ajustada até medir 50, 100 ou 150 mm numa régua encostada na tela, também com ajuste fino de 1 px. Serve para quem não tem cartão à mão.
  - **Tamanho da tela**: de 11,6" a 49", ou "Outro tamanho", com o valor conferido entre 5 e 120 polegadas. O Rádix calcula pela resolução da tela. É **só uma ajuda**, porque as polegadas anunciadas não garantem a escala.
- A calibração fica **salva neste navegador**, com o método, a data, a resolução e o zoom da tela. Só o **Salvar** grava; **Cancelar** não mexe na calibração anterior. **Recomeçar** volta a barra ao início, e **Apagar calibração salva** remove a calibração.
- **Situação**, ao lado dos botões:
  - **Não calibrada**;
  - **Calibrada**;
  - **Calibração recomendada**: a resolução ou o zoom da tela mudaram desde a calibração (outro monitor, por exemplo).
  - Depois de salvar, aparece "Calibração concluída ✓".

## Painel "Tomografia" (23/11/2026, revisto no mesmo dia)

O painel aparece só quando a série aberta é uma tomografia, ou seja, modalidade
CT com vários cortes. Os controles ficam **em coluna, à direita da imagem**, e
o painel é recolhível.

| Grupo | Opções | Como funciona |
|---|---|---|
| Planos | Axial · Sagital · Coronal · 3D | Cada plano é marcado ou desmarcado com um clique, e a tela mostra **só os planos marcados**: 1 plano ocupa um quadro, 2 ficam lado a lado, 3 ficam três lado a lado e 4 ficam em 2 × 2. O último plano marcado não desmarca. O exame abre com os 4. O Rádix registra no OHIF um protocolo para cada combinação (`radix-planos-…`), com quadros de volume (reconstrução multiplanar) |
| Janela | Osso · Partes moles · Dentes · Original | Valores em HU: Osso 3000/900, Partes moles 1000/150 (escolhidas em 23/11/2026 comparando no exame TC01 do acervo; as antigas 2000/500 e 400/40 ficavam estouradas na TCFC), Dentes 3000/1000. Quando o exame **não está em HU** (por exemplo, valores de 0 a 4095), o Rádix acha o ar e o pico das partes moles no próprio exame e converte as janelas para a escala dele (ar = −1000 HU; pico = 40 HU). "Original" volta à janela do exame |
| 3D | (só osso) | O quadro 3D abre direto com o volume **só do osso**, usando a predefinição `CT-Bone`, convertida para a escala do exame do mesmo jeito |
| Espessura | 0,625 · 2 · 5 · 10 mm | 0,625 mm é o corte fino. As outras espessuras fazem um "corte grosso" pela **média** dos cortes, como nos programas de TCFC |
| Referência | Linhas de referência | Em cada quadro de plano aparece a linha do corte que está no **quadro ativo**, aquele em que o curador está passando os cortes. Usa a ferramenta `ReferenceLines` do OHIF. Vem ligada; o botão desliga e liga |
| Miniatura | (automática) | Com **um plano só** na tela, abaixo da data, no canto de cima à esquerda, aparece uma miniatura com a linha do corte aberto: no axial, o sagital com uma linha horizontal; no coronal, o sagital com uma linha vertical; no sagital, o coronal com uma linha vertical. A miniatura é montada do próprio volume carregado. Com mais de um plano na tela ela não aparece, porque as linhas de referência ficam nas imagens grandes |

## Reconstrução panorâmica (23/11/2026)

1. Na Curadoria, com uma ficha de tomografia aberta, o atalho
   **"Reconstrução panorâmica"** abre a tela de traçar a curva
   (`/curadoria/reconstrucao`).
2. O curador escolhe a altura do corte axial e a faixa MIP, até a arcada
   aparecer inteira. Depois clica pontos no meio da arcada, de um lado ao
   outro. A tela mostra uma prévia da curva suave, a mesma spline do
   servidor.
3. Ele ajusta a faixa da panorâmica, o intervalo e a largura dos cortes e
   clica em **Gerar**.
4. No visualizador, o painel "Tomografia" ganha o grupo **Reconstrução**,
   com os botões **Panorâmica reconstruída** e **Cortes transversais**. Cada
   botão abre num quadro só a série mais nova daquele tipo. Os botões de
   Visualização voltam à tomografia.

### Canal mandibular (23/11/2026)

1. Na tela de reconstrução, em **Reconstruções já feitas**, o curador clica
   em **Marcar canal mandibular**. A panorâmica gerada aparece.
2. Ele clica pontos ao longo do canal, do forame mandibular ao forame
   mentual. Depois clica em **Outro lado** e marca o segundo canal. O 1º
   traçado fica amarelo e o 2º, ciano.
3. Em **Gravar canal**, o servidor gera duas séries novas, em cor: **Panorâmica
   com canal** (o traço) e **Cortes com canal** (uma marca na altura do canal
   em cada corte, sobre a faixa da panorâmica).
4. No visualizador, o grupo **Reconstrução** do painel Tomografia ganha os
   botões **Panorâmica com canal** e **Cortes com canal**.

Limite: a panorâmica mostra a altura do canal ao longo da arcada, mas não se
ele está mais para lingual ou vestibular. Nos cortes, a marca indica só a
altura. É material de ensino, não diagnóstico.

As séries geradas ficam no mesmo exame, para visualizar e ensinar. Elas não entram na fila da curadoria. Regras completas: `docs/REGRAS_DE_NEGOCIO.md`, seção 1.13.

**Limitações conhecidas:**

- A tomografia odontológica (TCFC/CBCT) nem sempre usa unidades Hounsfield
  calibradas. Por isso, as janelas são pontos de partida, e o ajuste fino é
  feito com o botão direito do mouse.
- O OHIF não tem reconstrução panorâmica curva nem cortes transversais ao
  longo da arcada. Por isso o Rádix gera esses recursos no servidor, como
  séries novas (seção acima).
- O canal mandibular é marcado na panorâmica (seção acima). A posição vestibulolingual dele não é marcada.
