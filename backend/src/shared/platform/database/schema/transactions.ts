import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "@/shared/platform/database/schema/users";
import { accounts } from "@/shared/platform/database/schema/accounts";
import { categories } from "@/shared/platform/database/schema/categories";
import { importJobs } from "@/shared/platform/database/schema/imports";
import type { TransactionType } from "@/shared/platform/database/enums";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    importJobId: uuid("import_job_id").references(() => importJobs.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    type: text("type").$type<TransactionType>().notNull(),
    date: date("date").notNull(),
    notes: text("notes"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_transaction_dedup")
      .on(table.accountId, table.date, table.amount, table.description)
      .nullsNotDistinct(),
    index("idx_transactions_user_id").on(table.userId),
    index("idx_transactions_account_id").on(table.accountId),
    index("idx_transactions_category_id").on(table.categoryId),
    index("idx_transactions_date").on(table.date.desc()),
    index("idx_transactions_import_job").on(table.importJobId),
    index("idx_transactions_report")
      .on(table.userId, table.date, table.categoryId)
      .where(sql`type = 'expense'`),
    check(
      "transactions_type_check",
      sql`${table.type} IN ('income', 'expense')`,
    ),
    check(
      "transactions_amount_check",
      sql`${table.amount} > 0`,
    ),
  ],
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  importJob: one(importJobs, {
    fields: [transactions.importJobId],
    references: [importJobs.id],
  }),
}));

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

