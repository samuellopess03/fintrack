# SPEC-04 — Pipeline Assíncrono (RabbitMQ + Worker)

## Por que processamento assíncrono?

Processar um CSV de 500 linhas dentro de uma requisição HTTP bloquearia
o servidor por segundos, travaria o cliente esperando a resposta e impediria
retentativas automáticas em caso de falha.

O modelo correto é: **aceitar, enfileirar, processar, notificar**.

```
Upload (< 100ms)          Processamento (segundos)
     │                           │
     ▼                           ▼
API salva arquivo     Worker processa em background
API publica job   →   Worker atualiza status no banco
API retorna 202   ←   Cliente faz polling do status
```

---

## Topologia do RabbitMQ

```
Publisher (API)
    │
    │  routing_key: "import.csv"
    │  routing_key: "import.ofx"
    ▼
Exchange: fintrack.imports  (tipo: direct)
    │
    ├──── binding: "import.csv" ──→ Queue: fintrack.imports.csv
    │                                    │
    │                                    └──→ Worker
    │
    ├──── binding: "import.ofx" ──→ Queue: fintrack.imports.ofx
    │                                    │
    │                                    └──→ Worker
    │
    └──── (on NACK após 3 retries)
              ▼
         Exchange: fintrack.dlx  (dead letter)
              │
              └──→ Queue: fintrack.imports.dead
                        │
                        └──→ Monitoramento / alerta
```

**Por que `direct` exchange?** Permite rotear por tipo de arquivo no futuro,
permitindo workers especializados com concorrência diferente (CSVs pesados
vs OFX simples). Por ora ambas as filas apontam para o mesmo worker.

---

## Configuração das filas

```typescript
// src/shared/plugins/rabbitmq.plugin.ts

const EXCHANGE = 'fintrack.imports'
const DLX      = 'fintrack.dlx'

async function setupTopology(channel: Channel) {
  // Dead letter exchange — precisa existir antes das filas principais
  await channel.assertExchange(DLX, 'direct', { durable: true })
  await channel.assertQueue('fintrack.imports.dead', { durable: true })
  await channel.bindQueue('fintrack.imports.dead', DLX, 'dead')

  // Exchange principal
  await channel.assertExchange(EXCHANGE, 'direct', { durable: true })

  // Filas com DLX configurado
  const queueOptions = {
    durable: true,
    arguments: {
      'x-dead-letter-exchange':    DLX,
      'x-dead-letter-routing-key': 'dead',
      'x-message-ttl':             1000 * 60 * 60,  // 1h TTL
    }
  }

  await channel.assertQueue('fintrack.imports.csv', queueOptions)
  await channel.assertQueue('fintrack.imports.ofx', queueOptions)

  await channel.bindQueue('fintrack.imports.csv', EXCHANGE, 'import.csv')
  await channel.bindQueue('fintrack.imports.ofx', EXCHANGE, 'import.ofx')
}
```

---

## Publicação de job (API)

```typescript
// src/modules/imports/imports.service.ts

interface ImportJobMessage {
  jobId:     string
  userId:    string
  accountId: string
  filePath:  string
  fileFormat: 'csv' | 'ofx'
}

async function publishImportJob(message: ImportJobMessage): Promise<void> {
  const routingKey = `import.${message.fileFormat}`
  const content    = Buffer.from(JSON.stringify(message))

  channel.publish(EXCHANGE, routingKey, content, {
    persistent:    true,           // sobrevive a restart do RabbitMQ
    contentType:  'application/json',
    messageId:     message.jobId,  // idempotência
    timestamp:     Date.now(),
  })
}
```

---

## Padrão Strategy — Parsers

Cada formato de arquivo tem um parser próprio. O worker escolhe a estratégia
com base no `fileFormat` da mensagem, sem `if/else` espalhados.

```typescript
// src/worker/parsers/types.ts
export interface ParsedTransaction {
  description: string
  amount:      number
  type:        'income' | 'expense'
  date:        Date
  externalId?: string  // id do OFX quando disponível
}

export interface FileParser {
  parse(filePath: string): Promise<ParsedTransaction[]>
}
```

```typescript
// src/worker/parsers/csv.parser.ts
export class CsvParser implements FileParser {
  async parse(filePath: string): Promise<ParsedTransaction[]> {
    // Usa a lib 'csv-parse' para ler linha a linha
    // Valida cada linha com Zod antes de retornar
    // Lança ParseError com número da linha em caso de falha
  }
}

// src/worker/parsers/ofx.parser.ts
export class OfxParser implements FileParser {
  async parse(filePath: string): Promise<ParsedTransaction[]> {
    // Usa a lib 'ofx-js' para parsear o formato bancário
    // Extrai FITID como externalId para deduplicação
  }
}

// Registro das estratégias
export const parsers: Record<string, FileParser> = {
  csv: new CsvParser(),
  ofx: new OfxParser(),
}
```

---

## Padrão Chain of Responsibility — Categorização

Cada regra é um elo da corrente. O processador testa regra por regra,
em ordem de prioridade, e para no primeiro match.

```typescript
// src/worker/categorization/handler.interface.ts
export interface CategorizationHandler {
  setNext(handler: CategorizationHandler): CategorizationHandler
  handle(transaction: ParsedTransaction): string | null  // retorna category_id ou null
}

// src/worker/categorization/base.handler.ts
export abstract class BaseHandler implements CategorizationHandler {
  private next: CategorizationHandler | null = null

  setNext(handler: CategorizationHandler) {
    this.next = handler
    return handler
  }

  handle(transaction: ParsedTransaction): string | null {
    if (this.next) return this.next.handle(transaction)
    return null
  }
}

// src/worker/categorization/description.handler.ts
export class DescriptionContainsHandler extends BaseHandler {
  constructor(
    private readonly text:       string,
    private readonly categoryId: string
  ) { super() }

  handle(transaction: ParsedTransaction): string | null {
    if (transaction.description.toLowerCase().includes(this.text.toLowerCase())) {
      return this.categoryId  // match! para a cadeia
    }
    return super.handle(transaction)  // passa para o próximo
  }
}
```

**Montagem da corrente a partir das regras do banco:**
```typescript
function buildChain(rules: CategorizationRule[]): CategorizationHandler {
  const fallback = new FallbackHandler(UNCATEGORIZED_ID)

  const handlers = rules
    .sort((a, b) => a.priority - b.priority)
    .map(rule => createHandler(rule))

  // Liga os elos: h1 → h2 → h3 → fallback
  return handlers.reduceRight(
    (next, handler) => { handler.setNext(next); return handler },
    fallback as CategorizationHandler
  )
}
```

---

## Padrão Unit of Work — Atomicidade

Todo o processamento de um arquivo ocorre dentro de uma única transação
de banco de dados. Ou tudo é salvo, ou nada é salvo.

```typescript
// src/worker/processors/import.processor.ts

async function processImportJob(message: ImportJobMessage): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Atualiza status para 'processing'
    await tx.update(importJobs)
      .set({ status: 'processing', startedAt: new Date() })
      .where(eq(importJobs.id, message.jobId))

    // 2. Faz parse do arquivo
    const parser = parsers[message.fileFormat]
    const parsed = await parser.parse(message.filePath)

    // 3. Carrega regras do usuário e monta a cadeia
    const rules = await tx.select().from(categorizationRules)
      .where(eq(categorizationRules.userId, message.userId))
    const chain = buildChain(rules)

    // 4. Insere todas as transações (ignora duplicatas via ON CONFLICT DO NOTHING)
    let importedCount = 0
    let skippedCount  = 0

    for (const row of parsed) {
      const categoryId = chain.handle(row)
      const result = await tx.insert(transactions)
        .values({ ...row, categoryId, importJobId: message.jobId })
        .onConflictDoNothing()

      if (result.rowCount === 0) skippedCount++
      else importedCount++
    }

    // 5. Atualiza job com resultado final
    await tx.update(importJobs)
      .set({
        status: 'done',
        totalRows: parsed.length,
        importedCount,
        skippedCount,
        finishedAt: new Date()
      })
      .where(eq(importJobs.id, message.jobId))

    // 6. Invalida cache dos relatórios afetados (fora da tx, sem rollback)
    await invalidateReportCache(message.userId)
  })
}
```

---

## Retry e Dead Letter Queue

```typescript
// src/worker/worker.ts

channel.consume('fintrack.imports.csv', async (msg) => {
  if (!msg) return

  const message: ImportJobMessage = JSON.parse(msg.content.toString())
  const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number

  try {
    await processImportJob(message)
    channel.ack(msg)  // sucesso: remove da fila
  } catch (error) {
    logger.error({ jobId: message.jobId, retryCount, error }, 'Job failed')

    if (retryCount < 3) {
      // Republica com contador incrementado (backoff exponencial)
      const delay = Math.pow(2, retryCount) * 1000  // 1s, 2s, 4s
      setTimeout(() => {
        channel.publish(EXCHANGE, `import.${message.fileFormat}`,
          msg.content, {
            headers: { 'x-retry-count': retryCount + 1 },
            persistent: true
          }
        )
      }, delay)
      channel.ack(msg)  // ack o original para não duplicar
    } else {
      // Esgotou retries → vai para DLQ via NACK
      await markJobAsFailed(message.jobId, error)
      channel.nack(msg, false, false)
    }
  }
}, { noAck: false })
```

---

## Diagrama de estados do Import Job

```
         upload
           │
           ▼
        [pending]
           │
           │  worker consume
           ▼
       [processing]
           │
     ┌─────┴─────┐
     │           │
  sucesso      erro
     │           │
     ▼           ▼
  [done]    retry (até 3x)
                 │
                 │ esgotou
                 ▼
             [failed]
```

---

## Configuração do worker como processo separado

O worker roda em um processo Node.js separado da API.
Em desenvolvimento, sobe via Docker Compose como serviço independente.

```typescript
// src/worker/worker.ts
async function start() {
  const connection = await amqplib.connect(env.RABBITMQ_URL)
  const channel    = await connection.createChannel()

  await setupTopology(channel)
  channel.prefetch(5)  // processa até 5 jobs simultaneamente

  logger.info('Worker started, waiting for jobs...')

  channel.consume('fintrack.imports.csv', handleMessage(channel, 'csv'))
  channel.consume('fintrack.imports.ofx', handleMessage(channel, 'ofx'))
}

start().catch((err) => {
  logger.fatal(err, 'Worker failed to start')
  process.exit(1)
})
```
