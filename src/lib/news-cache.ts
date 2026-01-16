/**
 * News Cache Manager (Redis-backed)
 *
 * TWO-LAYER STORAGE:
 * 1. PERMANENT STORE (article-store.ts) - Individual articles stored forever by URL
 * 2. CATEGORY CACHE (this file) - Category listings cached for 4 hours for fast homepage
 *
 * The category cache is just for performance. Articles are always stored permanently
 * in the article store so thread URLs never break.
 */

import axios from 'axios';
import { getCached, setCached, getAllKeys } from './redis';
import { fetchFromAllSources } from './multi-source-fetcher';
import { createLogger } from './logger';
import { createCycleLogger, initializeSheet } from './sheets-logger';
import { storeArticlesBatch, getRecentArticlesByCategory, getAllRecentArticles } from './article-store';
import { Article } from '@/types';

const logger = createLogger('NewsCache');

const API_KEY = process.env.NEWS_API_KEY;
const BASE_URL = 'https://newsapi.org/v2/top-headlines';

// Category cache TTL: 4 hours (just for fast homepage loading)
// Articles are stored permanently in article-store, so this is just a performance cache
const CACHE_DURATION_SECONDS = 4 * 60 * 60; // 4 hours

export interface CachedData {
  articles: unknown[];
  totalResults: number;
  timestamp: number;
}

// Track ongoing fetch requests to prevent duplicate API calls (in-memory, per-instance)
const pendingFetches: Map<string, Promise<CachedData>> = new Map();

/**
 * Generate cache key for a category
 */
function getCacheKey(category: string): string {
  return `news:${category.toLowerCase()}`;
}

/**
 * Fetch news from all sources (NewsAPI, GNews, RSS)
 */
async function fetchFromAPI(category: string): Promise<CachedData> {
  logger.info(`Fetching from all sources for category: ${category}`);

  // Use multi-source fetcher instead of just NewsAPI
  const result = await fetchFromAllSources(category);

  logger.info(`Fetched ${result.articles.length} articles from sources: ${result.sources.join(', ')}`);
  logger.debug(`Removed ${result.duplicatesRemoved} duplicates`);
  
  return {
    articles: result.articles,
    totalResults: result.articles.length,
    timestamp: Date.now(),
  };
}

/**
 * Get cached data or fetch if expired/missing
 * With graceful fallback to stale cache on rate limit errors
 */
export async function getCachedNews(category: string): Promise<CachedData> {
  const key = getCacheKey(category);
  const now = Date.now();
  
  // Try to get from Redis
  const cached = await getCached<CachedData>(key);

  // Return cached data if still valid
  if (cached && (now - cached.timestamp) < CACHE_DURATION_SECONDS * 1000) {
    logger.debug(`Serving cached data for ${category} (age: ${Math.round((now - cached.timestamp) / 1000 / 60)}min)`);
    return cached;
  }

  // If we have stale cache, log it for potential fallback
  if (cached) {
    logger.debug(`Stale cache available for ${category} (age: ${Math.round((now - cached.timestamp) / 1000 / 60)}min)`);
  }

  // Check if a fetch is already in progress for this category
  const pendingFetch = pendingFetches.get(category);
  if (pendingFetch) {
    logger.debug(`Waiting for pending fetch for ${category}`);
    return pendingFetch;
  }

  // Start new fetch with fallback to stale cache on error
  const fetchPromise = fetchFromAPI(category)
    .then(async (data) => {
      // Merge with existing cache to accumulate articles (up to 1000 total)
      const existing = await getCached<CachedData>(key);
      let mergedArticles = data.articles;

      if (existing?.articles) {
        // Filter out articles older than 7 days
        const MAX_ARTICLE_AGE_DAYS = 7;
        const maxAge = Date.now() - (MAX_ARTICLE_AGE_DAYS * 24 * 60 * 60 * 1000);

        const freshExistingArticles = (existing.articles as any[]).filter((article: any) => {
          const publishDate = new Date(article.publishedAt).getTime();
          return publishDate > maxAge;
        });

        logger.info(`Filtered ${existing.articles.length} existing articles to ${freshExistingArticles.length} fresh articles (< ${MAX_ARTICLE_AGE_DAYS} days old) for ${category}`);

        // Combine fresh existing articles with new articles, deduplicate by URL, limit to 1000
        // Sort by AI score (highest first) before deduplication to keep best versions
        const allArticles = [...freshExistingArticles, ...data.articles].sort((a: any, b: any) => {
          const scoreA = a.aiScore ?? 0;
          const scoreB = b.aiScore ?? 0;
          return scoreB - scoreA; // Highest score first
        });
        const uniqueArticles = Array.from(
          new Map(allArticles.map((article: any) => [article.url, article])).values()
        );
        mergedArticles = uniqueArticles.slice(0, 1000); // Cap at 1000 articles

        logger.info(`Merged ${freshExistingArticles.length} fresh existing + ${data.articles.length} new = ${mergedArticles.length} total articles for ${category}`);
      } else {
        logger.info(`Cached ${data.articles.length} articles for ${category} (no existing cache)`);
      }

      // PERMANENT STORAGE: Store all articles permanently before category caching
      // This ensures thread URLs will always work even after category cache expires
      await storeArticlesBatch(mergedArticles as Article[]);
      logger.info(`Permanently stored ${mergedArticles.length} articles for ${category}`);

      // Store merged data in category cache (for fast homepage loading)
      const mergedData: CachedData = {
        articles: mergedArticles,
        totalResults: mergedArticles.length,
        timestamp: Date.now()
      };

      await setCached(key, mergedData, CACHE_DURATION_SECONDS);
      pendingFetches.delete(category);

      return mergedData;
    })
    .catch(async (error) => {
      pendingFetches.delete(category);

      // Check if it's a rate limit error
      const isRateLimitError =
        error.response?.status === 429 ||
        error.response?.data?.code === 'rateLimited';

      if (isRateLimitError) {
        logger.warn(`Rate limit hit for ${category}`);

        // If we have stale cache, return it
        if (cached) {
          logger.info(`Returning stale cache for ${category} due to rate limit`);
          return cached;
        }
      }

      // Check if it's an API key error
      const isApiKeyError =
        error.response?.status === 401 ||
        error.response?.data?.code === 'apiKeyInvalid';

      if (isApiKeyError) {
        logger.error(`API key error for ${category}:`, error.response?.data);
        throw new Error('Invalid API key. Please check your NewsAPI configuration.');
      }

      logger.error(`Error fetching ${category}:`, error.message);

      // If we have stale cache, return it as fallback
      if (cached) {
        logger.info(`Returning stale cache for ${category} due to error`);
        return cached;
      }

      // FALLBACK: Try to get articles from permanent store
      logger.info(`Attempting fallback to permanent article store for ${category}`);
      const fallbackArticles = await getRecentArticlesByCategory(category, 100, 72); // 72 hours max age
      if (fallbackArticles.length > 0) {
        logger.info(`Fallback succeeded: ${fallbackArticles.length} articles from permanent store for ${category}`);
        return {
          articles: fallbackArticles,
          totalResults: fallbackArticles.length,
          timestamp: Date.now(),
        };
      }

      throw error;
    });

  pendingFetches.set(category, fetchPromise);
  return fetchPromise;
}

/**
 * Update cache with ranked articles (called after AI ranking)
 */
export async function updateCacheWithRankedArticles(
  category: string,
  rankedArticles: unknown[]
): Promise<void> {
  const key = getCacheKey(category);
  const existing = await getCached<CachedData>(key);

  if (existing) {
    const updatedData: CachedData = {
      ...existing,
      articles: rankedArticles,
      timestamp: Date.now(), // Update timestamp
    };
    
    await setCached(key, updatedData, CACHE_DURATION_SECONDS);
    logger.info(`Updated ${category} with ${rankedArticles.length} ranked articles`);
  } else {
    logger.warn(`Cannot update ${category} - no existing cache`);
  }
}

/**
 * Prefetch all categories to warm the cache
 */
export async function prefetchAllCategories(): Promise<void> {
  const categories = ['general', 'Technology', 'Business', 'Health', 'Science'];
  
  logger.info('Prefetching all categories...');
  
  // Fetch all categories in parallel
  await Promise.all(
    categories.map(category => 
      getCachedNews(category).catch(error => {
        logger.error(`Failed to prefetch ${category}:`, error.message);
      })
    )
  );
  
  logger.info('Prefetch complete');
}

/**
 * Force refresh all categories (bypass cache)
 * Uses smart category rotation to stay under API rate limits
 */
export async function forceRefreshAllCategories(): Promise<void> {
  // Import dynamically to avoid circular dependency
  const { getCategoriesToFetch, getRateLimitStatus } = await import('./api-rate-limiter');

  // Get categories based on current hour and rate limit status
  const categories = await getCategoriesToFetch();

  // Log rate limit status
  const rateLimitStatus = await getRateLimitStatus();
  logger.info(`Rate limit status: NewsAPI ${rateLimitStatus.newsapi?.count || 0}/${rateLimitStatus.newsapi?.limit || 100}, GNews ${rateLimitStatus.gnews?.count || 0}/${rateLimitStatus.gnews?.limit || 100}`);
  logger.info(`Fetching ${categories.length} categories this hour: ${categories.join(', ')}`);

  logger.info('Force refreshing all categories (bypassing cache)...');

  // Initialize Google Sheets (if configured)
  await initializeSheet().catch(() => {
    /* Silently fail if sheets not configured */
  });

  // Fetch all categories in parallel, accumulating with existing cache
  await Promise.all(
    categories.map(async (category) => {
      const cycleLogger = createCycleLogger(category);

      try {
        const cacheKey = getCacheKey(category);
        const data = await fetchFromAPI(category);

        // Log fetched articles
        cycleLogger.logFetch(data.articles as any[], 'multi-source');

        // Merge with existing cache (same logic as regular fetch)
        const existing = await getCached<CachedData>(cacheKey);
        let mergedArticles = data.articles;

        if (existing?.articles) {
          // Filter out articles older than 7 days
          const MAX_ARTICLE_AGE_DAYS = 7;
          const maxAge = Date.now() - (MAX_ARTICLE_AGE_DAYS * 24 * 60 * 60 * 1000);

          const staleArticles = (existing.articles as any[]).filter((article: any) => {
            const publishDate = new Date(article.publishedAt).getTime();
            return publishDate <= maxAge;
          });

          const freshExistingArticles = (existing.articles as any[]).filter((article: any) => {
            const publishDate = new Date(article.publishedAt).getTime();
            return publishDate > maxAge;
          });

          // Log purged articles (stale)
          if (staleArticles.length > 0) {
            cycleLogger.logPurge(staleArticles as any[], `Older than ${MAX_ARTICLE_AGE_DAYS} days`);
          }

          logger.info(`Filtered ${existing.articles.length} existing articles to ${freshExistingArticles.length} fresh articles (< ${MAX_ARTICLE_AGE_DAYS} days old) for ${category}`);

          // Combine fresh existing articles with new articles, deduplicate by URL, limit to 1000
          // IMPORTANT: New articles (no aiScore yet) must come FIRST to avoid being cut off
          // by the 1000 limit before they get ranked. Scored articles sorted by score descending.
          const allArticles = [...freshExistingArticles, ...data.articles].sort((a: any, b: any) => {
            const scoreA = a.aiScore;
            const scoreB = b.aiScore;

            // New articles (no score) come first - they need to be ranked
            if (scoreA === undefined && scoreB === undefined) return 0;
            if (scoreA === undefined) return -1; // a (new) comes first
            if (scoreB === undefined) return 1;  // b (new) comes first

            // Both have scores - sort by score descending (highest first)
            return scoreB - scoreA;
          });

          // Track which articles get deduped
          const urlMap = new Map<string, any>();
          const dedupedArticles: any[] = [];

          for (const article of allArticles) {
            const existing = urlMap.get(article.url);
            if (existing) {
              // Check if we should replace: prefer scored articles over unscored
              const existingHasScore = existing.aiScore !== undefined;
              const articleHasScore = article.aiScore !== undefined;

              if (!existingHasScore && articleHasScore) {
                // Replace unscored article with scored one (preserve ranking)
                urlMap.set(article.url, article);
                cycleLogger.logDedupe(
                  existing,
                  `Replaced unscored with scored article (score: ${article.aiScore})`,
                  article
                );
              } else {
                // Keep existing (scored over unscored, or first when same status)
                cycleLogger.logDedupe(
                  article,
                  `Duplicate URL (kept ${existingHasScore ? `scored: ${existing.aiScore}` : 'first unscored'})`,
                  existing
                );
              }
              dedupedArticles.push(article);
            } else {
              urlMap.set(article.url, article);
            }
          }

          const uniqueArticles = Array.from(urlMap.values());
          mergedArticles = uniqueArticles.slice(0, 1000); // Cap at 1000 articles

          // Log purged articles (over 1000 limit)
          if (uniqueArticles.length > 1000) {
            const purged = uniqueArticles.slice(1000);
            cycleLogger.logPurge(purged as any[], 'Exceeded 1000 article limit');
          }

          logger.info(`Force refresh merged ${freshExistingArticles.length} fresh existing + ${data.articles.length} new = ${mergedArticles.length} total articles for ${category}`);
        } else {
          logger.info(`Force refreshed ${category}: ${data.articles.length} articles`);
        }

        // Log displayed articles (top 100 sorted by score)
        const displayedArticles = (mergedArticles as any[])
          .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
          .slice(0, 100);
        cycleLogger.logDisplay(displayedArticles, 'AI Score (Highest First)');

        // PERMANENT STORAGE: Store all articles permanently
        await storeArticlesBatch(mergedArticles as Article[]);
        logger.info(`Permanently stored ${mergedArticles.length} articles for ${category}`);

        // Store merged data in category cache (for fast homepage loading)
        const mergedData: CachedData = {
          articles: mergedArticles,
          totalResults: mergedArticles.length,
          timestamp: Date.now()
        };

        await setCached(cacheKey, mergedData, CACHE_DURATION_SECONDS);

        // Flush logs to Google Sheets
        await cycleLogger.flush();
        const summary = cycleLogger.getSummary();
        logger.info(`Logged ${summary.totalEvents} events for ${category}:`, summary.byType);
      } catch (error: any) {
        logger.error(`Failed to force refresh ${category}:`, error.message);
      }
    })
  );

  logger.info('Force refresh complete');
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const keys = await getAllKeys('news:*');
    
    const stats = await Promise.all(
      keys.map(async (key) => {
        const data = await getCached<CachedData>(key);
        if (!data) return null;
        
        const category = key.replace('news:', '');
        const age = Math.round((Date.now() - data.timestamp) / 1000 / 60); // minutes
        
        return {
          category,
          articles: data.articles.length,
          age,
        };
      })
    );

    const validStats = stats.filter(s => s !== null);

    return {
      categories: validStats,
      totalCached: validStats.length,
    };
  } catch (error) {
    logger.error('Error getting stats:', error);
    return {
      categories: [],
      totalCached: 0,
    };
  }
}

/**
 * Get raw cache (for debugging/admin purposes)
 */
export async function getRawCache(): Promise<Record<string, CachedData>> {
  try {
    const keys = await getAllKeys('news:*');
    const cache: Record<string, CachedData> = {};
    
    await Promise.all(
      keys.map(async (key) => {
        const data = await getCached<CachedData>(key);
        if (data) {
          const category = key.replace('news:', '');
          cache[category] = data;
        }
      })
    );

    return cache;
  } catch (error) {
    logger.error('Error getting raw cache:', error);
    return {};
  }
}

/**
 * Get paginated results from cache
 */
export async function getPaginatedResults(
  category: string,
  page: number = 1,
  pageSize: number = 10
): Promise<{ articles: unknown[]; totalResults: number }> {
  try {
    const cached = await getCachedNews(category);
    
    if (!cached || !cached.articles) {
      return { articles: [], totalResults: 0 };
    }

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedArticles = cached.articles.slice(startIndex, endIndex);

    return {
      articles: paginatedArticles,
      totalResults: cached.totalResults,
    };
  } catch (error) {
    logger.error(`Error getting paginated results for ${category}:`, error);
    return { articles: [], totalResults: 0 };
  }
}
