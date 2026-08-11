import { z } from "zod";
import { withMeta } from "@/shared/utils/response";

export const accountTypeSchema = z.enum([
  "checking",
  "savings",
  "wallet",
  "credit_card",
]);

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex code");

export const createAccountSchema = z.object({
  name: z.string().min(1).max(120),
  type: accountTypeSchema,
  currency: z.string().trim().min(3).max(3).default("BRL"),
  color: hexColorSchema.default("#6366F1"),
  initialBalance: z.coerce.number().min(0).default(0),
});

export const updateAccountSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    type: accountTypeSchema.optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    color: hexColorSchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export const accountParamsSchema = z.object({
  id: z.string().uuid(),
});

export const accountResponse = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  type: accountTypeSchema,
  currency: z.string(),
  color: z.string(),
  isArchived: z.boolean(),
  balance: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const accountsListResponse = withMeta(z.array(accountResponse));
export const accountDataResponse = withMeta(accountResponse);

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type AccountParamsInput = z.infer<typeof accountParamsSchema>;
