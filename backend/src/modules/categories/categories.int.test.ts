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

  const email = "categories-int-test@fintrack.dev";

  await app.inject({
    method: "POST",
    url: "/auth/register",
    body: {
      email,
      name: "Categories Test",
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
  const { budgetGoals, categories } =
    await import("@/shared/platform/database/schema");
  const { db } = app;

  await db.delete(budgetGoals).where(eq(budgetGoals.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));
});

afterAll(async () => {
  const { eq } = await import("drizzle-orm");
  const { users } = await import("@/shared/platform/database/schema");
  const { db } = app;

  await db.delete(users).where(eq(users.id, userId));
  await app.close();
});

describe("POST /categories", () => {
  it("creates a category", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: "Alimentação",
        color: "#EF4444",
        icon: "utensils",
      },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(201);
    expect(body.data.name).toBe("Alimentação");
    expect(body.data.color).toBe("#EF4444");
    expect(body.data.isDefault).toBe(false);
    expect(body.meta.requestId).toBeDefined();
  });

  it("creates a category with defaults", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Saúde" },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(201);
    expect(body.data.color).toBe("#94A3B8");
    expect(body.data.icon).toBeNull();
  });

  it("returns 422 for invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "" },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/categories",
      body: { name: "Test" },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /categories", () => {
  it("lists user categories", async () => {
    await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Categoria A" },
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(listRes.body);

    expect(listRes.statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Categoria A");
    expect(body.data[0].budgetGoal).toBeNull();
  });

  it("returns empty array when user has no categories", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(listRes.body);

    expect(listRes.statusCode).toBe(200);
    expect(body.data).toHaveLength(0);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/categories",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /categories/:id", () => {
  it("returns category details", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Detalhe" },
    });
    const created = JSON.parse(createRes.body).data;

    const detailRes = await app.inject({
      method: "GET",
      url: `/categories/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(detailRes.body);

    expect(detailRes.statusCode).toBe(200);
    expect(body.data.id).toBe(created.id);
  });

  it("returns 404 for non-existent category", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/categories/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/categories/00000000-0000-0000-0000-000000000000",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("PATCH /categories/:id", () => {
  it("updates the category", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Antiga" },
    });
    const created = JSON.parse(createRes.body).data;

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/categories/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Nova", color: "#10B981" },
    });
    const body = JSON.parse(updateRes.body);

    expect(updateRes.statusCode).toBe(200);
    expect(body.data.name).toBe("Nova");
    expect(body.data.color).toBe("#10B981");
  });

  it("returns 404 for non-existent category", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/categories/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "X" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 422 for invalid payload", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Valid" },
    });
    const created = JSON.parse(createRes.body).data;

    const res = await app.inject({
      method: "PATCH",
      url: `/categories/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      body: { name: "" },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/categories/00000000-0000-0000-0000-000000000000",
      body: { name: "X" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when trying to update a default category", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
    });
    const defaultCategory = JSON.parse(listRes.body).data.find(
      (c: { isDefault: boolean }) => c.isDefault,
    );

    if (!defaultCategory) return;

    const res = await app.inject({
      method: "PATCH",
      url: `/categories/${defaultCategory.id}`,
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Tentando alterar" },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("DELETE /categories/:id", () => {
  it("deletes the category", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Para deletar" },
    });
    const created = JSON.parse(createRes.body).data;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/categories/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(deleteRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
    });
    const listBody = JSON.parse(listRes.body);

    expect(listBody.data).toHaveLength(0);
  });

  it("returns 404 for non-existent category", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/categories/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/categories/00000000-0000-0000-0000-000000000000",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when trying to delete a default category", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
    });
    const defaultCategory = JSON.parse(listRes.body).data.find(
      (c: { isDefault: boolean }) => c.isDefault,
    );

    if (!defaultCategory) return;

    const res = await app.inject({
      method: "DELETE",
      url: `/categories/${defaultCategory.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("Budget Goals", () => {
  let categoryId: string;

  beforeEach(async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { authorization: `Bearer ${token}` },
      body: { name: "Categoria com meta" },
    });
    categoryId = JSON.parse(createRes.body).data.id;
  });

  describe("PUT /categories/:id/goal", () => {
    it("creates a budget goal", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
        body: { amount: 500 },
      });

      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.amount).toBe("500.00");
      expect(body.data.period).toBe("monthly");
    });

    it("updates an existing budget goal", async () => {
      await app.inject({
        method: "PUT",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
        body: { amount: 500 },
      });

      const res = await app.inject({
        method: "PUT",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
        body: { amount: 800 },
      });

      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.amount).toBe("800.00");
    });

    it("returns 404 for non-existent category", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/categories/00000000-0000-0000-0000-000000000000/goal",
        headers: { authorization: `Bearer ${token}` },
        body: { amount: 500 },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 422 for invalid amount", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
        body: { amount: -100 },
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe("GET /categories/:id/goal", () => {
    it("returns the budget goal", async () => {
      await app.inject({
        method: "PUT",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
        body: { amount: 500 },
      });

      const res = await app.inject({
        method: "GET",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
      });

      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.amount).toBe("500.00");
    });

    it("returns 404 when goal does not exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /categories/:id/goal", () => {
    it("deletes the budget goal", async () => {
      await app.inject({
        method: "PUT",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
        body: { amount: 500 },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);

      const getRes = await app.inject({
        method: "GET",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(getRes.statusCode).toBe(404);
    });

    it("returns 404 when goal does not exist", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/categories/${categoryId}/goal`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
