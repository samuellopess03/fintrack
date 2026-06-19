import fp from "fastify-plugin";
import amqp from "amqplib";
import { env } from "@/shared/config/env";

export default fp(async (fastify) => {
  try {
    const conn = await amqp.connect(env.RABBITMQ_URL);

    conn.on("error", (err) => {
      fastify.log.error({ err }, "RabbitMQ connection error");
    });

    conn.on("close", () => {
      fastify.log.warn("RabbitMQ connection closed");
    });

    fastify.decorate("rabbitmq", conn);

    fastify.addHook("onClose", async () => {
      await conn.close();
    });
  } catch (err) {
    fastify.log.warn({ err }, "RabbitMQ unavailable — running without messaging");
    fastify.decorate("rabbitmq", undefined);
    return;
  }
});

declare module "fastify" {
  interface FastifyInstance {
    rabbitmq?: amqp.ChannelModel;
  }
}
