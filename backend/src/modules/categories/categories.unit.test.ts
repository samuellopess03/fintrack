import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { NotFoundError, ForbiddenError, InfrastructureError } from "@/shared/core/errors";
import * as repository from "@/modules/categories/categories.repository";
import {
  createCategorySchema,
  updateCategorySchema,
  categoryParamsSchema,
  createBudgetGoalSchema,
  updateBudgetGoalSchema,
} from "@/modules/categories/categories.schema";
import {
  createCategory,
  listCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  upsertBudgetGoal,
  deleteBudgetGoal,
  getBudgetGoal,
} from "@/modules/categories/categories.service";

jest.mock("./categories.repository");

describe("CategoriesModule", () => {
  // ---------------------------------------------------------------------------
  // Schemas
  // ---------------------------------------------------------------------------

  describe("Schemas", () => {
    describe("createCategorySchema", () => {
      const validPayload = {
        name: "Alimentação",
        color: "#EF4444",
        icon: "utensils",
      };

      it("accepts a valid payload with all fields", () => {
        const result = createCategorySchema.safeParse(validPayload);

        expect(result.success).toBe(true);
      });

      it("accepts payload with only required fields and applies defaults", () => {
        const result = createCategorySchema.safeParse({ name: "Saúde" });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.color).toBe("#94A3B8");
        }
      });

      it("accepts null icon", () => {
        const result = createCategorySchema.safeParse({
          name: "Test",
          icon: null,
        });

        expect(result.success).toBe(true);
      });

      it("rejects empty name", () => {
        const result = createCategorySchema.safeParse({ name: "" });

        expect(result.success).toBe(false);
      });

      it("rejects name longer than 80 characters", () => {
        const result = createCategorySchema.safeParse({
          name: "A".repeat(81),
        });

        expect(result.success).toBe(false);
      });

      it("rejects invalid hex color", () => {
        const result = createCategorySchema.safeParse({
          name: "Test",
          color: "red",
        });

        expect(result.success).toBe(false);
      });

      it("rejects hex color without # prefix", () => {
        const result = createCategorySchema.safeParse({
          name: "Test",
          color: "FF5733",
        });

        expect(result.success).toBe(false);
      });

      it("rejects hex color with wrong length", () => {
        const result = createCategorySchema.safeParse({
          name: "Test",
          color: "#FFF",
        });

        expect(result.success).toBe(false);
      });
    });

    describe("updateCategorySchema", () => {
      it("accepts partial update with name only", () => {
        const result = updateCategorySchema.safeParse({ name: "Novo nome" });

        expect(result.success).toBe(true);
      });

      it("accepts partial update with color only", () => {
        const result = updateCategorySchema.safeParse({ color: "#10B981" });

        expect(result.success).toBe(true);
      });

      it("accepts update with all fields", () => {
        const result = updateCategorySchema.safeParse({
          name: "Atualizada",
          color: "#10B981",
          icon: "heart",
        });

        expect(result.success).toBe(true);
      });

      it("rejects empty object", () => {
        const result = updateCategorySchema.safeParse({});

        expect(result.success).toBe(false);
      });

      it("rejects invalid color", () => {
        const result = updateCategorySchema.safeParse({ color: "not-hex" });

        expect(result.success).toBe(false);
      });

      it("rejects name longer than 80 characters", () => {
        const result = updateCategorySchema.safeParse({ name: "A".repeat(81) });

        expect(result.success).toBe(false);
      });
    });

    describe("categoryParamsSchema", () => {
      it("accepts a valid UUID", () => {
        const result = categoryParamsSchema.safeParse({
          id: "018f3a2b-4c5d-6e7f-8a9b-0c1d2e3f4a5b",
        });

        expect(result.success).toBe(true);
      });

      it("rejects a non-UUID string", () => {
        const result = categoryParamsSchema.safeParse({ id: "not-a-uuid" });

        expect(result.success).toBe(false);
      });

      it("rejects an empty string", () => {
        const result = categoryParamsSchema.safeParse({ id: "" });

        expect(result.success).toBe(false);
      });
    });

    describe("createBudgetGoalSchema", () => {
      it("accepts a valid payload", () => {
        const result = createBudgetGoalSchema.safeParse({ amount: 500 });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe("monthly");
        }
      });

      it("coerces string to number for amount", () => {
        const result = createBudgetGoalSchema.safeParse({ amount: "300" });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.amount).toBe(300);
        }
      });

      it("rejects zero amount", () => {
        const result = createBudgetGoalSchema.safeParse({ amount: 0 });

        expect(result.success).toBe(false);
      });

      it("rejects negative amount", () => {
        const result = createBudgetGoalSchema.safeParse({ amount: -100 });

        expect(result.success).toBe(false);
      });

      it("rejects invalid period", () => {
        const result = createBudgetGoalSchema.safeParse({
          amount: 100,
          period: "weekly",
        });

        expect(result.success).toBe(false);
      });
    });

    describe("updateBudgetGoalSchema", () => {
      it("accepts partial update with amount only", () => {
        const result = updateBudgetGoalSchema.safeParse({ amount: 600 });

        expect(result.success).toBe(true);
      });

      it("rejects empty object", () => {
        const result = updateBudgetGoalSchema.safeParse({});

        expect(result.success).toBe(false);
      });

      it("rejects negative amount", () => {
        const result = updateBudgetGoalSchema.safeParse({ amount: -50 });

        expect(result.success).toBe(false);
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

    const mockCategory = {
      id: "cat-uuid",
      userId: "user-uuid",
      name: "Alimentação",
      color: "#EF4444",
      icon: "utensils",
      isDefault: false,
      createdAt: new Date(),
      budgetGoal: null,
    };

    const mockDefaultCategory = {
      ...mockCategory,
      id: "default-cat-uuid",
      name: "Não categorizado",
      isDefault: true,
    };

    const mockGoal = {
      id: "goal-uuid",
      userId: "user-uuid",
      categoryId: "cat-uuid",
      amount: "500.00",
      period: "monthly",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    describe("createCategory", () => {
      it("creates a category through the repository", async () => {
        (repository.createCategory as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );

        const result = await createCategory(
          "user-uuid",
          {
            name: "Alimentação",
            color: "#EF4444",
            icon: "utensils",
          },
          mockLog,
        );

        expect(result).toEqual(mockCategory);
        expect(repository.createCategory).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user-uuid",
            name: "Alimentação",
            color: "#EF4444",
          }),
        );
      });

      it("logs and propagates InfrastructureError from the repository", async () => {
        (repository.createCategory as jest.Mock<any>).mockRejectedValue(
          new InfrastructureError("categories"),
        );

        await expect(
          createCategory(
            "user-uuid",
            {
              name: "Alimentação",
              color: "#EF4444",
              icon: "utensils",
            },
            mockLog,
          ),
        ).rejects.toThrow(InfrastructureError);

        expect(mockLog.error).toHaveBeenCalledWith(
          { userId: "user-uuid" },
          "Failed to create category",
        );
      });

      it("logs and throws InfrastructureError when repository returns null", async () => {
        (repository.createCategory as jest.Mock<any>).mockResolvedValue(null);

        await expect(
          createCategory(
            "user-uuid",
            {
              name: "Alimentação",
              color: "#EF4444",
              icon: "utensils",
            },
            mockLog,
          ),
        ).rejects.toThrow(InfrastructureError);

        expect(mockLog.error).toHaveBeenCalledWith(
          { userId: "user-uuid" },
          "Failed to create category",
        );
      });
    });

    describe("listCategories", () => {
      it("returns categories for a user", async () => {
        (repository.findCategoriesByUserId as jest.Mock<any>).mockResolvedValue(
          [mockCategory],
        );

        const result = await listCategories("user-uuid");

        expect(result).toHaveLength(1);
        expect(repository.findCategoriesByUserId).toHaveBeenCalledWith(
          "user-uuid",
        );
      });

      it("returns empty array when user has no categories", async () => {
        (repository.findCategoriesByUserId as jest.Mock<any>).mockResolvedValue(
          [],
        );

        const result = await listCategories("user-uuid");

        expect(result).toEqual([]);
      });
    });

    describe("getCategoryById", () => {
      it("returns category when found", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );

        const result = await getCategoryById("user-uuid", "cat-uuid");

        expect(result).toEqual(mockCategory);
      });

      it("throws NotFoundError when category does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(null);

        await expect(getCategoryById("user-uuid", "missing")).rejects.toThrow(
          NotFoundError,
        );
      });
    });

    describe("updateCategory", () => {
      it("updates and returns the category", async () => {
        const updated = { ...mockCategory, name: "Saúde" };
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (repository.updateCategory as jest.Mock<any>).mockResolvedValue(
          updated,
        );

        const result = await updateCategory("user-uuid", "cat-uuid", {
          name: "Saúde",
        });

        expect(result).toEqual(updated);
        expect(repository.updateCategory).toHaveBeenCalledWith(
          "user-uuid",
          "cat-uuid",
          { name: "Saúde" },
        );
      });

      it("throws NotFoundError when category does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(null);

        await expect(
          updateCategory("user-uuid", "missing", { name: "X" }),
        ).rejects.toThrow(NotFoundError);
      });

      it("throws ForbiddenError when trying to update default category", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockDefaultCategory,
        );

        await expect(
          updateCategory("user-uuid", "default-cat-uuid", { name: "X" }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe("deleteCategory", () => {
      it("deletes and returns the category", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (repository.deleteCategory as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );

        const result = await deleteCategory("user-uuid", "cat-uuid");

        expect(result).toEqual(mockCategory);
        expect(repository.deleteCategory).toHaveBeenCalledWith(
          "user-uuid",
          "cat-uuid",
        );
      });

      it("throws NotFoundError when category does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(null);

        await expect(deleteCategory("user-uuid", "missing")).rejects.toThrow(
          NotFoundError,
        );
      });

      it("throws ForbiddenError when trying to delete default category", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockDefaultCategory,
        );

        await expect(
          deleteCategory("user-uuid", "default-cat-uuid"),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe("upsertBudgetGoal", () => {
      it("creates a budget goal", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (repository.upsertBudgetGoal as jest.Mock<any>).mockResolvedValue(
          mockGoal,
        );

        const result = await upsertBudgetGoal(
          "user-uuid",
          "cat-uuid",
          {
            amount: 500,
            period: "monthly",
          },
          mockLog,
        );

        expect(result).toEqual(mockGoal);
        expect(repository.upsertBudgetGoal).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user-uuid",
            categoryId: "cat-uuid",
            amount: 500,
            period: "monthly",
          }),
        );
      });

      it("logs and throws InfrastructureError when repository returns null", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (repository.upsertBudgetGoal as jest.Mock<any>).mockResolvedValue(null);

        await expect(
          upsertBudgetGoal(
            "user-uuid",
            "cat-uuid",
            {
              amount: 500,
              period: "monthly",
            },
            mockLog,
          ),
        ).rejects.toThrow(InfrastructureError);

        expect(mockLog.error).toHaveBeenCalledWith(
          { userId: "user-uuid", categoryId: "cat-uuid" },
          "Failed to upsert budget goal",
        );
      });

      it("throws NotFoundError when category does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(null);

        await expect(
          upsertBudgetGoal(
            "user-uuid",
            "missing",
            {
              amount: 500,
              period: "monthly",
            },
            mockLog,
          ),
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe("deleteBudgetGoal", () => {
      it("deletes and returns the goal", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (repository.deleteBudgetGoal as jest.Mock<any>).mockResolvedValue(
          mockGoal,
        );

        const result = await deleteBudgetGoal("user-uuid", "cat-uuid");

        expect(result).toEqual(mockGoal);
        expect(repository.deleteBudgetGoal).toHaveBeenCalledWith(
          "user-uuid",
          "cat-uuid",
        );
      });

      it("throws NotFoundError when category does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(null);

        await expect(deleteBudgetGoal("user-uuid", "missing")).rejects.toThrow(
          NotFoundError,
        );
      });

      it("throws NotFoundError when goal does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (repository.deleteBudgetGoal as jest.Mock<any>).mockResolvedValue(null);

        await expect(deleteBudgetGoal("user-uuid", "cat-uuid")).rejects.toThrow(
          NotFoundError,
        );
      });
    });

    describe("getBudgetGoal", () => {
      it("returns the goal when found", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (
          repository.findBudgetGoalByCategoryId as jest.Mock<any>
        ).mockResolvedValue(mockGoal);

        const result = await getBudgetGoal("user-uuid", "cat-uuid");

        expect(result).toEqual(mockGoal);
      });

      it("throws NotFoundError when category does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(null);

        await expect(getBudgetGoal("user-uuid", "missing")).rejects.toThrow(
          NotFoundError,
        );
      });

      it("throws NotFoundError when goal does not exist", async () => {
        (repository.findCategoryById as jest.Mock<any>).mockResolvedValue(
          mockCategory,
        );
        (
          repository.findBudgetGoalByCategoryId as jest.Mock<any>
        ).mockResolvedValue(null);

        await expect(getBudgetGoal("user-uuid", "cat-uuid")).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });
});
