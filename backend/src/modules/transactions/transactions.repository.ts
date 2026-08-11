import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import type { AccountType } from "@/shared/platform/database/enums";
import { db } from "@/shared/platform/database/client";
import {
  transactions,
  type Transaction,
} from "@/shared/platform/database/schema/transactions";
import { categories } from "@/shared/platform/database/schema/categories";
import { accounts } from "@/shared/platform/database/schema/accounts";
import type {
  TransactionCategory,
  TransactionAccount,
  TransactionWithRelations,
  PaginatedTransactions,
  CreateTransactionData,
} from "@/modules/transactions/transactions.types";
import type {
  UpdateTransactionInput,
  TransactionFiltersInput,
} from "@/modules/transactions/transactions.schema";

type TransactionRow = Transaction & {
  category: {
    id: string | null;
    name: string | null;
    color: string | null;
  } | null;
  account: {
    id: string | null;
    name: string | null;
    type: AccountType | null;
  } | null;
};

const transactionSelect = {
  id: transactions.id,
  userId: transactions.userId,
  accountId: transactions.accountId,
  categoryId: transactions.categoryId,
  importJobId: transactions.importJobId,
  description: transactions.description,
  amount: transactions.amount,
  type: transactions.type,
  date: transactions.date,
  notes: transactions.notes,
  externalId: transactions.externalId,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
  category: {
    id: categories.id,
    name: categories.name,
    color: categories.color,
  },
  account: {
    id: accounts.id,
    name: accounts.name,
    type: accounts.type,
  },
};

function mapTransaction(row: TransactionRow): TransactionWithRelations {
  const { category, account, ...base } = row;

  return {
    ...base,
    category: category?.id ? (category as TransactionCategory) : null,
    account: account as TransactionAccount,
  };
}

export async function findTransactionById(
  userId: string,
  transactionId: string,
): Promise<TransactionWithRelations | null> {
  const [row] = await db
    .select(transactionSelect)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
      ),
    )
    .limit(1);

  return row ? mapTransaction(row) : null;
}

export async function createTransaction(data: CreateTransactionData) {
  const [created] = await db
    .insert(transactions)
    .values({
      userId: data.userId,
      accountId: data.accountId,
      categoryId: data.categoryId ?? null,
      description: data.description,
      amount: data.amount.toFixed(2),
      type: data.type,
      date: data.date,
      notes: data.notes ?? null,
    })
    .returning();

  return (await findTransactionById(data.userId, created!.id))!;
}

export async function findTransactions(
  userId: string,
  filters: TransactionFiltersInput,
): Promise<PaginatedTransactions> {
  const { limit } = filters;
  const conditions = [eq(transactions.userId, userId)];

  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.categoryId) {
    conditions.push(eq(transactions.categoryId, filters.categoryId));
  }
  if (filters.type) {
    conditions.push(eq(transactions.type, filters.type));
  }
  if (filters.startDate) {
    conditions.push(gte(transactions.date, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(transactions.date, filters.endDate));
  }
  if (filters.text) {
    conditions.push(ilike(transactions.description, `%${filters.text}%`));
  }

  if (filters.cursor) {
    const [cursorDate, cursorId] = filters.cursor.split("_");
    conditions.push(
      sql`(${transactions.date}, ${transactions.id}) < (${cursorDate}, ${cursorId})`,
    );
  }

  const rows = await db
    .select(transactionSelect)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

  return {
    data: rows.slice(0, limit).map(mapTransaction),
    hasMore: rows.length > limit,
  };
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  data: UpdateTransactionInput,
) {
  const [updated] = await db
    .update(transactions)
    .set({
      ...data,
      amount: data.amount !== undefined ? data.amount.toFixed(2) : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
      ),
    )
    .returning();

  if (!updated) return null;

  return findTransactionById(userId, transactionId);
}

export async function deleteTransaction(userId: string, transactionId: string) {
  const [deleted] = await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
      ),
    )
    .returning();

  return deleted ?? null;
}
