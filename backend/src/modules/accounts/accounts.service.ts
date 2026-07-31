import * as repository from "@/modules/accounts/accounts.repository";
import { InfrastructureError, NotFoundError } from "@/shared/core/errors";
import type { CreateAccountInput, UpdateAccountInput } from "@/modules/accounts/accounts.schema";
import type { AppLogger } from "@/shared/core/types/logger";

export async function createAccount(
  userId: string,
  data: CreateAccountInput,
  log: AppLogger,
) {
  try {
    return await repository.createAccount({
      userId,
      name: data.name,
      type: data.type,
      currency: data.currency,
      color: data.color,
      initialBalance: data.initialBalance,
    });
  } catch (error) {
    if (error instanceof InfrastructureError) {
      log.error({ userId }, "Failed to create account");
    }
    throw error;
  }
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
