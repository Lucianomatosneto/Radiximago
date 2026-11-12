# Central de Auditoria do Radix Imago

Pasta da auditoria técnica contínua. É **independente** da aplicação: nada aqui é carregado pelo sistema.

## O que há aqui

| Caminho | Para que serve |
|---|---|
| `../.github/workflows/auditoria.yml` | Esteira automática (GitHub Actions): testes do backend e do frontend, qualidade, segurança |
| `../.github/dependabot.yml` | Aviso semanal de bibliotecas desatualizadas ou com falha de segurança |
| `config/ruff.toml` | Regras do verificador de qualidade/segurança do Python |
| `relatorios/` | Relatórios de cada auditoria (um arquivo por auditoria) |
| `historico.md` | Linha do tempo: problemas novos, recorrentes, resolvidos e agravados |

## Como a esteira roda

- Em cada Pull Request, toda segunda-feira às 06h (Brasília), ou manualmente: aba **Actions → Auditoria contínua → Run workflow**.
- Usa banco PostgreSQL descartável e senhas inventadas na hora. **Nunca** usa dados clínicos reais nem credenciais reais.
- Testes e TypeScript **bloqueiam** (vermelho se falharem). Ferramentas de segurança **informam** (por enquanto).
- Resultados: resumo na própria execução e arquivos em *Artifacts* (guardados por 90 dias).

## Regras

1. A auditoria não altera código da aplicação, banco de dados nem regras de negócio.
2. Correções vão em branches isoladas, com revisão humana. Nada é publicado automaticamente.
3. Uma falha só é considerada resolvida depois de um novo teste (reteste) que a confirme.
4. Classificação: CRÍTICO, ALTO, MÉDIO, BAIXO. Sempre separando **confirmado**, **suspeita** e **não verificável**.

## Rodar os testes no seu computador (Docker ligado)

```
docker compose exec radix-api python scripts/rodar_testes.py
```
