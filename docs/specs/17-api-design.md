# SPEC-17 — Design de API e Contratos

## Filosofia

Uma API bem projetada é um contrato entre backend e frontend. Mudanças
quebram esse contrato — e quebrar contratos quebra a confiança. Este
documento define os princípios de design que governam todas as rotas
do FinTrack: nomenclatura, versionamento, paginação, filtragem,
idempotência e evolução da API sem breaking changes.

---

## Princípios gerais

### REST semântico

O FinTrack usa REST com semântica HTTP correta — não "REST com todos os
verbos em POST":

| Ação                        | Verbo HTTP | Idempotente? | Body?  |
|-----------------------------|------------|--------------|--------|
| Ler um ou múltiplos recursos| GET        | Sim          | Não    |
| Criar um novo recurso       | POST       | Não          | Sim    |
| Atualizar parcialmente      | PATCH      | Sim*         | Sim    |
| Substituir completamente    | PUT        | Sim          | Sim    |
| Excluir um recurso          | DELETE     | Sim          | Não    |

*PATCH é idempotente quando aplicado múltiplas vezes resulta no mesmo estado.

### URLs representam recursos, não ações

```
✅ POST   /transactions           → cria uma transação
✅ GET    /transactions/:id       → lê uma transação
✅ PATCH  /transactions/:id       → atualiza parcialmente
✅ DELETE /transactions/:id       → exclui

❌ POST   /createTransaction      → verbo na URL
❌ GET    /getTransactionById/:id → verbo na URL
❌ POST   /transactions/delete    → ação como sub-recurso
```

### Recursos no plural

```
✅ /accounts     /transactions     /categories     /rules
❌ /account      /transaction      /category       /rule
```

---

## Versionamento

A v1 da API não tem prefixo de versão nas URLs — todas as rotas são `/resource`.
O versionamento é necessário apenas quando uma breaking change é inevitável.

**Estratégia de versionamento quando necessário:**

```
# Versão no header (preferido — URL permanece limpa)
Accept: application/vnd.fintrack.v2+json

# Ou versão na URL (mais simples de testar)
/v2/transactions
```

**O que é uma breaking change (requer nova versão):**
- Remover um campo da resposta.
- Mudar o tipo de um campo existente.
- Tornar um campo opcional em obrigatório.
- Mudar o comportamento semântico de um endpoint.

**O que NÃO é breaking change (pode ser feito sem nova versão):**
- Adicionar novos campos opcionais à resposta.
- Adicionar novos endpoints.
- Adicionar novos valores opcionais de query param.
- Tornar um campo obrigatório em opcional.

---

## Envelope de resposta padronizado

Toda resposta segue o mesmo envelope JSON.

### Recurso único

```json
{
  "data": {
    "id":          "018f3a2b-...",
    "description": "Uber *TRIP",
    "amount":      "18.50",
    "type":        "expense",
    "date":        "2024-05-15",
    "categoryId":  "cat-transport-uuid",
    "accountId":   "acc-uuid",
    "createdAt":   "2024-05-15T14:30:00Z"
  }
}
```

### Lista paginada

```json
{
  "data": [ ... ],
  "pagination": {
    "next_cursor": "2024-05-14_018f3a2b-...",
    "has_more":    true,
    "count":       50
  }
}
```

### Erro

```json
{
  "error": {
    "code":    "VALIDATION_ERROR",
    "message": "Dados de entrada inválidos",
    "details": [
      { "field": "amount", "message": "Valor deve ser maior que zero" }
    ]
  }
}
```

**Regra:** o campo `data` existe apenas em sucesso. O campo `error` existe
apenas em erro. Nunca os dois ao mesmo tempo.

---

## Filtragem, ordenação e busca

### Query parameters para filtragem

```
GET /transactions?accountId=uuid&categoryId=uuid&type=expense&from=2024-05-01&to=2024-05-31&q=uber
```

| Param        | Tipo    | Descrição                                     |
|--------------|---------|-----------------------------------------------|
| `accountId`  | UUID    | Filtra por conta                              |
| `categoryId` | UUID    | Filtra por categoria                          |
| `type`       | string  | `income` ou `expense`                         |
| `from`       | date    | Data inicial (YYYY-MM-DD, inclusivo)          |
| `to`         | date    | Data final (YYYY-MM-DD, inclusivo)            |
| `q`          | string  | Busca por texto na descrição (case-insensitive)|
| `cursor`     | string  | Cursor da página anterior (keyset pagination) |
| `limit`      | number  | Itens por página (padrão: 50, máximo: 100)    |

### Validação dos query params

```typescript
const TransactionQuerySchema = z.object({
  accountId:  z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  type:       z.enum(['income', 'expense']).optional(),
  from:       z.string().date().optional(),
  to:         z.string().date().optional(),
  q:          z.string().max(100).optional(),
  cursor:     z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
}).refine(
  (data) => !data.from || !data.to || data.from <= data.to,
  { message: 'Data inicial deve ser anterior à data final', path: ['from'] }
)
```

---

## Idempotência em criação de recursos

Algumas operações POST precisam ser idempotentes — o cliente pode enviar
o mesmo request mais de uma vez (timeout, retry) sem criar duplicatas.

### Idempotency-Key header

```typescript
// Cliente envia um UUID único gerado localmente
POST /transactions
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

// Se o servidor já processou essa chave, retorna o resultado anterior
// sem criar nova transação
```

```typescript
// src/modules/transactions/transactions.service.ts

async function createTransaction(userId: string, dto: CreateTransactionDto, idempotencyKey?: string) {
  if (idempotencyKey) {
    const cached = await cache.get<Transaction>(`idempotency:${userId}:${idempotencyKey}`)
    if (cached) return cached  // retorna resultado anterior
  }

  const [tx] = await db.insert(transactions).values({ ...dto, userId }).returning()

  if (idempotencyKey) {
    // Guarda o resultado por 24h
    await cache.set(`idempotency:${userId}:${idempotencyKey}`, tx, 86_400)
  }

  return tx
}
```

---

## Documentação automática com OpenAPI

O Fastify com `fastify-swagger` gera documentação OpenAPI 3.0 automaticamente
a partir dos schemas Zod das rotas:

```typescript
// src/app.ts
await app.register(swagger, {
  openapi: {
    info: {
      title:   'FinTrack API',
      version: '1.0.0',
      description: 'API de controle financeiro pessoal',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type:   'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        }
      }
    },
    security: [{ bearerAuth: [] }],
  }
})

await app.register(swaggerUi, {
  routePrefix: '/docs',
  // Disponível apenas em desenvolvimento
  exposeRoute: env.NODE_ENV === 'development',
})
```

A documentação fica disponível em `http://localhost:3000/docs` em desenvolvimento.

---

## Contratos de tipos entre frontend e backend

### O problema da dessincronização

O backend define uma `Transaction` com campo `amount` como `string` (retorno
do NUMERIC do PostgreSQL). O frontend pode assumir que é `number` e quebrar
na hora de formatar o valor.

### Convenções de tipos na API

```typescript
// Contratos explícitos documentados em src/types/api.types.ts (frontend)

export interface Transaction {
  id:          string      // UUID
  description: string
  amount:      string      // ← string, não number (vem como NUMERIC do banco)
  type:        'income' | 'expense'
  date:        string      // ← ISO date: "YYYY-MM-DD"
  categoryId:  string | null
  accountId:   string
  importJobId: string | null
  createdAt:   string      // ← ISO datetime com UTC: "2024-05-15T14:30:00Z"
  updatedAt:   string
}
```

### Regras de serialização

| Tipo no banco   | Tipo na API (JSON)  | Conversão no frontend       |
|-----------------|---------------------|-----------------------------|
| `UUID`          | `string`            | Nenhuma                     |
| `NUMERIC(12,2)` | `string` ("150.50") | `parseFloat(tx.amount)`     |
| `DATE`          | `string` ("YYYY-MM-DD") | `new Date(tx.date)` ou disp. direta |
| `TIMESTAMPTZ`   | `string` (ISO UTC)  | `new Date(tx.createdAt)`    |
| `BOOLEAN`       | `boolean`           | Nenhuma                     |
| `TEXT`          | `string` ou `null`  | Nenhuma                     |

---

## Deprecação de campos

Quando um campo precisa ser removido da API sem breaking change imediata:

1. Adicionar o campo novo na resposta (mantém o antigo).
2. Documentar o campo antigo como `@deprecated` no schema.
3. Avisar no header: `Deprecation: true`, `Sunset: Sat, 01 Jan 2026 00:00:00 GMT`.
4. Após a data de sunset, remover o campo (nova versão major se necessário).

```typescript
// Schema com campo deprecado
const TransactionResponseSchema = z.object({
  id:          z.string().uuid(),
  amount:      z.string(),          // campo novo
  value:       z.string().optional(), // @deprecated — use `amount` — removido em v2
})
```
