# Testes do frontend: guia rápido

Há três tipos de teste automático para o frontend. Cada um tem seu lugar:

| Tipo | Onde fica | O que testa | Como rodar |
|---|---|---|---|
| **Funções** | `frontend/testes/*.teste.ts` (esta pasta) | Regras puras, sem tela (ex.: `lib/sessao.ts`, `lib/pintura.ts`) | `cd frontend` e `npx tsx testes/nome.teste.ts` |
| **Telas** (novo, 13/11/2026) | `auditoria/ferramentas/frontend-testes/telas/*.test.tsx` | A tela de verdade, num navegador simulado, com o servidor trocado por respostas inventadas | `cd auditoria/ferramentas/frontend-testes` e `npm run vitest` |
| **Navegador** (Playwright) | `auditoria/ferramentas/frontend-testes/e2e/` | O sistema inteiro ligado (API, banco e login de verdade) | ver `testes-e2e.yml` |

Os testes de telas ficam **fora** da pasta `frontend`. Assim as ferramentas de teste não entram no site publicado, e o `tsc` do frontend não precisa conhecê-las.

## O modelo: `telas/vocabulario.test.tsx`

Copie esse arquivo como ponto de partida. Todo teste de tela segue **4 passos**.

### 1. Simular o servidor

```ts
const servidor = servidorFalso({
  'GET /auth/me': { corpo: { perfil: 'curador', ... } },        // quem está logado
  'GET /vocabulario/termos-livres': { corpo: { itens: [] } },   // resposta normal (200)
  'POST /vocabulario/termos': { status: 409, corpo: { detail: 'Já existe.' } }, // recusa
  'PATCH /vocabulario/termos/10': 'SEM_CONEXAO',                 // servidor fora do ar
})
```

- A chave é `"MÉTODO /caminho"`, com o `?...` quando houver.
- Um pedido sem rota cadastrada responde 404. Assim, um pedido inesperado aparece no teste.
- `servidor.alteracoes()` lista o que a tela **enviou** (POST, PATCH, DELETE), com o corpo já lido. Use para conferir o que foi salvo.
- **Nada de dado real**: nomes, e-mails, fichas e textos devem ser inventados.

### 2. Montar a tela

```ts
montarTela(<VocabularioPage />)
await screen.findByRole('heading', { level: 1, name: /Vocabulário/ })  // espera carregar
```

`montarTela` usa as traduções reais em português (`frontend/messages/pt.json`). O teste vê o mesmo texto que a pessoa vê.

O que **não** é da tela fica de fora com `vi.mock`:
- `next/navigation`: o roteador vira um espião, para conferir `push('/login')`;
- `Sidebar` e `Topbar`: têm teste próprio.

### 3. Agir como a pessoa age

```ts
const usuario = userEvent.setup()
await usuario.click(screen.getByRole('button', { name: 'Promover' }))
await usuario.type(screen.getByRole('textbox', { name: 'Termo' }), 'Reabsorção')
```

Ache os elementos **pelo papel e pelo nome que aparecem na tela**: botão "Promover", campo "Termo", caixa "Ficha 502". É assim que um leitor de tela os encontra.
- Se não der para achar assim, a própria tela provavelmente tem um problema de acessibilidade.
- Evite `className` e `data-*`.

### 4. Conferir um resultado visível

```ts
expect((await screen.findByRole('alert')).textContent).toBe('Já existe um termo com esse nome.')
expect(servidor.alteracoes()[0].corpo).toEqual({ termo: 'Reabsorção', ... })
expect(roteador.push).toHaveBeenCalledWith('/acesso-negado?de=/vocabulario')
```

## Regra de ouro

Cobertura conta **linhas executadas**, não prova que algo funciona. Por isso, todo teste confere algo visível:
- o que aparece na tela;
- o que foi enviado ao servidor;
- para onde a pessoa foi levada.

**Proibido:**
- teste que só "monta e passa";
- *snapshot* sem conferência;
- `test.skip` ou `fixme`;
- `type: ignore`;
- desligar regra.

Para cada tela, cubra no mínimo:
1. **carregando**;
2. **lista vazia**;
3. **lista com dados**;
4. **erro do servidor**: mensagem com o motivo e mensagem padrão;
5. **sem conexão**;
6. **ação principal**: salvar, apagar ou filtrar, conferindo o que foi enviado;
7. **permissão por perfil**: sem login, estudante, curador e administrador.

## Provar que o teste falha quando deve

Antes de abrir o PR:
1. quebre de propósito uma regra da tela (ex.: deixar o estudante entrar);
2. rode o teste e veja **falhar**;
3. desfaça com `git checkout`.

Se nada falhar, o teste não protege essa regra.

## Cobertura e catraca

- `npm run cobertura` (em `auditoria/ferramentas/frontend-testes`) mede a cobertura e grava `frontend/coverage/lcov.info` para o SonarCloud.
- Os mínimos ficam em `vitest.config.ts` (`coverage.thresholds`). Se a cobertura cair abaixo deles, o teste **falha**, inclusive no GitHub (workflow "Testes do frontend").
- A cada PR que acrescenta testes, **suba** os mínimos para o novo valor medido.

## Se um teste revelar defeito real

Pare. Descreva o defeito e peça decisão ao Luciano **antes** de corrigir. Não ajuste o teste para "passar".
