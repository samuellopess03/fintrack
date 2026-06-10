# ADR-008 — Prometheus + Grafana como stack de observabilidade

- **Status:** Aceito
- **Data:** 2025
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

---

## Justificativas

### Modelo pull — a API expõe, o Prometheus coleta
O Prometheus usa um modelo *pull*: ele periodicamente faz scrape no endpoint
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

Esta stack cobre o pilar de **métricas**. Os outros dois pilares são:

| Pilar     | Ferramenta         | Status no projeto         |
|-----------|--------------------|---------------------------|
| Métricas  | Prometheus+Grafana | Implementado (v1)         |
| Logs      | Pino (JSON)        | Implementado (v1)         |
| Traces    | OpenTelemetry      | Fora do escopo na v1      |

**Logs estruturados com Pino** cobrem o pilar de logs — cada requisição gera
logs JSON com `requestId`, `level`, `timestamp` e contexto de negócio. Em
produção, esses logs são agregados por um serviço externo (CloudWatch, Loki,
ou similar) para busca e correlação.

**Distributed tracing** (rastreamento de uma request através de API → fila →
worker) é o passo natural após métricas e logs, mas adiciona complexidade
de instrumentação (spans, context propagation) que está fora do escopo da v1.

---

## Alternativas rejeitadas

### Datadog
- Custo por host em produção — inviável para projeto pessoal.
- Exige agent instalado nos containers — adiciona dependência de runtime.
- Lock-in com plataforma proprietária — os dashboards e alertas não são
  portáveis para outra ferramenta.
- Excelente produto, mas custo-benefício inadequado para este contexto.

### OpenTelemetry + Jaeger (para métricas)
- OpenTelemetry é o padrão emergente para traces e logs, mas para métricas
  ainda tem mais fricção de configuração que `prom-client` direto.
- Jaeger é focado em traces distribuídos, não em métricas e dashboards.
- Faz mais sentido como evolução futura (adicionar traces via OTel exportando
  para Prometheus/Grafana) do que como substituição da stack atual.

### Winston + ELK (Elasticsearch, Logstash, Kibana) para logs
- ELK é poderoso para logs, mas adiciona três serviços pesados ao ambiente.
- Pino com output JSON é suficiente para v1 — os logs são consumíveis por
  qualquer agregador (CloudWatch, Loki, Splunk) sem mudar o código.

---

## Consequências

- **Positivo:** Stack open source sem custo por volume, dashboards versionáveis como JSON, alertas configuráveis, métricas Node.js coletadas automaticamente.
- **Positivo:** Conceitos (PromQL, scrape config) diretamente aplicáveis em contextos profissionais com Kubernetes.
- **Negativo:** Prometheus armazena métricas apenas localmente — sem HA nativa. Para produção com alta disponibilidade, seria necessário Thanos ou Cortex (fora do escopo da v1).
- **Negativo:** Prometheus não é adequado para logs ou traces — os outros pilares precisam de ferramentas separadas.
- **Risco mitigado:** Na v1, instância única do Prometheus com retenção de 15 dias é suficiente para aprendizado e monitoramento básico.
