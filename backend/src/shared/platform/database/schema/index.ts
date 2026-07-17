export { users, usersRelations } from "@/shared/platform/database/schema/users";
export { accounts, accountsRelations } from "@/shared/platform/database/schema/accounts";
export {
  categories,
  categoriesRelations,
  budgetGoals,
  budgetGoalsRelations,
} from "@/shared/platform/database/schema/categories";
export { transactions, transactionsRelations } from "@/shared/platform/database/schema/transactions";
export { categorizationRules, categorizationRulesRelations } from "@/shared/platform/database/schema/rules";
export { importJobs, importJobsRelations } from "@/shared/platform/database/schema/imports";
export { refreshTokens, refreshTokensRelations } from "@/shared/platform/database/schema/refresh-tokens";

export type { User } from "@/shared/platform/database/schema/users";
export type { Account } from "@/shared/platform/database/schema/accounts";
export type { Category, BudgetGoal } from "@/shared/platform/database/schema/categories";
export type { Transaction } from "@/shared/platform/database/schema/transactions";
export type { CategorizationRule } from "@/shared/platform/database/schema/rules";
export type { ImportJob } from "@/shared/platform/database/schema/imports";
export type { RefreshToken, NewRefreshToken } from "@/shared/platform/database/schema/refresh-tokens";
