import { z } from "zod";

const csvListSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().trim().min(1).default("24h"),
  UPLOAD_DIR: z.string().trim().min(1).default("./uploads"),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),
  ALLOWED_ORIGINS: csvListSchema.default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  OTEL_SERVICE_NAME: z.string().trim().min(1).default("fintrack-api"),
  OTEL_COLLECTOR_HOST: z.string().trim().min(1).default("otel-collector"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
});

export const env = envSchema.parse(process.env);
