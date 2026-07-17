import { shutdownTelemetry } from "@/shared/platform/observability/telemetry/tracing";
import pino from "pino";
import { buildApp } from "@/app";
import { env } from "@/shared/core/config/env";

const logger = pino({ level: env.LOG_LEVEL });

async function main() {
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully`);
      try {
        await app.close();
      } finally {
        await shutdownTelemetry().catch(() => undefined);
        process.exit(0);
      }
    });
  }
}

main().catch(async (err) => {
  logger.fatal({ err }, "Failed to start server");
  await shutdownTelemetry().catch(() => undefined);
  process.exit(1);
});
