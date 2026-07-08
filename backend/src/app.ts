import Fastify from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { env } from "@/shared/core/config/env";
import {
  dbPlugin,
  redisPlugin,
  rabbitmqPlugin,
  authPlugin,
  swaggerPlugin,
  zodPlugin,
  errorHandlerPlugin,
  metaPlugin,
  helmetPlugin,
  rateLimitPlugin,
  metricsPlugin,
} from "@/shared/plugins";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === "development" && {
        transport: { target: "pino-pretty" },
      }),
    },
  }).withTypeProvider<ZodTypeProvider>();

  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS.split(","),
    credentials: true,
  });
  await app.register(cookie, { secret: env.JWT_SECRET });
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(rabbitmqPlugin);
  await app.register(authPlugin);
  await app.register(swaggerPlugin);
  await app.register(zodPlugin);
  await app.register(metaPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(helmetPlugin);
  await app.register(rateLimitPlugin);
  await app.register(metricsPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(import("@/modules/auth/auth.routes"), { prefix: "/auth" });

  return app;
}
