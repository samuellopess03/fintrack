import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { env } from "@/shared/core/config/env";
import { RateLimitError } from "@/shared/core/errors";

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, context) =>
      new RateLimitError(`Rate limit exceeded, retry in ${context.after}`),
  });
});
