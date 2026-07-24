import * as repository from "@/modules/accounts/accounts.repository";
import { NotFoundError } from "@/shared/core/errors";
import type { CreateAccountInput, UpdateAccountInput } from "@/modules/accounts/accounts.schema";

export async function createAccount(
  userId: string,
  data: CreateAccountInput,
) {
  return repository.createAccount({
    userId,
    name: data.name,
    type: data.type,
    currency: data.currency,
    color: data.color,
    initialBalance: data.initialBalance,
  });
}

export async function listAccounts(userId: string) {
  return repository.findAccountsByUserId(userId);
}

export async function getAccountById(userId: string, accountId: string) {
  const account = await repository.findAccountById(userId, accountId);

  if (!account) {
    throw new NotFoundError("Account");
  }

  return account;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  data: UpdateAccountInput,
) {
  const account = await repository.updateAccount(userId, accountId, data);

  if (!account) {
    throw new NotFoundError("Account");
  }

  return account;
}

export async function archiveAccount(userId: string, accountId: string) {
  const account = await repository.archiveAccount(userId, accountId);

  if (!account) {
    throw new NotFoundError("Account");
  }

  return account;
}
