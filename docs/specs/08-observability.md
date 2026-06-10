# SPEC-08 — Observabilidade

## Filosofia

Um sistema sem observabilidade é uma caixa preta. Você só descobre que algo
está errado quando o usuário reclama. O FinTrack adota os três pilares
clássicos de observabilidade:

- **Métricas** (Prometheus + Grafana): o que está acontecendo agora, em números.
- **Logs** (Pino): o que aconteceu, em ordem, com contexto.
- **Traces** (futuro): por onde uma requisição passou e quanto tempo levou em cada etapa.

---

## Stack

| Ferramenta        | Papel                                                  |
|-------------------|--------------------------------------------------------|
| **Pino**          | Logger estruturado em JSON — embutido no Fastify       |
| **Prometheus**    | Coleta e armazena métricas em time series              |
| **Grafana**       | Dashboards e alertas sobre as métricas do Prometheus   |
| **prom-client**   | Biblioteca Node.js que expõe métricas no formato Prometheus |

---

## Métricas — o que medir

### Métricas da API (HTTP)

```typescript
// src/shared/metrics/http.metrics.ts
import { Histogram, Counter, register } from 'prom-client'

// Duração de cada requisição HTTP por rota e status
export const httpRequestDuration = new Histogram({
  name:    'fintrack_http_request_duration_seconds',
  help:    'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2],
})

// Total de requisições por rota
export const httpRequestTotal = new Counter({
  name:    'fintrack_http_requests_total',
  help:    'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
})
```

**Registrado como hook global no Fastify:**
```typescript
app.addHook('onResponse', (request, reply, done) => {
  const route = request.routeOptions.url ?? 'unknown'
  const duration = reply.elapsedTime / 1000

  httpRequestDuration
    .labels(request.method, route, String(reply.statusCode))
    .observe(duration)

  httpRequestTotal
    .labels(request.method, route, String(reply.statusCode))
    .inc()

  done()
})
```

---

### Métricas do Worker e da Fila

```typescript
// src/shared/metrics/worker.metrics.ts

// Tempo de processamento de cada job de importação
export const importJobDuration = new Histogram({
  name:    'fintrack_import_job_duration_seconds',
  help:    'Duration of import job processing in seconds',
  labelNames: ['file_format', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
})

// Contagem de jobs por status final
export const importJobTotal = new Counter({
  name:    'fintrack_import_jobs_total',
  help:    'Total import jobs processed',
  labelNames: ['file_format', 'status'],  // status: done | failed
})

// Transações processadas por job
export const transactionsImported = new Counter({
  name:    'fintrack_transactions_imported_total',
  help:    'Total transactions imported',
  labelNames: ['file_format'],
})

// Taxa de falha de categorização automática
export const categorizationResults = new Counter({
  name:    'fintrack_categorization_results_total',
  help:    'Categorization outcomes during import',
  labelNames: ['result'],  // result: matched | fallback
})
```

**Usado no processor:**
```typescript
const timer = importJobDuration.startTimer({ file_format: message.fileFormat })

try {
  await processImportJob(message)
  timer({ status: 'done' })
  importJobTotal.labels(message.fileFormat, 'done').inc()
} catch (err) {
  timer({ status: 'failed' })
  importJobTotal.labels(message.fileFormat, 'failed').inc()
}
```

---

### Métricas de Cache

```typescript
// src/shared/metrics/cache.metrics.ts

export const cacheOperations = new Counter({
  name:    'fintrack_cache_operations_total',
  help:    'Cache hits and misses',
  labelNames: ['operation', 'key_prefix'],
  // operation: hit | miss | invalidation
})

export const cacheOperationDuration = new Histogram({
  name:    'fintrack_cache_operation_duration_seconds',
  help:    'Duration of Redis cache operations',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
})
```

---

### Endpoint de métricas

```typescript
// src/modules/metrics/metrics.routes.ts
import { register } from 'prom-client'

app.get('/metrics', async (request, reply) => {
  reply.header('Content-Type', register.contentType)
  return register.metrics()
})
```

O endpoint `/metrics` é público (sem autenticação) por convenção do Prometheus,
mas deve ser restrito por rede — acessível apenas pela instância do Prometheus,
não pelo público externo.

---

## Logs — estrutura e padrões

### Configuração do Pino no Fastify

```typescript
// src/config/logger.ts
import pino from 'pino'

export const pinoConfig = {
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty' } }  // legível em dev
    : {}),                                       // JSON puro em produção
}
```

### Campos obrigatórios em todo log

Cada linha de log deve conter:

| Campo       | Tipo   | Descrição                                           |
|-------------|--------|-----------------------------------------------------|
| `timestamp` | string | ISO 8601 — quando o evento ocorreu                  |
| `level`     | string | `trace`, `debug`, `info`, `warn`, `error`, `fatal`  |
| `requestId` | string | UUID único por requisição HTTP (gerado pelo Fastify) |
| `message`   | string | Descrição do evento                                 |
| `context`   | object | Dados adicionais relevantes ao evento               |

### Exemplos de uso correto

```typescript
// Nível INFO — operações normais de negócio
request.log.info({ jobId, userId, fileFormat }, 'Import job published to queue')

// Nível WARN — situação inesperada mas recuperável
request.log.warn({ jobId, retryCount }, 'Import job failed, scheduling retry')

// Nível ERROR — falha que precisa de atenção
logger.error({ jobId, error: err.message, stack: err.stack }, 'Import job exhausted retries, sending to DLQ')

// NUNCA em produção:
console.log('job processado')  // ❌ não estruturado, sem contexto
```

### Logs do worker

O worker tem sua própria instância Pino (sem `request.log`, já que não
há request HTTP):

```typescript
// src/worker/worker.ts
const logger = pino({ level: env.LOG_LEVEL })

logger.info({ queue: 'fintrack.imports.csv', prefetch: 5 }, 'Worker started')
logger.info({ jobId, userId }, 'Processing import job')
logger.info({ jobId, importedCount, skippedCount, durationMs }, 'Import job completed')
```

---

## Dashboards Grafana

### Dashboard: API Health

| Painel                      | Query Prometheus                                                               |
|-----------------------------|--------------------------------------------------------------------------------|
| Requisições por segundo     | `rate(fintrack_http_requests_total[1m])`                                       |
| Latência P95                | `histogram_quantile(0.95, rate(fintrack_http_request_duration_seconds_bucket[5m]))` |
| Taxa de erros 5xx           | `rate(fintrack_http_requests_total{status_code=~"5.."}[5m])`                   |
| Endpoints mais lentos       | Top 5 por `rate(fintrack_http_request_duration_seconds_sum[5m]) / rate(fintrack_http_request_duration_seconds_count[5m])` |

### Dashboard: Import Pipeline

| Painel                         | Query Prometheus                                                          |
|--------------------------------|---------------------------------------------------------------------------|
| Jobs processados por minuto    | `rate(fintrack_import_jobs_total[1m])`                                    |
| Taxa de falha de jobs          | `rate(fintrack_import_jobs_total{status="failed"}[5m]) / rate(fintrack_import_jobs_total[5m])` |
| Tempo médio de processamento   | `rate(fintrack_import_job_duration_seconds_sum[5m]) / rate(fintrack_import_job_duration_seconds_count[5m])` |
| Taxa de categorização automática | `rate(fintrack_categorization_results_total{result="matched"}[5m]) / rate(fintrack_categorization_results_total[5m])` |

### Dashboard: Cache

| Painel              | Query Prometheus                                                                           |
|---------------------|--------------------------------------------------------------------------------------------|
| Hit rate do cache   | `rate(fintrack_cache_operations_total{operation="hit"}[5m]) / rate(fintrack_cache_operations_total[5m])` |
| Invalidações        | `rate(fintrack_cache_operations_total{operation="invalidation"}[5m])`                      |

---

## Alertas (Grafana Alerting)

| Alerta                        | Condição                                  | Severidade |
|-------------------------------|-------------------------------------------|------------|
| Alta taxa de erros HTTP        | Taxa 5xx > 5% por 5 minutos               | Critical   |
| Latência elevada               | P95 > 500ms por 5 minutos                 | Warning    |
| Jobs falhando repetidamente    | Taxa de falha de jobs > 20% por 5 minutos | Critical   |
| Cache com hit rate baixo       | Hit rate < 30% por 10 minutos             | Warning    |
| Worker sem consumir            | Nenhum job processado em 10 minutos (se há jobs publicados) | Warning |

---

## Configuração do Prometheus (prometheus.yml)

```yaml
# infra/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'fintrack-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'

  - job_name: 'fintrack-worker'
    static_configs:
      - targets: ['worker:9091']  # worker expõe métricas em porta separada
    metrics_path: '/metrics'
```
