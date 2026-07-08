import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import type { FastifyRequest } from "fastify";
import { env } from "@/shared/core/config/env";
import { UnauthorizedError } from "@/shared/core/errors";

export default fp(async (fastify) => {
  await fastify.register(fjwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest) => {
      try {
        await request.jwtVerify();
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }
    },
  );
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}
