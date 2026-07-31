import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import { buildApp } from "@/app";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function deleteTestUser() {
  try {
    const { db } = app;
    const { users } = await import("@/shared/platform/database/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(users).where(eq(users.email, "int-test@fintrack.dev"));
  } catch {
    // Tabela pode não existir se migrations ainda não rodaram
  }
}

beforeAll(async () => {
  await deleteTestUser();
});

describe("POST /auth/register", () => {
  afterEach(async () => {
    await deleteTestUser();
  });

  it("returns 201 with user, tokens and meta", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      body: {
        email: "int-test@fintrack.dev",
        name: "Int Test",
        password: "Abcdef12",
      },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(201);
    expect(body.data.user.email).toBe("int-test@fintrack.dev");
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeUndefined();

    const cookie = res.cookies.find((c) => c.name === "refreshToken");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");

    expect(body.meta.requestId).toBeDefined();
  });

  it("returns 409 for duplicate email", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      body: {
        email: "int-test@fintrack.dev",
        name: "Int Test",
        password: "Abcdef12",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      body: {
        email: "int-test@fintrack.dev",
        name: "Int Test",
        password: "Abcdef12",
      },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("Email already registered");
  });

  it("returns 422 for invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      body: { email: "invalid", name: "", password: "123" },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /auth/login", () => {
  beforeAll(async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      body: {
        email: "int-test@fintrack.dev",
        name: "Int Test",
        password: "Abcdef12",
      },
    });
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  it("returns 200 with tokens for valid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      body: { email: "int-test@fintrack.dev", password: "Abcdef12" },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.user.email).toBe("int-test@fintrack.dev");
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeUndefined();

    const cookie = res.cookies.find((c) => c.name === "refreshToken");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);

    expect(body.meta.requestId).toBeDefined();
  });

  it("returns 401 for wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      body: { email: "int-test@fintrack.dev", password: "wrong-password" },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Invalid email or password");
  });

  it("returns 401 for non-existent email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      body: { email: "no-exist@fintrack.dev", password: "Abcdef12" },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Invalid email or password");
  });
});

describe("POST /auth/refresh", () => {
  let refreshToken: string;
  let accessToken: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      body: {
        email: "int-test@fintrack.dev",
        name: "Int Test",
        password: "Abcdef12",
      },
    });
    const body = JSON.parse(res.body);
    accessToken = body.data.accessToken;

    const cookie = res.cookies.find((c) => c.name === "refreshToken");
    refreshToken = cookie!.value;
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  it("returns 200 with rotated tokens", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refreshToken },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeUndefined();

    const cookie = res.cookies.find((c) => c.name === "refreshToken");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeDefined();
    expect(cookie?.value).not.toBe(refreshToken);

    refreshToken = cookie!.value;
  });

  it("returns 401 when refresh token cookie is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Refresh token not found");
  });

  it("returns 401 when the cookie holds a non-refresh token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refreshToken: accessToken },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Invalid refresh token");
  });

  it("returns 401 when refresh token was already revoked", async () => {
    const logoutRes = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { refreshToken },
    });

    expect(logoutRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refreshToken },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Invalid or expired refresh token");
  });
});

describe("POST /auth/logout", () => {
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      body: {
        email: "int-test@fintrack.dev",
        name: "Int Test",
        password: "Abcdef12",
      },
    });
    const body = JSON.parse(res.body);
    accessToken = body.data.accessToken;

    const cookie = res.cookies.find((c) => c.name === "refreshToken");
    refreshToken = cookie!.value;
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  it("returns 200 with valid access token + refresh token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { refreshToken },
    });

    expect(res.statusCode).toBe(200);

    const cookie = res.cookies.find((c) => c.name === "refreshToken");
    expect(cookie?.value).toBe("");
  });

  it("returns 401 without access token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { refreshToken },
    });

    expect(res.statusCode).toBe(401);
  });
});
