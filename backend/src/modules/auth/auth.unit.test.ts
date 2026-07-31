import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import bcrypt from "bcryptjs";
import { registerSchema, loginSchema } from "@/modules/auth/auth.schema";
import {
  registerUser,
  loginUser,
  logoutUser,
  storeRefreshToken,
  rotateRefreshToken,
} from "@/modules/auth/auth.service";
import * as repository from "@/modules/auth/auth.repository";
import { ConflictError, UnauthorizedError } from "@/shared/core/errors";

jest.mock("./auth.repository");
jest.mock("bcryptjs");
jest.mock("@/modules/categories/categories.repository", () => ({
  seedDefaultCategories: jest.fn<any>().mockResolvedValue(undefined),
}));

describe("AuthModule", () => {
  // ---------------------------------------------------------------------------
  // Schemas
  // ---------------------------------------------------------------------------

  describe("Schemas", () => {
    describe("registerSchema", () => {
      const validPayload = {
        email: "user@example.com",
        name: "John",
        password: "Abcdef12",
      };

      it("accepts a valid payload", () => {
        const result = registerSchema.safeParse(validPayload);

        expect(result.success).toBe(true);
      });

      it("rejects invalid email without @", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          email: "userexample.com",
        });

        expect(result.success).toBe(false);
      });

      it("rejects invalid email without domain", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          email: "user@",
        });

        expect(result.success).toBe(false);
      });

      it("rejects empty name", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          name: "",
        });

        expect(result.success).toBe(false);
      });

      it("rejects password shorter than 8 characters", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          password: "Abcde12",
        });

        expect(result.success).toBe(false);
      });

      it("rejects password without uppercase letter", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          password: "abcdef12",
        });

        expect(result.success).toBe(false);
      });

      it("rejects password without number", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          password: "Abcdefgh",
        });

        expect(result.success).toBe(false);
      });

      it("rejects password longer than 128 characters", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          password: "A" + "a".repeat(127) + "1",
        });

        expect(result.success).toBe(false);
      });

      it("accepts password with exactly 8 characters", () => {
        const result = registerSchema.safeParse({
          ...validPayload,
          password: "Abcdef12",
        });

        expect(result.success).toBe(true);
      });
    });

    describe("loginSchema", () => {
      const validPayload = {
        email: "user@example.com",
        password: "12345678",
      };

      it("accepts a valid payload", () => {
        const result = loginSchema.safeParse(validPayload);

        expect(result.success).toBe(true);
      });

      it("rejects invalid email", () => {
        const result = loginSchema.safeParse({
          ...validPayload,
          email: "not-an-email",
        });

        expect(result.success).toBe(false);
      });

      it("accepts any password string (no min length)", () => {
        const result = loginSchema.safeParse({
          email: "user@example.com",
          password: "a",
        });

        expect(result.success).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Service
  // ---------------------------------------------------------------------------

  describe("Service", () => {
    const mockLog = { warn: jest.fn(), info: jest.fn(), error: jest.fn() } as any;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe("registerUser", () => {
      it("creates user when email is unique", async () => {
        (repository.findByEmail as jest.Mock<any>).mockResolvedValue(null);
        const mockUser = {
          id: "uuid",
          email: "a@b.com",
          name: "A",
          createdAt: new Date(),
        };
        (repository.create as jest.Mock<any>).mockResolvedValue(mockUser);

        const result = await registerUser(
          {
            email: "a@b.com",
            name: "A",
            password: "12345678",
          },
          mockLog,
        );

        expect(result).toEqual(mockUser);
        expect(repository.findByEmail).toHaveBeenCalledWith("a@b.com");
        expect(repository.create).toHaveBeenCalledWith(
          expect.objectContaining({ email: "a@b.com" }),
        );
      });

      it("throws ConflictError when email already exists", async () => {
        (repository.findByEmail as jest.Mock<any>).mockResolvedValue({
          id: "uuid",
        });

        const promise = registerUser(
          {
            email: "a@b.com",
            name: "A",
            password: "12345678",
          },
          mockLog,
        );

        await expect(promise).rejects.toThrow(ConflictError);
        await expect(promise).rejects.toThrow("Email already registered");

        expect(repository.create).not.toHaveBeenCalled();
      });
    });

    describe("loginUser", () => {
      it("returns user when credentials are valid", async () => {
        const mockUser = {
          id: "uuid",
          email: "a@b.com",
          name: "A",
          passwordHash: "$2b$12$hash",
          createdAt: new Date(),
        };
        (repository.findByEmail as jest.Mock<any>).mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock<any>).mockResolvedValue(true);

        const result = await loginUser({
          email: "a@b.com",
          password: "12345678",
        });

        expect(result.email).toBe("a@b.com");
        expect(result).not.toHaveProperty("passwordHash");
      });

      it("throws UnauthorizedError when email not found", async () => {
        (repository.findByEmail as jest.Mock<any>).mockResolvedValue(null);

        const promise = loginUser({
          email: "notfound@b.com",
          password: "12345678",
        });

        await expect(promise).rejects.toThrow(UnauthorizedError);
        await expect(promise).rejects.toThrow("Invalid email or password");

        expect(bcrypt.compare).not.toHaveBeenCalled();
      });

      it("throws UnauthorizedError when password is wrong", async () => {
        const mockUser = {
          id: "uuid",
          email: "a@b.com",
          name: "A",
          passwordHash: "$2b$12$hash",
          createdAt: new Date(),
        };
        (repository.findByEmail as jest.Mock<any>).mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock<any>).mockResolvedValue(false);

        const promise = loginUser({ email: "a@b.com", password: "wrong" });

        await expect(promise).rejects.toThrow(UnauthorizedError);
        await expect(promise).rejects.toThrow("Invalid email or password");
      });
    });

    describe("logoutUser", () => {
      it("revokes the refresh token", async () => {
        const crypto = await import("node:crypto");
        const hash = crypto
          .createHash("sha256")
          .update("token-to-revoke")
          .digest("hex");

        await logoutUser("token-to-revoke");

        expect(repository.revokeRefreshToken).toHaveBeenCalledWith(hash);
      });
    });

    describe("storeRefreshToken", () => {
      it("stores the hashed refresh token", async () => {
        const crypto = await import("node:crypto");
        const hash = crypto
          .createHash("sha256")
          .update("raw-token")
          .digest("hex");

        await storeRefreshToken({ userId: "user-uuid", rawToken: "raw-token" });

        expect(repository.createRefreshToken).toHaveBeenCalledWith({
          userId: "user-uuid",
          tokenHash: hash,
          expiresAt: expect.any(Date),
        });
      });

      it("propagates repository errors", async () => {
        (repository.createRefreshToken as jest.Mock<any>).mockRejectedValue(
          new Error("db down"),
        );

        await expect(
          storeRefreshToken({ userId: "user-uuid", rawToken: "raw-token" }),
        ).rejects.toThrow("db down");
      });
    });

    describe("rotateRefreshToken", () => {
      it("rotates the refresh token with hashed values", async () => {
        const crypto = await import("node:crypto");
        const oldHash = crypto
          .createHash("sha256")
          .update("old-token")
          .digest("hex");
        const newHash = crypto
          .createHash("sha256")
          .update("new-token")
          .digest("hex");

        await rotateRefreshToken({
          oldRawToken: "old-token",
          userId: "user-uuid",
          newRawToken: "new-token",
        });

        expect(repository.rotateRefreshToken).toHaveBeenCalledWith({
          oldHash,
          userId: "user-uuid",
          newHash,
          expiresAt: expect.any(Date),
        });
      });

      it("propagates repository errors", async () => {
        (repository.rotateRefreshToken as jest.Mock<any>).mockRejectedValue(
          new Error("db down"),
        );

        await expect(
          rotateRefreshToken({
            oldRawToken: "old-token",
            userId: "user-uuid",
            newRawToken: "new-token",
          }),
        ).rejects.toThrow("db down");
      });
    });
  });
});
