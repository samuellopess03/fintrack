import * as repository from "@/modules/transactions/transactions.repository";
import { findAccountById } from "@/modules/accounts/accounts.repository";
import { findCategoryById } from "@/modules/categories/categories.repository";
import { NotFoundError } from "@/shared/core/errors";
import type { CacheStore } from "@/shared/contracts/cache-store";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionFiltersInput,
} from "@/modules/transactions/transactions.schema";

async function invalidateAfterTransaction(
  cache: CacheStore,
  userId: string,
  months: string[],
  accountIds: string[],
) {
  const uniqueMonths = [...new Set(months)];
  const uniqueAccounts = [...new Set(accountIds)];

  const monthKeys = uniqueMonths.flatMap((month) => [
    `report:monthly:${userId}:${month}`,
    `report:dashboard:${userId}:${month}`,
  ]);
  const balanceKeys = uniqueAccounts.map((id) => `balance:${id}`);

  await Promise.all([
    ...monthKeys.map((key) => cache.del(key)),
    cache.del(`report:evolution:${userId}`),
    ...balanceKeys.map((key) => cache.del(key)),
  ]);
}

async function assertAccountOwnership(userId: string, accountId: string) {
  const account = await findAccountById(userId, accountId);

  if (!account) {
    throw new NotFoundError("Account");
  }
}

async function assertCategoryOwnership(userId: string, categoryId: string) {
  const category = await findCategoryById(userId, categoryId);

  if (!category) {
    throw new NotFoundError("Category");
  }
}

export async function createTransaction(
  userId: string,
  data: CreateTransactionInput,
  cache: CacheStore,
) {
  await assertAccountOwnership(userId, data.accountId);

  if (data.categoryId) {
    await assertCategoryOwnership(userId, data.categoryId);
  }

  const created = await repository.createTransaction({
    userId,
    accountId: data.accountId,
    categoryId: data.categoryId ?? null,
    description: data.description,
    amount: data.amount,
    type: data.type,
    date: data.date,
    notes: data.notes ?? null,
  });

  await invalidateAfterTransaction(
    cache,
    userId,
    [data.date.slice(0, 7)],
    [data.accountId],
  );

  return created;
}

export async function getTransactionById(userId: string, transactionId: string) {
  const transaction = await repository.findTransactionById(
    userId,
    transactionId,
  );

  if (!transaction) {
    throw new NotFoundError("Transaction");
  }

  return transaction;
}

export async function listTransactions(
  userId: string,
  filters: TransactionFiltersInput,
) {
  const { data, hasMore } = await repository.findTransactions(userId, filters);
  const last = data[data.length - 1];

  return {
    data,
    pagination: {
      next_cursor: hasMore && last ? `${last.date}_${last.id}` : null,
      has_more: hasMore,
      count: data.length,
    },
  };
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  data: UpdateTransactionInput,
  cache: CacheStore,
) {
  const existing = await repository.findTransactionById(
    userId,
    transactionId,
  );

  if (!existing) {
    throw new NotFoundError("Transaction");
  }

  if (data.accountId && data.accountId !== existing.accountId) {
    await assertAccountOwnership(userId, data.accountId);
  }

  if (data.categoryId) {
    await assertCategoryOwnership(userId, data.categoryId);
  }

  const updated = await repository.updateTransaction(
    userId,
    transactionId,
    data,
  );

  if (!updated) {
    throw new NotFoundError("Transaction");
  }

  await invalidateAfterTransaction(
    cache,
    userId,
    [existing.date.slice(0, 7), updated.date.slice(0, 7)],
    [existing.accountId, updated.accountId],
  );

  return updated;
}

export async function deleteTransaction(
  userId: string,
  transactionId: string,
  cache: CacheStore,
) {
  const existing = await repository.findTransactionById(
    userId,
    transactionId,
  );

  if (!existing) {
    throw new NotFoundError("Transaction");
  }

  const deleted = await repository.deleteTransaction(userId, transactionId);

  if (!deleted) {
    throw new NotFoundError("Transaction");
  }

  await invalidateAfterTransaction(
    cache,
    userId,
    [existing.date.slice(0, 7)],
    [existing.accountId],
  );

  return existing;
}
