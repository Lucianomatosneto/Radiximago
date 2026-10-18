# Radix Imago — Comunicações entre as partes do sistema

| Campo | Valor |
|---|---|
| Versão do documento | 1.0 — 18/10/2026 |
| Base | OWASP ASVS 5.0: 13.1.1 (documentar todas as comunicações), apoio a 13.2.x e 12.3.x |
| Conferido com | `docker-compose.yml`, `orthanc/cors-proxy.conf.template`, `ohif/radix-dicomweb.conf`, `backend/app/core/config.py`, `frontend/.env.example` |

## 1. Desenho

```
 Navegador do usuário
   │  :3000 telas (Next.js)            ┌──────────── rede interna do Docker (radix-network) ─────────────┐
   │  :8000 API (cookie de sessão) ───►│ radix-api ──► radix-postgres (5432, usuário/senha)              │
   │  :3001 visualizador (OHIF, moldura│     │    ──► radix-orthanc (8042, usuário/senha)                 │
   │        dentro das telas) ─────────│──► radix-ohif ──► radix-orthanc-cors ──► radix-orthanc           │
   │  :8042 imagens (via portaria) ───►│                    │ "portaria": pergunta à API se pode       │
   │                                   │                    └─► radix-api /visualizador/autorizar        │
 Aparelho de raio-X                    │     radix-api ──► radix-whisper (9000, SEM autenticação)       │
   │  :4242 DICOM (C-STORE) ──────────►│ radix-orthanc                                                   │
                                       │ radix-backup ──► radix-postgres; lê o volume do Orthanc         │
                                       └──────────────────────────────────────────────────────────────────┘
 radix-api ──► servidor de e-mail (SMTP, STARTTLS) ── internet
```

## 2. Inventário (ASVS 13.1.1)

| # | De → para | Protocolo / porta | Autenticação | Criptografia | Para quê |
|---|---|---|---|---|---|
| 1 | Navegador → telas | HTTP :3000 | — (páginas públicas e logadas) | **não (HTTPS na implantação)** | interface |
| 2 | Navegador → API | HTTP :8000 | cookie `HttpOnly` com sessão (JWT); conferência de origem nos pedidos que alteram dados | **não (HTTPS na implantação)** | todos os dados |
| 3 | Navegador → OHIF | HTTP :3001 | — (programa do visualizador) | não | exibir imagens |
| 4 | OHIF / navegador → portaria do Orthanc | HTTP :8042 e `/dicom-web` no OHIF | cookie de sessão do Radix, conferido pela API (`auth_request`) | não | baixar as imagens que o usuário pode ver |
| 5 | Portaria → API | HTTP interno | repassa o cookie | não (rede interna) | decidir acesso à imagem |
| 6 | Portaria → Orthanc | HTTP interno :8042 | usuário/senha do Orthanc, acrescentados pela portaria | não (rede interna) | entregar a imagem |
| 7 | API → Orthanc | HTTP interno :8042 | usuário/senha (`ORTHANC_PASSWORD`) | não (rede interna) | enviar, anonimizar e ler imagens |
| 8 | API → PostgreSQL | TCP interno :5432 | usuário/senha (`POSTGRES_PASSWORD`) | não (rede interna) | dados |
| 9 | API → serviço de voz | HTTP interno :9000 | **nenhuma** (achado 13.2.1, grupo 4) | não (rede interna) | transcrição |
| 10 | Aparelho → Orthanc | DICOM :4242 | **nenhuma**: o Orthanc aceita envio de qualquer equipamento que alcance a porta | não | receber exames |
| 11 | Backup → PostgreSQL / volume do Orthanc | interno | usuário/senha do banco | não | cópia diária |
| 12 | API → servidor de e-mail | SMTP :587 | usuário/senha (`SMTP_PASSWORD`) | **STARTTLS** | redefinição de senha, confirmação, imagens pedidas pelo próprio usuário |
| 13 | Montagem (build) → PyPI, npm, Docker Hub | HTTPS | — | sim | baixar componentes (só ao montar; ver `docs/sbom/`) |

**Garantias comprovadas por testes:**
- **sem chamadas a endereços externos escolhidos pelo usuário:** todo destino de saída vem da configuração (`test_1_3_6_e_13_2_4`);
- **sem seguir redirecionamentos:** `test_15_3_2`;
- **sem rastreadores de terceiros nas telas:** `test_14_2_3`.

## 3. Pontos de atenção (registrados na auditoria)

| Ponto | Risco | Encaminhamento |
|---|---|---|
| Portas 3000, 8000, 3001, 8042 e 4242 abertas em **todas as interfaces** do computador | qualquer máquina da mesma rede alcança os serviços | na implantação: só a porta 443 (HTTPS) pública; 4242 restrita ao IP do aparelho |
| DICOM :4242 aceita qualquer equipamento | alguém na rede pode enviar imagens. Elas são anonimizadas na chegada, mas entram no acervo | na implantação: lista de aparelhos permitidos no Orthanc (`DicomAlwaysAllowStore: false` + `DicomModalities`) e firewall |
| Serviço de voz sem autenticação | outro container da rede poderia usar a transcrição | grupo 4: segredo compartilhado API ↔ voz |
| Sem TLS na rede interna | quem controlar o servidor lê o tráfego interno | grupo de implantação (ASVS 12.3.x) |
| Telas e API em portas diferentes do mesmo endereço | mesma "origem de site" para o navegador | grupo de implantação: nomes de host separados ou proxy único (ASVS 3.5.4) |

## 4. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 18/10/2026 | Criação (auditoria OWASP ASVS 5.0, Nível 2) |
