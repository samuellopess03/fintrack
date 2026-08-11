import { z } from "zod";
import { withMeta } from "@/shared/utils/response";
import { accountTypeSchema } from "@/modules/accounts/accounts.schema";

export const transactionTypeSchema = z.enum(["income", "expense"]);

const uuidSchema = z.string().uuid();

export const createTransactionSchema = z.object({
  accountId: uuidSchema,
  categoryId: uuidSchema.nullable().optional(),
  description: z.string().min(1).max(200),
  amount: z.coerce.number().positive().multipleOf(0.01),
  type: transactionTypeSchema,
  date: z.string().date(),
  notes: z.string().max(500).nullable().optional(),
});

export const updateTransactionSchema = z
  .object({
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema.nullable().optional(),
    description: z.string().min(1).max(200).optional(),
    amount: z.coerce.number().positive().multipleOf(0.01).optional(),
    type: transactionTypeSchema.optional(),
    date: z.string().date().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export const transactionParamsSchema = z.object({
  id: uuidSchema,
});

const transactionCursorSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Cursor must be in the format YYYY-MM-DD_<uuid>",
  );

export const transactionFiltersSchema = z.object({
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  type: transactionTypeSchema.optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  text: z.string().max(200).optional(),
  cursor: transactionCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const transactionResponse = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  accountId: uuidSchema,
  categoryId: uuidSchema.nullable(),
  importJobId: uuidSchema.nullable(),
  description: z.string(),
  amount: z.string(),
  type: transactionTypeSchema,
  date: z.string(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  category: z
    .object({
      id: uuidSchema,
      name: z.string(),
      color: z.string(),
    })
    .nullable(),
  account: z.object({
    id: uuidSchema,
    name: z.string(),
    type: accountTypeSchema,
  }),
});

export const transactionPaginationSchema = z.object({
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  count: z.number().int(),
});

export const transactionListResponse = z.object({
  data: z.array(transactionResponse),
  pagination: transactionPaginationSchema,
  meta: z.object({ requestId: z.string() }).optional(),
});

export const transactionDataResponse = withMeta(transactionResponse);

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionParamsInput = z.infer<typeof transactionParamsSchema>;
export type TransactionFiltersInput = z.infer<typeof transactionFiltersSchema>;
