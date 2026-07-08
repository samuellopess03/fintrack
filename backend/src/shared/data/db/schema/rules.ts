import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "@/shared/data/db/schema/users";
import { categories } from "@/shared/data/db/schema/categories";
import type { RuleType } from "@/shared/data/db/enums";

export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").$type<RuleType>().notNull(),
    value: jsonb("value").notNull(),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_rules_user_id").on(table.userId),
    index("idx_rules_priority")
      .on(table.userId, table.priority)
      .where(sql`is_active = true`),
    check(
      "rules_rule_type_check",
      sql`${table.ruleType} IN ('description_contains', 'amount_range', 'description_regex')`,
    ),
  ],
);

export const categorizationRulesRelations = relations(
  categorizationRules,
  ({ one }) => ({
    user: one(users, {
      fields: [categorizationRules.userId],
      references: [users.id],
    }),
    category: one(categories, {
      fields: [categorizationRules.categoryId],
      references: [categories.id],
    }),
  }),
);

export type CategorizationRule = typeof categorizationRules.$inferSelect;
export type NewCategorizationRule = typeof categorizationRules.$inferInsert;
