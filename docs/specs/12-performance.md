# SPEC-12 — Performance

## Filosofia

Performance não é uma otimização prematura — é uma dimensão de qualidade
que afeta diretamente a experiência do usuário. Em um app financeiro,
um dashboard que demora 3 segundos para carregar é um dashboard que o
usuário deixa de consultar. Este documento define metas mensuráveis e
as técnicas aplicadas para atingi-las em cada camada.

---

## Metas de performance (SLOs)

### Backend

| Métrica                              | Meta    | Medido em        |
|--------------------------------------|---------|------------------|
| Latência P95 — leitura simples       | < 200ms | Prometheus       |
| Latência P95 — relatório cacheado    | < 50ms  | Prometheus       |
| Latência P95 — relatório sem cache   | < 500ms | Prometheus       |
| Tempo de processamento CSV (500 linhas) | < 10s | Prometheus    |
| Throughput mínimo                    | 100 req/s | k6 load test  |

### Frontend (Core Web Vitals)

| Métrica | Nome                         | Meta    | Impacto SEO |
|---------|------------------------------|---------|-------------|
| LCP     | Largest Contentful Paint     | < 2.5s  | Alto        |
| INP     | Interaction to Next Paint    | < 200ms | Alto        |
| CLS     | Cumulative Layout Shift      | < 0.1   | Alto        |
| FCP     | First Contentful Paint       | < 1.8s  | Médio       |
| TTFB    | Time to First Byte           | < 600ms | Médio       |

---

## Performance de banco de dados

### Índices críticos e suas queries

Cada índice no schema (SPEC-02) existe para uma query específica.
Nenhum índice deve ser criado sem a query correspondente, e nenhuma
query lenta deve existir sem investigação de índice.

```sql
-- Query: extrato paginado (mais frequente)
-- Índice: (user_id, date DESC, id DESC)
SELECT * FROM transactions
WHERE user_id = $1 AND (date, id) < ($2, $3)
ORDER BY date DESC, id DESC
LIMIT 50;

-- Query: relatório mensal por categoria
-- Índice parcial: (user_id, date, category_id) WHERE type = 'expense'
SELECT category_id, SUM(amount)
FROM transactions
WHERE user_id = $1 AND type = 'expense'
  AND date BETWEEN $2 AND $3
GROUP BY category_id;

-- Query: saldo da conta
-- Índice: (account_id) — já coberto pelo FK
SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END)
FROM transactions
WHERE account_id = $1;
```

### EXPLAIN ANALYZE para validação

Antes de qualquer deploy que altere queries críticas, validar com:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM transactions
WHERE user_id = '...' AND (date, id) < ('2024-05-15', '...')
ORDER BY date DESC, id DESC
LIMIT 50;
```

O plano deve mostrar `Index Scan` (não `Seq Scan`) nas tabelas grandes.
`Seq Scan` em `transactions` é um sinal de índice faltando ou query
mal construída.

### Pool de conexões com database connection pooling

O Node.js não deve abrir uma conexão ao banco por requisição — conexões
são caras de estabelecer (handshake TCP + autenticação). O Drizzle usa
um pool de conexões via `pg`:

```typescript
// src/db/client.ts
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max:             20,    // máximo de conexões simultâneas
  idleTimeoutMillis: 30_000,  // fecha conexões ociosas após 30s
  connectionTimeoutMillis: 5_000,  // timeout ao tentar nova conexão
})

export const db = drizzle(pool, { schema })
```

Em produção com múltiplas réplicas da API, usar **PgBouncer** em modo
`transaction` para multiplexar conexões e não ultrapassar o limite do
PostgreSQL.

---

## Performance de cache

### Estratégia cache-aside

O padrão cache-aside (também chamado lazy loading) é o adotado:

```
1. Requisição chega
2. Tenta ler do Redis  →  hit: retorna imediatamente (< 5ms)
                       →  miss: continua para o passo 3
3. Executa query no PostgreSQL (50–300ms)
4. Armazena resultado no Redis com TTL
5. Retorna resultado
```

### Cache warming proativo (opcional, v2)

Para relatórios de dashboards acessados com alta frequência, considerar
pré-aquecer o cache após importações e no início do dia:

```typescript
// Após conclusão de um import job, pré-calcula e cacheia o relatório
// em vez de esperar a primeira requisição do usuário
async function warmReportCache(userId: string) {
  const currentMonth = new Date()
  await reportsService.getMonthlyReport(
    userId,
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1
    // O método já cacheia o resultado internamente
  )
}
```

---

## Performance do frontend

### Bundle splitting e lazy loading de rotas

Cada rota é carregada sob demanda — o usuário não baixa o código do
módulo de relatórios ao acessar o extrato:

```typescript
// src/App.tsx
import { lazy, Suspense } from 'react'
import { Routes, Route }  from 'react-router-dom'

const DashboardPage    = lazy(() => import('./pages/dashboard/DashboardPage'))
const TransactionsPage = lazy(() => import('./pages/transactions/TransactionsPage'))
const ReportsPage      = lazy(() => import('./pages/reports/ReportsPage'))
const ImportsPage      = lazy(() => import('./pages/imports/ImportsPage'))

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/"            element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/reports"      element={<ReportsPage />} />
        <Route path="/imports"      element={<ImportsPage />} />
      </Routes>
    </Suspense>
  )
}
```

### Prefetching de rotas prováveis

Ao passar o mouse sobre um link de navegação, o chunk daquela rota
é baixado antecipadamente — eliminando o delay no clique:

```typescript
// Ao hover na sidebar, prefetch da rota destino
<Link
  to="/transactions"
  onMouseEnter={() => import('./pages/transactions/TransactionsPage')}
>
  Extrato
</Link>
```

### Virtualização da lista de transações

Uma lista com centenas de transações renderiza apenas os itens visíveis
na viewport (+ um buffer). Itens fora da tela não existem no DOM.

```tsx
// src/pages/transactions/components/TransactionList.tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count:            transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize:     () => 64,  // altura estimada de cada linha
    overscan:         10,        // renderiza 10 itens além da viewport
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => (
          <div
            key={item.key}
            style={{
              position:  'absolute',
              top:       item.start,
              height:    item.size,
              width:     '100%',
            }}
          >
            <TransactionRow transaction={transactions[item.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Evitar re-renders desnecessários

```tsx
// Memoização de componentes pesados que recebem as mesmas props
const TransactionRow = memo(function TransactionRow({ transaction }) {
  return (/* ... */)
})

// Callbacks estáveis para não invalidar a memoização dos filhos
function TransactionsPage() {
  const handleEdit = useCallback((id: string) => {
    setEditingId(id)
  }, [])  // sem dependências → mesma referência em todo render

  return <TransactionList onEdit={handleEdit} />
}

// Derivar dados memoizados de listas grandes
const totals = useMemo(() => ({
  income:  transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
  expense: transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
}), [transactions])  // só recalcula quando transactions muda
```

### Otimização de imagens e assets

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Chunks de vendedores separados do código da aplicação
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-query':    ['@tanstack/react-query'],
          'vendor-charts':   ['recharts'],
          'vendor-router':   ['react-router-dom'],
        }
      }
    },
    // Compressão de assets
    assetsInlineLimit: 4096,  // inline assets < 4KB como base64
  }
})
```

### Skeleton screens em vez de spinners

Spinners causam CLS (Cumulative Layout Shift) quando o conteúdo carrega
e empurra elementos. Skeletons ocupam o mesmo espaço do conteúdo real —
CLS = 0.

```tsx
// src/components/ui/TransactionRowSkeleton.tsx
function TransactionRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 animate-pulse">
      <div className="h-4 w-24 bg-slate-200 rounded" />  {/* data */}
      <div className="h-4 flex-1 bg-slate-200 rounded" /> {/* descrição */}
      <div className="h-6 w-20 bg-slate-200 rounded-full" /> {/* badge */}
      <div className="h-4 w-24 bg-slate-200 rounded ml-auto" /> {/* valor */}
    </div>
  )
}
```

---

## Monitoramento de performance em produção

### Web Vitals reportados ao backend

```typescript
// src/main.tsx
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals'

function reportVital(metric: Metric) {
  // Envia para o endpoint de analytics da própria API
  navigator.sendBeacon('/api/vitals', JSON.stringify({
    name:  metric.name,
    value: metric.value,
    rating: metric.rating,  // 'good' | 'needs-improvement' | 'poor'
  }))
}

onCLS(reportVital)
onINP(reportVital)
onLCP(reportVital)
onFCP(reportVital)
onTTFB(reportVital)
```

### Load test com k6

```javascript
// infra/k6/load-test.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '30s', target: 10  },  // ramp up
    { duration: '1m',  target: 100 },  // carga sustentada
    { duration: '30s', target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // P95 < 200ms
    http_req_failed:   ['rate<0.01'],  // < 1% de erros
  },
}

export default function () {
  const res = http.get('http://api:3000/transactions', {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
  })
  check(res, { 'status 200': (r) => r.status === 200 })
  sleep(1)
}
```

Executar no CI antes de cada release:
```bash
k6 run infra/k6/load-test.js
```
