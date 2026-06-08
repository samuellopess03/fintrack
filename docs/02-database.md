# SPEC-02 — Modelagem do Banco de Dados

## Visão geral

O banco de dados é PostgreSQL, acessado exclusivamente via **Drizzle ORM**.
O schema é definido em TypeScript em `src/db/schema/` e as migrations são
geradas pelo Drizzle Kit como arquivos SQL versionados.

---

## Entidades e relacionamentos

```
users
  │
  ├─── accounts (contas bancárias)
  │         │
  │         └─── transactions (transações)
  │                    │
  │                    └─── categories (categoria da transação)
  │
  ├─── categories (categorias do usuário)
  │         │
  │         └─── budget_goals (meta mensal por categoria)
  │
  ├─── categorization_rules (regras de categorização automática)
  │
  └─── import_jobs (histórico de importações)
```

---

## Tabelas

### `users`

Armazena as credenciais e dados básicos do usuário.

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Drizzle schema:**
```typescript
export const users = pgTable('users', {
  id:           uuid('id').defaultRandom().primaryKey(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name:         text('name').notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

---

### `accounts`

Representa uma conta bancária, carteira ou cartão do usuário.

```sql
CREATE TABLE accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('corrente', 'poupança', 'carteira', 'cartão')),
  currency     TEXT NOT NULL DEFAULT 'BRL',
  color        TEXT NOT NULL DEFAULT '#6366F1',
  is_archived  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
```

**Nota:** O saldo não é armazenado diretamente — é sempre calculado como
`SUM(amount) WHERE account_id = :id`. Isso garante consistência e elimina
a necessidade de sincronizar um campo derivado.

---

### `categories`

Categorias de gastos do usuário. Inclui categorias padrão (seed) e customizadas.

```sql
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#94A3B8',
  icon       TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
```

**Categorias padrão (seed):** Alimentação, Transporte, Saúde, Educação,
Lazer, Moradia, Salário, Investimentos, Não categorizado.

---

### `budget_goals`

Meta de gasto mensal por categoria.

```sql
CREATE TABLE budget_goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  period      TEXT NOT NULL DEFAULT 'monthly',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, category_id)
);
```

---

### `transactions`

Núcleo do sistema. Cada linha representa uma movimentação financeira.

```sql
CREATE TABLE transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  import_job_id UUID REFERENCES import_jobs(id) ON DELETE SET NULL,

  description   TEXT NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL,  -- positivo = receita, negativo = despesa
  type          TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  date          DATE NOT NULL,
  notes         TEXT,

  -- controle de duplicidade em importações
  external_id   TEXT,  -- id original do arquivo OFX quando disponível

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- índice único para detectar duplicatas em importação
  UNIQUE NULLS NOT DISTINCT (account_id, date, amount, description)
);

-- Índices para queries frequentes
CREATE INDEX idx_transactions_user_id      ON transactions(user_id);
CREATE INDEX idx_transactions_account_id   ON transactions(account_id);
CREATE INDEX idx_transactions_category_id  ON transactions(category_id);
CREATE INDEX idx_transactions_date         ON transactions(date DESC);
CREATE INDEX idx_transactions_import_job   ON transactions(import_job_id);

-- Índice composto para o relatório mensal (GROUP BY category + filtro de data)
CREATE INDEX idx_transactions_report
  ON transactions(user_id, date, category_id)
  WHERE type = 'expense';
```

**Nota sobre `amount`:** O valor é sempre positivo no banco. O campo `type`
(`income` | `expense`) determina o sinal na lógica de negócio. Isso evita
ambiguidade e simplifica queries de soma.

---

### `categorization_rules`

Regras avaliadas em cadeia (Chain of Responsibility) durante a importação.

```sql
CREATE TABLE categorization_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

  rule_type   TEXT NOT NULL CHECK (rule_type IN ('description_contains', 'amount_range', 'description_regex')),
  value       JSONB NOT NULL,
  -- Para description_contains: { "text": "UBER" }
  -- Para amount_range:         { "min": 0, "max": 50 }
  -- Para description_regex:    { "pattern": "^PIX\\s" }

  priority    INTEGER NOT NULL DEFAULT 0,  -- menor número = maior prioridade
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rules_user_id  ON categorization_rules(user_id);
CREATE INDEX idx_rules_priority ON categorization_rules(user_id, priority ASC)
  WHERE is_active = true;
```

---

### `import_jobs`

Rastreia cada importação de extrato do início ao fim.

```sql
CREATE TABLE import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  file_format      TEXT NOT NULL CHECK (file_format IN ('csv', 'ofx')),
  file_path        TEXT NOT NULL,    -- caminho no servidor ou object storage
  file_name        TEXT NOT NULL,    -- nome original do arquivo

  total_rows       INTEGER,          -- preenchido após parse
  imported_count   INTEGER,          -- transações salvas com sucesso
  skipped_count    INTEGER,          -- ignoradas por duplicidade
  failed_count     INTEGER,          -- linhas com erro de parse

  error_message    TEXT,             -- mensagem de erro quando status = 'failed'
  retry_count      INTEGER NOT NULL DEFAULT 0,

  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_jobs_user_id ON import_jobs(user_id);
CREATE INDEX idx_import_jobs_status  ON import_jobs(status)
  WHERE status IN ('pending', 'processing');
```

---

## Keyset Pagination — implementação

Para o extrato de transações, usamos paginação por cursor em vez de `OFFSET`.

**Query com cursor:**
```sql
SELECT * FROM transactions
WHERE user_id = :userId
  AND (date, id) < (:lastDate, :lastId)   -- cursor composto
ORDER BY date DESC, id DESC
LIMIT 50;
```

**Por que cursor composto?**
Datas podem se repetir (várias transações no mesmo dia). Usar apenas `date`
como cursor pode pular ou duplicar registros. O par `(date, id)` é sempre
único e garante paginação estável.

**Formato da resposta:**
```json
{
  "data": [...],
  "next_cursor": "2024-05-15_018f3a2b-...",
  "has_more": true
}
```

---

## Índice para relatório mensal — explicação

O índice parcial `idx_transactions_report` é a chave de desempenho dos relatórios:

```sql
CREATE INDEX idx_transactions_report
  ON transactions(user_id, date, category_id)
  WHERE type = 'expense';
```

Ele é **parcial** (`WHERE type = 'expense'`) porque relatórios de gasto
só consideram despesas. O PostgreSQL usa esse índice diretamente para a
query do relatório, sem varrer receitas. Em uma tabela com 10.000 transações
(50% despesas), o índice tem metade do tamanho e é 2x mais rápido de varrer.

---

## Estratégia de migrations

```
src/db/
├── schema/
│   ├── index.ts          ← exporta todos os schemas
│   ├── users.ts
│   ├── accounts.ts
│   ├── categories.ts
│   ├── transactions.ts
│   ├── rules.ts
│   └── imports.ts
│
├── migrations/
│   ├── 0001_init.sql
│   ├── 0002_add_budget_goals.sql
│   └── ...
│
├── seed.ts               ← categorias padrão + usuário de dev
└── client.ts             ← instância do Drizzle
```

**Comandos:**
```bash
# Gerar migration a partir do schema
npx drizzle-kit generate

# Aplicar migrations pendentes
npx drizzle-kit migrate

# Abrir Drizzle Studio (visualizador do banco)
npx drizzle-kit studio
```
