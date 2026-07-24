import { and, desc, eq, sql } from "drizzle-orm";
import type { AccountType } from "@/shared/platform/database/enums";
import { db, type DbClient } from "@/shared/platform/database/client";
import { accounts, Account } from "@/shared/platform/database/schema/accounts";
import { transactions } from "@/shared/platform/database/schema/transactions";

export type AccountWithBalance = Account & {
  balance: string;
};

export type CreateAccountData = {
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  color: string;
  initialBalance: number;
};

export type UpdateAccountData = {
  name?: string;
  type?: AccountType;
  currency?: string;
  color?: string;
};

type QueryOptions = {
  tx?: DbClient;
  includeArchived?: boolean;
};

const accountGroupBy = [
  accounts.id,
  accounts.userId,
  accounts.name,
  accounts.type,
  accounts.currency,
  accounts.color,
  accounts.isArchived,
  accounts.createdAt,
  accounts.updatedAt,
] as const;

function getClient(tx?: DbClient) {
  return tx ?? db;
}

function balanceExpression() {
  return sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end), 0)`;
}

async function selectAccountById(
  userId: string,
  accountId: string,
  options?: QueryOptions,
) {
  const client = getClient(options?.tx);
  const conditions = [eq(accounts.userId, userId), eq(accounts.id, accountId)];

  if (!options?.includeArchived) {
    conditions.push(eq(accounts.isArchived, false));
  }

  const [account] = await client
    .select({
      id: accounts.id,
      userId: accounts.userId,
      name: accounts.name,
      type: accounts.type,
      currency: accounts.currency,
      color: accounts.color,
      isArchived: accounts.isArchived,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      balance: balanceExpression(),
    })
    .from(accounts)
    .leftJoin(
      transactions,
      and(
        eq(transactions.accountId, accounts.id),
        eq(transactions.userId, userId),
      ),
    )
    .where(and(...conditions))
    .groupBy(...accountGroupBy)
    .limit(1);

  return (account ?? null) as AccountWithBalance | null;
}

async function createOpeningBalanceTransaction(
  data: {
    userId: string;
    accountId: string;
    amount: number;
  },
  tx?: DbClient,
) {
  const client = getClient(tx);
  await client.insert(transactions).values({
    userId: data.userId,
    accountId: data.accountId,
    description: "Saldo inicial",
    amount: data.amount.toFixed(2),
    type: "income",
    date: new Date().toISOString().slice(0, 10),
  });
}

export async function createAccount(data: CreateAccountData) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(accounts)
      .values({
        userId: data.userId,
        name: data.name,
        type: data.type,
        currency: data.currency,
        color: data.color,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create account");
    }

    if (data.initialBalance > 0) {
      await createOpeningBalanceTransaction(
        {
          userId: data.userId,
          accountId: created.id,
          amount: data.initialBalance,
        },
        tx,
      );
    }

    const account = await selectAccountById(data.userId, created.id, {
      tx,
      includeArchived: true,
    });

    if (!account) {
      throw new Error("Failed to load created account");
    }

    return account;
  });
}

export async function findAccountsByUserId(
  userId: string,
  options?: QueryOptions,
) {
  const client = getClient(options?.tx);
  const conditions = [eq(accounts.userId, userId)];

  if (!options?.includeArchived) {
    conditions.push(eq(accounts.isArchived, false));
  }

  return client
    .select({
      id: accounts.id,
      userId: accounts.userId,
      name: accounts.name,
      type: accounts.type,
      currency: accounts.currency,
      color: accounts.color,
      isArchived: accounts.isArchived,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
      balance: balanceExpression(),
    })
    .from(accounts)
    .leftJoin(
      transactions,
      and(
        eq(transactions.accountId, accounts.id),
        eq(transactions.userId, userId),
      ),
    )
    .where(and(...conditions))
    .groupBy(...accountGroupBy)
    .orderBy(desc(accounts.createdAt));
}

export async function findAccountById(
  userId: string,
  accountId: string,
  options?: QueryOptions,
) {
  return selectAccountById(userId, accountId, {
    tx: options?.tx,
    includeArchived: true,
  });
}

export async function updateAccount(
  userId: string,
  accountId: string,
  data: UpdateAccountData,
) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(accounts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .returning();

    if (!updated) {
      return null;
    }

    const account = await selectAccountById(userId, accountId, {
      tx,
      includeArchived: true,
    });

    return account;
  });
}

export async function archiveAccount(userId: string, accountId: string) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(accounts)
      .set({
        isArchived: true,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .returning();

    if (!updated) {
      return null;
    }

    const account = await selectAccountById(userId, accountId, {
      tx,
      includeArchived: true,
    });

    return account;
  });
}
