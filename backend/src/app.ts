import Fastify from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import cors from "@fastify/cors";
import { env } from "@/shared/config/env";
import {
  dbPlugin,
  redisPlugin,
  rabbitmqPlugin,
  authPlugin,
  swaggerPlugin,
  zodPlugin,
  errorHandlerPlugin,
  metaPlugin,
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

  await app.register(cors, { origin: true });
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(rabbitmqPlugin);
  await app.register(authPlugin);
  await app.register(swaggerPlugin);
  await app.register(zodPlugin);
  await app.register(metaPlugin);
  await app.register(errorHandlerPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(import("@/modules/auth/auth.routes"), { prefix: "/auth" });

  return app;
}
