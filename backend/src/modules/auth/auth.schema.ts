import { z } from "zod";
import { withMeta } from "@/shared/utils/response";

/* Request Schemas for Validation and Swagger Documentation */

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export const logoutSchema = z.object({
  refreshToken: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;

/* Response Schemas for Serialization and Swagger Documentation */

export const userResponse = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.date(),
});

export const authDataResponse = withMeta(
  z.object({
    user: userResponse,
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
);

export const refreshDataResponse = withMeta(
  z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
);

export const logoutDataResponse = withMeta(
  z.object({
    message: z.string(),
  }),
);

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
