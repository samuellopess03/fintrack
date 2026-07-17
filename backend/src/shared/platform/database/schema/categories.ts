import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "@/shared/platform/database/schema/users";
import { transactions } from "@/shared/platform/database/schema/transactions";
import type { BudgetPeriod } from "@/shared/platform/database/enums";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#94A3B8"),
    icon: text("icon"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_categories_user_id").on(table.userId)],
);

export const budgetGoals = pgTable(
  "budget_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    period: text("period").$type<BudgetPeriod>().notNull().default("monthly"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("budget_goals_user_id_category_id_unique").on(
      table.userId,
      table.categoryId,
    ),
    check("budget_goals_amount_check", sql`${table.amount} > 0`),
  ],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  transactions: many(transactions),
  budgetGoal: one(budgetGoals, {
    fields: [categories.id],
    references: [budgetGoals.categoryId],
  }),
}));

export const budgetGoalsRelations = relations(budgetGoals, ({ one }) => ({
  user: one(users, { fields: [budgetGoals.userId], references: [users.id] }),
  category: one(categories, {
    fields: [budgetGoals.categoryId],
    references: [categories.id],
  }),
}));

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type BudgetGoal = typeof budgetGoals.$inferSelect;
export type NewBudgetGoal = typeof budgetGoals.$inferInsert;

