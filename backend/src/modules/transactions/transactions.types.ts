import type { Transaction } from "@/shared/platform/database/schema/transactions";
import type { Category } from "@/shared/platform/database/schema/categories";
import type { Account } from "@/shared/platform/database/schema/accounts";
import type { CreateTransactionInput } from "@/modules/transactions/transactions.schema";

export type TransactionCategory = Pick<Category, "id" | "name" | "color">;
export type TransactionAccount = Pick<Account, "id" | "name" | "type">;

export type TransactionWithRelations = Transaction & {
  category: TransactionCategory | null;
  account: TransactionAccount;
};

export type PaginatedTransactions = {
  data: TransactionWithRelations[];
  hasMore: boolean;
};

export type CreateTransactionData = CreateTransactionInput & { userId: string };
