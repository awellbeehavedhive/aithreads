/**
 * Redis Client (Upstash Redis)
 * 
 * Provides persistent caching across serverless function invocations
 * Uses @upstash/redis for direct Upstash Redis connection
 */

import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

/**
 * Get Redis client (Upstash)
 * Uses KV_REST_API_URL and KV_REST_API_TOKEN environment variables
 */
export function getRedisClient() {
  if (!redisClient && isRedisAvailable()) {
    redisClient = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return redisClient;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  // Check for Upstash Redis environment variables
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Fallback to in-memory cache if Redis is not available
 * (useful for local development without Redis)
 * Using globalThis to ensure cache persists across hot reloads in development
 */
const getMemoryCache = () => {
  if (!(globalThis as any).__memoryCache) {
    (globalThis as any).__memoryCache = new Map<string, { value: unknown; expiry: number }>();
  }
  return (globalThis as any).__memoryCache as Map<string, { value: unknown; expiry: number }>;
};

const memoryCache = getMemoryCache();

export async function getCached<T>(key: string): Promise<T | null> {
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      if (!redis) {
        // Fall back to memory cache if Redis client fails
        const cached = memoryCache.get(key);
        if (cached && cached.expiry > Date.now()) {
          return cached.value as T;
        }
        return null;
      }
      
      // Set a timeout for Redis operations
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 3000); // 3 second timeout
      });
      
      const valuePromise = redis.get(key);
      const value = await Promise.race([valuePromise, timeoutPromise]);
      
      if (value === null) {
        // Fall back to memory cache if Redis times out or returns null
        const cached = memoryCache.get(key);
        if (cached && cached.expiry > Date.now()) {
          return cached.value as T;
        }
        return null;
      }
      
      // Upstash Redis returns parsed objects directly
      return value as T;
    } catch (error) {
      console.error('[Redis] Get error, falling back to memory cache:', error);
      // Fall back to memory cache on error
      const cached = memoryCache.get(key);
      if (cached && cached.expiry > Date.now()) {
        return cached.value as T;
      }
      return null;
    }
  } else {
    // Fallback to memory cache
    const cached = memoryCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.value as T;
    }
    return null;
  }
}

export async function setCached<T>(
  key: string,
  value: T,
  expirySeconds?: number
): Promise<void> {
  // Always set in memory cache as backup
  memoryCache.set(key, {
    value,
    expiry: expirySeconds ? Date.now() + expirySeconds * 1000 : Infinity,
  });

  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      if (!redis) return;
      
      // Set a timeout for Redis operations
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 3000); // 3 second timeout
      });
      
      const setPromise = (async () => {
        // Upstash Redis handles JSON serialization automatically
      if (expirySeconds) {
          await redis.set(key, value, { ex: expirySeconds });
      } else {
          await redis.set(key, value);
      }
      })();
      
      await Promise.race([setPromise, timeoutPromise]);
    } catch (error) {
      console.error('[Redis] Set error, using memory cache fallback:', error);
      // Memory cache already set above, so just continue
    }
  }
}

export async function deleteCached(key: string): Promise<void> {
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      if (!redis) return;
      await redis.del(key);
    } catch (error) {
      console.error('[Redis] Delete error:', error);
    }
  } else {
    memoryCache.delete(key);
  }
}

export async function getAllKeys(pattern: string): Promise<string[]> {
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      if (!redis) return [];
      
      // Upstash Redis uses scan for better performance
      const keys: string[] = [];
      let cursor: string | number = 0;
      
      do {
        const result: [string | number, string[]] = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = typeof result[0] === 'string' ? parseInt(result[0], 10) : result[0];
        keys.push(...result[1]);
      } while (cursor !== 0);
      
      return keys;
    } catch (error) {
      console.error('[Redis] Keys error:', error);
      return [];
    }
  } else {
    // Fallback: filter memory cache keys
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(memoryCache.keys()).filter(key => regex.test(key));
  }
}

