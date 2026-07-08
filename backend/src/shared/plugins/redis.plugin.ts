import fp from "fastify-plugin";
import Redis from "ioredis";
import { env } from "@/shared/core/config/env";
import { CacheService } from "@/shared/data/cache";

export default fp(async (fastify) => {
  let redis: Redis | undefined;

  try {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
      commandTimeout: 2_000,
      connectTimeout: 5_000,
    });

    await redis.connect();
  } catch (err) {
    fastify.log.warn({ err }, "Redis unavailable — running without cache");
  }

  if (redis) {
    redis.on("error", (err) => {
      fastify.log.error({ err }, "Redis connection error");
    });
  }

  const cacheService = new CacheService(redis);

  fastify.decorate("redis", redis);
  fastify.decorate("cache", cacheService);

  fastify.addHook("onClose", async () => {
    if (redis) await redis.quit();
  });
});

declare module "fastify" {
  interface FastifyInstance {
    redis?: Redis;
    cache: CacheService;
  }
}
