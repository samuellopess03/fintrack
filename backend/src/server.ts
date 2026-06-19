import "dotenv/config";
import { buildApp } from "@/app";
import { env } from "@/shared/config/env";

async function main() {
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully`);
      await app.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
