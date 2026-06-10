# SPEC-06 — Arquitetura do Frontend

## Stack

| Tecnologia       | Versão | Papel                                        |
|------------------|--------|----------------------------------------------|
| React            | 19.x   | UI declarativa com componentes               |
| TypeScript       | 5.x    | Tipagem estática                             |
| Vite             | 5.x    | Build tool e dev server                      |
| TanStack Query   | 5.x    | Cache de server state, mutations, polling    |
| React Router     | 7.x    | Roteamento SPA tipado                        |
| Recharts         | 2.x    | Gráficos (pie, bar, line) baseados em D3     |
| Zod              | 3.x    | Validação de formulários                     |
| React Hook Form  | 7.x    | Gerenciamento de estado de formulários       |

---

## Estrutura de pastas

```
frontend/
├── src/
│   ├── main.tsx                    ← entrypoint
│   ├── App.tsx                     ← providers + router
│   │
│   ├── pages/                      ← uma pasta por rota
│   │   ├── dashboard/
│   │   │   ├── DashboardPage.tsx
│   │   │   └── components/         ← componentes exclusivos da página
│   │   ├── transactions/
│   │   ├── accounts/
│   │   ├── imports/
│   │   ├── reports/
│   │   ├── rules/
│   │   └── auth/
│   │
│   ├── components/                 ← componentes reutilizáveis globais
│   │   ├── ui/                     ← primitivos: Button, Input, Modal, Badge
│   │   ├── layout/                 ← Sidebar, Header, PageContainer
│   │   └── charts/                 ← wrappers de Recharts tipados
│   │
│   ├── api/                        ← camada de acesso à API
│   │   ├── client.ts               ← instância do fetch com base URL + auth
│   │   ├── accounts.api.ts
│   │   ├── transactions.api.ts
│   │   ├── imports.api.ts
│   │   ├── reports.api.ts
│   │   └── rules.api.ts
│   │
│   ├── hooks/                      ← hooks TanStack Query por domínio
│   │   ├── useAccounts.ts
│   │   ├── useTransactions.ts
│   │   ├── useImportJob.ts         ← hook com polling automático
│   │   ├── useReports.ts
│   │   └── useAuth.ts
│   │
│   ├── stores/                     ← estado local com Context ou Zustand
│   │   └── auth.store.ts           ← token JWT, dados do usuário logado
│   │
│   ├── types/                      ← tipos TypeScript compartilhados
│   │   └── api.types.ts            ← espelha os schemas do backend
│   │
│   └── utils/
│       ├── currency.ts             ← formatação BRL
│       ├── date.ts                 ← formatação de datas em pt-BR
│       └── cn.ts                   ← helper de classNames
│
├── index.html
├── vite.config.ts
└── tsconfig.json
```

---

## Camada de API — fetch tipado

A camada `api/` isola todas as chamadas HTTP. Nenhuma página ou hook
chama `fetch` diretamente — sempre passa por essa camada.

```typescript
// src/api/client.ts

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = authStore.getToken()

  const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (response.status === 401) {
    authStore.clear()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!response.ok) {
    const error = await response.json()
    throw new ApiError(error.error.message, error.error.code, response.status)
  }

  return response.json()
}
```

```typescript
// src/api/transactions.api.ts

export const transactionsApi = {
  list: (params: TransactionFilters) =>
    apiFetch<PaginatedResponse<Transaction>>(`/transactions?${toQueryString(params)}`),

  create: (data: CreateTransactionDto) =>
    apiFetch<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: UpdateTransactionDto) =>
    apiFetch<Transaction>(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) =>
    apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' }),
}
```

---

## TanStack Query — padrões de uso

### Queries com cache automático

```typescript
// src/hooks/useTransactions.ts

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ['transactions', filters],
    queryFn: ({ pageParam }) =>
      transactionsApi.list({ ...filters, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    initialPageParam: undefined,
    staleTime: 1000 * 60,  // considera fresco por 1 minuto
  })
}
```

### Mutations com invalidação de cache

```typescript
// src/hooks/useTransactions.ts

export function useCreateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      // Invalida todas as queries de transações e relatórios
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })  // saldo
    },
  })
}
```

### Polling de status do import job

O cliente faz polling do status do job a cada 2 segundos enquanto
o status for `pending` ou `processing`. Para automaticamente quando
o job termina (`done` ou `failed`).

```typescript
// src/hooks/useImportJob.ts

export function useImportJob(jobId: string | null) {
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () => importsApi.getJob(jobId!),
    enabled:  !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'done' || status === 'failed') return false
      return 2000  // poll a cada 2 segundos
    },
  })
}
```

---

## Páginas e funcionalidades

### Dashboard (`/`)
- Cards de resumo: saldo total, receitas do mês, despesas do mês.
- Gráfico de pizza: distribuição de gastos por categoria.
- Indicadores de meta: categorias que ultrapassaram o limite.
- Últimas 5 transações.

### Extrato (`/transactions`)
- Lista paginada com scroll infinito (useInfiniteQuery).
- Filtros: conta, categoria, tipo, período, busca por texto.
- Ação de criar, editar e remover transação inline.
- Badge de categoria com cor.

### Importação (`/imports`)
- Dropzone de upload de arquivo (CSV/OFX).
- Seleção de conta destino.
- Barra de progresso / status em tempo real (polling).
- Histórico de importações anteriores com resultado.

### Contas (`/accounts`)
- Cards por conta com saldo calculado.
- Formulário de criação/edição.

### Relatórios (`/reports`)
- Seletor de período (mês/ano).
- Gráfico de barras: gastos por categoria.
- Gráfico de linha: evolução mês a mês.
- Tabela detalhada com percentual de cada categoria.

### Regras (`/rules`)
- Lista de regras com prioridade.
- Drag-and-drop para reordenar.
- Formulário de criação com preview de match.

---

## Tratamento de estado de upload

```typescript
// src/pages/imports/ImportPage.tsx

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'polling'; jobId: string }
  | { phase: 'done';    result: ImportJobResult }
  | { phase: 'error';   message: string }
```

A máquina de estados garante que a UI sempre reflita a fase correta
e nunca mostre estados contraditórios (ex: botão de upload ativo
enquanto processa).

---

## Formatação de valores monetários

```typescript
// src/utils/currency.ts

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style:    'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatBRLCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      style:             'currency',
      currency:          'BRL',
      notation:          'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }
  return formatBRL(value)
}
```

---

## Variáveis de ambiente do frontend

```bash
# .env.development
VITE_API_URL=http://localhost:3000
```

Validadas em `src/config/env.ts` com Zod no boot da aplicação,
da mesma forma que o backend.
