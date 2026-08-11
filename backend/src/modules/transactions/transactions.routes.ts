import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  createTransactionSchema,
  transactionDataResponse,
  transactionFiltersSchema,
  transactionListResponse,
  transactionParamsSchema,
  updateTransactionSchema,
} from "@/modules/transactions/transactions.schema";
import {
  errorResponse,
  validationErrorResponse,
} from "@/shared/core/errors/error.schema";
import {
  createTransaction,
  deleteTransaction,
  getTransactionById,
  listTransactions,
  updateTransaction,
} from "@/modules/transactions/transactions.service";

const transactionsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", async (request) => {
    await fastify.authenticate(request);
  });

  const getUserId = (request: { user: unknown }) =>
    (request.user as { sub: string }).sub;

  fastify.get(
    "/",
    {
      schema: {
        description: "List transactions with keyset pagination and filters",
        tags: ["transactions"],
        security: [{ bearerAuth: [] }],
        querystring: transactionFiltersSchema,
        response: {
          200: transactionListResponse,
          401: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await listTransactions(getUserId(request), request.query);

      return reply.status(200).send(result);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get transaction details",
        tags: ["transactions"],
        security: [{ bearerAuth: [] }],
        params: transactionParamsSchema,
        response: {
          200: transactionDataResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const transaction = await getTransactionById(
        getUserId(request),
        request.params.id,
      );

      return reply.status(200).send({
        data: transaction,
      });
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        description: "Create a manual transaction",
        tags: ["transactions"],
        security: [{ bearerAuth: [] }],
        body: createTransactionSchema,
        response: {
          201: transactionDataResponse,
          401: errorResponse,
          404: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const transaction = await createTransaction(
        getUserId(request),
        request.body,
        fastify.cache,
      );

      return reply.status(201).send({
        data: transaction,
      });
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        description: "Update an existing transaction",
        tags: ["transactions"],
        security: [{ bearerAuth: [] }],
        params: transactionParamsSchema,
        body: updateTransactionSchema,
        response: {
          200: transactionDataResponse,
          401: errorResponse,
          404: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const transaction = await updateTransaction(
        getUserId(request),
        request.params.id,
        request.body,
        fastify.cache,
      );

      return reply.status(200).send({
        data: transaction,
      });
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete a transaction",
        tags: ["transactions"],
        security: [{ bearerAuth: [] }],
        params: transactionParamsSchema,
        response: {
          200: transactionDataResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const transaction = await deleteTransaction(
        getUserId(request),
        request.params.id,
        fastify.cache,
      );

      return reply.status(200).send({
        data: transaction,
      });
    },
  );
};

export default transactionsRoutes;
