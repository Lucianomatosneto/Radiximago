# Colocar o Radix Imago na internet (radiximago.com.br)

Guia passo a passo para quem não é da área de TI. Tempo estimado: 1 a 2 horas
na primeira vez.

## Como vai ficar

| Endereço | O que é |
|---|---|
| `https://app.radiximago.com.br` | as telas do sistema (login, curadoria, pesquisa...) |
| `https://api.radiximago.com.br` | a "cozinha" do sistema (o navegador conversa com ela) |
| `https://viewer.radiximago.com.br` | o visualizador de imagens (OHIF) |
| `https://radiximago.com.br` | só redireciona para o `app.` |

Tudo roda num **servidor alugado (VPS)**, com os mesmos containers do
computador. A diferença está em `docker-compose.prod.yml`:

- só o **Caddy** fica aberto para a internet (portas 80 e 443). Ele cria e
  renova sozinho o **cadeado HTTPS** (certificado gratuito da Let's Encrypt)
  e repassa cada endereço ao serviço certo;
- Orthanc, banco de dados, API e visualizador ficam **fechados** para fora;
- as telas são **compiladas** (mais rápidas) e o serviço de voz (Whisper)
  fica desligado;
- o cookie de login vale para `app.`, `api.` e `viewer.` (`COOKIE_DOMAIN`),
  para o visualizador saber quem está logado;
- a página técnica da API (`/docs`) é desligada.

> **Dados:** nesta etapa, só imagens de **teste ou anonimizadas**. Nunca
> envie ao servidor imagens com dados de pacientes.

---

## Passo 1 – Alugar o servidor (VPS)

Sugestão: **Hostinger VPS KVM 2** (2 processadores, 8 GB de memória, 100 GB).

1. Acesse <https://www.hostinger.com.br/servidor-vps> e escolha **KVM 2**.
2. Na configuração:
   - **Localização:** Brasil (São Paulo), para ficar mais rápido;
   - **Sistema operacional:** "Sistema operacional puro" → **Ubuntu 24.04**;
   - crie uma **senha root** forte e guarde-a num gerenciador de senhas.
3. Ao terminar, anote o **endereço IP** do servidor (ex.: `203.0.113.10`),
   que aparece no painel da Hostinger (hPanel → VPS).

## Passo 2 – Apontar o domínio para o servidor (registro.br)

1. Entre em <https://registro.br> → **radiximago.com.br** → **DNS** →
   **Editar zona** (modo avançado, o mesmo em que você colocou os registros
   da Brevo).
2. **Não apague** os registros da Brevo (brevo-code, brevo1/brevo2,
   _dmarc, login...).
3. Adicione 5 registros do tipo **A**, todos com o **IP do servidor**:

| Nome | Tipo | Valor |
|---|---|---|
| (vazio) | A | IP do servidor |
| `www` | A | IP do servidor |
| `app` | A | IP do servidor |
| `api` | A | IP do servidor |
| `viewer` | A | IP do servidor |

4. Clique em **Salvar**. Pode levar de alguns minutos até 2 horas. Para
   conferir, abra <https://dns.google/query?name=app.radiximago.com.br&type=A>.
   Quando aparecer o IP, está pronto.

## Passo 3 – Entrar no servidor

No **PowerShell** do seu computador:

```powershell
ssh root@IP_DO_SERVIDOR
```

Na primeira vez, digite `yes` e depois a senha root. Daqui em diante, os
comandos são digitados **no servidor**, onde o terminal mostra
`root@...:~#`.

## Passo 4 – Preparar o servidor (uma vez só)

```bash
# atualizar o sistema
apt update && apt upgrade -y

# instalar o Docker (site oficial)
curl -fsSL https://get.docker.com | sh

# firewall: deixar entrar só SSH (22), HTTP (80) e HTTPS (443)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443
ufw --force enable

# atualizacoes de seguranca automaticas
apt install -y unattended-upgrades
```

## Passo 5 – Baixar o Radix

```bash
cd ~
git clone -b redesign-ui https://github.com/Lucianomatosneto/radiximago.git
cd radiximago
```

Se o repositório for **privado**, o Git pede usuário e senha:

- **usuário:** o seu usuário do GitHub;
- **senha:** um **token**. Crie em <https://github.com/settings/personal-access-tokens>
  → *Fine-grained token* → só o repositório `radiximago` → permissão
  *Contents: Read-only*.

## Passo 6 – Criar o arquivo de configuração (.env) do servidor

```bash
cp env-producao.example .env
openssl rand -base64 48 | tr -d '/+=' | cut -c1-48
```

O comando `openssl` gera uma chave aleatória a cada execução. Rode-o
**quatro vezes** e use uma chave diferente em cada um destes campos:

- `POSTGRES_PASSWORD`, repetindo a mesma no lugar de `REPITA_A_SENHA` em
  `DATABASE_URL`;
- `JWT_SECRET_KEY`;
- `ORTHANC_PASSWORD`;
- `WHISPER_CHAVE`.

Para editar o arquivo:

```bash
nano .env
```

Ainda no arquivo, preencha:

- `SMTP_USER` e `SMTP_PASSWORD`: os **mesmos** da Brevo que já funcionam no
  seu computador;
- `CADDY_EMAIL`: um e-mail seu, que recebe avisos sobre o cadeado HTTPS.

Para salvar: **Ctrl+O**, **Enter**. Para sair: **Ctrl+X**.

## Passo 7 – Ligar o Radix

Crie um atalho para o comando longo:

```bash
echo "alias radix='cd ~/radiximago && docker compose -f docker-compose.yml -f docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
```

Construa e ligue tudo. A primeira vez demora de 10 a 20 minutos.

```bash
radix up -d --build
```

Crie as tabelas do banco e o primeiro administrador:

```bash
radix exec radix-api alembic upgrade head
radix exec radix-api python criar_admin.py
```

Para conferir se está tudo de pé, use `radix ps`: todos devem aparecer como
"Up" ou "running".

## Passo 8 – Testar

1. Abra <https://app.radiximago.com.br>. O cadeado deve aparecer.
2. Faça login com o administrador criado.
3. Envie uma imagem **de teste** e abra-a no visualizador.
4. Em **Integrações**, faça o teste de e-mail. O link do e-mail agora abre
   no celular também, porque não é mais `localhost`.

Se algo der errado, veja os registros de cada serviço:

```bash
radix logs --tail 50 radix-caddy      # cadeado/HTTPS e enderecos
radix logs --tail 50 radix-api        # sistema
radix logs --tail 50 radix-frontend   # telas
```

O problema mais comum é o **cadeado não ser criado** porque o DNS (Passo 2)
ainda não chegou. Espere o `dns.google` mostrar o IP e rode
`radix restart radix-caddy`.

## Atualizar o sistema (quando houver versão nova no GitHub)

```bash
radix exec radix-backup sh -c 'ls -lh /backups | tail -3'   # confere o ultimo backup
cd ~/radiximago && git pull
radix up -d --build
radix exec radix-api alembic upgrade head
```

## Cópias de segurança (backup)

- O serviço `radix-backup` grava, uma vez por dia, uma cópia do banco e das
  imagens em `~/radiximago/backups` (mantém as 14 mais recentes).
- Essa cópia fica **no mesmo servidor**. Ative também o **backup semanal da
  Hostinger** (hPanel → VPS → Backups) e, de vez em quando, baixe uma cópia
  para o seu computador:

```powershell
scp -r root@IP_DO_SERVIDOR:~/radiximago/backups C:\Users\lmnvo\Radiximago_backups_servidor
```

## Pausar e reativar

### Pausa curta (o servidor continua pago)

```bash
radix stop     # tira o Radix do ar; banco e imagens ficam guardados
radix start    # volta exatamente como estava
```

### Pausa longa (cancelar o servidor para parar de pagar)

**1. Gerar a cópia completa.** No servidor:

```bash
cd ~/radiximago
bash scripts/copia-completa.sh
```

O resultado é **um único arquivo** com o banco, as imagens, as fotos de
perfil e o `.env`. No fim, o script mostra o comando para baixá-lo.

**2. Baixar a cópia para o seu PC.** No PowerShell do PC:

```powershell
mkdir C:\Users\lmnvo\Radiximago_copias
scp root@IP_DO_SERVIDOR:/root/radiximago/copias/radix-copia-completa-DATA.tar.gz C:\Users\lmnvo\Radiximago_copias\
```

- Troque `DATA` pelo nome exato que o script mostrou.
- Confira que o arquivo chegou e tem tamanho maior que zero.
- ⚠️ O arquivo contém as senhas do `.env`. Guarde-o só no seu PC ou num
  pendrive. Nunca no GitHub nem por e-mail.

**3. Cancelar o VPS no painel da Hostinger.**

- O domínio radiximago.com.br **não** é cancelado: ele é pago à parte, no
  registro.br.
- Enquanto isso, se quiser, o Radix pode ser mostrado pelo túnel no seu PC
  (docs/TUNEL_CLOUDFLARE.md).

### Reativar depois

1. Contrate um VPS novo e faça os **Passos 1 a 5** deste guia. No Passo 2,
   aponte o domínio para o **IP novo**.
   - **Pule o Passo 6**: o `.env` vem dentro da cópia.
   - **Pule o Passo 7**: a restauração liga tudo.
2. Envie a cópia do PC para o servidor. No PowerShell do PC:

   ```powershell
   scp C:\Users\lmnvo\Radiximago_copias\radix-copia-completa-DATA.tar.gz root@IP_NOVO:/root/
   ```

3. Restaure. No servidor:

   ```bash
   cd ~/radiximago
   echo "alias radix='cd ~/radiximago && docker compose -f docker-compose.yml -f docker-compose.prod.yml'" >> ~/.bashrc
   bash scripts/restaurar-copia.sh ~/radix-copia-completa-DATA.tar.gz
   ```

   Digite `RESTAURAR` quando o script pedir.
4. Abra <https://app.radiximago.com.br>: os usuários, as imagens e as
   curadorias estarão como antes.

> Para ganhar segurança, ensaie uma vez: gere a cópia, restaure-a no mesmo
> servidor e confira que tudo continua lá. Faça isso antes de precisar
> de verdade.

## O que fica fora desta primeira versão (de propósito)

- **Voz (Whisper):** desligado para economizar memória. Para ligar depois:
  `radix --profile voz up -d --build`.
- **Porta DICOM 4242** (envio direto do aparelho): fechada. As imagens entram
  pelo envio na própria tela do sistema.
- **Dados reais de pacientes:** só depois de revisar a LGPD, o termo do
  Comitê de Ética e o contrato com o provedor (operador de dados).
