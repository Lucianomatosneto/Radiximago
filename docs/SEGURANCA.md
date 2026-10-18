# Radix Imago — Documento de Segurança

| Campo | Valor |
|---|---|
| Versão do documento | 1.2 — 18/10/2026 |
| Responsável | Luciano de Matos Neto (PPGINFOS/UFSC) |
| Referência | OWASP Application Security Verification Standard (ASVS) 5.0.0 — alvo: **Nível 2** |
| Atende diretamente | ASVS 2.1.1, 6.1.1, 6.3.1 (com o código), 7.1.1, 7.1.2, 8.1.1, 15.1.1; apoia 5.1.1 |
| Revisão | A cada mudança que afete autenticação, autorização, arquivos ou dependências, e no mínimo a cada 6 meses |

> Este documento descreve **as regras que o sistema aplica**. Cada regra cita onde ela está implementada e qual teste automatizado a comprova. Divergência entre este texto e o código é um defeito a corrigir.

---

## 1. Dados tratados (resumo)

| Dado | Exemplo | Proteção |
|---|---|---|
| Conta do usuário | nome, e-mail, perfil, senha (só o hash bcrypt) | login obrigatório; só administrador gerencia contas |
| Imagens DICOM | radiografias odontológicas | anonimização automática no envio; acesso pela portaria das imagens (seção 5) |
| Ficha de curadoria | achados, descrição didática, observações internas | estudante não vê observações internas; só fichas aprovadas aparecem na busca |
| Anotações pessoais | texto livre do usuário | só o dono vê/edita; compartilhamento explícito |
| Registros de auditoria | quem, o quê, quando, resultado | só administrador consulta; sem senha, áudio ou texto ditado |

O acervo atual é composto por imagens obtidas na internet, sem identificação. **Antes de receber imagens de pacientes**, devem estar resolvidos: aprovação no Comitê de Ética (CEP), remoção de texto gravado nos pixels e revisão dos campos DICOM mantidos (ver `claude/auditoria/resultados_testes_dicom.md`).

## 2. Regras de validação de entrada (ASVS 2.1.1)

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
| Senha | mínimo de 8 caracteres; sem regra de composição | `auth.py`, `users_router.py` |
| Anotação | 1 a 2000 caracteres | `anotacoes_router.py` |
| Recado de compartilhamento | 1 a 500 caracteres | `compartilhamentos_router.py` |
| Termo do vocabulário | 2 a 150 caracteres | `vocabulario_router.py` |
| Macro de curadoria | nome 2–80, frase 3–150, valor 1–60 | `macros_router.py` |
| Achado "Outro" | exige descrição não vazia | `curation/achados.py` |
| Busca textual | caracteres curinga (`%`, `_`) tratados como texto | `busca_texto.py` |

**Lacuna conhecida (ASVS 2.2.1, em correção):** descrição didática e observações internas da ficha ainda **não têm limite de tamanho** no servidor.

**Testes que comprovam:** `test_fdi_invalido_e_rejeitado`, `test_busca_fdi_invalido_e_rejeitado`, `test_outro_sem_descricao_e_rejeitado`, auditoria T-VAL-01/02 (15/10/2026).

## 3. Autenticação e defesas contra força bruta (ASVS 6.1.1 e 6.3.1)

### 3.1 Limites de tentativas (por endereço de rede)
| Função | Limite | Ao estourar |
|---|---|---|
| Login (`POST /auth/login`) | 5 por minuto | resposta 429 por 1 minuto |
| Esqueci a senha | 3 por minuto | 429 |
| Redefinir a senha | 10 por minuto | 429 |
| Pedir acesso (cadastro) | 5 por minuto | 429 |
| Confirmar e-mail do cadastro | 10 por minuto; o link é **invalidado** após 5 senhas erradas | 429 / link bloqueado |
| Compartilhar imagem / responder | 20 por minuto | 429 |
| Transcrição de voz | 120 por minuto | 429 |

Implementação: biblioteca `slowapi` (`@limiter.limit` em cada rota). Teste: `test_rate_limit_no_login`.

### 3.2 Outras defesas
- Mensagem **igual** para e-mail inexistente e senha errada ("Email ou senha incorretos"); "esqueci a senha" sempre responde a mesma frase (não revela quais e-mails existem).
- Senhas guardadas só como hash **bcrypt**.
- Todas as falhas de login são registradas na auditoria (`falha_login`), o que permite ao administrador identificar ataques.
- Conta suspeita pode ser **bloqueada** pelo administrador; o bloqueio vale na hora.
- Código de redefinição: aleatório (256 bits), validade de 60 minutos, uso único; no banco fica **só o resumo SHA-256** do código (ASVS 6.4.1), como na confirmação de e-mail.
- Não existem contas padrão; o primeiro administrador é criado por `criar_admin.py`, que pede a senha no terminal.

### 3.3 Política de senha (ASVS 6.2.1, 6.2.4, 6.2.5, 6.2.8)
Uma única função (`app/core/politica_senha.py`) decide se uma senha **nova** pode ser usada, em todas as entradas: cadastro público, troca da própria senha, redefinição ("esqueci") e criação de conta pelo administrador.

| Regra | Valor | Justificativa |
|---|---|---|
| Tamanho mínimo | 8 caracteres | ASVS 6.2.1 |
| Tamanho máximo | 64 caracteres **e** 72 bytes | o bcrypt só lê 72 bytes; acima disso o fim da senha seria ignorado sem aviso (ASVS 6.2.8). Letras acentuadas ocupam 2 bytes |
| Senhas comuns | recusadas (11.663 senhas, ignorando maiúsculas) | ASVS 6.2.4 pede ao menos as 3 000 mais comuns |
| Contexto | recusa senha igual ao e-mail, à parte antes do "@" ou ao nome | ASVS 6.2.11 |
| Composição | **não** exige maiúscula/número/símbolo | ASVS 6.2.5: regras de composição levam a senhas previsíveis; incentiva-se frase curta |

- Lista: `app/core/senhas_comuns.txt` — lista "passwords" do zxcvbn 4.5.0 (licença MIT), filtrada para 8 a 64 caracteres, mais senhas comuns no Brasil e palavras do contexto (Radix, UFSC, odontologia, perfis). Fica dentro do sistema: **nenhuma senha é enviada a serviço externo**.
- Senhas já cadastradas continuam valendo; a regra se aplica na próxima troca. Uma senha antiga com mais de 72 bytes continua entrando como antes (risco residual baixo, registrado).
- Testes: `tests/test_politica_senha.py`, `tests/test_password_reset.py`.

**Melhorias planejadas:** bloqueio progressivo por conta; autenticação em dois fatores para curador/administrador.

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
| Anotações pessoais | só o autor; quem recebe um compartilhamento vê as do remetente e pode ocultá-las **só para si** |
| Imagens salvas | só o dono |
| Compartilhamentos | só imagens aprovadas; só remetente e destinatário veem |
| Observações internas da ficha | só perfis de curadoria |
| Ranking de curadores | cada curador vê só a própria posição |

Testes: `test_auth.py`, `test_acesso_imagens.py`, `test_saved_images.py`, `test_compartilhamentos.py`, `test_achados_api.py` (IDOR), `test_search_golden_rule.py`.

## 6. Arquivos enviados (apoia ASVS 5.1.1)
| Envio | Tipos aceitos | Tamanho máximo | Validação |
|---|---|---|---|
| Imagem DICOM | DICOM | 50 MB (`MAX_UPLOAD_SIZE_MB`) | leitura pelo `pydicom`; anonimização automática; original apagado |
| Foto de perfil | JPG, PNG, WebP | 5 MB | conteúdo real conferido pela assinatura do arquivo; nome gerado pelo servidor |
| Áudio da curadoria por voz | áudio | 10 MB | não é gravado em disco; só o texto volta |

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

## 8. Registros de auditoria (resumo)
Tabela `audit_logs`: usuário, ação, entidade, resultado, detalhes e horário (com fuso). Registra: login (sucesso/falha), troca e redefinição de senha (com nº de outras sessões encerradas), ações de curadoria, compartilhamentos, transcrições de voz (só duração) e **acessos negados às imagens**. Nunca registra senhas, áudio ou texto ditado.

## 9. Decisões e riscos aceitos
| Data | Decisão | Risco aceito | Condição para encerrar |
|---|---|---|---|
| 15/10/2026 | HTTPS/TLS será implementado na fase final (servidor externo) | tráfego sem criptografia enquanto o uso for local e sem dados de pacientes | configurar TLS e retestar ASVS 3.3.1, 3.4.1 e V12 na implantação |
| 18/10/2026 | Senha do banco de dados local ficou no histórico do Git (`alembic.ini`, corrigido no código em 18/10). Troca da senha adiada para a implantação | repositório **privado**, sem outros colaboradores; banco só no computador do responsável | **criar o banco do servidor externo com senha nova e forte** (nunca a antiga); trocar antes se alguém novo receber acesso ao repositório ou se ele ficar público |

### 9.1 Onde ficam os segredos (ASVS 13.3.1)
- Senhas e chaves (banco, JWT, Orthanc, e-mail) ficam **só** no arquivo `.env`, que o `.gitignore` impede de ir para o Git. O modelo sem valores é o `.env.example`.
- `alembic/env.py` lê `DATABASE_URL` do `.env`; o `alembic.ini` não tem endereço nem senha.
- Antes de cada entrega: `git grep -n -i "password\|senha\|secret"` para conferir que nenhum segredo entrou no código.

## 10. Histórico do documento
| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 15/10/2026 | Criação, a partir da auditoria OWASP ASVS 5.0 (pasta `claude/auditoria/` do projeto) |
| 1.1 | 18/10/2026 | Política de senha (seção 3.3) e código de redefinição guardado só como resumo |
| 1.2 | 18/10/2026 | Segredos fora do `alembic.ini` (seção 9.1) e risco aceito da senha no histórico do Git |
