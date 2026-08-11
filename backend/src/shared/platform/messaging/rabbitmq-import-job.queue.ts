import type amqp from "amqplib";
import type {
  ImportJobQueue,
  ImportJobPayload,
} from "@/shared/contracts/import-job-queue";
import { InfrastructureError } from "@/shared/core/errors";

const EXCHANGE = "fintrack.imports";

export class RabbitMqImportJobQueue implements ImportJobQueue {
  constructor(private readonly channel: amqp.Channel) {}

  async enqueue(payload: ImportJobPayload): Promise<void> {
    const routingKey = payload.fileFormat === "csv" ? "import.csv" : "import.ofx";
    const body = Buffer.from(JSON.stringify(payload));

    try {
      const published = this.channel.publish(EXCHANGE, routingKey, body, {
        contentType: "application/json",
        persistent: true,
        messageId: payload.fileId,
        timestamp: Date.now(),
        headers: {
          "x-user-id": payload.userId,
          "x-file-format": payload.fileFormat,
        },
      });

      if (!published) {
        await new Promise<void>((resolve) => {
          this.channel.once("drain", resolve);
        });
      }
    } catch (error) {
      const translated = new InfrastructureError("rabbitmq");
      translated.cause = error;
      throw translated;
    }
  }
}
