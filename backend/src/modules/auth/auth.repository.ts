import { eq, and, isNull, gt } from "drizzle-orm";
import { db, type DbClient } from "@/shared/platform/database/client";
import { users } from "@/shared/platform/database/schema/users";
import { refreshTokens } from "@/shared/platform/database/schema/refresh-tokens";
import { UnauthorizedError } from "@/shared/core/errors";

// ── Internals (accept tx for transaction reuse) ──

async function _findByEmail(email: string, tx?: DbClient) {
  const client = tx ?? db;
  const [user] = await client
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

async function _create(
  data: {
    email: string;
    name: string;
    passwordHash: string;
  },
  tx?: DbClient,
) {
  const client = tx ?? db;
  const [user] = await client.insert(users).values(data).returning({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
  });
  if (!user) {
    throw new Error("Failed to create user");
  }
  return user;
}

async function _createRefreshToken(
  data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  },
  tx?: DbClient,
) {
  const client = tx ?? db;
  await client.insert(refreshTokens).values(data);
}

async function _findValidRefreshToken(tokenHash: string, tx?: DbClient) {
  const client = tx ?? db;
  const [token] = await client
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return token ?? null;
}

async function _revokeRefreshToken(tokenHash: string, tx?: DbClient) {
  const client = tx ?? db;
  await client
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash));
}

async function _revokeAllUserRefreshTokens(userId: string, tx?: DbClient) {
  const client = tx ?? db;
  await client
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.userId, userId));
}

// ── Public API (no tx exposure) ──

export async function findByEmail(email: string) {
  return _findByEmail(email);
}

export async function create(data: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  return _create(data);
}

export async function createRefreshToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  await _createRefreshToken(data);
}

export async function findValidRefreshToken(tokenHash: string) {
  return _findValidRefreshToken(tokenHash);
}

export async function revokeRefreshToken(tokenHash: string) {
  await _revokeRefreshToken(tokenHash);
}

export async function revokeAllUserRefreshTokens(userId: string) {
  await _revokeAllUserRefreshTokens(userId);
}

export async function rotateRefreshToken(data: {
  oldHash: string;
  userId: string;
  newHash: string;
  expiresAt: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const stored = await _findValidRefreshToken(data.oldHash, tx);
    if (!stored) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
    await _revokeRefreshToken(data.oldHash, tx);
    await _createRefreshToken(
      {
        userId: data.userId,
        tokenHash: data.newHash,
        expiresAt: data.expiresAt,
      },
      tx,
    );
  });
}
