import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "@/shared/data/db/schema/users";
import { accounts } from "@/shared/data/db/schema/accounts";
import { transactions } from "@/shared/data/db/schema/transactions";
import type { ImportStatus, FileFormat } from "@/shared/data/db/enums";

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    status: text("status").$type<ImportStatus>().notNull().default("pending"),
    fileFormat: text("file_format").$type<FileFormat>().notNull(),
    filePath: text("file_path").notNull(),
    fileName: text("file_name").notNull(),
    totalRows: integer("total_rows"),
    importedCount: integer("imported_count"),
    skippedCount: integer("skipped_count"),
    failedCount: integer("failed_count"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_import_jobs_user_id").on(table.userId),
    index("idx_import_jobs_status")
      .on(table.status)
      .where(sql`status IN ('pending', 'processing')`),
    check(
      "import_jobs_status_check",
      sql`${table.status} IN ('pending', 'processing', 'done', 'failed')`,
    ),
    check(
      "import_jobs_file_format_check",
      sql`${table.fileFormat} IN ('csv', 'ofx')`,
    ),
  ],
);

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  user: one(users, { fields: [importJobs.userId], references: [users.id] }),
  account: one(accounts, {
    fields: [importJobs.accountId],
    references: [accounts.id],
  }),
  transactions: many(transactions),
}));

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
