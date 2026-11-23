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
  `ImagerPixelSpacing`) e a tela precisa ter sido calibrada uma vez com um
  cartão de 85,6 mm (padrão ISO/IEC 7810).
- **Calibrar tela**: refaz a calibração, por exemplo ao trocar de monitor ou
  mudar o zoom do navegador.

## Painel "Tomografia" (23/11/2026)

O painel aparece só quando a série aberta é uma tomografia, ou seja, modalidade
CT com vários cortes. Ele é recolhível, para liberar a imagem.

| Grupo | Opções | Como funciona |
|---|---|---|
| Visualização | Axial · 3 planos · 4 quadros · 3D | Protocolos do OHIF `default`, `mpr` (reconstrução multiplanar: axial, coronal e sagital), `fourUp` (3 planos + 3D) e `only3D`. Ao abrir um estudo, o visualizador começa sozinho em **4 quadros** |
| Filtro | Osso · Partes moles · Dentes · Original | Janela/nível nos planos: Osso 1800/400, Partes moles 400/40, Dentes 3000/1000. "Original" volta à janela do próprio exame |
| 3D | 3D osso · 3D partes moles · 3D MIP | Predefinições de renderização de volume do cornerstone3D: `CT-Bone`, `CT-Soft-Tissue` e `CT-MIP` |
| Espessura | Fina · MIP 5 / 10 / 20 mm | "Corte grosso" com projeção de máxima intensidade (MIP) nos planos, útil para seguir canais e raízes. "Fina" volta ao corte normal |

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
