# Alterações da matriz OWASP ASVS

A matriz completa (`matriz_asvs.csv`, 253 itens ASVS + 6 itens DICOM) fica nos documentos do Projeto Radix
(`claude/auditoria/matriz_asvs.csv`). Cada arquivo `mudancas_AAAA-MM-DD.csv` desta pasta lista só os itens
reavaliados naquela data: situação anterior, situação nova, evidência (arquivo:linha ou teste) e recomendação.
Para aplicar na matriz, troque `resultado_obtido`, `situacao`, `criticidade`, `recomendacao`, `revisao_humana`,
`data_avaliacao` e `versao_codigo` da linha com o mesmo `id_interno` (e `aplicabilidade`, quando mudou).

| Data | Itens | Resumo |
|---|---|---|
| 12/11/2026 | 15 | 6 itens de segundo fator saem de "não aplicável" (o TOTP existe desde 19/10): 6.5.1, 6.5.3 e 6.5.4 aprovados; **6.5.2 reprovado** (códigos de recuperação em SHA-256 sem sal, ~40 bits); **6.5.5 reprovado** (código aceito por ~90 s); 6.4.4 inconclusivo (procedimento de identidade não documentado). **3.5.5 reprovado** (o OHIF confia na origem de quem o emoldura). 8 itens com evidência atualizada ou reforçada, sem mudar a situação. |
