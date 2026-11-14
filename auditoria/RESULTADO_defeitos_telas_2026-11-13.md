# Resultado: correção dos 2 defeitos achados pelos testes de telas (13/11/2026)

**Ramo:** `qualidade/defeitos-telas-fase-1`, PR #71 para `redesign-ui` (base `444ac68`, já com o #70). PR pequeno e separado, autorizado pelo Luciano. **Quem junta é o Luciano** ("Create a merge commit").

## Em uma frase
A tela **Usuários** agora avisa quando o servidor não responde. Os formulários de **Usuários** e a janela de **Motivo** da Curadoria passaram a ser lidos corretamente por leitores de tela. A aparência não mudou.

## 1. O que mudou

### Defeito 1 — Usuários sem aviso com o servidor fora do ar (`frontend/src/app/usuarios/page.tsx`)

| Ação | Antes | Agora |
|---|---|---|
| Excluir usuário | Sem mensagem; o erro "escapava" | "Não foi possível excluir o usuário." na janela; a pessoa continua na lista |
| Aprovar pedido | Sem mensagem | "Não foi possível aprovar a solicitação." na janela; o pedido continua |
| Rejeitar pedido | Sem mensagem | "Não foi possível rejeitar a solicitação." na janela; o pedido continua |
| Ver usuários excluídos | Sem mensagem | "Não foi possível carregar os usuários excluídos."; não fica preso em "Carregando..."; abrir de novo tenta outra vez |
| Pedidos de acesso (ao abrir a tela) | **Silêncio** (com servidor fora do ar **e** com erro do servidor) | "Não foi possível carregar as solicitações de acesso." (mensagem nova, em português e inglês); o resto da tela funciona |

**Em todos os casos:**
- o botão volta ao normal (não fica em "Excluindo..."/"Aprovando...");
- nada é mostrado como sucesso;
- nada é repetido sozinho (gravação nunca se repete sem o clique da pessoa).

Foi usado o mesmo padrão das outras ações da tela, que já avisavam.

### Defeito 2 — Acessibilidade (WCAG 1.3.1 e 4.1.2)
- **Rótulos ligados aos campos** (`htmlFor` + `id`; o `id` vem do `useId` do React, então não repete):
  - em "Editar usuário": Nome, Instituição;
  - em "Novo usuário": Nome, E-mail, Senha, Perfil, Instituição (opcional);
  - em "Rejeitar solicitação": Motivo da rejeição;
  - na Curadoria (`ModalMotivo.tsx`): **Motivo** (descartar e segunda opinião).
- **Janelas com nome:** as 7 janelas de Usuários (Editar, Novo, Confirmar ação, Redefinir 2 etapas, Excluir, Aprovar, Rejeitar) agora têm `aria-labelledby` apontando para o título. O leitor de tela anuncia, por exemplo, "Editar usuário, caixa de diálogo".
- **"Perfil a conceder"** (janela Aprovar): era um rótulo sem campo. Virou o nome de um **grupo** com os 4 botões de perfil (`role="group"`).
- **Sem mudança visual:** mesmas classes; o título passou a ser desenhado pela própria janela, com a mesma aparência.

### Arquivos
- **Código:**
  - `frontend/src/app/usuarios/page.tsx`;
  - `frontend/src/components/curadoria/ModalMotivo.tsx`;
  - `frontend/messages/pt.json` e `frontend/messages/en.json` (uma mensagem nova cada).
- **Testes:**
  - `auditoria/ferramentas/frontend-testes/telas/usuarios.test.tsx`: 9 testes novos; os 7 de criar/editar agora acham os campos pelo rótulo;
  - `telas/curadoria.test.tsx`: 2 novos.
- **Catraca:** `vitest.config.ts`.
- **Não mudaram:** dependências, workflows, `matriz_asvs.csv`, dados.

## 2. Testes primeiro: antes (falha) x depois (passa) [medido]
Os testes novos foram escritos **antes** da correção e rodados contra o código antigo. A rodada foi repetida no fim, voltando só os arquivos de produção para a versão `444ac68`, para a prova ser reproduzível.

**Antes da correção (código de `444ac68`):**
```
× novo usuario: senha curta e recusada pela tela; depois cria e aparece na lista
× novo usuario: avisa erro de digitacao no e-mail (sem bloquear)
× novo usuario: erro do servidor (recusa com motivo) aparece na janela
× novo usuario: erro do servidor (sem conexao) aparece na janela
× editar: vem preenchido, envia nome e instituicao (vazia vira null) e a linha muda
× editar: erro do servidor (recusa com motivo) aparece na janela
× editar: erro do servidor (sem conexao) aparece na janela
× pedidos de acesso nao carregam (recusa do servidor): avisa, sem esconder o problema
× pedidos de acesso nao carregam (sem conexao): avisa, sem esconder o problema
× excluir sem conexao: avisa na janela, o botao volta e a pessoa continua na lista
× aprovar pedido sem conexao: avisa na janela, o botao volta e o pedido continua
× rejeitar pedido sem conexao: avisa na janela, o botao volta e o pedido continua
× "Ver usuarios excluidos" sem conexao: avisa e nao fica em "Carregando..."; abrir de novo tenta outra vez
× cada janela tem nome (o titulo) para o leitor de tela
× os campos de editar e criar sao encontrados pelo rotulo
× aprovar: os botoes de perfil formam um grupo com o nome "Perfil a conceder"
× "Descartar": a caixa do motivo e encontrada pelo rotulo "Motivo"
× "Solicitar segunda opinião": a caixa do motivo e encontrada pelo rotulo "Motivo"
Tests  18 failed | 68 passed (86)
```
Exemplo de motivo da falha: `Unable to find an accessible element with the role "dialog" and name "Excluir usuário"`.

**Depois da correção:**
```
Tests  86 passed (86)
```

## 3. Números de cobertura [medido, Vitest]

| | Antes (#70) | Depois |
|---|---|---|
| `app/usuarios/page.tsx`, linhas | 289 de 319 (90,6%) | **305 de 329 (92,7%)** |
| `app/usuarios/page.tsx`, ramos | 222 de 254 (87%) | 225 de 256 (88%) |
| `components/curadoria/ModalMotivo.tsx` | 6 de 6 | 7 de 7 (100%) |
| Frontend total, linhas | 33,27% | **33,39%** |
| Testes no Vitest | 204 | **215** |

**Catraca subiu:** linhas 33,3%, comandos 32,8%, ramos 30,1%, funções 30,6%.

## 4. Verificação [medido]
- **Vitest completo** com a catraca: 8 arquivos, 215 testes, todos passando; `npm run cobertura` terminou com 0.
- **`tsc`** ok; **`next build`** ok; **`npx tsx testes/*.teste.ts`** 16 de 16; **`pytest`** 657 passed (nenhum arquivo do backend mudou).
- **Playwright local: 16 de 16, duas rodadas seguidas.**
  - Antes disso houve duas falhas, mas **do ambiente local, não do código**: a API local aceitava só `localhost:3000` e o site estava montado para `localhost:8000`.
  - Com o mesmo endereço do CI (`127.0.0.1`), passou.
- **ESLint:** 2 avisos, os mesmos da base.
  - A correção chegou a criar um 3º aviso: a busca dos pedidos passou a usar a tradução `t`.
  - Resolvido do jeito certo, declarando a dependência, sem desligar regra.
- **GitHub, PR #71:** ver a seção 6.

## 5. Pendências fora do escopo (NÃO corrigidas, só listadas — regra 4 da tarefa)
Procurei o mesmo tipo de defeito no restante do frontend:

| Onde | O que é | Gravidade |
|---|---|---|
| `app/aparelhos/page.tsx`, botão "Testar" | Mesmo defeito 1: sem conexão, nenhum aviso (o erro escapa) | Média (tela do administrador) |
| `components/TermoCiencia.tsx` e `components/termos/AceiteTermosUso.tsx`, "Recusar" | Sem `catch`, mas vai para o login de qualquer jeito (comportamento correto); só sobra um erro no console | Baixa |
| `components/curadoria/ModalMotivo.tsx` | A janela ainda não tem `role="dialog"` nem nome (só o rótulo foi corrigido, como pedido) | Baixa |
| Rótulos sem `htmlFor` | `app/macros/page.tsx` (5), `app/auditoria/page.tsx` (5), `components/curadoria/PainelAchadosEstruturados.tsx` (5), `PainelAchadosRadiografia.tsx` (2), `PainelErroTecnico.tsx` (2), `app/solicitar-acesso/page.tsx` (1) | Média (mesmo defeito 2) |
| `app/pesquisa/page.tsx` (4 rótulos) | Os rótulos não estão ligados, mas os campos já têm nome próprio (`aria-label`/grupo); o leitor de tela já os anuncia | Baixa |

**Sugestão:** juntar estas pendências num próximo PR pequeno, junto com os testes das telas da Fase 3 (macros, auditoria, solicitar acesso), que vão precisar achar esses campos pelo rótulo.

## 6. CI e tempo [medido]
**GitHub, PR #71: 5 de 5 checks verdes.**
- Testes do frontend: linhas 33,39% (a catraca passou);
- Testes no navegador: **16 passed** (23,5 s);
- Qualidade: Ruff **4**, Mypy **72**;
- Testes do backend e Segurança: ok.

**Tempo:** passo do Vitest **20 s** (era 19 s no PR #70) e job "Testes do frontend" 1 min 16 s (era 1 min 11 s). Aumento desprezível.
