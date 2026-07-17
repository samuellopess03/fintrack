import "dotenv/config";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes, envDetector, hostDetector, processDetector } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import FastifyOtelInstrumentation from "@fastify/otel";
import { env } from "@/shared/core/config/env";

export const telemetrySdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
  }),
  resourceDetectors: [envDetector, hostDetector, processDetector],
  traceExporter: new OTLPTraceExporter({
    url: `http://${env.OTEL_COLLECTOR_HOST}:4318/v1/traces`,
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new FastifyOtelInstrumentation({ registerOnInitialization: true }),
    new PinoInstrumentation(),
  ],
});

telemetrySdk.start();

export function shutdownTelemetry() {
  return telemetrySdk.shutdown();
}
