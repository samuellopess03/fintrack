import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  accountDataResponse,
  accountParamsSchema,
  accountsListResponse,
  createAccountSchema,
  updateAccountSchema,
} from "@/modules/accounts/accounts.schema";
import {
  errorResponse,
  validationErrorResponse,
} from "@/shared/core/errors/error.schema";
import {
  archiveAccount,
  createAccount,
  getAccountById,
  listAccounts,
  updateAccount,
} from "@/modules/accounts/accounts.service";

const accountsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", async (request) => {
    await fastify.authenticate(request);
  });

  const getUserId = (request: { user: unknown }) =>
    (request.user as { sub: string }).sub;

  fastify.get(
    "/",
    {
      schema: {
        description: "List user accounts",
        tags: ["accounts"],
        security: [{ bearerAuth: [] }],
        response: {
          200: accountsListResponse,
          401: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const accounts = await listAccounts(getUserId(request));

      return reply.status(200).send({
        data: accounts,
      });
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get account details",
        tags: ["accounts"],
        security: [{ bearerAuth: [] }],
        params: accountParamsSchema,
        response: {
          200: accountDataResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const account = await getAccountById(
        getUserId(request),
        request.params.id,
      );

      return reply.status(200).send({
        data: account,
      });
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new account",
        tags: ["accounts"],
        security: [{ bearerAuth: [] }],
        body: createAccountSchema,
        response: {
          201: accountDataResponse,
          401: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const account = await createAccount(
        getUserId(request),
        request.body,
      );

      return reply.status(201).send({
        data: account,
      });
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        description: "Update an existing account",
        tags: ["accounts"],
        security: [{ bearerAuth: [] }],
        params: accountParamsSchema,
        body: updateAccountSchema,
        response: {
          200: accountDataResponse,
          401: errorResponse,
          404: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const account = await updateAccount(
        getUserId(request),
        request.params.id,
        request.body,
      );

      return reply.status(200).send({
        data: account,
      });
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Archive an account",
        tags: ["accounts"],
        security: [{ bearerAuth: [] }],
        params: accountParamsSchema,
        response: {
          200: accountDataResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const account = await archiveAccount(
        getUserId(request),
        request.params.id,
      );

      return reply.status(200).send({
        data: account,
      });
    },
  );
};

export default accountsRoutes;
