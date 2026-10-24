# SPEC-07 — Estratégia de Testes

## Filosofia

Testes no FinTrack seguem a pirâmide clássica:

- **Base larga:** muitos testes unitários — rápidos, sem I/O, testam lógica pura.
- **Meio:** testes de integração — testam o pipeline completo em banco real.
- **Topo:** testes E2E — poucos, apenas para fluxos críticos.

O foco principal está na **lógica de categorização** (pura, testável, sem dependências)
e no **pipeline de importação** (integração completa do upload ao banco).

---

## Configuração

```typescript
// jest.config.mjs
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true, tsconfig: "tsconfig.json" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/jest.setup.cjs"],
  transformIgnorePatterns: ["node_modules/(?!(drizzle-orm|pg)/)"],
  clearMocks: true,
};
```

---

## Testes Unitários — Regras de Categorização

Esses testes não tocam banco, Redis ou RabbitMQ.
São puros: entrada → processamento → saída.

```typescript
// test/worker/categorization/chain.unit.test.ts

import { buildChain } from "../chain.builder";
import { CategorizationRule } from "@/db/schema";

const FOOD_CATEGORY_ID = "cat-food-uuid";
const TRANSPORT_CATEGORY_ID = "cat-transport-uuid";
const UNCATEGORIZED_ID = "cat-uncategorized-uuid";

describe("Chain of Responsibility — Categorização", () => {
  const rules: CategorizationRule[] = [
    {
      id: "1",
      userId: "u1",
      categoryId: TRANSPORT_CATEGORY_ID,
      ruleType: "description_contains",
      value: { text: "UBER" },
      priority: 1,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: "2",
      userId: "u1",
      categoryId: FOOD_CATEGORY_ID,
      ruleType: "description_contains",
      value: { text: "IFOOD" },
      priority: 2,
      isActive: true,
      createdAt: new Date(),
    },
  ];

  const chain = buildChain(rules, UNCATEGORIZED_ID);

  it('categoriza "UBER TRIP" como Transporte', () => {
    const result = chain.handle({
      description: "UBER TRIP 12345",
      amount: 18.5,
      type: "expense",
      date: new Date(),
    });
    expect(result).toBe(TRANSPORT_CATEGORY_ID);
  });

  it('categoriza "IFOOD*MCDONALDS" como Alimentação', () => {
    const result = chain.handle({
      description: "IFOOD*MCDONALDS",
      amount: 35.0,
      type: "expense",
      date: new Date(),
    });
    expect(result).toBe(FOOD_CATEGORY_ID);
  });

  it("usa fallback para transações sem match", () => {
    const result = chain.handle({
      description: "PIX ENVIADO 99812345",
      amount: 100,
      type: "expense",
      date: new Date(),
    });
    expect(result).toBe(UNCATEGORIZED_ID);
  });

  it("respeita a prioridade — regra 1 bate antes da regra 2", () => {
    // Descrição contém tanto UBER quanto IFOOD — deve categorizar como Transporte (prioridade 1)
    const result = chain.handle({
      description: "UBER EATS IFOOD",
      amount: 25,
      type: "expense",
      date: new Date(),
    });
    expect(result).toBe(TRANSPORT_CATEGORY_ID);
  });

  it("ignora regras inativas", () => {
    const rulesComInativa = [
      { ...rules[0], isActive: false }, // UBER desativada
      rules[1],
    ];
    const chain2 = buildChain(rulesComInativa, UNCATEGORIZED_ID);
    const result = chain2.handle({
      description: "UBER TRIP",
      amount: 18,
      type: "expense",
      date: new Date(),
    });
    expect(result).toBe(UNCATEGORIZED_ID); // não casou com UBER (inativa), nem IFOOD
  });
});
```

---

## Testes Unitários — Parsers

```typescript
// test/worker/parsers/csv.parser.unit.test.ts

import { CsvParser } from "../csv.parser";
import path from "path";

describe("CsvParser", () => {
  const parser = new CsvParser();
  const fixturesDir = path.join(__dirname, "fixtures");

  it("parseia um CSV válido do Nubank", async () => {
    const result = await parser.parse(
      path.join(fixturesDir, "nubank-valid.csv"),
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      description: "UBER TRIP",
      amount: 18.5,
      type: "expense",
    });
  });

  it("rejeita CSV com colunas obrigatórias faltando", async () => {
    await expect(
      parser.parse(path.join(fixturesDir, "invalid-missing-columns.csv")),
    ).rejects.toThrow("Missing required column: description");
  });

  it("ignora linhas com valores inválidos e reporta o erro", async () => {
    const result = await parser.parse(
      path.join(fixturesDir, "partial-invalid.csv"),
    );
    // Linhas válidas são retornadas, linhas inválidas são logadas
    expect(result.length).toBeGreaterThan(0);
  });
});
```

---

## Testes de Integração — Pipeline de Importação

Esses testes usam um banco PostgreSQL real (rodando via Docker no CI)
e verificam o pipeline completo.

```typescript
// test/worker/processors/import.processor.int.test.ts

import { buildTestDb } from "../../helpers/db";
import { processImportJob } from "../import.processor";
import { importJobs, transactions } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import path from "path";

describe("Import Pipeline — integração", () => {
  const db = buildTestDb(); // banco de teste isolado

  beforeEach(async () => {
    await db.delete(transactions);
    await db.delete(importJobs);
  });

  it("processa CSV completo e salva todas as transações", async () => {
    const job = await db
      .insert(importJobs)
      .values({
        userId: TEST_USER_ID,
        accountId: TEST_ACCOUNT_ID,
        status: "pending",
        fileFormat: "csv",
        filePath: path.join(__dirname, "fixtures/nubank-5-transactions.csv"),
        fileName: "nubank.csv",
      })
      .returning();

    await processImportJob(
      {
        jobId: job[0].id,
        userId: TEST_USER_ID,
        accountId: TEST_ACCOUNT_ID,
        filePath: job[0].filePath,
        fileFormat: "csv",
      },
      db,
    );

    // Verifica que o job foi atualizado
    const [updatedJob] = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, job[0].id));
    expect(updatedJob.status).toBe("done");
    expect(updatedJob.importedCount).toBe(5);
    expect(updatedJob.skippedCount).toBe(0);

    // Verifica que as transações foram salvas
    const [{ total }] = await db
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.importJobId, job[0].id));
    expect(total).toBe(5);
  });

  it("é idempotente — re-importar o mesmo arquivo não duplica transações", async () => {
    const jobData = {
      userId: TEST_USER_ID,
      accountId: TEST_ACCOUNT_ID,
      status: "pending" as const,
      fileFormat: "csv" as const,
      filePath: path.join(__dirname, "fixtures/nubank-5-transactions.csv"),
      fileName: "nubank.csv",
    };

    const [job1] = await db.insert(importJobs).values(jobData).returning();
    await processImportJob({ jobId: job1.id, ...jobData }, db);

    const [job2] = await db.insert(importJobs).values(jobData).returning();
    await processImportJob({ jobId: job2.id, ...jobData }, db);

    // Ainda 5 transações — duplicatas ignoradas
    const [{ total }] = await db.select({ total: count() }).from(transactions);
    expect(total).toBe(5);

    const [updatedJob2] = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, job2.id));
    expect(updatedJob2.skippedCount).toBe(5);
  });

  it('atualiza status para "failed" quando o arquivo não existe', async () => {
    const [job] = await db
      .insert(importJobs)
      .values({
        userId: TEST_USER_ID,
        accountId: TEST_ACCOUNT_ID,
        status: "pending",
        fileFormat: "csv",
        filePath: "/tmp/arquivo-que-nao-existe.csv",
        fileName: "ghost.csv",
      })
      .returning();

    await processImportJob(
      {
        jobId: job.id,
        userId: TEST_USER_ID,
        accountId: TEST_ACCOUNT_ID,
        filePath: job.filePath,
        fileFormat: "csv",
      },
      db,
    );

    const [updatedJob] = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, job.id));
    expect(updatedJob.status).toBe("failed");
    expect(updatedJob.errorMessage).toContain("not found");
  });
});
```

---

## Testes de Integração — Endpoints HTTP

```typescript
// test/modules/transactions/transactions.routes.int.test.ts

import { buildApp } from "@/app";
import { buildTestDb, seedUser } from "../../helpers/db";

describe("POST /transactions", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = await seedUser(app); // cria usuário e retorna JWT
  });

  afterAll(() => app.close());

  it("cria uma transação e retorna 201", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        accountId: TEST_ACCOUNT_ID,
        description: "Supermercado Extra",
        amount: 150.0,
        type: "expense",
        date: "2024-05-10",
        categoryId: TEST_CATEGORY_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.description).toBe("Supermercado Extra");
    expect(body.data.amount).toBe("150.00");
  });

  it("retorna 422 quando amount é negativo", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        accountId: TEST_ACCOUNT_ID,
        description: "Teste",
        amount: -50,
        type: "expense",
        date: "2024-05-10",
      },
    });
    expect(response.statusCode).toBe(422);
  });

  it("retorna 401 sem token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/transactions",
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });
});
```

---

## Helpers de teste

```typescript
// test/helpers/db.ts

export function buildTestDb() {
  return drizzle(process.env.TEST_DATABASE_URL!, { schema });
}

export async function seedUser(app: FastifyInstance): Promise<string> {
  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: "test@test.com",
      password: "Test1234!",
      name: "Test User",
    },
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "test@test.com", password: "Test1234!" },
  });
  return res.json().data.accessToken;
}
```

---

## Scripts de teste

```json
// backend/package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern='\\.unit\\.test\\.ts$'",
    "test:int": "dotenv -e .env.test -- drizzle-kit migrate && jest --testPathPattern='\\.int\\.test\\.ts$'"
  }
}
```

---

## Fixtures de teste

Os arquivos de fixture em `test/fixtures/` simulam extratos reais (a criar):

| Arquivo                       | Conteúdo                                     |
| ----------------------------- | -------------------------------------------- |
| `nubank-valid.csv`            | 3 transações válidas no formato Nubank       |
| `nubank-5-transactions.csv`   | 5 transações para teste de pipeline completo |
| `itau-valid.ofx`              | Extrato OFX válido do Itaú                   |
| `invalid-missing-columns.csv` | CSV com colunas obrigatórias faltando        |
| `partial-invalid.csv`         | CSV com mix de linhas válidas e inválidas    |
