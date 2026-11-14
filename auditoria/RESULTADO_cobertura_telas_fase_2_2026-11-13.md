# Resultado — Cobertura de telas, Fase 2 (13/11/2026)

**Tarefa:** `TAREFA_claude_code_cobertura_telas_2026-11-13.md`, Fase 2 — componentes de desenho, câmera e microfone.
**Branch / PR:** `qualidade/cobertura-telas-fase-2` → `redesign-ui`, PR #72.
**Código do sistema alterado:** nenhum. Só testes, apoio de testes, catraca e guia.

Legenda: **[medido]** = número tirado de uma execução real nesta sessão; **[hipótese]** = avaliação minha, não medida.

---

## 1. Resumo em linguagem simples

- Os 13 componentes desta fase são as partes "difíceis" de testar: desenham na imagem (canvas), usam a câmera, o microfone ou o visualizador OHIF (que roda em outro endereço).
- O navegador de teste não desenha, não tem câmera nem microfone. Por isso, cada teste **simula só o mínimo** e o topo de cada arquivo diz **o que ficou de fora** (vai para o Playwright ou para o teste à mão).
- 12 dos 13 componentes passaram de quase 0% para **91% a 100%** das linhas. O 13º (`PainelAchadosEstruturados`) não é usado por nenhuma tela — ver a decisão no item 6.
- A cobertura total do frontend foi de **33,39% para 56,17%** das linhas **[medido]**. A catraca subiu junto.
- Três achados aguardam decisão (item 6). Nenhum foi corrigido, como manda a regra.

---

## 2. Cobertura por arquivo (linhas) — antes e depois **[medido]**

"Antes" = `lcov` da `redesign-ui` com os PRs #70 e #71 (commit `422d22b`). "Depois" = esta branch.

| Componente | Teste | Antes | Depois | Ramos depois |
|---|---|---|---|---|
| segmentacao/PintorSegmentacao | `pintor-segmentacao.test.tsx` (24) | 0/483 (0%) | 477/483 (98,8%) | 356/400 (89,0%) |
| VisualizadorSequencial | `visualizador-sequencial.test.tsx` (25) | 0/429 (0%) | 424/429 (98,8%) | 459/509 (90,2%) |
| curadoria/PainelVoz | `painel-voz.test.tsx` (33) | 0/300 (0%) | 297/300 (99,0%) | 290/311 (93,2%) |
| impressao/MenuPrancha | `menu-prancha.test.tsx` (15) | 23/208 (11,1%) | 198/208 (95,2%) | 179/207 (86,5%) |
| curadoria/MarcadorAchado | `marcador-achado.test.tsx` (13) | 0/197 (0%) | 195/197 (99,0%) | 139/162 (85,8%) |
| visualizador/EtiquetaMarcacoes | `etiqueta-marcacoes.test.tsx` (9) | 0/171 (0%) | 164/171 (95,9%) | 170/204 (83,3%) |
| detalhe/AnotacoesImagem | `anotacoes-imagem.test.tsx` (14) | 0/166 (0%) | 152/166 (91,6%) | 101/124 (81,5%) |
| curadoria/ColunaFichaCuradoria | `coluna-ficha.test.tsx` (20) | 6/126 (4,8%) | 125/126 (99,2%) | 160/174 (92,0%) |
| curadoria/PainelAchadosFicha | `coluna-ficha.test.tsx` | 3/121 (2,5%) | 111/121 (91,7%) | 137/160 (85,6%) |
| segundaOpiniao/PainelParecer | `painel-parecer.test.tsx` (6) | 77/100 (77,0%) | 100/100 (100%) | 158/161 (98,1%) |
| envios/EditorFoto | `foto-celular.test.tsx` (18) | 0/141 (0%) | 140/141 (99,3%) | 58/69 (84,1%) |
| envios/EnvioFotoCelular | `foto-celular.test.tsx` | 0/126 (0%) | 119/126 (94,4%) | 80/87 (92,0%) |
| curadoria/PainelAchadosEstruturados | — | 0/96 (0%) | 0/96 (0%) | — (código morto, item 6) |

## 3. Total do frontend **[medido]**

| Métrica | Antes (Fase 1) | Depois (Fase 2) | Nova catraca |
|---|---|---|---|
| Linhas | 33,39% (3.655/10.945) | **56,17%** (6.148/10.945) | 56,1 |
| Instruções | 32,8% | **54,85%** (7.063/12.875) | 54,8 |
| Ramos | 30,18% | **53,12%** (5.255/9.892) | 53,1 |
| Funções | 30,61% | **53,66%** (1.632/3.041) | 53,6 |

Testes Vitest: 214 → **391** (+177 nos 10 arquivos novos desta fase) **[medido]**. Tempo da suíte local com cobertura: ~1 min 08 s **[medido]**.

## 4. Verificações **[medido]**

| Verificação | Resultado |
|---|---|
| Vitest (391 testes) | todos passam; 6 rodadas seguidas da pasta `telas/` sem falha após os ajustes do item 7 |
| pytest | 657 passed |
| tsc (frontend) | ok |
| tsx (16 arquivos `testes/*.teste.ts`) | 0 falhas |
| next build | ok |
| ESLint | 2 avisos (igual a antes) |
| Ruff / Mypy | sem mudança no backend (4 / 72, igual a antes) |
| e2e (16) | sem mudança no código do sistema; resultado do CI no item 9 |
| CI do PR #72 | ver item 9 |
| Dependências novas | **nenhuma** |

## 5. Prova de que os testes falham quando devem (mutação) **[medido]**

Cada linha: uma regra do componente foi quebrada de propósito, o teste rodou e o arquivo voltou ao original (`git checkout`).

| Componente | Mutação | Resultado |
|---|---|---|
| PainelVoz | sessão expirada (401) deixa de ser reconhecida | 2 testes falham |
| PainelVoz | ensinar a frase mesmo com "Lembrar" desmarcado | **sobreviveu** → teste reforçado → 1 falha |
| VisualizadorSequencial | aceitar mensagem de qualquer endereço (não só do OHIF) | 1 falha |
| VisualizadorSequencial | estudante passa a gravar o giro | 3 falham |
| PintorSegmentacao | varinha sem limite de tamanho da região | 1 falha |
| PintorSegmentacao | nova ação não apaga o "refazer" antigo | **sobreviveu** → teste novo → 1 falha |
| MenuPrancha | limite de 30 imagens vira 300 | 1 falha |
| MarcadorAchado | giro deixa de "grudar" em 90° | **sobreviveu** → teste reforçado (≈92° gruda, ≈97° não) → 1 falha |
| EditorFoto | lado máximo 2048 vira 4096 | 10 falham |
| EditorFoto | desfazer sem limite de 5 | **sobreviveu** → teste novo → 1 falha |
| EnvioFotoCelular | prazo vencido (410) deixa de ser reconhecido | 1 falha |
| PainelParecer | Ctrl+Enter deixa de concluir | 1 falha |
| ColunaFichaCuradoria | seta ↓ deixa de avançar o holofote | 1 falha |
| AnotacoesImagem | editar passa a criar outra (POST em vez de PUT) | 1 falha |
| EtiquetaMarcacoes | Enter deixa de isolar a marcação | 1 falha |

Resultado: 15 mutações; 4 sobreviveram na primeira rodada e os testes foram reforçados até falharem. Duas mutações que bateram em comentários foram descartadas (inválidas).

## 6. Achados — aguardam decisão do Luciano (nada foi corrigido)

1. **Defeito (baixo):** falta a tradução `Visualizador.anotacoes.salvando` em `pt.json` e `en.json`. Enquanto uma anotação está sendo salva, o botão mostra o nome técnico da chave em vez de "Salvando…". O teste registra o aviso `MISSING_MESSAGE` do next-intl. A correção seria só acrescentar a chave nos dois arquivos.
2. **Código morto:** `curadoria/PainelAchadosEstruturados.tsx` (96 linhas) e `SeletorDentesQuadrante` não são importados por nenhuma tela. Por isso não foram testados. Opções:
   - (a) apagar os arquivos;
   - (b) colocá-los em `sonar.coverage.exclusions`;
   - (c) manter como estão.
   **[hipótese]** Recomendo (a), porque código sem uso não protege nada e confunde a manutenção.
3. **Observação (fragilidade de tela):** no EditorFoto, o botão "Aplicar recorte" só aparece no próximo redesenho da tela. Hoje esse redesenho vem do relógio da contagem regressiva (até ~1 s depois de soltar o dedo). Se o relógio sair dessa tela, o botão pode não aparecer. O teste espera até 2,5 s e tem um comentário explicando isso.
4. **Observação (Pintura):** a contagem "N pixels pintados" só se atualiza quando o estado de gravação muda. Se o curador age enquanto a gravação anterior ainda está a caminho, o número na tela pode atrasar até o fim dessa gravação. O que é **gravado** está sempre certo: o teste de "duas ações seguidas" confere. **[hipótese]** Efeito só visual e passageiro; não pede correção agora.

## 7. Estabilidade

- 6 rodadas completas da pasta `telas/` **[medido]**. Duas falhas raras apareceram (1 vez cada) e foram corrigidas **no teste**, sem mexer no sistema:
  - `painel-voz`: o teste olhava o aviso "Aprendido" antes de a tela se redesenhar. Agora espera o aviso aparecer.
  - `foto-celular` (Fase 2, prazo vencido): o teste conferia o botão "Começar de novo" enquanto o novo pedido ainda estava a caminho. Agora espera o segundo pedido e o botão.
- Depois dos ajustes: 3 rodadas seguidas dos arquivos afetados e a suíte completa com cobertura, todas sem falha **[medido]**.

## 8. O que NÃO dá para cobrir em teste de componente (fica para o Playwright ou para o teste à mão)

| Componente | O que fica de fora | Por quê |
|---|---|---|
| PintorSegmentacao | aparência da pintura, PNG real, desempenho com radiografia grande | o canvas é simulado: guarda pixels numa memória simples |
| VisualizadorSequencial | o OHIF de verdade desenhando marcações, girando e trocando de série; tela cheia real | o OHIF roda num iframe de outro endereço, que o jsdom não carrega |
| PainelVoz | qualidade da transcrição; detecção de pausa na fala (`lib/escutaContinua.ts`); permissão do navegador | não há microfone; o "interpretador" (`lib/vozCuradoria.ts`) foi substituído por respostas fixas, porque o teste é do componente |
| EditorFoto / EnvioFotoCelular | câmera real do celular, JPEG regravado de verdade (EXIF removido) | sem câmera; o canvas só anota os comandos |
| MarcadorAchado | detecção da borda branca da radiografia (lê pixels) | trocada por um valor fixo no teste de recorte |
| MenuPrancha | o PDF/PNG gerado de verdade e o diálogo de impressão | quem gera é o servidor; `print()` não existe no jsdom (linhas 453–459 descobertas) |
| AnotacoesImagem | parte do arrasto fino da seta com o mouse (linhas 183–226) | depende de `ownerSVGElement` medido pelo navegador |

Linhas que ficaram descobertas por arquivo (amostra): retornos de segurança (`return null` em URL inválida no Visualizador), `onContextMenu`, `onBlur` e trechos de impressão listados acima. Nenhuma regra de negócio importante ficou sem teste **[hipótese, revisando o lcov]**.

## 9. CI do PR #72

Todas as verificações verdes no commit dos testes (`a4b28a6`) **[medido]**:

| Verificação no GitHub | Resultado | Duração |
|---|---|---|
| Testes do projeto, Vitest (com catraca) e build de produção | sucesso | 1 min 28 s |
| Playwright (e2e) | sucesso | 1 min 54 s |
| pytest + auditoria da API | sucesso | 2 min 53 s |
| Frontend (TypeScript; ESLint informa) | sucesso | 36 s |
| Python (Ruff + Mypy, informativo) | sucesso | 31 s |
| Segurança | sucesso | 1 min 13 s |

Tempo total do CI: cerca de 3 min (as verificações rodam em paralelo). A Fase 2 acrescentou cerca de 20 s ao Vitest **[hipótese: comparando com a suíte local]**.

## 10. Arquivos do PR

| Arquivo | O que é |
|---|---|
| `auditoria/ferramentas/frontend-testes/telas/apoio/preparar.ts` | simula `Element.scrollTo` |
| `auditoria/ferramentas/frontend-testes/telas/apoio/montar.tsx` | servidor falso: cabeçalhos e corpo `FormData` |
| `telas/coluna-ficha.test.tsx`, `painel-parecer.test.tsx`, `anotacoes-imagem.test.tsx`, `etiqueta-marcacoes.test.tsx`, `menu-prancha.test.tsx`, `foto-celular.test.tsx`, `marcador-achado.test.tsx`, `painel-voz.test.tsx`, `visualizador-sequencial.test.tsx`, `pintor-segmentacao.test.tsx` | testes novos |
| `auditoria/ferramentas/frontend-testes/vitest.config.ts` | catraca 56,1 / 54,8 / 53,1 / 53,6 |
| `frontend/testes/LEIA-ME.md` | como simular canvas, imagem, medidas, microfone, iframe e downloads |
| este relatório | — |

Fase 3 **não** foi iniciada: aguarda o PR #72 verde e aprovado.
