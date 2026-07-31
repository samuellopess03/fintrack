import { z } from "zod";
import { withMeta } from "@/shared/utils/response";

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex code");

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  color: hexColorSchema.default("#94A3B8"),
  icon: z.string().max(40).nullable().optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    color: hexColorSchema.optional(),
    icon: z.string().max(40).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export const categoryParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createBudgetGoalSchema = z.object({
  amount: z.coerce.number().positive(),
  period: z.enum(["monthly"]).default("monthly"),
});

export const updateBudgetGoalSchema = z
  .object({
    amount: z.coerce.number().positive().optional(),
    period: z.enum(["monthly"]).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export const categoryResponse = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  icon: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.date(),
});

export const categoryWithGoalResponse = categoryResponse.extend({
  budgetGoal: z
    .object({
      id: z.string().uuid(),
      amount: z.string(),
      period: z.string(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })
    .nullable(),
});

export const categoriesListResponse = withMeta(
  z.array(categoryWithGoalResponse),
);
export const categoryDataResponse = withMeta(categoryWithGoalResponse);

export const categorySimpleResponse = withMeta(categoryResponse);

export const budgetGoalResponse = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.string(),
  period: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const budgetGoalDataResponse = withMeta(budgetGoalResponse);

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const validationErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryParamsInput = z.infer<typeof categoryParamsSchema>;
export type CreateBudgetGoalInput = z.infer<typeof createBudgetGoalSchema>;
export type UpdateBudgetGoalInput = z.infer<typeof updateBudgetGoalSchema>;
