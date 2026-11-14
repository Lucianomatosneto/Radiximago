# RESULTADO — Cobertura das telas, Fase 3b (14/11/2026)

Tarefa: `TAREFA_claude_code_cobertura_telas_fase_3b_2026-11-14.md`.
Branch: `qualidade/cobertura-telas-fase-3b` (criada de `redesign-ui` em 8ed473e, já com #73 e #74).
Regras seguidas: um arquivo por commit, teste que falha antes da correção,
sem force push, sem mesclar. Só dados inventados.

## Resumo em linguagem simples

- **Cobertura do frontend (Vitest):** as linhas testadas subiram de **59,64% para 73,12%**.
  Antes: 6401 de 10731 linhas. Depois: 7848 de 10733.
- **Testes:** passaram de 406 para **686**. Todos passam, e passaram em 3 rodadas seguidas.
- **Linhas sem teste em `app/` + `components/`:** caíram de **4034 para 2607**.
- **Defeitos achados:** 2, ambos corrigidos. Em cada um, o teste que falhava veio antes da correção, em commit separado.
- **Mutação (estragar o código de propósito):** 12 provas. Todas as 12 foram pegas pelos testes.
- **Pendente:** os dois motores gráficos, que ainda não têm teste. Há uma proposta numérica abaixo, e a decisão fica com o Luciano.

## Parte 1 — correções pedidas

| Item | Commit | Resultado |
|---|---|---|
| Remover `TIPOS_ERRO_TECNICO` e o tipo `ErroTecnico` de `lib/achados.ts` | c75dc0a | Nenhuma importação no código nem nos testes. O tsc passou. O componente `ErroTecnico.tsx` é outra coisa e não foi tocado. |
| Pesquisa: rótulo "Erro técnico" sem campo ligado | 36bdedf (teste) | O teste falhava com "Found a label … no form control". |
| | cba2004 (`FiltroErrosTecnicos.tsx`) | Ganhou a prop `idCampo`. Com rótulo, o nome acessível do campo vem do rótulo. Sem rótulo, mantém o `aria-label` de antes. |
| | 521ebd3 (`pesquisa/page.tsx`) | `useId` + `htmlFor`. Depois disso, o teste passa. |

## Parte 2 — top 20 dos arquivos com mais linhas sem teste (`app/` e `components/`)

### Antes → depois (os 20 maiores no início da 3b)

| # | Arquivo | Linhas sem teste antes | % antes | Linhas sem teste depois | % depois |
|---|---|---|---|---|---|
| 1 | components/fundo/motorMapaMundi.ts | 275 | 0,0% | 275 | 0,0% (decisão pendente) |
| 2 | components/login/motorCenaLogin.ts | 210 | 0,0% | 210 | 0,0% (decisão pendente) |
| 3 | app/compartilhadas-comigo/page.tsx | 149 | 0,0% | 4 | 97,3% |
| 4 | app/curadoria/page.tsx | 139 | 76,1% | 139 | 76,1% |
| 5 | app/login/page.tsx | 120 | 0,0% | 0 | 100% |
| 6 | app/imagens/page.tsx | 114 | 0,0% | 0 | 100% |
| 7 | components/Topbar.tsx | 107 | 0,0% | 107 | 0,0% |
| 8 | app/enviar-imagem/page.tsx | 96 | 0,0% | 1 | 99,0% |
| 9 | components/anexos/AnexosCuradoria.tsx | 95 | 2,1% | 1 | 99,0% |
| 10 | components/visualizador/NotasVisualizador.tsx | 90 | 0,0% | 0 | 100% |
| 11 | components/curadoria/ControleOrientacao.tsx | 86 | 0,0% | 86 | 0,0% |
| 12 | app/sugestoes/page.tsx | 81 | 0,0% | 0 | 100% |
| 13 | components/compartilhar/CompartilharImagem.tsx | 78 | 0,0% | 0 | 100% |
| 14 | app/visualizar/[id]/page.tsx | 77 | 0,0% | 0 | 100% |
| 15 | components/envios/SecaoEnvios.tsx | 76 | 0,0% | 0 | 100% |
| 16 | app/relatorios/page.tsx | 75 | 0,0% | 1 | 98,7% |
| 17 | app/grupos/page.tsx | 73 | 0,0% | 0 | 100% |
| 18 | app/painel-admin/page.tsx | 73 | 0,0% | 0 | 100% |
| 19 | components/Sidebar.tsx | 70 | 0,0% | 70 | 0,0% |
| 20 | components/segundoFator/SecaoSegundoFator.tsx | 68 | 0,0% | 0 | 100% |

Também ganharam teste, embora estivessem logo depois do 20º lugar:

- `app/integracoes/page.tsx`: de 67 linhas sem teste para 0.
- `components/TermoCiencia.tsx`: de 66 linhas sem teste para 2 (97%).
- `frontend/src/i18n`: config.ts e request.ts, de 0% para 100%. Aqui também os ramos ficaram 100% cobertos (cada caminho de "se/senão" do código).

O critério de prioridade foi o da tarefa: telas com formulário, conversa com o servidor e mensagens de erro.
Por isso Topbar, Sidebar e ControleOrientacao ficaram para depois. Elas mostram menus e controles, quase sem envio ao servidor.
A curadoria já tinha 76%.

### Depois: os 20 maiores que restam

| # | Arquivo | Linhas sem teste | % |
|---|---|---|---|
| 1 | components/fundo/motorMapaMundi.ts | 275 | 0,0% |
| 2 | components/login/motorCenaLogin.ts | 210 | 0,0% |
| 3 | app/curadoria/page.tsx | 139 | 76,1% |
| 4 | components/Topbar.tsx | 107 | 0,0% |
| 5 | components/curadoria/ControleOrientacao.tsx | 86 | 0,0% |
| 6 | components/Sidebar.tsx | 70 | 0,0% |
| 7 | app/pranchas-recebidas/page.tsx | 59 | 0,0% |
| 8 | components/GradeCategoriasImagens.tsx | 59 | 0,0% |
| 9 | components/compartilhar/AnotacoesCompartilhadas.tsx | 55 | 0,0% |
| 10 | components/termos/TextoTermos.tsx | 55 | 11,3% |
| 11 | app/meus-acessos/page.tsx | 54 | 0,0% |
| 12 | app/aparelhos/page.tsx | 53 | 49,5% |
| 13 | components/compartilhar/ResponderCompartilhamento.tsx | 53 | 0,0% |
| 14 | app/macros/page.tsx | 52 | 54,0% |
| 15 | app/configuracoes/page.tsx | 51 | 0,0% |
| 16 | components/MiniaturaImagem.tsx | 45 | 0,0% |
| 17 | app/redefinir-senha/page.tsx | 43 | 0,0% |
| 18 | components/visualizador/SeletorLayout.tsx | 43 | 0,0% |
| 19 | app/auditoria/page.tsx | 42 | 64,7% |
| 20 | app/solicitar-acesso/page.tsx | 40 | 20,0% |

## Testes novos (17 arquivos em `auditoria/ferramentas/frontend-testes/telas/`)

compartilhadas-comigo, login, imagens, enviar-imagem, anexos-curadoria,
notas-visualizador, sugestoes, compartilhar-imagem, visualizar, secao-envios,
relatorios, grupos, painel-admin, integracoes, secao-segundo-fator,
termo-ciencia, i18n. O teste da pesquisa também ganhou um caso novo.

Todos testam comportamento, sem nenhum teste de "foto" (snapshot). Cada um confere:

- o que a pessoa vê na tela;
- o que vai para o servidor (método, caminho e corpo);
- quem pode entrar (perfis);
- carregando, erro com o motivo do servidor, erro sem motivo, sem conexão;
- sessão vencida (401);
- enviar e cancelar.

Peças simuladas (com o motivo):

- **Menu lateral e barra do topo:** são testados à parte.
- **Animação do login (CenaLogin):** é desenho em canvas.
- **Leitura das integrações, do e-mail e do OHIF (`lib/servicosSistema`):** já tem teste próprio.
- **Idioma:** os cookies e os cabeçalhos da visita (`next/headers`) e o embrulho `getRequestConfig`.

Apoio: o servidor falso (`telas/apoio/montar.tsx`) passou a ler o corpo em formato de formulário (URLSearchParams), que é o formato usado pelo login. Commit 8f2336e.

## Defeitos achados e corrigidos (o teste que falha veio antes)

1. **Grupos: falha ao apagar ficava invisível.** A mensagem de erro só existia dentro do formulário de criar ou editar.
   Ao apagar com o formulário fechado, a falha não aparecia, e o texto padrão ainda falava em "salvar".
   - Teste: a085430. Antes da correção: 3 falharam com "Unable to find role=alert".
   - Correção:
     - b092505 (pt.json) e e88d831 (en.json): nova chave `Grupos.erroApagar`;
     - 5c8cf83 (`grupos/page.tsx`): limpa os avisos antes de apagar, usa o texto de apagar e mostra o erro também com o formulário fechado.
   - Depois da correção: 20 de 20 passam.
2. **Termo de ciência: "Não aceito" sem conexão deixava um erro solto** (uma promessa rejeitada sem tratamento).
   É o mesmo caso corrigido na 3a no AceiteTermosUso. Aqui foi listado na 3a e corrigido agora.
   - Teste: 064660c. Antes da correção: "expected [TypeError: Failed to fetch] to deeply equal []".
   - Correção: 82d6034 (`TermoCiencia.tsx`), um `catch` com comentário. A pessoa sai do mesmo jeito.
   - Depois da correção: 17 de 17 passam.

## Prova de mutação (estragar o código de propósito; o teste precisa falhar)

Cada mudança foi aplicada no código, o teste foi rodado, e depois o arquivo foi restaurado com `git checkout`.

| Arquivo | Mudança | Resultado |
|---|---|---|
| i18n/request.ts | padrão `pt` vira `en` | 2 falharam |
| i18n/request.ts | `split('-')` vira `split('_')` | 1 falhou |
| app/grupos/page.tsx | erro só com o formulário aberto | 6 falharam |
| app/grupos/page.tsx | `membros_ids` vira lista vazia | 2 falharam |
| components/TermoCiencia.tsx | `ciente: true` vira `false` | 1 falhou |
| components/TermoCiencia.tsx | `409` vira `410` | 1 falhou |
| SecaoSegundoFator.tsx | desligar sem mandar a senha | 1 falhou |
| app/integracoes/page.tsx | `liberados === 0` vira `=== 1` | 1 falhou |
| app/painel-admin/page.tsx | aviso de migração pendente nunca aparece | 1 falhou |
| app/imagens/page.tsx | busca pelo código Orthanc desligada | 1 falhou |
| app/relatorios/page.tsx | sessão vencida não vai ao login | 1 falhou |
| app/login/page.tsx | 401 deixa de ser tratado | 1 falhou |

Resultado: 12 de 12 mutações foram pegas. A tarefa pedia pelo menos 10.

## Números

| Verificação | Resultado |
|---|---|
| Vitest | 686 testes em 41 arquivos, todos passam. 3 rodadas seguidas sem falha intermitente. |
| Cobertura (Vitest) | Linhas 73,12% (7848/10733) · Instruções 70,52% (8921/12649) · Ramos 68,14% (6611/9702) · Funções 70,39% (2088/2966) |
| Catraca (`vitest.config.ts`, commit 9772b1c) | Linhas 73,1 · Instruções 70,5 · Ramos 68,1 · Funções 70,3. Antes: 59,4 / 57,7 / 55,5 / 56,7. Arredondada para baixo. |
| pytest | 657 passaram |
| tsc (checagem de tipos) | ok |
| tsx (testes de tradução) | 16 arquivos, 0 falhas |
| build (Next.js) | ok |
| ESLint | 0 erros e 2 avisos, os mesmos 2 de antes |
| Sonar | Ainda não medido. Depende da análise disparada à mão depois do merge. |

**Sobre a meta do Sonar (>68% no total e ≥80% no código novo do PR):**

- O Sonar mistura frontend e backend e conta linhas e condições juntas. Por isso o número dele não é igual ao do Vitest.
- No frontend, a cobertura subiu 13,5 pontos.
- Todo o código de produção alterado neste PR está coberto por teste:
  - `FiltroErrosTecnicos.tsx`, `pesquisa/page.tsx`, `grupos/page.tsx` e `TermoCiencia.tsx`: cobertos;
  - `achados.ts`: só teve remoção.
- Não invento o número final do Sonar: ele entra quando a análise rodar.

## Decisão pendente — motores gráficos (NÃO foram excluídos)

| Arquivo | Linhas | Cobertas |
|---|---|---|
| components/fundo/motorMapaMundi.ts | 275 | 0 |
| components/login/motorCenaLogin.ts | 210 | 0 |
| **Soma** | **485** | **0** |

Os dois arquivos fazem a mesma coisa: desenham o fundo animado e a cena do login quadro a quadro, num canvas.
O jsdom, o "navegador de mentira" dos testes, não desenha nada. Testar esses motores exigiria simular o canvas inteiro.
Esse tipo de teste diz pouco sobre o que a pessoa vê de fato.

| Cobertura de linhas do frontend | Contando os motores | Sem os motores |
|---|---|---|
| Antes da 3b | 59,65% (6401/10731) | 62,47% (6401/10246) |
| Depois da 3b | 73,12% (7848/10733) | **76,58% (7848/10248)** |

Os motores são 4,5% de todas as linhas do frontend.

Proposta: excluir só esses dois arquivos da medição, usando o `exclude` do `vitest.config.ts` e o `sonar.coverage.exclusions`, com o motivo escrito no próprio arquivo.
As telas que usam os motores (login e fundo) continuam testadas, com o motor simulado.

**Decisão do Luciano:** excluir ou manter. Não foi feito nada por conta própria.

## Sobras novas (listadas, NÃO corrigidas)

1. **Imagens recebidas:** o campo de arquivo e os 2 filtros (selects) não têm nome acessível.
2. **Sugestões:** o campo "motivo" não tem rótulo, só o texto de exemplo (placeholder).
3. **Solicitar acesso:** os botões de perfil não têm `aria-pressed`. Já estava listado na 3a.
4. **Envios (SecaoEnvios):** "devolver" manda a observação sem tirar os espaços das pontas. É um defeito pequeno.
5. **Detalhes da imagem:** sem sessão, "Carregando..." fica na tela até o redirecionamento.
6. **Macros:** "Erros técnicos" usa `<p>` e não um rótulo.
7. **Comentários antigos:** alguns comentários ainda citam componentes apagados na 3a (pesquisa, FichaCuradoriaForm, lib).
8. **Teste de idioma:** precisa simular `getRequestConfig` em dois caminhos (o de desenvolvimento e o de produção do next-intl). O motivo: o pacote escolhe o arquivo conforme o ambiente. Funciona, mas vale saber disso se o next-intl for atualizado.

## Commits com mais de um arquivo

Nenhum. Todos os commits têm um arquivo só.
A mensagem do commit bee5c85 (i18n) repete o caminho do arquivo duas vezes. É só texto, sem efeito.
