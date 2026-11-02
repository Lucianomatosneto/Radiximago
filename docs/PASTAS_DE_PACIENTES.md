# Pastas de pacientes (fotos do negatoscópio)

Versão 1.1, de 02/11/2026 (perfis: administrador, suporte e curador). A especificação completa está no documento "Radix Imago – Especificação: fotos dos alunos, revisão do professor e fila de tratamento".

> As imagens originais estão arquivadas. O Radix **não emite diagnóstico**:
> é apenas um organizador para análise posterior do profissional, com
> validação obrigatória no filme físico antes de qualquer procedimento.
> Esse aviso aparece em todas as telas das pastas.

## Quem faz o quê

| Perfil | Onde | O que faz |
|---|---|---|
| Aluno | **Upload (câmera)** | Fotografa as radiografias no negatoscópio, uma por foto, com dente e observação opcionais. Fotografa o termo assinado, preenche a ficha do paciente e envia ao professor (ou só para si). |
| Aluno | **Minhas imagens** | Vê as próprias pastas. O selo "corrigida" aparece quando o professor anotou. Na pasta, mostra as marcações, as anotações e o histórico de versões. |
| Professor | **Compartilhadas comigo** | Vê as pastas dos alunos em miniatura, com setas ◀ ▶, 🔍 lupa (clique para fixar), **i** (informações) e caixa de seleção. **Ver estudos** abre as imagens marcadas para marcar e anotar; as setas ← → do teclado também funcionam. **Salvar** cria uma versão nova, que o aluno recebe na hora. |
| Professor | **Pasta** | Edita os dados do paciente e compartilha com outro professor ou curador. Envia o link por e-mail (só o link). Imprime ou salva em PDF, baixa a imagem e pede revisão ao curador. |
| Curador | **Aguardando tratamento** | Na aba "Para classificar", **classifica o tratamento** de cada pasta (obrigatório), e ela entra na fila. |
| Professor | **Aguardando tratamento** | Usa a busca avançada por tipo de tratamento, nome ou modalidade, abre a pasta e **encaminha a um aluno**. O paciente sai da fila. |
| Aluno | **Meus pacientes em tratamento** | Vê os pacientes encaminhados a ele, com o contato. Marca "tratamento concluído". A tela pede confirmação antes, e é possível deixar uma observação. |
| Professor e curador | **Pasta** | **Reabrir tratamento**: desfaz um "concluído" por engano. O paciente volta para "em tratamento" com o mesmo aluno, e a ação fica no histórico e na auditoria (`caso_tratamento_reaberto`). |
| Professor e curador | **Alunos e pacientes** | Veem quem trata quem e buscam pelo nome do aluno ou do paciente. |
| Curador | **Pasta** | Vê a pasta inteira, mas **só acrescenta observações**: nome, nascimento, contato, prontuário e descrição são do aluno que enviou e do professor. Se tentar alterar, o servidor recusa (403) e registra na auditoria. |
| Administrador | **Aguardando tratamento** e **Alunos e pacientes** | **Supervisiona** se a fila anda e onde há erro, **sem ver dados do paciente**: a pasta aparece como "Pasta #n", sem nome, idade, contato, descrição nem fotos, e a busca é só pelo nome do aluno. Cada consulta fica na auditoria (`caso_fila_supervisao`, `caso_tratamentos_supervisao`). |
| Administrador | **Pasta** (abrir) | Para abrir uma pasta, informa o **motivo** (10 a 300 caracteres, sem escrever dados do paciente). O acesso vale **30 minutos**, só para aquela pasta, é **somente leitura** (não edita, não compartilha, não baixa, não conclui) e fica na auditoria (`caso_acesso_justificado`). |
| Suporte | — | **Não acessa pastas de pacientes** (a pasta responde "não encontrada"), nem a fila. |
| Administrador, curador e professor | **Registro de acessos** | Veem quem abriu cada pasta e quando, sem o nome do paciente. |
| Curador | **Tela da imagem → Editar curadoria** | Reabre uma curadoria já aprovada para corrigir. Ela sai da busca até ser aprovada de novo, e o histórico guarda tudo. |

## Proteções

- **Dados identificados (nível N4).** As fotos das pastas:
  - não passam pelo Orthanc;
  - não vão para o banco geral;
  - não aparecem para pesquisadores.
- **Fotos cifradas no servidor (AES-256-GCM).** Ficam em `dados_clinicos/`, reduzidas a 2.400 px e **sem metadados**, ou seja, sem GPS e sem o modelo do celular.
- **Quem vê uma pasta:**
  - o aluno autor;
  - o aluno do tratamento;
  - professores e curadores;
  - o administrador, **só depois de justificar** o motivo (somente leitura, 30 minutos).

  Não veem: pesquisadores, suporte e os demais alunos.

  Todo acesso fica na auditoria. A regra vale **mesmo quando o aluno não escolhe professor**: essa opção agora se chama "Não avisar nenhum professor agora (a pasta fica visível para os professores e curadores da clínica)". Antes ela se chamava "Só para mim", e o QA de 01/11/2026 mostrou que esse nome enganava. A equipe precisa ver todas as pastas para a fila de tratamento funcionar. Escolher um professor só faz a pasta chegar a ele em "Compartilhadas comigo".
- **E-mail só com o link.** A mensagem não leva o nome do paciente nem imagens; quem recebe precisa entrar no Radix.

## Para usar com pacientes reais

Antes, é preciso ter:

1. a concordância da coordenação da clínica-escola;
2. a ciência do encarregado de dados (DPO) da UFSC;
3. a aprovação do Comitê de Ética e do modelo do termo.

Até lá, use só dados de teste.

## Instalação (servidor)

- Rodar `alembic upgrade head`. Isso cria as tabelas `sugestoes`, `casos_clinicos`, `casos_imagens`, `casos_revisoes`, `casos_compartilhamentos` e `casos_historico`.
- Definir a `CASOS_CHAVE` no `.env` **uma única vez**. Trocar a chave depois deixa ilegíveis as fotos já guardadas.
- A cópia completa (`scripts/copia-completa.sh`) inclui a pasta `dados_clinicos/`. O backup diário a inclui **no servidor** (`docker-compose.prod.yml`); no computador de desenvolvimento ela não é copiada pelo backup diário.
- Antes de usar dados reais, ver o checklist de LGPD do projeto (base legal, encarregado, CEP, RIPD, retenção e teste de restauração do backup).
