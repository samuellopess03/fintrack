import { Counter, Histogram } from "prom-client";

export const cacheOperations = new Counter({
  name: "fintrack_cache_operations_total",
  help: "Cache operations by result",
  labelNames: ["operation", "key_prefix", "result"] as const,
});

export const cacheOperationDuration = new Histogram({
  name: "fintrack_cache_operation_duration_seconds",
  help: "Duration of Redis cache operations",
  labelNames: ["operation"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
});
