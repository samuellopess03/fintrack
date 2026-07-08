import "dotenv/config";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "fintrack-api",
  traceExporter: new OTLPTraceExporter({
    url: `http://${process.env.OTEL_COLLECTOR_HOST ?? "otel-collector"}:4318/v1/traces`,
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new FastifyInstrumentation(),
    new PinoInstrumentation(),
  ],
});

sdk.start();
