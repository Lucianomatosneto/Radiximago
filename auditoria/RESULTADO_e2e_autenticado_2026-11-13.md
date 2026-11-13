# Resultado: testes no navegador COM LOGIN (13/11/2026)

**Ramo:** `qualidade/e2e-autenticado`, PR #67 para `redesign-ui` (base `d1fafdc`). Quem junta é o Luciano ("Create a merge commit").

## Em uma frase
O "robô" do Playwright (um navegador de verdade, controlado por programa) agora entra no sistema como estudante e como administrador, com as 2 etapas, a cada PR. **Logo na primeira execução ele achou um defeito real:** depois de entrar, o administrador voltava para a tela de login. O defeito foi corrigido neste PR, com autorização do Luciano.

## 1. Contas de teste descartáveis
- **Script `backend/scripts/semear_usuarios_teste.py`.** Antes não existia: o `criar_admin.py` pede a senha no terminal e o `limpar_dados_demo.py` só limpa.
  - **Recusa rodar** se `ENVIRONMENT` não for exatamente `test`: devolve o código 2 e não cria nada. Testado com `development`, `production`, vazio e `TEST`.
  - **Cria três contas:**
    - administrador e curador, com as 2 etapas já cadastradas e os Termos já aceitos;
    - estudante, **sem** aceite, para o robô ver o aceite aparecer.
  - **Cria duas fichas aprovadas** só com texto e metadados. A "imagem" é uma referência fictícia, sem nenhuma imagem real.
  - **Senhas e segredos:** senhas de 24 caracteres e segredo do 2º fator **sorteados a cada execução** com gerador criptográfico. No banco, o segredo fica cifrado, como o de qualquer usuário.
- **Para onde vão as credenciais:** só para o arquivo pedido (no GitHub, o `$GITHUB_ENV`, que vale para os passos seguintes do mesmo job). Na tela aparece apenas `::add-mask::`, o comando que faz o GitHub esconder esses valores em qualquer log.
  - O teste `test_semear_usuarios_teste.py` confere que nenhuma senha aparece fora desse comando.
- **Código das 2 etapas no robô:** calculado pelo próprio teste com o `node:crypto`, sem biblioteca nova (a tarefa sugeria o `otplib`; não foi preciso). A conta foi conferida com os vetores oficiais do RFC 6238.

## 2. O que o robô cobre agora (`e2e/fluxos_autenticados.spec.ts`, 12 testes; com os 4 de telas públicas, 16)

| # | Teste | O que prova |
|---|---|---|
| 1-4 | Sem login, `/painel-admin`, `/usuarios`, `/curadoria` e `/pesquisa` vão para o login | Rotas protegidas. **Obs.:** não existe a rota `/admin` (responde 404); a área do administrador é `/painel-admin`, `/usuarios` e `/dashboard` |
| 5 | Campos do login com rótulo; nada recebe foco sozinho | Acessibilidade (Lote 3) |
| 6 | "Solicitar acesso" abre sem foco automático | O `autoFocus` retirado no Lote 3 não volta |
| 7 | Ao chegar pelo Tab, o campo muda de aparência | Foco visível pelo teclado |
| 8 | Senha errada e e-mail inexistente: **mesma** mensagem na tela **e** mesma resposta do servidor (código e texto) | Não revela quem tem conta |
| 9 | Estudante no 1º acesso: Termos v1.1 aparecem; "Li e concordo" só libera depois de rolar o texto; depois vem o termo de ciência | Aceite exigido |
| 10 | Pesquisa: "2 imagens disponíveis"; buscar lista 2; só o dente 36 lista 1 | Pesquisa e filtro funcionando |
| 11 | Administrador: senha certa leva à tela do código; código errado é recusado; código certo entra e **fica no Painel** depois do termo de ciência | 2 etapas e a correção do defeito |
| 12 | Modal "Redefinir 2 etapas": 4 meios; com 1 meio não libera; com 2 meios e sem a confirmação também não; o teste **cancela** e confere que **nenhum** pedido de redefinição saiu | Regra dos dois meios (ASVS 6.4.4) sem mexer em nada |

**Limite de logins:** o login aceita 5 tentativas por minuto por endereço (proteção contra adivinhação de senha), e **essa proteção não foi afrouxada**. Por isso:
- o arquivo faz só 4 logins e reaproveita a sessão entre os passos de cada perfil;
- não repete teste que falhou (`retries: 0` só neste arquivo), porque uma repetição gastaria o limite e esconderia a causa.

**Nenhum `test.skip`, `fixme` ou `type: ignore`.** Os passos de cada perfil rodam em sequência: se o login falha, o passo seguinte aparece como "não executado" no relatório, sem ser escondido.

## 3. Defeito encontrado e corrigido (autorizado pelo Luciano)
- **Sintoma:** depois de um login certo (senha + código), o administrador ia para o Painel e, um instante depois, voltava para a tela de login.
- **Causa:** o Painel pede os números ao servidor antes de o termo de ciência da sessão ser aceito. O servidor responde 403 com o código "termo pendente", e o Painel tratava **qualquer** recusa como "não está logado".
- **Correção:**
  - nova função `termoPendente()` em `lib/sessao.ts`: reconhece só os dois códigos de termo pendente, `termo_ciencia_pendente` e `termos_uso_pendentes`;
  - o Painel (`dashboard/page.tsx`) agora espera o aceite (a janela do termo já está na tela e, ao aceitar, a página recarrega). Qualquer outra recusa continua mandando para o login.
- **Testes da correção:**
  - `frontend/testes/termoPendente.teste.ts`, com 8 verificações, inclusive que os códigos são os mesmos do backend;
  - o teste 11 do robô.

## 4. Prova de que os testes falham quando devem (mutações, todas desfeitas)

| Mudança proposital | Teste que falhou |
|---|---|
| Servidor responde "Usuario nao encontrado" para e-mail inexistente | 8: "o servidor nao pode revelar se o e-mail existe" |
| `autoFocus` de volta no campo "nome" do Solicitar acesso | 6 |
| Correção do Painel desfeita | 11: voltou para o login |
| Modal aceitando 1 meio só | 12: "um meio so nao pode bastar" |

## 5. Workflow
- **`testes-e2e.yml`:** novo passo "Semear usuários de teste", depois de subir a API e antes do Playwright. O workflow continua bloqueante nos PRs, chamado pela auditoria semanal, com `permissions: contents: read`, banco descartável e senhas inventadas.
- **`subir-radix-isolado`:** a chave JWT sorteada passa a valer para os passos seguintes do mesmo job, escondida no log. Sem isso, o segredo do 2º fator semeado não poderia ser lido pela API.
- **Relatório do GitHub:** o artifact `playwright-relatorio` já guardava o relatório HTML e as capturas; agora também guarda o **vídeo** do teste que falhar (só no GitHub; localmente o vídeo fica desligado).

## 6. Verificação
- **Local [medido]:**
  - Playwright 16/16 em duas rodadas seguidas, cerca de **55 s** cada;
  - `pytest` 657 passed (651 + 6 do script);
  - `tsc` ok, `npx tsx testes/*.teste.ts` 10/10, `next build` ok;
  - Ruff 4 / Mypy 72 / ESLint 2 avisos, os mesmos da base.
- **GitHub [medido]**, PR #67, run 43509419964: **16 passed (27,1 s)**; job inteiro em **2 min 33 s**.
  - Subir API + frontend: 1 min 24 s;
  - semear os usuários: 1 s;
  - instalar o Chromium: 17 s;
  - testes: 27 s.
  - Os outros checks do PR (backend, frontend, qualidade, segurança) também ficaram verdes.
  - O log mostra só "Usuarios de teste prontos…", sem nenhuma senha.

## 7. O que continua manual
- **Visualizador (OHIF) e imagens de verdade:** nesta fase não há Orthanc no teste, e a pesquisa mostra "Sem preview".
- **Envio de DICOM** e **foto pelo celular**.
- **Curadoria completa** (marcar, aprovar), **segunda opinião**, **compartilhamento** e **prancha**.
- **Primeiro cadastro do aplicativo de 2 etapas** (QR code) e **códigos de recuperação.**
- **Redefinir as 2 etapas de verdade:** o robô só confere as travas e cancela.

## 8. Fase 2 (proposta, NÃO feita): Orthanc + OHIF com DICOM sintético
- **O que seria:** subir o Orthanc (imagem Docker oficial) e o OHIF no job e enviar 3 radiografias **sintéticas** geradas por `gerar_radiografias_sinteticas.py` (nunca imagem real). O robô testaria:
  - envio, anonimização e aprovação;
  - abrir a imagem no visualizador e ver as marcações;
  - miniatura na pesquisa.
- **Custo:** zero (GitHub Actions é gratuito para repositório público).
- **Tempo extra estimado [hipótese]:** de +3 a +6 min por PR (baixar as imagens do Orthanc e do OHIF, cerca de 1 GB, e esperar os serviços ligarem). Hoje o job leva 2 min 33 s.
- **Riscos:**
  1. Mais pontos de falha que não são do Radix (download de imagem Docker, demora do OHIF), com risco de PR bloqueado sem culpa. **Sugestão:** começar como **não bloqueante**, só na auditoria semanal.
  2. O OHIF roda numa moldura (iframe) de outra origem e conversa por mensagens: os testes ficam mais frágeis e lentos.
  3. A anonimização usa OCR (Tesseract), o que deixa os testes mais lentos.
- **Decisão pendente do Luciano:** fazer ou não; se sim, bloqueante ou só semanal.
