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

**Limitações conhecidas:**

- A tomografia odontológica (TCFC/CBCT) nem sempre usa unidades Hounsfield
  calibradas. Por isso, as janelas são pontos de partida, e o ajuste fino é
  feito com o botão direito do mouse.
- Reconstrução panorâmica curva e cortes transversais ao longo da arcada,
  recursos comuns em softwares odontológicos dedicados, não existem no OHIF.
  Eles exigiriam um desenvolvimento próprio, a ser planejado à parte.
