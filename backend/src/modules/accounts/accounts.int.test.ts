import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@/app";

let app: FastifyInstance;
let token: string;
let userId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const email = "accounts-int-test@fintrack.dev";

  await app.inject({
    method: "POST",
    url: "/auth/register",
    body: {
      email,
      name: "Accounts Test",
      password: "Abcdef12",
    },
  });

  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    body: {
      email,
      password: "Abcdef12",
    },
  });

  const loginBody = JSON.parse(loginRes.body);
  token = loginBody.data.accessToken;
  userId = loginBody.data.user.id;
});

beforeEach(async () => {
  const { eq } = await import("drizzle-orm");
  const { accounts, transactions } = await import("@/shared/platform/database/schema");
  const { db } = app;

  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(accounts).where(eq(accounts.userId, userId));
});

afterAll(async () => {
  const { eq } = await import("drizzle-orm");
  const { users } = await import("@/shared/platform/database/schema");
  const { db } = app;

  await db.delete(users).where(eq(users.id, userId));
  await app.close();
});

describe("POST /accounts", () => {
  it("creates an account with initial balance", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Conta principal",
        type: "checking",
        initialBalance: 1500,
      },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(201);
    expect(body.data.name).toBe("Conta principal");
    expect(parseFloat(body.data.balance)).toBeCloseTo(1500);
    expect(body.meta.requestId).toBeDefined();
  });

  it("creates an account without initial balance", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Conta sem saldo",
        type: "savings",
      },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(201);
    expect(body.data.name).toBe("Conta sem saldo");
    expect(parseFloat(body.data.balance)).toBe(0);
  });

  it("returns 422 for invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "",
        type: "invalid",
      },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/accounts",
      body: {
        name: "Conta sem auth",
        type: "checking",
      },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /accounts", () => {
  it("lists active accounts", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Conta listável",
        type: "savings",
        initialBalance: 100,
      },
    });
    const created = JSON.parse(createRes.body).data;

    const listRes = await app.inject({
      method: "GET",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(listRes.body);

    expect(listRes.statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(created.id);
    expect(parseFloat(body.data[0].balance)).toBeCloseTo(100);
  });

  it("lists multiple accounts ordered by creation", async () => {
    await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Conta A", type: "checking" },
    });
    await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Conta B", type: "savings" },
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(listRes.body);

    expect(listRes.statusCode).toBe(200);
    expect(body.data).toHaveLength(2);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/accounts",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /accounts/:id", () => {
  it("returns account details", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Conta detalhe",
        type: "wallet",
        initialBalance: 50,
      },
    });
    const created = JSON.parse(createRes.body).data;

    const detailRes = await app.inject({
      method: "GET",
      url: `/accounts/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(detailRes.body);

    expect(detailRes.statusCode).toBe(200);
    expect(body.data.id).toBe(created.id);
    expect(parseFloat(body.data.balance)).toBeCloseTo(50);
  });

  it("returns 404 for non-existent account", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/accounts/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/accounts/00000000-0000-0000-0000-000000000000",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("PATCH /accounts/:id", () => {
  it("updates the account", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Conta antiga",
        type: "checking",
      },
    });
    const created = JSON.parse(createRes.body).data;

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/accounts/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Conta nova",
        type: "savings",
      },
    });
    const body = JSON.parse(updateRes.body);

    expect(updateRes.statusCode).toBe(200);
    expect(body.data.name).toBe("Conta nova");
    expect(body.data.type).toBe("savings");
  });

  it("returns 404 for non-existent account", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/accounts/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "X" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 422 for invalid payload", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Conta", type: "checking" },
    });
    const created = JSON.parse(createRes.body).data;

    const res = await app.inject({
      method: "PATCH",
      url: `/accounts/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      body: { name: "", type: "invalid" },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/accounts/00000000-0000-0000-0000-000000000000",
      body: { name: "X" },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("DELETE /accounts/:id", () => {
  it("archives the account", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Conta para arquivar",
        type: "checking",
      },
    });
    const created = JSON.parse(createRes.body).data;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/accounts/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(deleteRes.body);

    expect(deleteRes.statusCode).toBe(200);
    expect(body.data.isArchived).toBe(true);

    const listRes = await app.inject({
      method: "GET",
      url: "/accounts",
      headers: { authorization: `Bearer ${token}` },
    });
    const listBody = JSON.parse(listRes.body);

    expect(listBody.data).toHaveLength(0);
  });

  it("returns 404 for non-existent account", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/accounts/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/accounts/00000000-0000-0000-0000-000000000000",
    });

    expect(res.statusCode).toBe(401);
  });
});
