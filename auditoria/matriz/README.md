# Alterações da matriz OWASP ASVS

A matriz completa está nesta pasta: `matriz_asvs.csv` (253 itens ASVS + 6 itens DICOM = 259 linhas,
separador `;`, UTF-8 com BOM). Ela é a cópia do Projeto Radix (`claude/auditoria/matriz_asvs.csv`) com as
mudanças de 12/11 e da parte 2 já aplicadas. Daqui em diante, **a versão do repositório é a de referência**.
No repositório as linhas terminam em LF (regra do `.gitattributes`); o conteúdo é o mesmo.

Cada arquivo `mudancas_AAAA-MM-DD*.csv` lista só os itens reavaliados naquela data: situação anterior,
situação nova, evidência (arquivo:linha ou teste) e recomendação. Para aplicar, use o script
`auditoria/scripts/aplicar_mudancas_matriz.py`, na ordem das datas:

```
python3 auditoria/scripts/aplicar_mudancas_matriz.py auditoria/matriz/matriz_asvs.csv auditoria/matriz/mudancas_AAAA-MM-DD.csv nova.csv
```

O script troca, na linha com o mesmo `id_interno`, `aplicabilidade`, `resultado_obtido`, `situacao`,
`criticidade`, `recomendacao`, `revisao_humana`, `data_avaliacao` e `versao_codigo`, e mostra a contagem
de cada situação antes e depois.

**Situação em 13/11/2026** (depois das duas aplicações): 259 linhas; 79 aprovados com evidência,
77 aprovados após reteste, 77 não aplicáveis com justificativa, **22 reprovados**, **4 inconclusivos**.

| Data | Itens | Resumo |
|---|---|---|
| 12/11/2026 | 15 | 6 itens de segundo fator saem de "não aplicável" (o TOTP existe desde 19/10): 6.5.1, 6.5.3 e 6.5.4 aprovados; **6.5.2 reprovado** (códigos de recuperação em SHA-256 sem sal, ~40 bits); **6.5.5 reprovado** (código aceito por ~90 s); 6.4.4 inconclusivo (procedimento de identidade não documentado). **3.5.5 reprovado** (o OHIF confia na origem de quem o emoldura). 8 itens com evidência atualizada ou reforçada, sem mudar a situação. |
| 12/11/2026 (parte 2) | 5 | **6.5.2, 6.5.5 e 3.5.5 corrigidos** (reprovado → aprovado após reteste: códigos de recuperação com Argon2id e 24 caracteres; janela do TOTP de 30 s; OHIF com origem da configuração e `frame-ancestors`). 3.4.6 com evidência ampliada (OHIF). 6.4.4 continua inconclusivo até o PR #53. |
