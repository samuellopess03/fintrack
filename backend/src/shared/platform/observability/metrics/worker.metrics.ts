import { Histogram, Counter } from "prom-client";

export const importJobDuration = new Histogram({
  name: "fintrack_import_job_duration_seconds",
  help: "Duration of import job processing in seconds",
  labelNames: ["file_format", "status"] as const,
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
});

export const importJobTotal = new Counter({
  name: "fintrack_import_jobs_total",
  help: "Total import jobs processed",
  labelNames: ["file_format", "status"] as const,
});

export const transactionsImported = new Counter({
  name: "fintrack_transactions_imported_total",
  help: "Total transactions imported",
  labelNames: ["file_format"] as const,
});

export const categorizationResults = new Counter({
  name: "fintrack_categorization_results_total",
  help: "Categorization outcomes during import",
  labelNames: ["result"] as const,
});
