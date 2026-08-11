import type { Account } from "@/shared/platform/database/schema/accounts";
import type { CreateAccountInput } from "@/modules/accounts/accounts.schema";

export type AccountWithBalance = Account & {
  balance: string;
};

export type CreateAccountData = CreateAccountInput & {
  userId: string;
};
