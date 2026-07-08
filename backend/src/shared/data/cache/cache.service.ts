import type Redis from "ioredis";

export class CacheService {
  private failureCount = 0;
  private lastFailure: Date | null = null;
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 30_000;

  constructor(private readonly redis: Redis | undefined) {}

  private isCircuitOpen(): boolean {
    if (this.failureCount < this.FAILURE_THRESHOLD) return false;
    if (!this.lastFailure) return false;

    const elapsed = Date.now() - this.lastFailure.getTime();
    if (elapsed > this.RECOVERY_TIMEOUT) {
      this.failureCount = 0;
      return false;
    }
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis || this.isCircuitOpen()) return null;

    try {
      const value = await this.redis.get(key);
      this.failureCount = 0;
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      this.failureCount++;
      this.lastFailure = new Date();
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis || this.isCircuitOpen()) return;

    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      this.failureCount = 0;
    } catch {
      this.failureCount++;
      this.lastFailure = new Date();
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(key);
    } catch {
      // silent
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.redis) return;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      // silent
    }
  }
}
