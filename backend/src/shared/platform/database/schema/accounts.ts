import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "@/shared/platform/database/schema/users";
import { transactions } from "@/shared/platform/database/schema/transactions";
import type { AccountType } from "@/shared/platform/database/enums";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<AccountType>().notNull(),
    currency: text("currency").notNull().default("BRL"),
    color: text("color").notNull().default("#6366F1"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_accounts_user_id").on(table.userId),
    check(
      "accounts_type_check",
      sql`${table.type} IN ('checking', 'savings', 'wallet', 'credit_card')`,
    ),
  ],
);

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

