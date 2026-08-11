import { z } from "zod";

export const validationDetailSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

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
    details: z.array(validationDetailSchema).optional(),
  }),
});
