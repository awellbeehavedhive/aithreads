/**
 * API Rate Limiter
 *
 * Manages API call quotas to stay under daily limits while maximizing freshness.
 *
 * Strategy:
 * - Track daily API calls in Redis
 * - Spread calls throughout the day
 * - Skip API calls when approaching limits
 * - Reset counters at midnight UTC
 */

import { getRedisClient } from './redis';

interface RateLimitConfig {
  dailyLimit: number;
  safetyMargin: number; // Reserve some calls for manual triggers
}

const API_CONFIGS: Record<string, RateLimitConfig> = {
  newsapi: { dailyLimit: 100, safetyMargin: 5 },
  gnews: { dailyLimit: 100, safetyMargin: 5 },
};

/**
 * Get the current UTC date as a string key (e.g., "2026-01-10")
 */
function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get the Redis key for tracking daily API calls
 */
function getCounterKey(apiName: string): string {
  return `ratelimit:${apiName}:${getTodayKey()}`;
}

/**
 * Get current call count for an API today
 */
export async function getApiCallCount(apiName: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;

  const key = getCounterKey(apiName);
  const count = await redis.get(key);
  if (!count) return 0;
  // Handle both string and object returns from Redis
  const countStr = typeof count === 'string' ? count : String(count);
  return parseInt(countStr, 10) || 0;
}

/**
 * Increment and get the new call count
 * Returns the new count after incrementing
 */
export async function incrementApiCallCount(apiName: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;

  const key = getCounterKey(apiName);
  const newCount = await redis.incr(key);

  // Set expiry to 25 hours (to ensure cleanup even with timezone drift)
  await redis.expire(key, 25 * 60 * 60);

  return newCount;
}

/**
 * Check if we can make another API call
 * Returns true if under limit, false if we should skip
 */
export async function canMakeApiCall(apiName: string): Promise<boolean> {
  const config = API_CONFIGS[apiName];
  if (!config) {
    console.warn(`[RateLimiter] Unknown API: ${apiName}`);
    return true; // Allow unknown APIs
  }

  const currentCount = await getApiCallCount(apiName);
  const effectiveLimit = config.dailyLimit - config.safetyMargin;

  if (currentCount >= effectiveLimit) {
    console.log(`[RateLimiter] ${apiName}: At limit (${currentCount}/${config.dailyLimit}), skipping`);
    return false;
  }

  return true;
}

/**
 * Record an API call and check if it was allowed
 * Use this after making a successful API call
 */
export async function recordApiCall(apiName: string): Promise<void> {
  const newCount = await incrementApiCallCount(apiName);
  const config = API_CONFIGS[apiName];
  const remaining = config ? config.dailyLimit - newCount : 'unknown';
  console.log(`[RateLimiter] ${apiName}: Call recorded (${newCount} today, ${remaining} remaining)`);
}

/**
 * Get status of all APIs
 */
export async function getRateLimitStatus(): Promise<Record<string, { count: number; limit: number; remaining: number }>> {
  const status: Record<string, { count: number; limit: number; remaining: number }> = {};

  for (const [apiName, config] of Object.entries(API_CONFIGS)) {
    const count = await getApiCallCount(apiName);
    status[apiName] = {
      count,
      limit: config.dailyLimit,
      remaining: Math.max(0, config.dailyLimit - count),
    };
  }

  return status;
}

/**
 * Determine which categories to fetch based on rate limits and time of day
 * Returns a list of categories that should be fetched
 *
 * Strategy:
 * - We have 5 categories and ~100 API calls/day per API
 * - That's 20 calls per category per day
 * - Running every hour means 24 runs, but we can only afford ~19-20 per category
 * - Solution: Rotate which category is skipped each hour
 */
export function getCategoriesForHour(hour: number): string[] {
  const allCategories = ['general', 'technology', 'business', 'health', 'science'];

  // Rotate which category is skipped based on hour
  // This ensures all categories get equal coverage (~19-20 fetches/day each)
  const skipIndex = hour % allCategories.length;

  return allCategories.filter((_, index) => index !== skipIndex);
}

/**
 * Smart category selection that considers both time and current API usage
 */
export async function getCategoriesToFetch(): Promise<string[]> {
  const hour = new Date().getUTCHours();
  const baseCategories = getCategoriesForHour(hour);

  // Check rate limits
  const newsapiOk = await canMakeApiCall('newsapi');
  const gnewsOk = await canMakeApiCall('gnews');

  // If both APIs are at limit, we can still fetch from RSS (which has no limit)
  // But we should reduce categories to avoid overloading
  if (!newsapiOk && !gnewsOk) {
    console.log('[RateLimiter] Both APIs at limit, fetching only top 3 categories for RSS');
    return baseCategories.slice(0, 3);
  }

  return baseCategories;
}
