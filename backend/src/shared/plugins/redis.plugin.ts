import fp from "fastify-plugin";
import Redis from "ioredis";
import { env } from "@/shared/config/env";

export default fp(async (fastify) => {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 100, 3000);
    },
    lazyConnect: true,
  });

  try {
    await redis.connect();
  } catch (err) {
    fastify.log.warn({ err }, "Redis unavailable — running without cache");
    fastify.decorate("redis", undefined);
    return;
  }

  redis.on("error", (err) => {
    fastify.log.error({ err }, "Redis connection error");
  });

  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
});

declare module "fastify" {
  interface FastifyInstance {
    redis?: Redis;
  }
}
