import fp from 'fastify-plugin'
import { toErrorResponse, isServerError } from '@/shared/core/errors'

export default fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    const { statusCode, ...body } = toErrorResponse(error)

    if (isServerError(error)) {
      const userId = (request.user as { sub?: string } | undefined)?.sub;
      request.log.error(
        { err: error, ...(userId ? { userId } : {}) },
        "Unhandled server error",
      );
    }

    reply.status(statusCode).send({ error: body })
  })
})
