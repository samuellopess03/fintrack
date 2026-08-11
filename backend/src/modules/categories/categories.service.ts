import * as repository from "@/modules/categories/categories.repository";
import { NotFoundError, ForbiddenError } from "@/shared/core/errors";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateBudgetGoalInput,
} from "@/modules/categories/categories.schema";
import type { CategoryWithGoal } from "@/modules/categories/categories.types";

export async function createCategory(
  userId: string,
  data: CreateCategoryInput,
): Promise<CategoryWithGoal> {
  const category = await repository.createCategory({
    userId,
    name: data.name,
    color: data.color,
    icon: data.icon,
  });

  return category!;
}

export async function listCategories(userId: string) {
  return repository.findCategoriesByUserId(userId);
}

export async function getCategoryById(userId: string, categoryId: string) {
  const category = await repository.findCategoryById(userId, categoryId);

  if (!category) {
    throw new NotFoundError("Category");
  }

  return category;
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  data: UpdateCategoryInput,
) {
  const existing = await repository.findCategoryById(userId, categoryId);

  if (!existing) {
    throw new NotFoundError("Category");
  }

  if (existing.isDefault) {
    throw new ForbiddenError("Default categories cannot be modified");
  }

  const updated = await repository.updateCategory(userId, categoryId, data);

  if (!updated) {
    throw new NotFoundError("Category");
  }

  return updated;
}

export async function deleteCategory(userId: string, categoryId: string) {
  const existing = await repository.findCategoryById(userId, categoryId);

  if (!existing) {
    throw new NotFoundError("Category");
  }

  if (existing.isDefault) {
    throw new ForbiddenError("Default categories cannot be deleted");
  }

  const deleted = await repository.deleteCategory(userId, categoryId);

  if (!deleted) {
    throw new NotFoundError("Category");
  }

  return deleted;
}

export async function upsertBudgetGoal(
  userId: string,
  categoryId: string,
  data: CreateBudgetGoalInput,
) {
  const category = await repository.findCategoryById(userId, categoryId);

  if (!category) {
    throw new NotFoundError("Category");
  }

  const goal = await repository.upsertBudgetGoal({
    userId,
    categoryId,
    amount: data.amount,
    period: data.period,
  });

  return goal!;
}

export async function deleteBudgetGoal(userId: string, categoryId: string) {
  const category = await repository.findCategoryById(userId, categoryId);

  if (!category) {
    throw new NotFoundError("Category");
  }

  const deleted = await repository.deleteBudgetGoal(userId, categoryId);

  if (!deleted) {
    throw new NotFoundError("Budget goal");
  }

  return deleted;
}

export async function getBudgetGoal(userId: string, categoryId: string) {
  const category = await repository.findCategoryById(userId, categoryId);

  if (!category) {
    throw new NotFoundError("Category");
  }

  const goal = await repository.findBudgetGoalByCategoryId(
    userId,
    categoryId,
  );

  if (!goal) {
    throw new NotFoundError("Budget goal");
  }

  return goal;
}
