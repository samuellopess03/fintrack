import type Redis from "ioredis";
import type { AppLogger } from "@/shared/core/types/logger";
import { CacheService } from "@/shared/platform/cache";
import type { CacheStore } from "@/shared/contracts/cache-store";

export class RedisCacheStore implements CacheStore {
  constructor(private readonly cacheService: CacheService) {}

  static fromRedis(redis: Redis | undefined, log?: AppLogger) {
    return new RedisCacheStore(new CacheService(redis, log));
  }

  get<T>(key: string): Promise<T | null> {
    return this.cacheService.get<T>(key);
  }

  set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    return this.cacheService.set(key, value, ttlSeconds);
  }

  del(key: string): Promise<void> {
    return this.cacheService.del(key);
  }

  delPattern(pattern: string): Promise<void> {
    return this.cacheService.delPattern(pattern);
  }
}
