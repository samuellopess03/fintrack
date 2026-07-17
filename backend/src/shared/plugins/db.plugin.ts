import fp from "fastify-plugin";
import { db, pool } from "@/shared/platform/database/client";

export default fp(async (fastify) => {
  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}
