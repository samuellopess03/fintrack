# SPEC-03 — Arquitetura do Backend

## Stack

| Tecnologia      | Versão | Papel                                       |
|-----------------|--------|---------------------------------------------|
| Node.js         | 24 LTS | Runtime                                     |
| TypeScript      | 5.x    | Linguagem (strict mode)                     |
| Fastify         | 5.x    | Framework HTTP                              |
| Drizzle ORM     | latest | Acesso ao banco de dados                    |
| Zod             | 3.x    | Validação de schemas e inferência de tipos  |
| Pino            | built-in Fastify | Logging estruturado em JSON     |
| amqplib         | latest | Cliente AMQP para RabbitMQ                  |
| ioredis         | latest | Cliente Redis para cache                    |

---

## Estrutura de pastas

```
backend/
├── src/
│   ├── app.ts                    ← bootstrap do Fastify (sem iniciar servidor)
│   ├── server.ts                 ← entrypoint: chama app.listen()
│   │
│   ├── modules/                  ← cada módulo = um domínio de negócio
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schema.ts    ← schemas Zod do módulo
│   │   │   ├── auth.unit.test.ts
│   │   │   └── auth.int.test.ts
│   │   ├── accounts/
│   │   ├── categories/
│   │   ├── transactions/
│   │   ├── imports/
│   │   ├── reports/
│   │   └── rules/
│   │
│   ├── shared/
│   │   ├── config/
│   │   │   └── env.ts                ← validação Zod de variáveis de ambiente
│   │   │
│   │   ├── db/
│   │   │   ├── client.ts             ← instância do Drizzle
│   │   │   ├── schema/               ← definições de tabelas (ver SPEC-02)
│   │   │   ├── migrations/           ← SQL puro gerado pelo Drizzle Kit
│   │   │   ├── seed.ts
│   │   │   └── reset.ts
│   │   │
│   │   ├── errors/               ← classes de erro tipadas (AppError, NotFoundError, etc.)
│   │   ├── middlewares/          ← autenticação, rate limit
│   │   ├── plugins/              ← plugins Fastify (db, redis, rabbitmq, auth, swagger, zod, error-handler)
│   │   └── utils/
│   │
│   └── worker/
│       ├── worker.ts             ← entrypoint do worker (processo separado)
│       ├── processors/
│       │   ├── import.processor.ts
│       │   └── alert.processor.ts
│       └── parsers/              ← Strategy: CsvParser, OfxParser
│
├── jest.config.ts
├── tsconfig.json
├── drizzle.config.ts
└── package.json
```

---

## Separação de responsabilidades por camada

```
Request HTTP
    │
    ▼
Route Handler (routes.ts)
    │  - Valida input com Zod schema
    │  - Extrai dados da request
    │  - Chama o service
    │  - Serializa a response
    ▼
Service (service.ts)
    │  - Toda a lógica de negócio vive aqui
    │  - Orquestra repositórios, cache e fila
    │  - Nunca conhece req/res do Fastify
    ▼
Repository / Drizzle Query
    │  - Acesso ao banco de dados
    │  - Queries tipadas com Drizzle
    │  - Sem lógica de negócio
    ▼
PostgreSQL
```

**Regra:** Controllers/routes nunca acessam o banco diretamente.
Services nunca importam `FastifyRequest` ou `FastifyReply`.

---

## Plugins Fastify

O Fastify usa um sistema de plugins para encapsular funcionalidades.
Cada plugin é registrado no `app.ts` e fica disponível via `fastify.nomeDoPluign`.

```typescript
// src/app.ts
import Fastify from 'fastify'

export async function buildApp() {
  const app = Fastify({ logger: pinoConfig })

  // Plugins de infraestrutura
  await app.register(import('./shared/plugins/db.plugin'))           // Drizzle
  await app.register(import('./shared/plugins/redis.plugin'))        // Redis
  await app.register(import('./shared/plugins/rabbitmq.plugin'))     // RabbitMQ
  await app.register(import('./shared/plugins/auth.plugin'))         // JWT
  await app.register(import('./shared/plugins/swagger.plugin'))      // OpenAPI /docs
  await app.register(import('./shared/plugins/zod.plugin'))          // Zod type provider
  await app.register(import('./shared/plugins/error-handler.plugin'))// Error handling
  await app.register(import('./shared/plugins/meta.plugin'))         // Meta requestId

  // Rotas por módulo (com prefixo)
  await app.register(import('./modules/auth/auth.routes'), { prefix: '/auth' })

  return app
}
```

---

## Validação de variáveis de ambiente

O sistema valida toda a configuração na inicialização.
Se uma variável obrigatória estiver ausente ou inválida, o processo termina
com uma mensagem clara — nunca sobe com configuração silenciosamente errada.

```typescript
// src/shared/core/config/env.ts
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:         z.enum(['development', 'test', 'production']),
  PORT:             z.coerce.number().default(3000),
  DATABASE_URL:     z.string().url(),
  REDIS_URL:        z.string().url(),
  RABBITMQ_URL:     z.string().url(),
  JWT_SECRET:       z.string().min(32),
  JWT_EXPIRES_IN:   z.string().default('24h'),
  UPLOAD_DIR:       z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
})

export const env = envSchema.parse(process.env)
// Se parse falhar → ZodError é lançado → processo termina com mensagem legível
```

---

## Tratamento de erros

Erros são classes tipadas, não strings soltas. O Fastify captura erros
não tratados via `setErrorHandler` e serializa a resposta corretamente.

```typescript
// src/shared/core/errors/app.error.ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422, 'VALIDATION_ERROR')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}
```

```typescript
// src/shared/plugins/error-handler.plugin.ts — handler global
app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message }
    })
  }
  // Erros inesperados
  request.log.error(error)
  return reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
  })
})
```

---

## Endpoints da API

### Auth
| Método | Rota             | Descrição                        |
|--------|------------------|----------------------------------|
| POST   | /auth/register   | Cadastro de novo usuário         |
| POST   | /auth/login      | Login — retorna JWT + refresh    |
| POST   | /auth/refresh    | Renova o access token            |
| POST   | /auth/logout     | Invalida o refresh token         |

### Accounts
| Método | Rota                | Descrição                       |
|--------|---------------------|---------------------------------|
| GET    | /accounts           | Lista contas do usuário         |
| POST   | /accounts           | Cria nova conta                 |
| GET    | /accounts/:id       | Detalhe da conta + saldo        |
| PATCH  | /accounts/:id       | Atualiza conta                  |
| DELETE | /accounts/:id       | Arquiva conta (soft delete)     |

### Transactions
| Método | Rota                      | Descrição                              |
|--------|---------------------------|----------------------------------------|
| GET    | /transactions             | Lista com filtros + paginação cursor   |
| POST   | /transactions             | Cria transação manual                  |
| GET    | /transactions/:id         | Detalhe da transação                   |
| PATCH  | /transactions/:id         | Atualiza transação                     |
| DELETE | /transactions/:id         | Remove transação                       |

### Imports
| Método | Rota                  | Descrição                               |
|--------|-----------------------|-----------------------------------------|
| POST   | /imports              | Upload de extrato (multipart/form-data) |
| GET    | /imports              | Histórico de importações                |
| GET    | /imports/:jobId       | Status de um job específico             |

### Reports
| Método | Rota                       | Descrição                              |
|--------|----------------------------|----------------------------------------|
| GET    | /reports/monthly           | Gasto por categoria no período         |
| GET    | /reports/evolution         | Evolução mês a mês                     |
| GET    | /reports/dashboard         | Dados do dashboard (mês corrente)      |

### Rules
| Método | Rota             | Descrição                              |
|--------|------------------|----------------------------------------|
| GET    | /rules           | Lista regras de categorização          |
| POST   | /rules           | Cria nova regra                        |
| PATCH  | /rules/:id       | Atualiza regra                         |
| DELETE | /rules/:id       | Remove regra                           |
| PATCH  | /rules/reorder   | Reordena prioridades                   |

### Sistema
| Método | Rota      | Descrição                              |
|--------|-----------|----------------------------------------|
| GET    | /health   | Health check (sem autenticação)        |
| GET    | /metrics  | Métricas Prometheus                    |

---

## Padrão de resposta da API

**Sucesso:**
```json
{
  "data": { ... },
  "meta": { "requestId": "..." }
}
```

**Lista paginada:**
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "2024-05-15_018f3a2b-...",
    "has_more": true,
    "count": 50
  }
}
```

**Erro:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Account not found"
  }
}
```
