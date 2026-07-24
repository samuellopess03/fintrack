import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { NotFoundError } from "@/shared/core/errors";
import * as repository from "@/modules/accounts/accounts.repository";
import {
  createAccountSchema,
  updateAccountSchema,
  accountParamsSchema,
} from "@/modules/accounts/accounts.schema";
import {
  archiveAccount,
  createAccount,
  getAccountById,
  listAccounts,
  updateAccount,
} from "@/modules/accounts/accounts.service";

jest.mock("./accounts.repository");

describe("AccountsModule", () => {
  // ---------------------------------------------------------------------------
  // Schemas
  // ---------------------------------------------------------------------------

  describe("Schemas", () => {
    describe("createAccountSchema", () => {
      const validPayload = {
        name: "Conta principal",
        type: "checking" as const,
        currency: "USD",
        color: "#FF5733",
        initialBalance: 500,
      };

      it("accepts a valid payload with all fields", () => {
        const result = createAccountSchema.safeParse(validPayload);

        expect(result.success).toBe(true);
      });

      it("accepts payload with only required fields and applies defaults", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "savings",
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.currency).toBe("BRL");
          expect(result.data.color).toBe("#6366F1");
          expect(result.data.initialBalance).toBe(0);
        }
      });

      it("coerces string to number for initialBalance", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "wallet",
          initialBalance: "250",
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.initialBalance).toBe(250);
        }
      });

      it("rejects empty name", () => {
        const result = createAccountSchema.safeParse({
          name: "",
          type: "checking",
        });

        expect(result.success).toBe(false);
      });

      it("rejects name longer than 120 characters", () => {
        const result = createAccountSchema.safeParse({
          name: "A".repeat(121),
          type: "checking",
        });

        expect(result.success).toBe(false);
      });

      it("rejects invalid account type", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "investment",
        });

        expect(result.success).toBe(false);
      });

      it("accepts all valid account types", () => {
        const types = ["checking", "savings", "wallet", "credit_card"] as const;

        for (const type of types) {
          const result = createAccountSchema.safeParse({ name: "Conta", type });
          expect(result.success).toBe(true);
        }
      });

      it("rejects invalid hex color", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "checking",
          color: "red",
        });

        expect(result.success).toBe(false);
      });

      it("rejects hex color without # prefix", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "checking",
          color: "FF5733",
        });

        expect(result.success).toBe(false);
      });

      it("rejects hex color with wrong length", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "checking",
          color: "#FFF",
        });

        expect(result.success).toBe(false);
      });

      it("rejects negative initialBalance", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "checking",
          initialBalance: -10,
        });

        expect(result.success).toBe(false);
      });

      it("accepts zero as initialBalance", () => {
        const result = createAccountSchema.safeParse({
          name: "Conta",
          type: "checking",
          initialBalance: 0,
        });

        expect(result.success).toBe(true);
      });
    });

    describe("updateAccountSchema", () => {
      it("accepts partial update with name only", () => {
        const result = updateAccountSchema.safeParse({ name: "Novo nome" });

        expect(result.success).toBe(true);
      });

      it("accepts partial update with type only", () => {
        const result = updateAccountSchema.safeParse({ type: "savings" });

        expect(result.success).toBe(true);
      });

      it("accepts update with all fields", () => {
        const result = updateAccountSchema.safeParse({
          name: "Conta atualizada",
          type: "wallet",
          currency: "EUR",
          color: "#10B981",
        });

        expect(result.success).toBe(true);
      });

      it("rejects empty object", () => {
        const result = updateAccountSchema.safeParse({});

        expect(result.success).toBe(false);
      });

      it("rejects invalid type", () => {
        const result = updateAccountSchema.safeParse({ type: "invalid" });

        expect(result.success).toBe(false);
      });

      it("rejects invalid color", () => {
        const result = updateAccountSchema.safeParse({ color: "not-hex" });

        expect(result.success).toBe(false);
      });

      it("rejects name longer than 120 characters", () => {
        const result = updateAccountSchema.safeParse({ name: "A".repeat(121) });

        expect(result.success).toBe(false);
      });
    });

    describe("accountParamsSchema", () => {
      it("accepts a valid UUID", () => {
        const result = accountParamsSchema.safeParse({
          id: "018f3a2b-4c5d-6e7f-8a9b-0c1d2e3f4a5b",
        });

        expect(result.success).toBe(true);
      });

      it("rejects a non-UUID string", () => {
        const result = accountParamsSchema.safeParse({ id: "not-a-uuid" });

        expect(result.success).toBe(false);
      });

      it("rejects an empty string", () => {
        const result = accountParamsSchema.safeParse({ id: "" });

        expect(result.success).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Service
  // ---------------------------------------------------------------------------

  describe("Service", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    const mockAccount = {
      id: "acc-uuid",
      userId: "user-uuid",
      name: "Conta principal",
      type: "checking",
      currency: "BRL",
      color: "#6366F1",
      isArchived: false,
      balance: "0",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe("createAccount", () => {
      it("creates an account through the repository", async () => {
        (repository.createAccount as jest.Mock<any>).mockResolvedValue({
          ...mockAccount,
          balance: "100.00",
        });

        const result = await createAccount("user-uuid", {
          name: "Conta principal",
          type: "checking",
          currency: "BRL",
          color: "#6366F1",
          initialBalance: 100,
        });

        expect(result).toEqual(expect.objectContaining({ id: "acc-uuid" }));
        expect(repository.createAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user-uuid",
            name: "Conta principal",
            initialBalance: 100,
          }),
        );
      });
    });

    describe("listAccounts", () => {
      it("returns accounts for a user", async () => {
        (repository.findAccountsByUserId as jest.Mock<any>).mockResolvedValue([
          mockAccount,
        ]);

        const result = await listAccounts("user-uuid");

        expect(result).toHaveLength(1);
        expect(repository.findAccountsByUserId).toHaveBeenCalledWith(
          "user-uuid",
        );
      });

      it("returns empty array when user has no accounts", async () => {
        (repository.findAccountsByUserId as jest.Mock<any>).mockResolvedValue(
          [],
        );

        const result = await listAccounts("user-uuid");

        expect(result).toEqual([]);
      });
    });

    describe("getAccountById", () => {
      it("returns account when found", async () => {
        (repository.findAccountById as jest.Mock<any>).mockResolvedValue(
          mockAccount,
        );

        const result = await getAccountById("user-uuid", "acc-uuid");

        expect(result).toEqual(mockAccount);
      });

      it("throws NotFoundError when account does not exist", async () => {
        (repository.findAccountById as jest.Mock<any>).mockResolvedValue(null);

        await expect(getAccountById("user-uuid", "missing")).rejects.toThrow(
          NotFoundError,
        );
      });
    });

    describe("updateAccount", () => {
      it("updates and returns the account", async () => {
        const updated = { ...mockAccount, name: "Conta nova", type: "savings" };
        (repository.updateAccount as jest.Mock<any>).mockResolvedValue(updated);

        const result = await updateAccount("user-uuid", "acc-uuid", {
          name: "Conta nova",
          type: "savings",
        });

        expect(result).toEqual(updated);
        expect(repository.updateAccount).toHaveBeenCalledWith(
          "user-uuid",
          "acc-uuid",
          {
            name: "Conta nova",
            type: "savings",
          },
        );
      });

      it("throws NotFoundError when account does not exist", async () => {
        (repository.updateAccount as jest.Mock<any>).mockResolvedValue(null);

        await expect(
          updateAccount("user-uuid", "missing", { name: "X" }),
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe("archiveAccount", () => {
      it("archives and returns the account", async () => {
        const archived = { ...mockAccount, isArchived: true };
        (repository.archiveAccount as jest.Mock<any>).mockResolvedValue(
          archived,
        );

        const result = await archiveAccount("user-uuid", "acc-uuid");

        expect(result).toEqual(archived);
        expect(repository.archiveAccount).toHaveBeenCalledWith(
          "user-uuid",
          "acc-uuid",
        );
      });

      it("throws NotFoundError when account does not exist", async () => {
        (repository.archiveAccount as jest.Mock<any>).mockResolvedValue(null);

        await expect(archiveAccount("user-uuid", "missing")).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });
});
