# Radix Imago — Documento de Segurança

| Campo | Valor |
|---|---|
| Versão do documento | 1.10 — 19/10/2026 |
| Responsável | Luciano de Matos Neto (PPGINFOS/UFSC) |
| Referência | OWASP Application Security Verification Standard (ASVS) 5.0.0 — alvo: **Nível 2** |
| Atende diretamente | ASVS 2.1.1, 5.1.1, 6.1.1, 6.3.1 (com o código), 7.1.1, 7.1.2, 8.1.1, 15.1.1 |
| Revisão | A cada mudança que afete autenticação, autorização, arquivos ou dependências, e no mínimo a cada 6 meses |

**Documentos complementares** (mesma pasta `docs/`):

| Documento | Assunto | ASVS |
|---|---|---|
| `DADOS_E_PRIVACIDADE.md` | inventário e classificação dos dados (LGPD), proteção por nível, acesso por campo | 14.1.1, 14.1.2, 8.1.2 |
| `REGRAS_DE_NEGOCIO.md` | consistência entre campos, fluxo da ficha, limites anti-abuso, funções pesadas | 2.1.2, 2.1.3, 2.2.3, 2.3.2, 2.4.1, 15.1.3, 15.2.2 |
| `CRIPTOGRAFIA.md` | inventário criptográfico, política de chaves e segredos, agilidade | 11.1.1, 11.1.2, 11.2.2 |
| `COMUNICACOES.md` | todas as conexões entre as partes do sistema | 13.1.1, 13.2.1 |
| `REGISTROS.md` | inventário dos registros (logs) | 16.1.1 |
| `sbom/radix-imago-sbom.cdx.json` | lista de componentes (CycloneDX 1.5), gerada por `scripts/gerar_sbom.py` | 15.1.2 |

> Este documento descreve **as regras que o sistema aplica**. Cada regra cita onde ela está implementada e qual teste automatizado a comprova. Divergência entre este texto e o código é um defeito a corrigir.

---

## 1. Dados tratados (resumo)

| Dado | Exemplo | Proteção |
|---|---|---|
| Conta do usuário | nome, e-mail, perfil, senha (só o resumo Argon2id), segredo do login em duas etapas (cifrado) | login obrigatório; só administrador gerencia contas |
| Imagens DICOM | radiografias odontológicas | anonimização automática no envio; acesso pela portaria das imagens (seção 5) |
| Ficha de curadoria | achados, descrição didática, observações internas | estudante não vê observações internas; só fichas aprovadas aparecem na busca |
| Anotações pessoais | texto livre do usuário | só o dono vê/edita; o compartilhamento leva só a anotação escrita nele |
| Registros de auditoria | quem, o quê, quando, resultado | só administrador consulta; sem senha, áudio ou texto ditado |

O acervo atual é composto por imagens obtidas na internet, sem identificação. **Antes de receber imagens de pacientes**, devem estar resolvidos: aprovação no Comitê de Ética (CEP), remoção de texto gravado nos pixels e revisão dos campos DICOM mantidos (ver `claude/auditoria/resultados_testes_dicom.md`).

## 2. Regras de validação de entrada (ASVS 2.1.1 e 2.2.1)

**Princípio:** toda validação que importa é feita **no servidor** (FastAPI/Pydantic). A validação nas telas é só conforto para o usuário. Valor fora da regra → resposta **422** e nada é gravado.

| Tipo de dado | Regra | Onde |
|---|---|---|
| Listas fechadas (tipo de radiografia, sexo, qualidade, achado, região, erro técnico, perfil, origem) | só valores da lista (*enum*) | modelos em `app/modules/curations.py`, `achados.py` |
| Dentes | numeração FDI de dentes permanentes válida (11–18, 21–28, 31–38, 41–48) | `DENTES_PERMANENTES` |
| Quadrante | 1 a 4 | `search_router.py` |
| Idade | 0 a 120 | `search_router.py`, ficha |
| Coordenadas das marcações | entre 0 e 1 (proporção da imagem) | `curation/schemas.py` |
| Paginação | `skip ≥ 0`; `limit` de 1 a 200 | `search_router.py` |
| E-mail | formato válido (`EmailStr`) | `auth.py` |
| Senha | política única (seção 3.3) | `politica_senha.py` |
| Anotação | 1 a 2000 caracteres | `anotacoes_router.py` |
| Recado de compartilhamento | 1 a 500 caracteres | `compartilhamentos_router.py` |
| Termo do vocabulário | 2 a 150 caracteres | `vocabulario_router.py` |
| Macro de curadoria | nome 2–80, frase 3–150, valor 1–60 | `macros_router.py` |
| Achado "Outro" | exige descrição não vazia | `curation/achados.py` |
| Busca textual | caracteres curinga (`%`, `_`) tratados como texto | `busca_texto.py` |

### 2.1 Tamanhos máximos (ASVS 2.2.1)
Definidos num só lugar, `app/core/limites.py`, e repetidos nas caixas de texto das telas (`maxLength`) para o usuário não perder texto ao salvar.

| Campo | Máximo |
|---|---|
| Descrição didática, achados detalhados, observações internas | 8 000 caracteres (as macros geram até 4 000) |
| Motivo de descarte/revisão, pareceres, observações, descrição de achado e de erro técnico | 2 000 |
| "Outro" de uma marcação | 500 |
| Nome / e-mail / instituição | 150 / 150 / 200 (= colunas do banco; antes, nome maior dava erro 500) |
| Senha recebida | 256 (a política de senha é mais estrita) |
| Código de link | 200 |
| Listas da ficha | dentes 52, marcações 200, achados 100, termos 200, erros técnicos 50, alterações 50 |

Testes: `tests/test_limites_entrada.py`.

**Garantia geral (ASVS 1.3.3):** o teste `test_1_3_3_todo_texto_recebido_tem_tamanho_maximo` lê o contrato da API (OpenAPI) e falha se algum campo de texto ou lista recebido, no corpo, no endereço ou na consulta, não tiver limite ou lista fechada. Na primeira execução ele achou **4 lacunas**, todas corrigidas:
- o formulário de login aceitava e-mail e senha de qualquer tamanho, e o e-mail digitado ia **inteiro** para a auditoria (`falha_login`); agora, acima de 150/256 caracteres → 422, antes de consultar o banco;
- o identificador de acesso em "Meus acessos";
- o filtro de situação dos pedidos de acesso;
- dois campos das macros.

Também neutralizados antes de **contextos perigosos**:
- todo valor posto em link (`href`) dos e-mails passa por `escape`;
- nomes de arquivo nos cabeçalhos HTTP só levam caracteres seguros (seção 6);
- a busca trata `%` e `_` como texto.

### 2.2 Dados sensíveis fora dos endereços (ASVS 14.2.1)
- O crachá de login vai **só em cookie**, nunca no endereço.
- Os links dos e-mails ("esqueci a senha" e confirmação de cadastro) levam o código **depois do `#`** (`/redefinir-senha#token=...`). Essa parte do endereço não sai do navegador: não chega ao servidor nem a registros de servidores e proxies. A tela lê o código e o **apaga da barra de endereço** na hora (`frontend/src/lib/codigoDoLink.ts`). Links antigos com `?token=` continuam aceitos e também são apagados.
- Os códigos são de uso único, expiram e ficam no banco só como resumo (seção 3.2).

### 2.3 A API devolve só o necessário (ASVS 15.3.1)
- Nenhuma resposta traz resumo de senha, códigos de link ou o identificador interno da sessão.
- Estudante, professor e pesquisador não recebem as **observações internas** da ficha nem o e-mail de outros usuários; a ficha completa é só para a curadoria.
- Comprovação automática: `tests/test_exposicao_de_dados.py` percorre **todas** as rotas de leitura do contrato da API com cada perfil e procura esses dados. Tem controle positivo: o teste falha se não encontrar a ficha, para provar que a varredura enxergou os dados.

**Testes que comprovam (validação):** `test_fdi_invalido_e_rejeitado`, `test_busca_fdi_invalido_e_rejeitado`, `test_outro_sem_descricao_e_rejeitado`, auditoria T-VAL-01/02 (15/10/2026).

## 3. Autenticação e defesas contra força bruta (ASVS 6.1.1 e 6.3.1)

### 3.1 Limites de tentativas (sem login: por endereço de rede; com login: por conta)
| Função | Limite | Ao estourar |
|---|---|---|
| Login (`POST /auth/login`) | 5 por minuto | resposta 429 por 1 minuto |
| Esqueci a senha | 3 por minuto | 429 |
| Redefinir a senha | 10 por minuto | 429 |
| Pedir acesso (cadastro) | 5 por minuto | 429 |
| Confirmar e-mail do cadastro | 10 por minuto; o link é **invalidado** após 5 senhas erradas | 429 / link bloqueado |
| Compartilhar imagem / responder | 20 por minuto | 429 |
| Transcrição de voz | 120 por minuto | 429 |
| Qualquer outra rota (limite geral) | 600 por minuto | 429 |

Implementação: biblioteca `slowapi` (`@limiter.limit` em cada rota) e um "vigia" próprio para o limite geral (`app/core/rate_limit.py`). Os limites de e-mail, ZIP, envio de DICOM e sincronização, por hora, estão em `REGRAS_DE_NEGOCIO.md`, seção 3. Testes: `test_rate_limit_no_login`, `tests/test_anti_abuso.py`.

### 3.2 Outras defesas
- Mensagem **igual** para e-mail inexistente e senha errada ("Email ou senha incorretos"); "esqueci a senha" sempre responde a mesma frase (não revela quais e-mails existem).
- Senhas guardadas só como resumo **Argon2id** (as anteriores a 19/10/2026, em bcrypt, são convertidas no próximo login).
- Todas as falhas de login são registradas na auditoria (`falha_login`), o que permite ao administrador identificar ataques.
- Conta suspeita pode ser **bloqueada** pelo administrador; o bloqueio vale na hora.
- Código de redefinição: aleatório (256 bits), validade de 60 minutos, uso único; no banco fica **só o resumo SHA-256** do código (ASVS 6.4.1), como na confirmação de e-mail.
- Não existem contas padrão; o primeiro administrador é criado por `criar_admin.py`, que pede a senha no terminal.

### 3.3 Política de senha (ASVS 6.2.1, 6.2.4, 6.2.5, 6.2.8, 6.2.9, 6.2.12)
Uma única função (`app/core/politica_senha.py`) decide se uma senha **nova** pode ser usada, em todas as entradas: cadastro público, troca da própria senha, redefinição ("esqueci") e criação de conta pelo administrador.

| Regra | Valor | Justificativa |
|---|---|---|
| Tamanho mínimo | 8 caracteres | ASVS 6.2.1 |
| Tamanho máximo | 128 caracteres, com qualquer acento ou símbolo | ASVS 6.2.9 pede ao menos 64. O Argon2id lê a senha **inteira** (ASVS 6.2.8); antes, com bcrypt, o limite era 64 caracteres e 72 bytes |
| Senhas comuns | recusadas (11.663 senhas, ignorando maiúsculas) | ASVS 6.2.4 pede ao menos as 3 000 mais comuns |
| Senhas **vazadas** | recusadas: as 100 mil senhas mais frequentes em vazamentos (base Have I Been Pwned, lista do NCSC do Reino Unido); ficam as 46.476 com 8 caracteres ou mais | ASVS 6.2.12. Checagem **local**: nada sai do servidor (decisão de 19/10/2026) |
| Contexto | recusa senha igual ao e-mail, à parte antes do "@" ou ao nome | ASVS 6.2.11 |
| Composição | **não** exige maiúscula/número/símbolo | ASVS 6.2.5: regras de composição levam a senhas previsíveis; incentiva-se frase curta |

- Lista: `app/core/senhas_comuns.txt` — lista "passwords" do zxcvbn 4.5.0 (licença MIT), filtrada para 8 a 64 caracteres, mais senhas comuns no Brasil e palavras do contexto (Radix, UFSC, odontologia, perfis). Fica dentro do sistema: **nenhuma senha é enviada a serviço externo**.
- Lista de vazadas: `app/core/senhas_vazadas.txt` (SecLists, licença MIT, `100k-most-used-passwords-NCSC.txt`, baixada em 19/10/2026).
- Senhas já cadastradas continuam valendo; a regra se aplica na próxima troca.
- Testes: `tests/test_politica_senha.py`, `tests/test_password_reset.py`.

### 3.4 Login em duas etapas (ASVS 6.3.3; decisão de 19/10/2026)

| Perfil | Situação |
|---|---|
| Administrador, suporte, curador | **obrigatório**: no 1º login depois da atualização, a pessoa cadastra um aplicativo autenticador (Google ou Microsoft Authenticator) lendo um QR code |
| Professor, pesquisador, estudante | **opcional**: liga e desliga em "Meus acessos" (desligar exige senha **e** código) |

Como funciona:
1. **Senha certa** → em vez da sessão, a pessoa recebe um "vale" de 5 minutos, que **não abre nada** no sistema;
2. **código do aplicativo** (6 números, troca a cada 30 s) → a sessão é aberta.

Proteções:
- cada código vale **uma vez**;
- cada "vale" aceita no máximo **5 tentativas** e é usado uma vez só;
- as rotas têm limite de 10 pedidos por minuto;
- quem já tem aplicativo cadastrado **não** cadastra outro só com a senha (impede o invasor de trocar o celular);
- o segredo do aplicativo fica **cifrado** no banco (`CRIPTOGRAFIA.md`).

**Celular perdido:**
- **8 códigos de recuperação** de uso único, mostrados uma vez no cadastro. Podem ser gerados de novo em "Meus acessos";
- sem eles, o **administrador** usa "Redefinir 2 etapas" na tela Usuários, depois de confirmar a identidade da pessoa por outro meio;
- se quem perdeu foi o próprio administrador, existe um roteiro no servidor: `docker compose exec radix-api python redefinir_segundo_fator.py`.

**Limite declarado:** como é **parcial** (estudantes, professores e pesquisadores podem entrar só com a senha), o item 6.3.3 continua **reprovado** na matriz. A escolha foi do responsável, para não exigir celular de estudantes, que só veem imagens já anonimizadas e aprovadas.

Testes: `tests/test_segundo_fator.py` (11 testes).

**Melhoria planejada:** bloqueio progressivo por conta.

## 4. Sessão (ASVS 7.1.1 e 7.1.2)

| Regra | Valor | Justificativa |
|---|---|---|
| Onde fica o "crachá" (token JWT) | cookie `HttpOnly`, `SameSite=Lax` (inacessível a scripts da página) | evita roubo por XSS |
| Inatividade | **60 minutos** sem uso encerram a sessão | equilíbrio entre segurança e sessões de curadoria longas |
| Renovação | enquanto o usuário usa o sistema, o crachá é renovado automaticamente (após metade da validade) | não desconectar quem está trabalhando |
| Duração máxima absoluta | **12 horas** desde o login, mesmo com uso contínuo | ASVS 3.3.2 (v4) / 7.3.2 (v5): reautenticação periódica |
| Sessões simultâneas | **permitidas, sem limite** (ex.: computador da clínica e notebook) | uso acadêmico em vários locais; cada sessão é rastreada e pode ser encerrada |
| Sair | encerra a sessão **no servidor** (cópia do crachá deixa de valer) e pede ao navegador para limpar o cache | ASVS 7.4.1, 14.3.1 |
| Novo login no mesmo navegador | encerra a sessão anterior daquele navegador | ASVS 7.2.4 |
| Trocar a senha | encerra as sessões dos **outros** aparelhos; o atual continua | ASVS 7.4.3 |
| Redefinir a senha ("esqueci") | encerra **todas** as sessões | quem esqueceu pode ter perdido o controle da conta |
| Conta bloqueada, inativa ou excluída | acesso recusado na hora, em qualquer sessão | ASVS 7.4.2 |
| **Meus acessos** (menu do perfil) | o usuário vê cada acesso aberto (aparelho resumido, endereço de rede, início, último uso) e encerra um ou todos os outros; nunca os de outra pessoa | ASVS 7.5.2 |
| Administrador | encerra todos os acessos de um usuário (tela Usuários) ou de **todos** (menos o dele) — ex.: incidente | ASVS 7.4.5 |
| Dado que afeta a autenticação | só a senha pode mudar, e **exige a senha atual**; ninguém troca o e-mail de uma conta; não há MFA (decisão pendente, grupo 6) | ASVS 7.5.1 |
| Crachá (JWT) | além de assinatura e validade, precisa dizer **quem emitiu** (`iss=radix-imago`), **para quem** (`aud=radix-imago-api`) e **para que** (`tipo=sessao`); faltando ou diferente → recusado | ASVS 9.2.2, 9.2.3 |

Implementação: `app/modules/sessoes.py` (tabela `sessoes_usuario`), `app/core/sessao.py`, `app/modules/auth.py`. Testes: `tests/test_sessao.py`, `tests/test_sessoes_revogaveis.py`.

## 5. Autorização (ASVS 8.1.1)

### 5.1 Por função (o que cada perfil pode fazer)
| Função | Admin | Suporte | Curador | Professor | Estudante | Pesquisador |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Gerenciar usuários e pedidos de acesso | ✅ | — | — | — | — | — |
| Ativar/desativar imagens, sincronizar com o Orthanc | ✅ | ✅ | — | — | — | — |
| Enviar imagens e ver a fila do que enviou | ✅ | ✅ | ✅ | ✅ | — | — |
| Curadoria (fichas, achados, aprovar, descartar, segunda opinião, voz, macros, vocabulário) | ✅ | ✅ | ✅ | — | — | — |
| Indicadores e relatórios | ✅ | ✅ | ✅ | — | — | — |
| Auditoria | ✅ | — | — | — | — | — |
| Pesquisar, visualizar, salvar, anotar e compartilhar imagens aprovadas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Fonte única: constantes `PERFIS_ADMIN`, `PERFIS_IMAGENS`, `PERFIS_CURADORIA`, `PERFIS_ENVIO_IMAGENS` em `app/modules/auth.py`, aplicadas por `exigir_perfis(...)` em cada rota. **Toda** rota, exceto login, cadastro, senha e verificação de saúde, exige login.

### 5.2 Por dado (o que cada pessoa pode ver)
| Dado | Regra |
|---|---|
| Resultados da pesquisa | só fichas **aprovadas** de imagens **ativas** |
| Imagens no visualizador (portaria das imagens) | admin: tudo; suporte: tudo, só leitura; curador: imagens cadastradas no Radix; demais: só aprovadas ou compartilhadas com a própria pessoa. Listas gerais e API do Orthanc: só admin/suporte |
| Anotações pessoais | só o autor; quem recebe um compartilhamento vê só a anotação escrita no próprio compartilhamento e pode ocultá-la **só para si** |
| Imagens salvas | só o dono |
| Compartilhamentos | só imagens aprovadas; só remetente e destinatário veem |
| Observações internas da ficha | só perfis de curadoria |
| Ranking de curadores | cada curador vê só a própria posição |

Testes: `test_auth.py`, `test_acesso_imagens.py`, `test_saved_images.py`, `test_compartilhamentos.py`, `test_achados_api.py` (IDOR), `test_search_golden_rule.py`.

## 5.1 Proteção no navegador (ASVS 3.2.1, 3.4.4–3.4.6, 3.5.1, 3.5.2)

**Pedidos que alteram dados** (POST, PUT, PATCH, DELETE) vindos de um navegador só são aceitos se a origem for a tela do Radix (`ORIGENS_PERMITIDAS` em `app/core/cabecalhos.py`, a mesma lista do CORS). Outro site → **403**, mesmo que o usuário esteja logado e mesmo com formulário HTML simples. Isso protege contra CSRF (falsificação de pedido entre sites). Pedidos sem navegador (scripts, testes, o servidor do Next.js) não trazem origem e seguem a regra normal de login.

| Cabeçalho | API (`app/core/cabecalhos.py`) | Telas (`frontend/next.config.mjs`) | Para quê |
|---|---|---|---|
| `X-Content-Type-Options` | `nosniff` | `nosniff` | o navegador não "adivinha" o tipo: foto enviada nunca vira página ou script |
| `Referrer-Policy` | `no-referrer` | `same-origin` | endereços internos não vazam para outros sites |
| `X-Frame-Options` + `frame-ancestors` | `DENY` / `'none'` | `DENY` / `'none'` | nenhum site embute o Radix em moldura (*clickjacking*). O Radix continua mostrando o OHIF em moldura |
| `Content-Security-Policy` | `default-src 'none'` em JSON e imagens; `sandbox` em `/uploads` | **lista fechada** (ASVS 3.4.3): só a própria tela, a API e o OHIF (em moldura); `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` | conteúdo da API nunca executa nada; nas telas, script, moldura ou conexão para outro site é recusado pelo navegador |

- Exceção: a documentação interativa da API (`/docs`) não recebe a CSP restrita, porque usa scripts. Deve ser desligada no servidor de produção.
- **Limite declarado da CSP das telas:** `'unsafe-inline'` em scripts e estilos continua permitido, porque o Next.js escreve pequenos scripts dentro da página e o tema é aplicado antes da primeira pintura. Tirá-lo exige "nonce" por resposta, exigência do Nível 3. `'unsafe-eval'` e `ws:` só existem em desenvolvimento (`npm run dev`).
- **Comprovação em navegador real (18/10):** 12 telas visitadas com o administrador, inclusive o visualizador com o OHIF em moldura, e **nenhuma** recusa da política. Já script, `<object>`, moldura, `<base>` e conexão para um site de fora, inseridos à força na página, foram **todos recusados** pelo navegador.
- Pendente (implantação): cabeçalhos no OHIF (porta 3001) e no proxy do Orthanc (porta 8042).
- Testes: `tests/test_protecao_navegador.py`.

## 6. Arquivos enviados (ASVS 5.1.1)
| Envio | Quem | Tipos aceitos | Extensão esperada | Tamanho máximo | Tamanho descompactado | Validação e destino |
|---|---|---|---|---|---|---|
| Imagem DICOM (tela) | administrador, suporte, curador, professor | DICOM (Part 10; sem cabeçalho "DICM" só se tiver SOPClassUID e SOPInstanceUID) | `.dcm` ou sem extensão (a extensão **não** decide; o conteúdo decide) | 50 MB (`MAX_UPLOAD_SIZE_MB`) | **arquivos compactados (.zip, .rar, .7z, .gz) são recusados** antes do Orthanc. A imagem DICOM comprimida (JPEG) só é descompactada na memória para o OCR; não há limite explícito de dimensões (risco baixo, limitado pelos 50 MB) | lido pelo `pydicom`; anonimizado; texto tarjado; original apagado |
| Imagem DICOM (aparelho, porta 4242) | equipamento na rede | DICOM | — | o que o Orthanc aceitar | o Orthanc não descompacta nada no protocolo DICOM | anonimizada automaticamente em até 60 s |
| Foto de perfil | o próprio usuário | JPG, PNG, WebP | qualquer (o nome enviado é ignorado; o servidor gera nome e extensão) | 5 MB | não se aplica | conteúdo real conferido pela assinatura do arquivo; servida com `nosniff` e CSP `sandbox` |
| Áudio da curadoria por voz | curadoria | áudio do navegador | — | 10 MB | não se aplica | só na memória; vira texto e é descartado |

**Nome do arquivo nas respostas (ASVS 5.4.1):** toda resposta de arquivo (miniatura, ZIP, foto de perfil) leva `Content-Disposition` com um nome **gerado pelo servidor** (`radix-imago-12.png`), nunca o nome enviado pelo usuário. Só letras sem acento, números, `.`, `-` e `_` entram no cabeçalho (`disposicao_de_arquivo` em `app/core/cabecalhos.py`). Comprovado por análise do código (toda `Response(content=...)` define o nome) e por teste (`test_5_4_1_...`).

Arquivo fora da regra → **422**, e nada é gravado. Arquivo malicioso disfarçado de imagem é recusado pela assinatura (`T-UPL-03`, auditoria de 15/10). Antivírus: **não há** por enquanto (ASVS 5.4.3, risco aceito em 19/10/2026 até a implantação, seção 9).

## 6.1 Anonimização das imagens DICOM (LGPD; auditoria TST-DICOM-01 a 03)

Toda imagem passa pela mesma função, `_registrar_referencia_se_nova` (`app/modules/images_router.py`), tanto no envio manual quanto na chegada pelo aparelho:

1. **Metadados** (`regras_de_anonimizacao` em `app/modules/orthanc_client.py`). A base é o perfil padrão DICOM PS3.15 aplicado pelo Orthanc. Por cima dele, as regras do Radix, decididas pelo responsável em 18/10/2026:

| Dado | Regra | Motivo |
|---|---|---|
| Nome, IDs, nascimento, endereço, telefone, médicos, instituição, aparelho, textos livres, tags privadas | removidos (perfil padrão) | identificam direta ou indiretamente |
| Sequência de equipamento (`ContributingEquipmentSequence`) | **removida explicitamente** | o perfil do Orthanc 1.12.2 **não** a remove; traz clínica e número de série |
| Datas do exame | só o **ano** (vira 01/01/AAAA) | data exata + idade + sexo pode reidentificar em grupo pequeno |
| Horas | removidas | idem |
| Idade | mantida em anos; **90 ou mais vira "090Y"** | valor didático; idades muito altas são raras (regra HIPAA Safe Harbor) |
| Sexo | mantido | valor didático; sozinho não identifica |
| UIDs | gerados novos | impede ligar de volta ao original |
| Método usado | gravado em `DeidentificationMethod` | rastreabilidade |

2. **Texto gravado nos pixels** (`app/modules/texto_na_imagem.py`). O Tesseract (OCR que roda no próprio servidor) procura texto na imagem e o cobre com tarja preta. O resultado fica na imagem (`texto_na_imagem`: `sem_texto`, `tarjado` ou `nao_verificado`), e a tela de curadoria mostra um aviso ao lado de "Anonimização validada".
   - Filtros contra falso texto: confiança ≥ 60% (≥ 80% para palavras de 2 a 3 caracteres) e altura típica de texto impresso.
   - Imagens com vários quadros, em formato não suportado ou sem OCR disponível ficam como `nao_verificado` e não são alteradas.
   - **Limite:** o OCR reduz o risco, não o elimina. Texto pequeno, inclinado ou com pouco contraste pode escapar, e uma tarja pode cobrir uma área pequena de anatomia. Por isso a aprovação continua exigindo "Anonimização validada" marcada pelo curador, e a auditoria registra o resultado da verificação.

3. **O original identificável é apagado** logo após a anonimização.

4. **Chegada pelo aparelho (porta 4242):** a anonimização é **automática**, a cada `ANONIMIZACAO_AUTOMATICA_SEGUNDOS` (padrão 60). Antes dependia de alguém clicar em "Sincronizar". Cada imagem tratada fica na auditoria (`anonimizacao_automatica`).

Testes: `tests/test_anonimizacao_regras.py`. Teste de ponta a ponta com Orthanc real em `claude/auditoria/resultados_testes_dicom.md`.

## 7. Correção de componentes vulneráveis (ASVS 15.1.1)

**Verificação:** `pip-audit -r backend/requirements.txt`, `pip-audit -r whisper/requirements.txt` e `npm audit --omit=dev` (pasta `frontend`) — **mensalmente** e **antes de cada entrega**.

| Gravidade da falha (pela base de vulnerabilidades) | Prazo máximo para corrigir |
|---|---|
| Crítica | 7 dias |
| Alta | 30 dias |
| Média | 90 dias |
| Baixa | na próxima manutenção programada |

- Sem correção disponível: documentar o risco, avaliar se a função afetada é usada e aplicar mitigação.
- Componente sem manutenção (ex.: biblioteca abandonada): planejar a troca.
- Falhas em ferramentas usadas só na montagem do sistema (não expostas a usuários) seguem os mesmos prazos, mas podem ser agrupadas na manutenção seguinte.
- Situação em 15/10/2026: 0 falhas conhecidas nas bibliotecas de produção (backend, voz e frontend); 7 avisos em ferramentas de montagem (Tailwind 3).
- **19/10/2026:** os 7 avisos foram resolvidos com a atualização para o **Tailwind 4.3.3**, que não usa mais as ferramentas afetadas (`braces`, `micromatch`, `chokidar`, `postcss-selector-parser`). Resultado: `npm audit` sem nenhuma falha (incluindo ferramentas de montagem), `pip-audit` sem falhas no backend e na voz.
  - A aparência das telas foi conferida antes e depois: 44 capturas de tela, 21 telas nos temas escuro e claro. Diferenças só nos dados (novos registros e acessos) e de poucos pixels.
  - Efeito colateral: o Tailwind 4 exige navegadores de 2023 em diante (Chrome 111, Edge 111, Firefox 128, Safari 16.4).

## 8. Registros de auditoria (resumo)
Tabela `audit_logs`: usuário, ação, entidade, resultado, detalhes e horário (com fuso). Registra: login (sucesso/falha), troca e redefinição de senha (com nº de outras sessões encerradas), ações de curadoria, compartilhamentos, transcrições de voz (só duração) e **acessos negados às imagens**. Nunca registra senhas, áudio ou texto ditado.

## 9. Decisões e riscos aceitos
| Data | Decisão | Risco aceito | Condição para encerrar |
|---|---|---|---|
| 15/10/2026 | HTTPS/TLS será implementado na fase final (servidor externo) | tráfego sem criptografia enquanto o uso for local e sem dados de pacientes | configurar TLS e retestar ASVS 3.3.1, 3.4.1 e V12 na implantação |
| 19/10/2026 | **Antivírus (ASVS 5.4.3) só no servidor da implantação**: o ClamAV (antivírus livre) consome 1 a 1,5 GB de memória, que o computador de desenvolvimento não tem sobrando | por enquanto, arquivos enviados não passam por antivírus. Risco reduzido: o DICOM é lido e **regravado** pela anonimização (o arquivo original é apagado), compactados são recusados, e a foto de perfil é conferida pela assinatura e servida sem execução (`sandbox`) | instalar o ClamAV como serviço próprio no servidor, examinar todo envio antes do Orthanc e retestar 5.4.3 |
| 18/10/2026 | Senha do banco de dados local ficou no histórico do Git (`alembic.ini`, corrigido no código em 18/10). Troca da senha adiada para a implantação | repositório **privado**, sem outros colaboradores; banco só no computador do responsável | **criar o banco do servidor externo com senha nova e forte** (nunca a antiga); trocar antes se alguém novo receber acesso ao repositório ou se ele ficar público |

### 9.1 Onde ficam os segredos (ASVS 13.3.1)
- Senhas e chaves (banco, JWT, Orthanc, e-mail, serviço de voz) ficam **só** no arquivo `.env`, que o `.gitignore` impede de ir para o Git. O modelo sem valores é o `.env.example`.
- `alembic/env.py` lê `DATABASE_URL` do `.env`; o `alembic.ini` não tem endereço nem senha.
- Antes de cada entrega: `git grep -n -i "password\|senha\|secret"` para conferir que nenhum segredo entrou no código.

## 10. Histórico do documento
| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 15/10/2026 | Criação, a partir da auditoria OWASP ASVS 5.0 (pasta `claude/auditoria/` do projeto) |
| 1.1 | 18/10/2026 | Política de senha (seção 3.3) e código de redefinição guardado só como resumo |
| 1.2 | 18/10/2026 | Segredos fora do `alembic.ini` (seção 9.1) e risco aceito da senha no histórico do Git |
| 1.3 | 18/10/2026 | Proteção no navegador: conferência de origem e cabeçalhos (seção 5.1) |
| 1.4 | 18/10/2026 | Tamanhos máximos (2.1), códigos fora dos endereços (2.2) e exposição de dados (2.3) |
| 1.5 | 18/10/2026 | Anonimização DICOM revisada: datas só com ano, idade 90+, sequência de equipamento, texto nos pixels, anonimização automática na chegada (seção 6.1) |
| 1.6 | 18/10/2026 | Índice dos documentos complementares; seção 6 completa (5.1.1) |
| 1.7 | 18/10/2026 | Meus acessos, encerramento pelo administrador, reautenticação e crachá com emissor/público/tipo (seção 4) |
| 1.10 | 19/10/2026 | Tailwind 4: fim dos 7 avisos das ferramentas de montagem (seção 7) |
| 1.9 | 19/10/2026 | Grupo 6: Argon2id e senhas de até 128 caracteres, lista de senhas vazadas (3.3), login em duas etapas (3.4), antivírus como risco aceito até a implantação (9) |
| 1.8 | 18/10/2026 | Grupo 4: CSP completa nas telas (5.1), nome de arquivo definido pelo servidor (6), chave do serviço de voz (9.1); limites em `REGRAS_DE_NEGOCIO.md` |
