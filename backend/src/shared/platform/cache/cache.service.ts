import type Redis from "ioredis";
import type { AppLogger } from "@/shared/core/types/logger";
import type { CacheStore } from "@/shared/contracts/cache-store";
import {
  cacheOperations,
  cacheOperationDuration,
} from "@/shared/platform/observability/metrics";

type CacheLogger = Pick<AppLogger, "warn" | "info">;

const CACHE_RESULT_HIT = "hit" as const;
const CACHE_RESULT_MISS = "miss" as const;
const CACHE_RESULT_ERROR = "error" as const;
const CACHE_RESULT_OK = "ok" as const;

type CacheResult =
  | typeof CACHE_RESULT_HIT
  | typeof CACHE_RESULT_MISS
  | typeof CACHE_RESULT_ERROR
  | typeof CACHE_RESULT_OK;

function keyPrefix(key: string): string {
  return key.split(":")[0] || "unknown";
}

export class CacheService implements CacheStore {
  private failureCount = 0;
  private lastFailure: Date | null = null;
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 30_000;

  constructor(
    private readonly redis: Redis | undefined,
    private readonly log?: CacheLogger,
  ) {}

  private isCircuitOpen(): boolean {
    if (this.failureCount < this.FAILURE_THRESHOLD) return false;
    if (!this.lastFailure) return false;

    const elapsed = Date.now() - this.lastFailure.getTime();
    if (elapsed > this.RECOVERY_TIMEOUT) {
      this.failureCount = 0;
      this.log?.info("Cache circuit breaker closed");
      return false;
    }
    return true;
  }

  private recordFailure(operation: string, key: string, started: number): void {
    this.failureCount++;
    this.lastFailure = new Date();
    this.observe(operation, key, CACHE_RESULT_ERROR, started);

    if (this.failureCount === this.FAILURE_THRESHOLD) {
      this.log?.warn(
        { operation, failureCount: this.failureCount },
        "Cache circuit breaker opened",
      );
    }
  }

  private observe(
    operation: string,
    key: string,
    result: CacheResult,
    started: number,
  ): void {
    cacheOperations.labels(operation, keyPrefix(key), result).inc();
    cacheOperationDuration
      .labels(operation)
      .observe((performance.now() - started) / 1000);
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis || this.isCircuitOpen()) return null;

    const started = performance.now();
    try {
      const value = await this.redis.get(key);
      this.failureCount = 0;
      if (value) {
        this.observe("get", key, CACHE_RESULT_HIT, started);
        return JSON.parse(value) as T;
      }
      this.observe("get", key, CACHE_RESULT_MISS, started);
      return null;
    } catch {
      this.recordFailure("get", key, started);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis || this.isCircuitOpen()) return;

    const started = performance.now();
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      this.failureCount = 0;
      this.observe("set", key, CACHE_RESULT_OK, started);
    } catch {
      this.recordFailure("set", key, started);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis || this.isCircuitOpen()) return;

    const started = performance.now();
    try {
      await this.redis.del(key);
      this.failureCount = 0;
      this.observe("del", key, CACHE_RESULT_OK, started);
    } catch {
      this.recordFailure("del", key, started);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.redis || this.isCircuitOpen()) return;

    const started = performance.now();
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      this.failureCount = 0;
      this.observe("delPattern", pattern, CACHE_RESULT_OK, started);
    } catch {
      this.recordFailure("delPattern", pattern, started);
    }
  }
}
