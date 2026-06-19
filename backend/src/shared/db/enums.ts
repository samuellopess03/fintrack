export const ACCOUNT_TYPE = {
  CHECKING: "checking",
  SAVINGS: "savings",
  WALLET: "wallet",
  CREDIT_CARD: "credit_card",
} as const;
export type AccountType = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE];

export const TRANSACTION_TYPE = {
  INCOME: "income",
  EXPENSE: "expense",
} as const;
export type TransactionType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const RULE_TYPE = {
  DESCRIPTION_CONTAINS: "description_contains",
  AMOUNT_RANGE: "amount_range",
  DESCRIPTION_REGEX: "description_regex",
} as const;
export type RuleType = (typeof RULE_TYPE)[keyof typeof RULE_TYPE];

export const IMPORT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  DONE: "done",
  FAILED: "failed",
} as const;
export type ImportStatus = (typeof IMPORT_STATUS)[keyof typeof IMPORT_STATUS];

export const FILE_FORMAT = {
  CSV: "csv",
  OFX: "ofx",
} as const;
export type FileFormat = (typeof FILE_FORMAT)[keyof typeof FILE_FORMAT];

export const BUDGET_PERIOD = {
  MONTHLY: "monthly",
} as const;
export type BudgetPeriod = (typeof BUDGET_PERIOD)[keyof typeof BUDGET_PERIOD];
