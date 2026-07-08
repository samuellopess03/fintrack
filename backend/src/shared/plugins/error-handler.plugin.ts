import fp from 'fastify-plugin'
import type { FastifyError } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '@/shared/core/errors'

export default fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
      return
    }

    if (error instanceof ZodError) {
      reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.issues,
        },
      })
      return
    }

    if (error instanceof Error && 'validation' in error) {
      const fastifyError = error as FastifyError
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: fastifyError.message,
          details: fastifyError.validation,
        },
      })
      return
    }

    request.log.error(error)
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
  })
})
