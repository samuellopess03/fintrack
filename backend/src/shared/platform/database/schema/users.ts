import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "@/shared/platform/database/schema/accounts";
import { categories } from "@/shared/platform/database/schema/categories";
import { transactions } from "@/shared/platform/database/schema/transactions";
import { categorizationRules } from "@/shared/platform/database/schema/rules";
import { importJobs } from "@/shared/platform/database/schema/imports";
import { refreshTokens } from "@/shared/platform/database/schema/refresh-tokens";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
  categorizationRules: many(categorizationRules),
  importJobs: many(importJobs),
  refreshTokens: many(refreshTokens),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

