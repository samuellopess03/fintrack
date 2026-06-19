import fp from "fastify-plugin";

export default fp(async (fastify) => {
  fastify.addHook("preSerialization", (request, _reply, payload, done) => {
    if (payload && typeof payload === "object" && "data" in payload) {
      (payload as Record<string, unknown>).meta = { requestId: request.id };
    }
    done(null, payload);
  });
});
