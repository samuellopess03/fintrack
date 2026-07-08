import fp from "fastify-plugin";
import amqp from "amqplib";
import { env } from "@/shared/core/config/env";

const EXCHANGE = "fintrack.imports";
const DLX = "fintrack.dlx";

async function setupTopology(channel: amqp.Channel) {
  await channel.assertExchange(DLX, "direct", { durable: true });
  await channel.assertQueue("fintrack.imports.dead", { durable: true });
  await channel.bindQueue("fintrack.imports.dead", DLX, "dead");

  await channel.assertExchange(EXCHANGE, "direct", { durable: true });

  const queueOptions: amqp.Options.AssertQueue = {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": DLX,
      "x-dead-letter-routing-key": "dead",
      "x-message-ttl": 1000 * 60 * 60,
    },
  };

  await channel.assertQueue("fintrack.imports.csv", queueOptions);
  await channel.assertQueue("fintrack.imports.ofx", queueOptions);

  await channel.bindQueue("fintrack.imports.csv", EXCHANGE, "import.csv");
  await channel.bindQueue("fintrack.imports.ofx", EXCHANGE, "import.ofx");

  channel.prefetch(5);
}

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
    await setupTopology(channel);

    fastify.decorate("rabbitmq", { connection: conn, channel });

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
  }
}
