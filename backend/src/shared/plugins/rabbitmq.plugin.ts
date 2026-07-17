import fp from "fastify-plugin";
import amqp from "amqplib";
import { env } from "@/shared/core/config/env";
import {
  RabbitMqImportJobQueue,
  setupRabbitMqTopology,
} from "@/shared/platform/messaging";

export default fp(async (fastify) => {
  try {
    const conn = await amqp.connect(env.RABBITMQ_URL);

    conn.on("error", (err) => {
      fastify.log.error({ err }, "RabbitMQ connection error");
    });

    conn.on("close", () => {
      fastify.log.warn("RabbitMQ connection closed");
    });

    const channel = await conn.createChannel();
    await setupRabbitMqTopology(channel);
    const importJobQueue = new RabbitMqImportJobQueue(channel);

    fastify.decorate("rabbitmq", { connection: conn, channel });
    fastify.decorate("importJobs", importJobQueue);

    fastify.addHook("onClose", async () => {
      await channel.close();
      await conn.close();
    });
  } catch (err) {
    fastify.log.warn(
      { err },
      "RabbitMQ unavailable — running without messaging",
    );
  }
});

declare module "fastify" {
  interface FastifyInstance {
    rabbitmq?: { connection: amqp.ChannelModel; channel: amqp.Channel };
    importJobs: RabbitMqImportJobQueue;
  }
}

