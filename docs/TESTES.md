# Testes automáticos do Rádix Imago

## Por que os testes usam um banco separado

Os testes criam usuários de mentira ("Usuário de Teste (suite automatizada)",
e-mails `suite-…@teste.example`), fichas e registros de auditoria, e depois
apagam o que puderam. Quando eram rodados direto no banco do sistema
(`radix_imago`), duas coisas ficavam misturadas com os dados de verdade:

- usuários de teste que não conseguiam ser apagados por completo;
- registros de auditoria de teste. Esses registros **não podem ser apagados**,
  porque a auditoria é selada: cada registro carrega um lacre ligado ao
  anterior, e o banco recusa apagar ou alterar qualquer registro.

Desde 01/11/2026 (item B3 da auditoria do administrador):

1. **`backend/tests/conftest.py` recusa rodar** num banco cujo nome não
   contenha "test". Quem digitar `pytest` apontando para `radix_imago` recebe
   a mensagem "RECUSADO" antes de qualquer teste.
2. **`backend/scripts/rodar_testes.py`** prepara e usa um banco próprio,
   `radix_imago_teste`, dentro do mesmo Postgres. O banco do sistema não é
   tocado em nenhum passo.

## Como rodar (PowerShell, na pasta do projeto, com o Docker ligado)

```powershell
cd C:\Users\lmnvo\Radiximago
docker compose exec radix-api python scripts/rodar_testes.py
```

Na primeira vez o script cria o banco `radix_imago_teste` e aplica as
migrações. Nas vezes seguintes ele só atualiza as migrações e roda os testes.
Para rodar um arquivo só, coloque o nome depois do comando:

```powershell
docker compose exec radix-api python scripts/rodar_testes.py tests/test_auth.py -q
```

## Dados de teste que já estão no banco do sistema

**Nada foi apagado ou alterado.** Primeiro dá para só **contar** o que
sobrou. A consulta abaixo apenas lê (SELECT):

```powershell
docker compose exec radix-postgres sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB'
```

Com isso abre o "prompt" do banco (`radix_imago=#`). Digite a linha abaixo e
aperte Enter. Para sair, digite `\q`.

```sql
SELECT count(*) AS usuarios_de_teste FROM users WHERE email LIKE 'suite-%@teste.example';
```

O que a auditoria do administrador (01/11/2026) encontrou, e de onde veio:

| O que aparece | De onde veio | Situação hoje |
|---|---|---|
| 4 × "Solicitante de Teste (suite automatizada)" em "Ver usuários excluídos" (17/08) | testes automáticos rodados no banco do sistema, antes desta trava | já estão excluídos (não entram nem aparecem nas listas normais) |
| "QA Layout Curadoria" 1 a 5 (03/08) | contas criadas à mão para conferir telas | já estão excluídas |
| "QA macro editada (desativada)" em Macros | teste feito pela tela | já está desativada |
| "QA termo teste" no Vocabulário | teste feito pela tela | já está inativo (não aparece na busca) |
| sugestão de teste em Sugestões | teste feito pela tela | aberta |

**Proposta de limpeza segura**, que só deve ser aplicada com autorização:

- **Usuários de teste:** marcar como excluídos, do mesmo jeito que a tela
  Usuários faz (`excluido = true`, `ativo = false`), em vez de apagar. Assim
  eles somem das listas e não conseguem entrar. Os registros de auditoria
  que apontam para eles continuam válidos.
- **Macro, termo e sugestão de teste:** já estão desativados ou inativos. A
  sugestão pode ser marcada como "não será feita" (motivo: teste) na própria
  tela Sugestões. Não é
  preciso apagar nada.
- **Registros de auditoria de teste:** ficam como estão, porque apagar
  quebraria o lacre. Na tela Auditoria eles podem ser filtrados pelo usuário.

A limpeza só deve ser feita depois da autorização do responsável pelo
projeto, quando não houver mais nenhum reteste em andamento.
