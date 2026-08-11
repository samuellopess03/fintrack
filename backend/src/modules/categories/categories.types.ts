import type {
  Category,
  BudgetGoal,
} from "@/shared/platform/database/schema/categories";
import type {
  CreateCategoryInput,
  CreateBudgetGoalInput,
} from "@/modules/categories/categories.schema";

export type CategoryWithGoal = Category & {
  budgetGoal: BudgetGoal | null;
};

export type CreateCategoryData = CreateCategoryInput & {
  userId: string;
};

export type CreateBudgetGoalData = CreateBudgetGoalInput & {
  userId: string;
  categoryId: string;
};
