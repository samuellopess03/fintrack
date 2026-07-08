import { Histogram, Counter } from "prom-client";

export const httpRequestDuration = new Histogram({
  name: "fintrack_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2],
});

export const httpRequestTotal = new Counter({
  name: "fintrack_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
});
