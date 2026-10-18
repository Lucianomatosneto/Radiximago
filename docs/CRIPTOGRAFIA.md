# Radix Imago — Criptografia e gestão de chaves

| Campo | Valor |
|---|---|
| Versão do documento | 1.0 — 18/10/2026 |
| Base | OWASP ASVS 5.0: 11.1.1 (política de chaves), 11.1.2 (inventário), 11.2.2 (agilidade) |
| Conferido com | `backend/app/core/security.py`, `config.py`, `modules/auth.py`, `modules/sessoes.py`, `core/email.py`, `docker-compose.yml` |

Glossário rápido:
- **Resumo (hash):** "impressão digital" de um dado. Não dá para voltar ao original.
- **Assinatura (HMAC):** prova de que um dado foi criado por quem tem a chave e não foi alterado.
- **Criptografia em trânsito (TLS/HTTPS):** "cadeado" da conexão.

## 1. Inventário (ASVS 11.1.2)

| Uso | Algoritmo | Força | Biblioteca | Onde |
|---|---|---|---|---|
| Guardar senhas | **bcrypt**, custo 12 (resumo lento, com "sal") | adequada (OWASP) | `passlib` + `bcrypt` | `security.py` (`pwd_context`) |
| Assinar a sessão (JWT) | **HMAC-SHA256 (HS256)**, algoritmo fixo; `alg: none` e outros recusados | 256 bits (chave ≥ 32 bytes, obrigatória em produção) | `PyJWT` | `security.py`, `config.py` |
| Identificador da sessão (`jti`) | aleatório, `secrets.token_urlsafe(32)` | 256 bits | Python `secrets` | `sessoes.py` |
| Códigos dos links (redefinição, confirmação de e-mail) | aleatório, `secrets.token_urlsafe(32)`; no banco só o **resumo SHA-256** | 256 bits | `secrets`, `hashlib` | `auth.py` |
| Envio de e-mail | TLS via STARTTLS (`SMTP_USE_TLS=true`) | depende do provedor | `smtplib` | `email.py` |
| Navegador ↔ Radix | **HTTPS: ainda não** (risco aceito até a implantação, `SEGURANCA.md` seção 9) | — | nginx (na implantação) | — |
| Serviços internos (API ↔ Orthanc, banco, voz) | sem TLS; rede interna do Docker (ASVS 12.3.x, grupo de implantação) | — | — | `docker-compose.yml` |
| UIDs DICOM novos na anonimização | gerados pelo Orthanc (não é uso criptográfico) | — | Orthanc | `orthanc_client.py` |

Proibidos no código (conferido por `test_11_4_3_e_11_5_1`):
- MD5 ou SHA-1 para segurança;
- o módulo `random` para segredos;
- algoritmos escritos à mão.

## 2. Segredos e chaves (política — ASVS 11.1.1)

| Segredo | Para que serve | Onde fica | Se vazar |
|---|---|---|---|
| `JWT_SECRET_KEY` | assina as sessões | `.env` (fora do Git) | alguém poderia forjar sessões → **trocar já** |
| `POSTGRES_PASSWORD` | acesso ao banco | `.env` | leitura e alteração de todos os dados |
| `ORTHANC_PASSWORD` | API e portaria acessam o Orthanc | `.env` | acesso às imagens sem passar pelo Radix |
| `SMTP_PASSWORD` | envio de e-mail | `.env` | envio de e-mails em nome do Radix |

**Regras:**
1. **Geração:** sempre com gerador criptográfico, por exemplo:
   ```
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
   48 bytes, acima do mínimo de 32. Nunca usar palavras, datas ou senhas reaproveitadas.
2. **Guarda:** só no `.env` do servidor, que o `.gitignore` impede de ir para o Git. Permissão de leitura só para o administrador do servidor (`chmod 600 .env`). O `.env.example` traz os nomes, nunca os valores.
3. **Distribuição:** pessoalmente ou por canal cifrado; nunca por e-mail, chat ou documento compartilhado.
4. **Troca (rotação):**
   - na implantação, **todas as senhas e chaves são novas**; nenhuma do ambiente local é reaproveitada. Isso encerra o risco aceito da senha que ficou no histórico do Git;
   - a cada 12 meses;
   - imediatamente se houver suspeita de vazamento, saída de alguém com acesso ao servidor ou exposição acidental (Git, captura de tela).
5. **Efeito da troca:**
   - a troca da `JWT_SECRET_KEY` **encerra todas as sessões**, e todos entram de novo;
   - a da senha do banco ou do Orthanc exige atualizar o `.env` e reiniciar os serviços (`docker compose up -d`).
6. **Cópia de segurança dos segredos:** o `.env` **não** entra no backup automático, de propósito. O responsável guarda uma cópia num gerenciador de senhas pessoal.
7. **Destruição:** valores antigos são apagados após a troca. Não ficam em arquivos, históricos de terminal ou anotações.
8. **Futuro (ASVS 13.3.1):** na implantação, avaliar um cofre de segredos (Docker secrets ou equivalente) no lugar do `.env`.

## 3. Agilidade criptográfica (ASVS 11.2.2)

| O que trocar | Como, sem reescrever o sistema |
|---|---|
| Algoritmo ou custo das **senhas** | editar a lista em `security.py` (`pwd_context`), por exemplo pôr `argon2` na frente. Senhas antigas continuam entrando e são **regravadas no padrão novo no próximo login** (`senha_precisa_atualizar`), comprovado por `test_11_2_2_senha_em_padrao_antigo_e_regravada_no_login` |
| Algoritmo da **sessão** | `JWT_ALGORITHM` no `.env`. A troca encerra as sessões atuais |
| Resumo dos **códigos de link** | função única `_resumo_token` em `auth.py`. Códigos pendentes deixam de valer, como na migração de 18/10 |
| Tamanho dos **segredos** | `secrets.token_urlsafe(N)` em um ponto por uso; `JWT_CHAVE_MIN_BYTES` em `config.py` |

## 4. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 18/10/2026 | Criação (auditoria OWASP ASVS 5.0, Nível 2). Também passou a vigorar: chave do JWT com 32 bytes ou mais obrigatória em produção, e regravação automática de senhas em padrão antigo |
