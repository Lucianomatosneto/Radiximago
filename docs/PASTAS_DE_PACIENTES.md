# Pastas de pacientes (fotos do negatoscópio)

Versão 1.0, de 31/10/2026. A especificação completa está no documento "Radix Imago – Especificação: fotos dos alunos, revisão do professor e fila de tratamento".

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
| Aluno | **Meus pacientes em tratamento** | Vê os pacientes encaminhados a ele, com o contato. Marca "tratamento concluído". |
| Professor e curador | **Alunos e pacientes** | Veem quem trata quem e buscam pelo nome do aluno ou do paciente. |
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
  - professores e curadores.

  Todo acesso fica na auditoria.
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
- A cópia completa (`scripts/copia-completa.sh`) e o backup diário incluem a pasta `dados_clinicos/`.
