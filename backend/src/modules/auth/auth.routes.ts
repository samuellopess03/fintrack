import { randomUUID } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  authDataResponse,
  refreshDataResponse,
  logoutDataResponse,
  errorResponse,
  validationErrorResponse,
} from "@/modules/auth/auth.schema";
import {
  registerUser,
  loginUser,
  storeRefreshToken,
  rotateRefreshToken,
  logoutUser,
} from "@/modules/auth/auth.service";
import { env } from "@/shared/config/env";
import { UnauthorizedError } from "@/shared/errors";

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/register",
    {
      schema: {
        description: "Register a new user",
        tags: ["auth"],
        body: registerSchema,
        response: {
          201: authDataResponse,
          409: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const user = await registerUser(request.body);

      const accessToken = await reply.jwtSign(
        { sub: user.id },
        { expiresIn: env.JWT_EXPIRES_IN },
      );
      const refreshToken = await reply.jwtSign(
        { sub: user.id, type: "refresh", nonce: randomUUID() },
        { expiresIn: "7d" },
      );
      await storeRefreshToken({ userId: user.id, rawToken: refreshToken });

      return reply.status(201).send({
        data: { user, accessToken, refreshToken },
      });
    },
  );

  fastify.post(
    "/login",
    {
      schema: {
        description: "Authenticate an existing user",
        tags: ["auth"],
        body: loginSchema,
        response: {
          200: authDataResponse,
          401: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const user = await loginUser(request.body);

      const accessToken = await reply.jwtSign(
        { sub: user.id },
        { expiresIn: env.JWT_EXPIRES_IN },
      );
      const refreshToken = await reply.jwtSign(
        { sub: user.id, type: "refresh", nonce: randomUUID() },
        { expiresIn: "7d" },
      );
      await storeRefreshToken({ userId: user.id, rawToken: refreshToken });

      return reply.status(200).send({
        data: { user, accessToken, refreshToken },
      });
    },
  );

  fastify.post(
    "/refresh",
    {
      schema: {
        description: "Refresh an expiring access token",
        tags: ["auth"],
        body: refreshSchema,
        response: {
          200: refreshDataResponse,
          401: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

      let payload: { sub: string; type?: string };
      try {
        payload = fastify.jwt.verify<{ sub: string; type?: string }>(
          refreshToken,
        );
      } catch {
        throw new UnauthorizedError("Invalid refresh token");
      }

      if (payload.type !== "refresh") {
        throw new UnauthorizedError("Invalid refresh token");
      }

      const newAccessToken = await reply.jwtSign(
        { sub: payload.sub },
        { expiresIn: env.JWT_EXPIRES_IN },
      );
      const newRefreshToken = await reply.jwtSign(
        { sub: payload.sub, type: "refresh", nonce: randomUUID() },
        { expiresIn: "7d" },
      );

      await rotateRefreshToken({
        oldRawToken: refreshToken,
        userId: payload.sub,
        newRawToken: newRefreshToken,
      });

      return reply.status(200).send({
        data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
      });
    },
  );

  fastify.post(
    "/logout",
    {
      schema: {
        description: "Invalidate the current session",
        tags: ["auth"],
        body: logoutSchema,
        security: [{ bearerAuth: [] }],
        response: {
          200: logoutDataResponse,
          401: errorResponse,
          422: validationErrorResponse,
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

      try {
        fastify.jwt.verify(refreshToken);
      } catch {
        throw new UnauthorizedError("Invalid refresh token");
      }

      await logoutUser(refreshToken);

      return reply.status(200).send({
        data: { message: "Logged out successfully" },
      });
    },
  );
};

export default authRoutes;
