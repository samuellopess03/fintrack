# SPEC-05 — Estratégia de Cache (Redis)

## Princípio

O Redis é usado **exclusivamente como cache** no FinTrack.
Nenhum dado primário vive no Redis — ele é sempre regenerável a partir
do PostgreSQL. Se o Redis estiver indisponível, o sistema continua
funcionando com queries diretas ao banco (degradação graceful).

---

## O que é cacheado

| Dado                         | Chave                                  | TTL     | Invalidado quando                              |
|------------------------------|----------------------------------------|---------|------------------------------------------------|
| Relatório mensal por categoria | `report:monthly:{userId}:{yyyy-MM}`  | 5 min   | Nova transação ou job concluído no mês         |
| Evolução mês a mês           | `report:evolution:{userId}`            | 10 min  | Nova transação ou job concluído                |
| Dashboard do mês corrente    | `report:dashboard:{userId}:{yyyy-MM}`  | 2 min   | Qualquer alteração de transação no mês         |
| Saldo de cada conta          | `balance:{accountId}`                  | 1 min   | Transação criada/editada/removida na conta     |

**Por que TTLs curtos?** O usuário lança transações com frequência baixa
(algumas por dia), então uma janela de 5 minutos é aceitável. TTL curto
elimina a necessidade de invalidação explícita em muitos casos — mas a
invalidação explícita existe para garantir consistência imediata quando
o usuário acaba de adicionar um lançamento.

---

## Implementação do cache service

```typescript
// src/shared/cache/cache.service.ts

export class CacheService {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key)
      return value ? JSON.parse(value) : null
    } catch {
      return null  // falha silenciosa — nunca quebra a request
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch {
      // falha silenciosa
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch {
      // falha silenciosa
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern)
      if (keys.length > 0) await this.redis.del(...keys)
    } catch {
      // falha silenciosa
    }
  }
}
```

---

## Cache no relatório mensal — fluxo completo

```typescript
// src/modules/reports/reports.service.ts

export class ReportsService {
  constructor(
    private readonly db:    DrizzleDB,
    private readonly cache: CacheService,
  ) {}

  async getMonthlyReport(userId: string, year: number, month: number) {
    const cacheKey = `report:monthly:${userId}:${year}-${String(month).padStart(2, '0')}`

    // 1. Tenta servir do cache
    const cached = await this.cache.get<MonthlyReport>(cacheKey)
    if (cached) return cached

    // 2. Cache miss — calcula a partir do banco
    const startDate = new Date(year, month - 1, 1)
    const endDate   = new Date(year, month, 0)

    const result = await this.db
      .select({
        categoryId:   transactions.categoryId,
        categoryName: categories.name,
        categoryColor:categories.color,
        total:        sql<number>`sum(${transactions.amount})`,
        count:        sql<number>`count(*)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'expense'),
        between(transactions.date, startDate, endDate)
      ))
      .groupBy(transactions.categoryId, categories.name, categories.color)

    // 3. Armazena no cache
    await this.cache.set(cacheKey, result, 60 * 5)  // TTL: 5 minutos

    return result
  }
}
```

---

## Invalidação de cache

A invalidação é chamada em dois contextos:

### 1. Após transação manual (criação, edição, remoção)

```typescript
// src/modules/transactions/transactions.service.ts

async function invalidateAfterTransaction(
  userId:    string,
  accountId: string,
  date:      Date
): Promise<void> {
  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

  await Promise.all([
    cache.del(`report:monthly:${userId}:${yearMonth}`),
    cache.del(`report:dashboard:${userId}:${yearMonth}`),
    cache.del(`report:evolution:${userId}`),
    cache.del(`balance:${accountId}`),
  ])
}
```

### 2. Após conclusão de import job (worker)

```typescript
// src/worker/processors/import.processor.ts

async function invalidateReportCache(userId: string): Promise<void> {
  // Invalida todos os meses — o extrato pode conter transações de qualquer período
  await cache.delPattern(`report:monthly:${userId}:*`)
  await cache.delPattern(`report:dashboard:${userId}:*`)
  await cache.del(`report:evolution:${userId}`)
  // Saldos das contas também precisam ser atualizados
  await cache.delPattern(`balance:*`)  // por simplicidade na v1
}
```

---

## Degradação graceful quando Redis está indisponível

O `CacheService` captura todas as exceções do Redis silenciosamente.
O fluxo de leitura no service sempre funciona mesmo com cache miss:

```
cache.get() → null (falha silenciosa)
    │
    ▼
query direto no banco (sempre funciona)
    │
    ▼
cache.set() → falha silenciosa (não armazena, mas não quebra)
    │
    ▼
retorna o dado normalmente para o cliente
```

A única consequência de Redis indisponível é **latência maior** nas queries
de relatório. Nenhum dado é perdido ou incorreto.

---

## Métricas de cache (Prometheus)

```typescript
// Contador de cache hits vs misses
const cacheHits   = new Counter({ name: 'fintrack_cache_hits_total',   labelNames: ['key_prefix'] })
const cacheMisses = new Counter({ name: 'fintrack_cache_misses_total', labelNames: ['key_prefix'] })

// Adicionado no CacheService.get()
if (cached) cacheHits.inc({ key_prefix: key.split(':')[0] })
else        cacheMisses.inc({ key_prefix: key.split(':')[0] })
```

Isso permite calcular o **hit rate** no Grafana:
```
rate(fintrack_cache_hits_total[5m])
  / (rate(fintrack_cache_hits_total[5m]) + rate(fintrack_cache_misses_total[5m]))
```
