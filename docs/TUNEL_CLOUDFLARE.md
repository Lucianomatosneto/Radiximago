# Mostrar o Radix pela internet a partir do seu computador (Cloudflare Tunnel)

O Radix continua rodando **no seu PC**, mas qualquer pessoa com o link
consegue abrir `https://app.radiximago.com.br`.

```
Visitante → Cloudflare ⇄ túnel ⇄ seu PC (Docker: telas, API, visualizador)
```

O programa `cloudflared` roda dentro do Docker e **liga de dentro para
fora**, até a Cloudflare. As visitas voltam por essa ligação. Isso traz três
vantagens:

- nenhuma porta do seu roteador é aberta;
- o cadeado HTTPS vem pronto;
- é grátis.

**Limites:**

- o link só funciona com o **PC ligado e o Docker aberto**;
- a velocidade depende da internet da sua casa.

**Dados:** use só imagens de **teste ou anonimizadas**. O túnel mostra
apenas o Radix, nunca as pastas do seu computador.

---

## Parte 1 – Passar o DNS do domínio para a Cloudflare (uma vez só)

Hoje quem responde "onde fica radiximago.com.br" é o registro.br. O túnel
exige que essa resposta passe a vir da Cloudflare. O domínio **continua
sendo seu e continua registrado no registro.br**: só muda quem cuida da
"lista telefônica".

1. Crie a conta grátis em <https://dash.cloudflare.com/sign-up>.
2. No painel, clique em **Add a domain** (Adicionar domínio) e digite
   `radiximago.com.br`. Escolha **Quick scan for DNS records** (procura
   rápida dos registros).
3. Escolha o plano **Free** (US$ 0).
4. A Cloudflare mostra os registros que encontrou. **Confira se estão os
   7 da Brevo**:

   | Tipo | Nome | Conteúdo |
   |---|---|---|
   | TXT | `radiximago.com.br` | `brevo-code:...` |
   | CNAME | `brevo1._domainkey` | `b1.radiximago-com-br.dkim.brevo.com` |
   | CNAME | `brevo2._domainkey` | `b2.radiximago-com-br.dkim.brevo.com` |
   | TXT | `_dmarc` | `v=DMARC1; ...` |
   | CNAME | `login` | `login-radiximago-com-br.brand.brevosend.com` |
   | CNAME | `r.login` | `login-radiximago-com-br.r.brand.brevosend.com` |
   | CNAME | `img.login` | `login-radiximago-com-br.img.brand.brevosend.com` |

   - Se faltar algum, clique em **Add record** e crie-o igual à tabela.
   - **Importante:** nos 5 registros **CNAME** da Brevo, clique na nuvem
     laranja até ela ficar **cinza ("DNS only" / Somente DNS)**. Com a nuvem
     laranja, os e-mails do Radix deixam de ser autenticados.
5. Clique em **Continue**. A Cloudflare mostra **2 nameservers** (os
   "endereços da nova lista telefônica"), por exemplo
   `ana.ns.cloudflare.com` e `bob.ns.cloudflare.com`. Deixe a página aberta.
6. Em <https://registro.br>, entre em **radiximago.com.br** → **DNS** →
   **Alterar servidores DNS**:
   - apague os servidores atuais e cole os **2 da Cloudflare**;
   - se aparecerem campos de **DNSSEC**, deixe-os **vazios**;
   - clique em **Salvar**.
7. Volte à Cloudflare e clique em **Check nameservers**. Pode levar de
   minutos a algumas horas. Quando o domínio aparecer como **Active**,
   chega também um e-mail da Cloudflare.
8. Na Brevo (**Remetentes, domínios e IPs → Domínios**), confira se
   radiximago.com.br continua **autenticado**.

## Parte 2 – Criar o túnel (uma vez só)

1. No painel da Cloudflare, abra **Zero Trust**: menu à esquerda ou
   <https://one.dash.cloudflare.com>.
   - Se for a primeira vez, ele pede um nome de equipe (qualquer um, ex.:
     `radiximago`) e o plano **Free**.
   - Ele pode pedir um cartão mesmo no plano grátis. A cobrança é US$ 0.
2. Vá em **Networks → Tunnels**. Em algumas contas o caminho aparece como
   **Networks → Connectors**.
3. Clique em **Create a tunnel** → **Cloudflared**, dê o nome `radix-pc` e
   salve.
4. Em **Choose your environment**, escolha **Docker**. Aparece um comando
   assim:
   `docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJh...`
   Copie **só o texto depois de `--token `** (o que começa com `eyJ`). Esse
   texto é uma **senha**: não envie para ninguém, nem para o Claude.
5. No seu PC, abra o `.env` do Radix no Bloco de Notas:
   ```powershell
   cd C:\Users\lmnvo\Radiximago
   notepad .env
   ```
   No final do arquivo, acrescente uma linha com o token e salve:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJh...(o texto copiado)
   ```
6. Na Cloudflare, clique em **Next** e cadastre os 3 endereços em
   **Public Hostnames**, um de cada vez:

   | Subdomain | Domain | Type | URL |
   |---|---|---|---|
   | `app` | radiximago.com.br | HTTP | `radix-frontend:3000` |
   | `api` | radiximago.com.br | HTTP | `radix-api:8000` |
   | `viewer` | radiximago.com.br | HTTP | `radix-ohif:80` |

   Clique em **Save tunnel**. A Cloudflare cria sozinha os registros de DNS
   desses 3 endereços.

## Parte 3 – Ligar e desligar (sempre que quiser)

No PowerShell, na pasta do projeto:

```powershell
cd C:\Users\lmnvo\Radiximago
.\scripts\tunel-ligar.ps1
```

A primeira vez demora alguns minutos, porque as telas são compiladas.
Depois, abra <https://app.radiximago.com.br> e compartilhe o link.

- No painel da Cloudflare, o túnel `radix-pc` deve aparecer como
  **HEALTHY** (saudável).
- Enquanto o túnel estiver ligado, **você também** usa o Radix por
  `https://app.radiximago.com.br`. O login pelo `localhost` não funciona
  nesse modo.

Para voltar ao modo normal de trabalho (`http://localhost:3000`):

```powershell
.\scripts\tunel-desligar.ps1
```

Se o PowerShell recusar rodar o script ("execução de scripts desabilitada"),
use uma vez:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tunel-ligar.ps1
```

## Se algo der errado

```powershell
docker compose -f docker-compose.yml -f docker-compose.tunel.yml logs --tail 30 radix-cloudflared
docker compose -f docker-compose.yml -f docker-compose.tunel.yml logs --tail 30 radix-api
```

| Mensagem | O que significa |
|---|---|
| "required variable CLOUDFLARE_TUNNEL_TOKEN is missing" | falta a linha do token no `.env` (Parte 2, passo 5) |
| "Unauthorized" / "Invalid tunnel secret" no cloudflared | token copiado errado; copie de novo, sem espaços |
| página da Cloudflare "Error 1033" | o túnel está desligado: rode `tunel-ligar.ps1` |
| página da Cloudflare "Bad gateway 502" | o Radix ainda está ligando; espere 1 minuto |

## Cadastro de novas pessoas

Estudante, professor e pesquisador são **aprovados automaticamente** depois
de confirmar o e-mail. Com o link público, **qualquer pessoa** pode se
cadastrar e ver as imagens de teste.

Se quiser restringir na fase de demonstração, há duas saídas:

- criar você mesmo as contas, pela tela **Usuários**;
- pedir para o cadastro voltar a exigir a aprovação do administrador.

## Depois: servidor alugado

Quando o Radix for para o servidor (docs/IMPLANTACAO.md), o DNS já estará na
Cloudflare. A forma mais simples é rodar **este mesmo túnel no servidor** e
desligá-lo no PC: os links compartilhados continuam iguais.
