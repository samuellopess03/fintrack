import fp from "fastify-plugin";
import { register } from "prom-client";
import {
  httpRequestDuration,
  httpRequestTotal,
} from "@/shared/platform/observability/metrics";

export default fp(async (fastify) => {
  fastify.addHook("onResponse", (request, reply, done) => {
    const route = request.routeOptions.url ?? "unknown";
    const duration = reply.elapsedTime / 1000;

    httpRequestDuration
      .labels(request.method, route, String(reply.statusCode))
      .observe(duration);

    httpRequestTotal
      .labels(request.method, route, String(reply.statusCode))
      .inc();

    done();
  });

  fastify.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });
});
