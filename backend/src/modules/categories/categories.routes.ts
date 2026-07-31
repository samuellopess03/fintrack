import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  categoryDataResponse,
  categoryParamsSchema,
  categoriesListResponse,
  createCategorySchema,
  errorResponse,
  updateCategorySchema,
  validationErrorResponse,
  createBudgetGoalSchema,
  budgetGoalDataResponse,
  categorySimpleResponse,
} from "@/modules/categories/categories.schema";
import {
  createCategory,
  listCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  upsertBudgetGoal,
  deleteBudgetGoal,
  getBudgetGoal,
} from "@/modules/categories/categories.service";

const categoriesRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", async (request) => {
    await fastify.authenticate(request);
  });

  const getUserId = (request: { user: unknown }) =>
    (request.user as { sub: string }).sub;

  fastify.get(
    "/",
    {
      schema: {
        description: "List user categories",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        response: {
          200: categoriesListResponse,
          401: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const categories = await listCategories(getUserId(request));

      return reply.status(200).send({
        data: categories,
      });
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get category details",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        params: categoryParamsSchema,
        response: {
          200: categoryDataResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const category = await getCategoryById(
        getUserId(request),
        request.params.id,
      );

      return reply.status(200).send({
        data: category,
      });
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        description: "Create a new category",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        body: createCategorySchema,
        response: {
          201: categoryDataResponse,
          401: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const category = await createCategory(
        getUserId(request),
        request.body,
        fastify.log,
      );

      return reply.status(201).send({
        data: category,
      });
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        description: "Update an existing category",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        params: categoryParamsSchema,
        body: updateCategorySchema,
        response: {
          200: categoryDataResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const category = await updateCategory(
        getUserId(request),
        request.params.id,
        request.body,
      );

      return reply.status(200).send({
        data: category,
      });
    },
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete a category",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        params: categoryParamsSchema,
        response: {
          200: categorySimpleResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const category = await deleteCategory(
        getUserId(request),
        request.params.id,
      );

      return reply.status(200).send({
        data: category,
      });
    },
  );

  fastify.get(
    "/:id/goal",
    {
      schema: {
        description: "Get budget goal for a category",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        params: categoryParamsSchema,
        response: {
          200: budgetGoalDataResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const goal = await getBudgetGoal(
        getUserId(request),
        request.params.id,
      );

      return reply.status(200).send({
        data: goal,
      });
    },
  );

  fastify.put(
    "/:id/goal",
    {
      schema: {
        description: "Create or update budget goal for a category",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        params: categoryParamsSchema,
        body: createBudgetGoalSchema,
        response: {
          200: budgetGoalDataResponse,
          401: errorResponse,
          404: errorResponse,
          422: validationErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const goal = await upsertBudgetGoal(
        getUserId(request),
        request.params.id,
        request.body,
        fastify.log,
      );

      return reply.status(200).send({
        data: goal,
      });
    },
  );

  fastify.delete(
    "/:id/goal",
    {
      schema: {
        description: "Delete budget goal for a category",
        tags: ["categories"],
        security: [{ bearerAuth: [] }],
        params: categoryParamsSchema,
        response: {
          200: budgetGoalDataResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const goal = await deleteBudgetGoal(
        getUserId(request),
        request.params.id,
      );

      return reply.status(200).send({
        data: goal,
      });
    },
  );
};

export default categoriesRoutes;
