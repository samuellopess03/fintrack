# ADR-008 — Stack de observabilidade: Prometheus, Loki, Tempo + Grafana

- **Status:** Aceito
- **Data:** 2025 (atualizado em 2026 — escopo ampliado de métricas para os três pilares de observabilidade)
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack tem componentes distribuídos — API, Worker, RabbitMQ, Redis e
PostgreSQL — que precisam ser observados de forma unificada. Os requisitos
de observabilidade definidos no RNF-05 exigem:

- Métricas de latência de endpoints (P95, P99).
- Número de jobs pendentes na fila e taxa de processamento.
- Hit rate do cache Redis.
- Taxa de erro de categorização automática.
- Dashboards visuais e alertas configuráveis.

A questão é: coletar e visualizar essas métricas com qual stack?

As opções avaliadas foram Prometheus + Grafana, Datadog e OpenTelemetry + Jaeger.

---

## Decisão

Adotamos **Prometheus** para coleta e armazenamento de métricas e **Grafana**
para dashboards e alertas.

> **Nota de revisão (2026):** a stack foi ampliada além do escopo original
> (métricas). A decisão consolidada em execução hoje cobre os três pilares da
> observabilidade, com OpenTelemetry como camada de instrumentação:
>
> ```
> Métricas:  prom-client (/metrics)  ──pull──>  Prometheus
> Logs:      Pino (JSON)          ──scrape──>  Promtail ──push──> Loki
> Traces:    OpenTelemetry SDK    ──OTLP──>    otel-collector ──push──> Tempo
>                                                            │
>                                                    Grafana (3 datasources)
> ```
>
> OpenTelemetry é a interface padrão da aplicação para todos os sinais — os
> backends específicos (Prometheus, Loki, Tempo) ficam atrás de infra de
> coleta e podem evoluir sem mudar o código instrumentado.

---

## Justificativas

### Modelo pull — a API expõe, o Prometheus coleta

O Prometheus usa um modelo _pull_: ele periodicamente faz scrape no endpoint
`/metrics` da aplicação. Isso inverte a responsabilidade — a aplicação não
precisa saber onde o Prometheus está rodando nem configurar endpoints de envio.
Em desenvolvimento local, basta o container do Prometheus saber o endereço da
API; em produção, o scrape é configurado via service discovery.

Essa arquitetura é tolerante a falhas: se o Prometheus estiver fora do ar,
a API continua funcionando normalmente. Quando o Prometheus voltar, retoma
o scrape do ponto em que parou.

### prom-client — integração nativa com Node.js

A biblioteca `prom-client` é o cliente oficial do Prometheus para Node.js.
Ela fornece os tipos de métricas necessários (`Counter`, `Histogram`, `Gauge`,
`Summary`) com API idiomática para TypeScript. Métricas padrão do processo
Node.js (event loop lag, heap used, GC) são coletadas automaticamente via
`collectDefaultMetrics()` — sem nenhuma instrumentação adicional.

### Grafana — dashboards como código

O Grafana lê métricas do Prometheus via PromQL (linguagem de query do
Prometheus) e renderiza dashboards configuráveis. Os dashboards podem ser
exportados como JSON e versionados no repositório (em `infra/grafana/dashboards/`),
tornando-os reproduzíveis em qualquer ambiente — o dashboard de produção é
idêntico ao de desenvolvimento local.

O Grafana Alerting permite definir condições (ex: "taxa de erro > 5% por 5
minutos") e enviar notificações por email, Slack ou PagerDuty sem código
adicional.

### Self-hosted e sem custo por volume de dados

Datadog, New Relic e similares cobram por host ou por volume de dados
ingeridos — custos que escalam rapidamente. Prometheus + Grafana são
open source e rodam nos próprios containers, sem custo incremental por
volume de métricas. Para um projeto pessoal, isso elimina a preocupação
com custos de observabilidade em produção.

### Stack consolidada na indústria

Prometheus + Grafana é a stack de observabilidade de métricas mais adotada
em ambientes Kubernetes e cloud-native. Os conceitos aprendidos aqui
(PromQL, scrape config, label-based querying) são diretamente transferíveis
para qualquer ambiente profissional.

---

## Pilares de observabilidade no FinTrack

Os três pilares estão implementados com pipelines distintos, mas convergindo no
Grafana como visualização única (datasources provisionados em
`backend/infra/grafana/provisioning/datasources/` — Prometheus, Loki e Tempo):

| Pilar    | Instrumentação no app                                                                                              | Coleta/transporte        | Backend    | Visualização |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------ | ---------- | ------------ |
| Métricas | `prom-client` (`/metrics`) + métricas custom (HTTP, cache, worker em `src/shared/platform/observability/metrics/`) | Pull via scrape          | Prometheus | Grafana      |
| Logs     | Pino (JSON) + `instrumentation-pino` (injeta `trace_id`)                                                           | Promtail (file scraping) | Loki       | Grafana      |
| Traces   | OpenTelemetry SDK + `@fastify/otel` + `instrumentation-pino`                                                       | OTLP → `otel-collector`  | Tempo      | Grafana      |

**Logs estruturados com Pino** cobrem o pilar de logs: cada requisição gera
logs JSON com `traceId`, `spanId`, `timestamp` e contexto de negócio. O
`requestId` fica disponível no envelope de resposta para suporte e correlação
de chamadas. A coleta é feita pelo **Promtail**, que lê os containers e envia
para o **Loki** — o agregador fica fora do processo da API, mantendo o runtime
leve e tolerante a indisponibilidade do Loki.

**Distributed tracing** está implementado com **OpenTelemetry**: o
`NodeSDK` (ver `backend/src/shared/platform/observability/telemetry/tracing.ts`)
instrumenta HTTP, Fastify e Pino, e exporta via **OTLP HTTP (4318)** para o
**otel-collector** (`backend/infra/otel/otel-collector.yml`), que faz batch e
encaminha para o **Tempo**. A escolha do Tempo em vez de Jaeger se deve a:
nativo do ecossistema Grafana, correlação direta com Loki no mesmo painel e
configuração mais simples no docker-compose — apoiando o fluxo ponta-a-ponta
API → fila → worker.

A correlação checkout-para-terminal de logs↔traces↔métricas acontece no
Grafana: um log de erro pode ser rastreado pelo `trace_id`, que abre o trace no
Tempo, que relaciona a request com métricas do Prometheus — a partir do
`requestId`, o suporte investiga tudo de um lugar.

---

## Alternativas rejeitadas

### Datadog

- Custo por host em produção — inviável para projeto pessoal.
- Exige agent instalado nos containers — adiciona dependência de runtime.
- Lock-in com plataforma proprietária — os dashboards e alertas não são
  portáveis para outra ferramenta.
- Excelente produto, mas custo-benefício inadequado para este contexto.

### Winston + ELK (Elasticsearch, Logstash, Kibana) para logs

- ELK é poderoso para logs, mas adiciona três serviços pesados ao ambiente.
- Pino com output JSON é suficiente para v1 — os logs saem do processo em
  stdout/JSON e são consumidos por qualquer agregador sem mudar o código. Na
  prática, o consumidor escolhido nesta revisão é o **Loki** (via Promtail).

---

## Consequências

- **Positivo:** Stack open source sem custo por volume, dashboards versionáveis como JSON, alertas configuráveis, métricas Node.js coletadas automaticamente.
- **Positivo:** Conceitos (PromQL, scrape config) diretamente aplicáveis em contextos profissionais com Kubernetes.
- **Negativo:** Prometheus armazena métricas apenas localmente — sem HA nativa. Para produção com alta disponibilidade, seria necessário Thanos ou Cortex (fora do escopo da v1).
- **Negativo:** Prometheus não é adequado para logs ou traces — por isso esta
  revisão documenta a stack completa: Loki (logs) e Tempo (traces) rodando
  ao lado do Prometheus.
- **Negativo:** mais containers no ambiente (otel-collector, Promtail, Loki,
  Tempo) — custo operacional em troca de correlação ponta-a-ponta no Grafana.
- **Risco mitigado:** Na v1, instância única do Prometheus com retenção de 15 dias é suficiente para aprendizado e monitoramento básico.
