import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { CookieSerializeOptions } from "@fastify/cookie";
import {
  registerSchema,
  loginSchema,
  authDataResponse,
  refreshDataResponse,
  logoutDataResponse,
} from "@/modules/auth/auth.schema";
import {
  errorResponse,
  validationErrorResponse,
} from "@/shared/core/errors/error.schema";
import {
  registerUser,
  loginUser,
  storeRefreshToken,
  rotateRefreshToken,
  logoutUser,
} from "@/modules/auth/auth.service";
import { env } from "@/shared/core/config/env";
import { UnauthorizedError } from "@/shared/core/errors";

const REFRESH_TOKEN_COOKIE_OPTIONS: CookieSerializeOptions = {
  path: "/",
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
};

const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const setRefreshTokenCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie("refreshToken", token, {
      ...REFRESH_TOKEN_COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  };

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
      config: {
        rateLimit: {
          max: env.AUTH_REGISTER_RATE_LIMIT_MAX,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const user = await registerUser(request.body, fastify.log);

      const accessToken = await reply.jwtSign(
        { sub: user.id },
        { expiresIn: env.JWT_EXPIRES_IN },
      );
      const refreshToken = await reply.jwtSign(
        { sub: user.id, type: "refresh", nonce: randomUUID() },
        { expiresIn: "7d" },
      );
      await storeRefreshToken({ userId: user.id, rawToken: refreshToken });

      setRefreshTokenCookie(reply, refreshToken);

      return reply.status(201).send({
        data: { user, accessToken },
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
      config: {
        rateLimit: {
          max: env.AUTH_LOGIN_RATE_LIMIT_MAX,
          timeWindow: "15 minutes",
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

      setRefreshTokenCookie(reply, refreshToken);

      return reply.status(200).send({
        data: { user, accessToken },
      });
    },
  );

  fastify.post(
    "/refresh",
    {
      schema: {
        description: "Refresh an expiring access token",
        tags: ["auth"],
        response: {
          200: refreshDataResponse,
          401: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        throw new UnauthorizedError("Refresh token not found");
      }

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

      setRefreshTokenCookie(reply, newRefreshToken);

      return reply.status(200).send({
        data: { accessToken: newAccessToken },
      });
    },
  );

  fastify.post(
    "/logout",
    {
      schema: {
        description: "Invalidate the current session",
        tags: ["auth"],
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
      const refreshToken = request.cookies.refreshToken;

      if (refreshToken) {
        try {
          fastify.jwt.verify(refreshToken);
          await logoutUser(refreshToken);
        } catch {
          fastify.log.warn("Failed to revoke refresh token on logout — clearing cookie anyway");
        }
      }

      reply.clearCookie("refreshToken", REFRESH_TOKEN_COOKIE_OPTIONS);

      return reply.status(200).send({
        data: { message: "Logged out successfully" },
      });
    },
  );
};

export default authRoutes;
