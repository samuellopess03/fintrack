import type { User } from "@/shared/platform/database/schema/users";

export type AuthResult = Pick<User, "id" | "email" | "name" | "createdAt">;

export type CreateUserData = {
  email: string;
  name: string;
  passwordHash: string;
};

export type CreateRefreshTokenData = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type RotateRefreshTokenData = {
  oldHash: string;
  userId: string;
  newHash: string;
  expiresAt: Date;
};
