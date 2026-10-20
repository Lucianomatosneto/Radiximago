# Radix Imago — Regras de negócio, limites e funções pesadas

| Campo | Valor |
|---|---|
| Versão do documento | 1.2 — 20/10/2026 |
| Base | OWASP ASVS 5.0: 2.1.2, 2.1.3, 2.2.3, 2.3.2, 2.4.1, 15.1.3 e 15.2.2 |
| Conferido com | `backend/app/modules/curation/*.py`, `auth.py`, `compartilhamentos_router.py`, `search_router.py`, `voz_router.py`, `images_router.py`, `app/core/limites.py`, `app/core/rate_limit.py`, `docker-compose.yml` |

Regra de ouro: **toda regra abaixo é aplicada no servidor**. A tela pode ajudar, mas não decide. Quando uma regra é violada, a resposta é **422** (dado inválido), **409** (estado não permite) ou **429** (excesso de pedidos), e **nada é gravado pela metade**. Um pedido inteiro é uma única transação no banco, comprovada por `test_2_3_3_operacao_invalida_nao_grava_nada_pela_metade`.

## 1. Consistência entre campos (ASVS 2.1.2)

| Regra | Onde |
|---|---|
| `idade_min` ≤ `idade_max`; as duas entre 0 e 120 (na ficha **e na busca**) | `curation/ficha.py`, `search_router.py` |
| Cada marcação tem as coordenadas do próprio formato: oval e retângulo → posição e tamanho; seta → cauda e ponta | `curation/schemas.py` (`Marcacao`) |
| Dentes só na numeração FDI de permanentes (11–18, 21–28, 31–38, 41–48), sem repetição | `curation/ficha.py`, `curation/achados.py` |
| Achado com "dente não identificado" **não pode** informar dentes | `curation/achados.py` |
| Achado do tipo "Outro" **exige** descrição | `curation/achados.py` |
| Imagem com achados registrados **não pode** ser marcada como "sem alterações" | `curation/ficha.py` |
| Os resumos `dentes` e `alteracoes_observadas` da ficha **são calculados** a partir dos achados (o usuário não os define em separado) | `curation/ficha.py` (`_sincronizar_achados`) |
| Termos do vocabulário ligados à ficha precisam existir | `curation/ficha.py` |
| Uma imagem tem **no máximo uma** ficha; imagem desativada não recebe ficha | `curation/ficha.py` |
| Limites de tamanho de textos e listas | `app/core/limites.py` (ver `SEGURANCA.md`, seção 2.1) |

## 2. Fluxo da ficha (estados permitidos)

```
pendente ─┐
          ├─(editar)→ em_analise ─┬─ aprovar ──→ aprovada   (final)
          │                       ├─ descartar → descartada (final)
          │                       └─ pedir 2ª opinião → segunda_opiniao ─┬─ aprovar → aprovada
          │                                                              └─ descartar → descartada
```

| Regra | Onde |
|---|---|
| Só se edita ficha **pendente** ou **em análise** | `curation/common.py` (`STATUS_EDITAVEIS`) |
| **Aprovar exige "anonimização validada"** marcada pelo curador (LGPD) | `curation/common.py` (`_executar_aprovacao`) |
| Descartar exige justificativa | `curation/common.py` |
| Ficha aprovada ou descartada não é reprocessada | `aprovacao_descarte.py`, `segunda_opiniao.py` |
| Segunda opinião: exige motivo; uma em aberto por ficha; **quem pediu não pode responder** | `curation/segunda_opiniao.py` |
| Toda mudança de estado fica no histórico (`curation_history`) e na auditoria | `curation/common.py` |

**Outras regras de negócio:**
- Pedido de acesso: o e-mail precisa ser confirmado antes de o administrador analisar. O link vale 24 h e é invalidado após 5 senhas erradas.
- Compartilhamento: só imagem aprovada; não se compartilha consigo mesmo; o destinatário precisa ter conta. Quem recebe pode esconder anotações e recados só da própria visão, sem apagar os dados de quem enviou.
- Conta: o administrador não pode excluir a própria conta. Conta bloqueada, inativa ou excluída perde o acesso na hora, em qualquer sessão.

## 3. Limites por usuário e globais (ASVS 2.1.3, 2.3.2 e 2.4.1)

**Quem é contado:** com login, a **conta** (assim a turma inteira atrás do mesmo endereço de rede da UFSC não divide o mesmo limite, e um robô não escapa trocando de endereço); sem login, o **endereço de rede**. Valores em `app/core/rate_limit.py`; o teste `test_limites_anti_abuso_documentados_sao_os_do_codigo` confere esta tabela com o código. Acima do limite, a resposta é **429** com a mensagem "Muitos pedidos em pouco tempo…".

| Função | Limite | Por quem | Onde |
|---|---|---|---|
| **Qualquer rota da API** (limite geral) | 600 por minuto | conta (ou endereço) | `app/core/rate_limit.py` (`limite_geral`) |
| Login | 5 por minuto | endereço de rede | `auth.py` |
| Esqueci a senha | 3 por minuto | endereço de rede | `auth.py` |
| Redefinir senha | 10 por minuto | endereço de rede | `auth.py` |
| Pedir acesso | 5 por minuto | endereço de rede | `auth.py` |
| Confirmar e-mail | 10 por minuto; 5 senhas erradas invalidam o link | endereço de rede / pedido | `auth.py` |
| Compartilhar / responder | 20 por minuto | conta | `compartilhamentos_router.py` |
| Transcrição de voz | 120 trechos por minuto; áudio de até 10 MB | conta | `voz_router.py` |
| **E-mail com uma imagem** (para o próprio e-mail) | 20 por hora | conta | `search_router.py` |
| **E-mail com várias imagens** | 5 por hora; até 10 imagens por e-mail | conta | `search_router.py` |
| **Download `.zip` de série** (imagens ou DICOM, somados) | 20 por hora; até 1.000 cortes no ZIP de imagens | conta | `search_router.py` |
| **Envio de DICOM** | 300 por hora; 50 MB por arquivo; compactados recusados | conta | `images_router.py` |
| **Sincronizar com o Orthanc** | 10 por hora | conta (administrador/suporte) | `images_router.py` |
| **Girar imagem** (Curadoria) | 30 por minuto; um giro por vez em cada imagem | conta (curadoria) | `curation/orientacao.py` |
| Foto de perfil | 5 MB; JPG/PNG/WebP | por pedido | `users_router.py` |
| Busca | até 200 resultados por página | por pedido | `search_router.py` |
| Sessão | 60 min de inatividade; 12 h no máximo | por sessão | `app/core/sessao.py` |

**Fora do limite geral, de propósito:**
- a portaria das imagens (`/visualizador/autorizar`): o visualizador pede um corte por vez, e uma tomografia tem centenas. A rota só responde "pode/não pode";
- as checagens de saúde (`/health`).

**Por que o limite geral é um "vigia" próprio:** o modo automático da biblioteca `slowapi` não encontra as rotas na versão do FastAPI usada (0.143) e deixava tudo passar. O teste `test_2_4_1_limite_geral_em_todas_as_rotas` revelou isso; a correção usa o mesmo contador da biblioteca.

## 4. Funções pesadas e como evitar indisponibilidade (ASVS 15.1.3)

| Função | Por que pesa | Proteção (ASVS 15.2.2) |
|---|---|---|
| Transcrição de voz (Whisper) | modelo de IA, CPU e memória | serviço separado com teto de 1,6 GB de RAM e 4 CPUs; 120 trechos/min; o modelo é descarregado após 10 min parado |
| Anonimização + OCR do texto na imagem | leitura completa da imagem (cerca de 1 a 10 s por imagem) | 1 imagem por envio; 50 MB por arquivo; 300 envios por hora; chegada pelo aparelho em ciclos de 60 s |
| Download `.zip` de uma série (vários cortes) | monta o arquivo na memória | só fichas aprovadas; 20 por hora; até 1.000 cortes no ZIP de imagens (acima disso, o DICOM); no máximo **2 ao mesmo tempo** no servidor inteiro, e o terceiro recebe 503 ("tente de novo em instantes") em vez de esperar na fila |
| E-mail com imagens (individual e lote) | renderiza imagens e envia por SMTP | 20 por hora (uma imagem); 5 por hora com até 10 imagens por e-mail (lote); sempre para o e-mail da própria conta |
| Sincronizar com o Orthanc | percorre todo o acervo | só administrador/suporte; 10 por hora |
| Girar imagem / recortar moldura | lê e regrava o arquivo DICOM inteiro (cerca de 1 s) | giro: só curadoria, 30 por minuto, um por vez em cada imagem (trava do registro); recorte das imagens antigas: só pelo roteiro no servidor |
| Busca com texto livre | consulta com `ILIKE` | texto até 150 caracteres; 200 por página; limite geral |

O teto de **2 ZIPs ao mesmo tempo** (`MAX_ZIPS_SIMULTANEOS`) vale para o servidor inteiro, não por pessoa.

**Conduta em caso de sobrecarga:**
- o Whisper fora do ar não derruba a API: a curadoria segue sem voz;
- o Orthanc fora do ar não derruba a API (`test_16_5_2`);
- o administrador pode bloquear um usuário abusivo na hora.

## 5. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 18/10/2026 | Criação (auditoria OWASP ASVS 5.0, Nível 2) |
| 1.1 | 18/10/2026 | Grupo 4: limites de e-mail, ZIP, envio e sincronização; limite geral por conta; teto de ZIPs simultâneos; coerência de idade na busca e de marcações |
| 1.2 | 20/10/2026 | Limite do giro de imagem na Curadoria; recorte da moldura branca |
