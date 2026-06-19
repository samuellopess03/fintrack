import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import * as repository from "@/modules/auth/auth.repository";
import { ConflictError, UnauthorizedError } from "@/shared/errors";

export type AuthResult = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerUser(data: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthResult> {
  const existing = await repository.findByEmail(data.email);
  if (existing) {
    throw new ConflictError("Email already registered");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await repository.create({
    email: data.email,
    name: data.name,
    passwordHash,
  });

  return user;
}

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const user = await repository.findByEmail(data.email);

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

export async function storeRefreshToken(data: {
  userId: string;
  rawToken: string;
}): Promise<void> {
  const tokenHash = hashToken(data.rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await repository.createRefreshToken({
    userId: data.userId,
    tokenHash,
    expiresAt,
  });
}

export async function rotateRefreshToken(data: {
  oldRawToken: string;
  userId: string;
  newRawToken: string;
}): Promise<void> {
  const oldHash = hashToken(data.oldRawToken);
  const newHash = hashToken(data.newRawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await repository.rotateRefreshToken({
    oldHash,
    userId: data.userId,
    newHash,
    expiresAt,
  });
}

export async function logoutUser(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await repository.revokeRefreshToken(tokenHash);
}
