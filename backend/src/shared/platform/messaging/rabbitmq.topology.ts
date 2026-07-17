import type amqp from "amqplib";

const EXCHANGE = "fintrack.imports";
const DLX = "fintrack.dlx";

export async function setupRabbitMqTopology(channel: amqp.Channel) {
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
