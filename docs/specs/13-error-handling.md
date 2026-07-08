# SPEC-13 — Tratamento de Erros e Resiliência

## Filosofia

Sistemas falham. Redes oscilam, bancos de dados ficam lentos, workers
travam, usuários submetem inputs inválidos. A diferença entre um sistema
frágil e um resiliente não é a ausência de falhas — é a capacidade de
falhar de forma previsível, comunicar o erro claramente e se recuperar
automaticamente quando possível.

Este documento define como o FinTrack trata erros em cada camada:
o que é recuperável, o que não é, como os erros são comunicados e
como o sistema se mantém estável diante de dependências instáveis.

---

## Taxonomia de erros

Antes de definir como tratar, é preciso categorizar:

| Categoria               | Exemplos                                      | Resposta esperada                    |
|-------------------------|-----------------------------------------------|--------------------------------------|
| **Erro de validação**   | Campo obrigatório vazio, valor negativo       | 422 Unprocessable Entity + detalhes  |
| **Erro de autenticação**| Token expirado, ausente ou inválido           | 401 Unauthorized                     |
| **Erro de autorização** | Acesso a recurso de outro usuário             | 403 Forbidden                        |
| **Recurso não encontrado** | Transação com ID inexistente               | 404 Not Found                        |
| **Conflito de dados**   | Email já cadastrado, transação duplicada      | 409 Conflict                         |
| **Erro de dependência** | Redis fora do ar, RabbitMQ indisponível       | Degradação graceful (sem 500)        |
| **Erro inesperado**     | Bug no código, estado corrompido             | 500 Internal Server Error + log      |

---

## Hierarquia de classes de erro

```typescript
// src/shared/core/errors/index.ts

// Erro base — todo erro de aplicação herda daqui
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

// Erros HTTP tipados
export class ValidationError  extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Token inválido ou expirado') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(resource: string) {
    super(`Acesso negado ao recurso: ${resource}`, 403, 'FORBIDDEN')
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} não encontrado`, 404, 'NOT_FOUND')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}

// Erro de infraestrutura (não expõe detalhes ao cliente)
export class InfrastructureError extends AppError {
  constructor(service: string, cause?: unknown) {
    super(`Serviço indisponível: ${service}`, 503, 'SERVICE_UNAVAILABLE')
    this.cause = cause
  }
}
```

---

## Error handler global no Fastify

```typescript
// src/app.ts

app.setErrorHandler((error, request, reply) => {
  // Erros de validação do Fastify (schema Zod)
  if (error.validation) {
    return reply.status(422).send({
      error: {
        code:    'VALIDATION_ERROR',
        message: 'Dados de entrada inválidos',
        details: error.validation,
      }
    })
  }

  // Erros tipados da aplicação
  if (error instanceof AppError) {
    // Erros de infraestrutura: loga com stack trace completo
    if (error.statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, error.message)
    }

    return reply.status(error.statusCode).send({
      error: {
        code:    error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      }
    })
  }

  // Erros não tratados (bugs) — nunca expõe detalhes internos
  request.log.error({
    err:       error,
    requestId: request.id,
    stack:     error.stack,
  }, 'Unhandled error')

  return reply.status(500).send({
    error: {
      code:    'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno. Tente novamente em instantes.',
    }
  })
})
```

---

## Tratamento de erros no Worker

O worker não tem um cliente HTTP para responder — ele precisa de
uma estratégia própria de tratamento e recuperação.

### Retry com backoff exponencial

```typescript
// src/worker/worker.ts

async function handleMessageWithRetry(
  msg: amqplib.Message,
  channel: Channel,
  processor: (msg: ImportJobMessage) => Promise<void>
) {
  const content      = JSON.parse(msg.content.toString()) as ImportJobMessage
  const retryCount   = (msg.properties.headers?.['x-retry-count'] ?? 0) as number
  const MAX_RETRIES  = 3

  try {
    await processor(content)
    channel.ack(msg)

  } catch (error) {
    const isRecoverable = !(error instanceof ParseError || error instanceof ValidationError)

    if (isRecoverable && retryCount < MAX_RETRIES) {
      // Backoff exponencial: 2s, 4s, 8s
      const delayMs = Math.pow(2, retryCount + 1) * 1000

      logger.warn({
        jobId: content.jobId,
        retryCount,
        delayMs,
        error: (error as Error).message,
      }, 'Job failed — scheduling retry')

      setTimeout(() => {
        channel.publish(
          'fintrack.imports',
          `import.${content.fileFormat}`,
          msg.content,
          {
            persistent: true,
            headers: { 'x-retry-count': retryCount + 1 },
          }
        )
      }, delayMs)

      channel.ack(msg)  // ACK o original — o retry é uma nova mensagem

    } else {
      // Erros não recuperáveis ou esgotou retries → DLQ
      logger.error({
        jobId:      content.jobId,
        retryCount,
        error:      (error as Error).message,
        stack:      (error as Error).stack,
        recoverable: isRecoverable,
      }, 'Job failed permanently — sending to DLQ')

      await markJobAsFailed(content.jobId, (error as Error).message)
      channel.nack(msg, false, false)  // false, false = não requeue → vai para DLX
    }
  }
}
```

### Erros não recuperáveis vs recuperáveis

| Tipo de erro                    | Recuperável? | Razão                                              |
|---------------------------------|--------------|----------------------------------------------------|
| Arquivo não encontrado          | Não          | O arquivo não vai aparecer magicamente no disco    |
| Erro de parse (CSV malformado)  | Não          | O arquivo não vai se corrigir sozinho              |
| Timeout do banco de dados       | Sim          | O banco pode estar momentaneamente sobrecarregado  |
| Violação de constraint único    | Não          | É uma duplicata — retry resultaria no mesmo erro   |
| Erro de conexão ao banco        | Sim          | Conexão pode ser restabelecida                     |
| Erro de memória (heap overflow) | Não          | Requer intervenção manual                          |

---

## Resiliência de dependências externas

### Circuit Breaker para Redis

O Redis é um componente opcional — a API não pode depender dele para funcionar.
O `CacheService` implementa um circuit breaker simples:

```typescript
// src/shared/data/cache/cache.service.ts

class CacheService {
  private failureCount   = 0
  private lastFailure:   Date | null = null
  private readonly FAILURE_THRESHOLD = 5
  private readonly RECOVERY_TIMEOUT  = 30_000  // 30 segundos

  private isOpen(): boolean {
    if (this.failureCount < this.FAILURE_THRESHOLD) return false
    if (!this.lastFailure) return false

    const elapsed = Date.now() - this.lastFailure.getTime()
    if (elapsed > this.RECOVERY_TIMEOUT) {
      // Tenta fechar o circuit — half-open
      this.failureCount = 0
      return false
    }
    return true  // circuit aberto — não tenta o Redis
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isOpen()) return null  // fallback imediato

    try {
      const value = await this.redis.get(key)
      this.failureCount = 0  // sucesso — reseta o contador
      return value ? JSON.parse(value) : null
    } catch (error) {
      this.failureCount++
      this.lastFailure = new Date()
      logger.warn({ key, failureCount: this.failureCount }, 'Redis cache miss due to error')
      return null  // fallback silencioso
    }
  }
}
```

### Timeout em todas as operações externas

Nenhuma operação externa deve bloquear indefinidamente:

```typescript
// Timeout no cliente Redis
const redis = new Redis(env.REDIS_URL, {
  commandTimeout:     2_000,   // 2s por comando
  connectTimeout:     5_000,   // 5s para conectar
  maxRetriesPerRequest: 2,
})

// Timeout no cliente RabbitMQ
const connection = await amqplib.connect(env.RABBITMQ_URL, {
  heartbeat: 30,  // detecta conexão morta em 30s
})

// Timeout no pool do banco de dados (já configurado no SPEC-12)
const pool = new Pool({
  connectionTimeoutMillis: 5_000,
  statement_timeout:       30_000,  // queries não podem levar mais que 30s
  idle_in_transaction_session_timeout: 60_000,
})
```

### Graceful shutdown

Quando o processo recebe SIGTERM (container sendo finalizado), ele:
1. Para de aceitar novas requisições.
2. Aguarda as requisições em andamento terminarem (até 30s).
3. Fecha conexões com banco, Redis e RabbitMQ limpa.
4. Termina com código 0.

```typescript
// src/server.ts

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received')

  // 1. Fastify para de aceitar novas conexões e aguarda as atuais
  await app.close()

  // 2. Fecha o worker (para de consumir da fila)
  if (workerChannel) {
    await workerChannel.close()
    await workerConnection.close()
  }

  // 3. Drena o pool de conexões do banco
  await pool.end()

  // 4. Fecha o Redis
  await redis.quit()

  logger.info('Shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))

// Captura erros não tratados (nunca deve acontecer em produção)
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — terminating')
  process.exit(1)
})
```

---

## Tratamento de erros no Frontend

### Error Boundary para erros de renderização

```tsx
// src/components/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react'

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Reporta o erro para o backend (logging centralizado)
    fetch('/api/client-errors', {
      method: 'POST',
      body: JSON.stringify({
        message: error.message,
        stack:   error.stack,
        componentStack: info.componentStack,
        url:     window.location.href,
      }),
    }).catch(() => {})  // silencioso — não causar erro dentro do handler de erro
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div role="alert">
          <h2>Algo deu errado</h2>
          <p>Recarregue a página. Se o problema persistir, tente novamente mais tarde.</p>
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### Estados de erro nas queries TanStack Query

```tsx
function TransactionsPage() {
  const { data, isLoading, error, refetch } = useTransactions(filters)

  if (error) {
    // Erro de autenticação — redireciona para login
    if (error.statusCode === 401) {
      return <Navigate to="/login" />
    }

    // Erro de servidor — permite retry manual
    return (
      <ErrorState
        message="Não foi possível carregar as transações."
        onRetry={refetch}
      />
    )
  }

  // ...
}
```

### Retry automático no TanStack Query

```typescript
// Configuração global no QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Não retry em erros do cliente (4xx)
        if (error instanceof ApiError && error.statusCode < 500) return false
        // Até 2 retries para erros de servidor (5xx) e de rede
        return failureCount < 2
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
    },
  },
})
```

---

## Formato padronizado de erro na API

Toda resposta de erro segue o mesmo envelope JSON,
independente da origem do erro:

```typescript
interface ApiErrorResponse {
  error: {
    code:     string    // constante em SCREAMING_SNAKE_CASE — usada no frontend
    message:  string    // mensagem legível por humanos — pode ser exibida ao usuário
    details?: unknown   // informações adicionais (campos inválidos, etc.)
  }
}
```

**Exemplos:**

```json
// 422 — Validação
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados de entrada inválidos",
    "details": [
      { "field": "amount", "message": "Valor deve ser maior que zero" },
      { "field": "date",   "message": "Data inválida" }
    ]
  }
}

// 404 — Recurso não encontrado
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Transação não encontrada"
  }
}

// 500 — Erro interno (sem detalhes internos expostos)
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Ocorreu um erro interno. Tente novamente em instantes."
  }
}
```

O campo `code` é a constante que o frontend usa para lógica condicional —
nunca parse a `message` para tomar decisões no código.
