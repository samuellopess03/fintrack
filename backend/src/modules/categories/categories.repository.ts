import { and, eq } from "drizzle-orm";
import { db, type DbClient } from "@/shared/platform/database/client";
import { InfrastructureError } from "@/shared/core/errors";
import {
  categories,
  type Category,
} from "@/shared/platform/database/schema/categories";
import {
  budgetGoals,
  type BudgetGoal,
} from "@/shared/platform/database/schema/categories";
import { DEFAULT_CATEGORIES } from "@/shared/platform/database/defaults";

export type CategoryWithGoal = Category & {
  budgetGoal: BudgetGoal | null;
};

export type CreateCategoryData = {
  userId: string;
  name: string;
  color: string;
  icon?: string | null;
};

export type UpdateCategoryData = {
  name?: string;
  color?: string;
  icon?: string | null;
};

import type { BudgetPeriod } from "@/shared/platform/database/enums";

export type CreateBudgetGoalData = {
  userId: string;
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
};

export type UpdateBudgetGoalData = {
  amount?: number;
  period?: BudgetPeriod;
};

function getClient(tx?: DbClient) {
  return tx ?? db;
}

async function selectCategoryWithGoal(
  userId: string,
  categoryId: string,
  options?: { tx?: DbClient },
): Promise<CategoryWithGoal | null> {
  const client = getClient(options?.tx);

  const [category] = await client
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);

  if (!category) return null;

  const [goal] = await client
    .select()
    .from(budgetGoals)
    .where(eq(budgetGoals.categoryId, categoryId))
    .limit(1);

  return { ...category, budgetGoal: goal ?? null };
}

export async function createCategory(data: CreateCategoryData) {
  const [created] = await db
    .insert(categories)
    .values({
      userId: data.userId,
      name: data.name,
      color: data.color,
      icon: data.icon ?? null,
    })
    .returning();

  if (!created) {
    throw new InfrastructureError("categories");
  }

  return selectCategoryWithGoal(data.userId, created.id);
}

export async function findCategoriesByUserId(userId: string) {
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryIds = userCategories.map((c) => c.id);
  if (categoryIds.length === 0) return [];

  const goals = await db
    .select()
    .from(budgetGoals)
    .where(
      eq(budgetGoals.userId, userId),
    );

  const goalMap = new Map(goals.map((g) => [g.categoryId, g]));

  return userCategories.map((cat) => ({
    ...cat,
    budgetGoal: goalMap.get(cat.id) ?? null,
  }));
}

export async function findCategoryById(
  userId: string,
  categoryId: string,
) {
  return selectCategoryWithGoal(userId, categoryId);
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  data: UpdateCategoryData,
) {
  const [updated] = await db
    .update(categories)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning();

  if (!updated) return null;

  return selectCategoryWithGoal(userId, categoryId);
}

export async function deleteCategory(userId: string, categoryId: string) {
  const [deleted] = await db
    .delete(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning();

  return deleted ?? null;
}

export async function upsertBudgetGoal(data: CreateBudgetGoalData) {
  const [goal] = await db
    .insert(budgetGoals)
    .values({
      userId: data.userId,
      categoryId: data.categoryId,
      amount: data.amount.toFixed(2),
      period: data.period,
    })
    .onConflictDoUpdate({
      target: [budgetGoals.userId, budgetGoals.categoryId],
      set: {
        amount: data.amount.toFixed(2),
        period: data.period,
        updatedAt: new Date(),
      },
    })
    .returning();

  return goal ?? null;
}

export async function deleteBudgetGoal(
  userId: string,
  categoryId: string,
) {
  const [deleted] = await db
    .delete(budgetGoals)
    .where(
      and(
        eq(budgetGoals.userId, userId),
        eq(budgetGoals.categoryId, categoryId),
      ),
    )
    .returning();

  return deleted ?? null;
}

export async function findBudgetGoalByCategoryId(
  userId: string,
  categoryId: string,
) {
  const [goal] = await db
    .select()
    .from(budgetGoals)
    .where(
      and(
        eq(budgetGoals.userId, userId),
        eq(budgetGoals.categoryId, categoryId),
      ),
    )
    .limit(1);

  return goal ?? null;
}

export async function seedDefaultCategories(userId: string) {
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((cat) => ({
        userId,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        isDefault: true,
      })),
    )
    .onConflictDoNothing();
}
