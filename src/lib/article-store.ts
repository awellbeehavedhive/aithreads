/**
 * Permanent Article Store
 *
 * Stores articles permanently by URL for reliable thread page lookups.
 * Articles never expire - shared thread URLs will always work.
 *
 * Key format: article:{base64_encoded_url}
 */

import { getCached, setCached, getAllKeys, getRedisClient, isRedisAvailable } from './redis';
import { Article } from '@/types';
import { createLogger } from './logger';

const logger = createLogger('ArticleStore');

/**
 * Stored article with metadata
 */
export interface StoredArticle extends Article {
  storedAt: number; // When we first stored this article
  lastDisplayedAt: number; // When this was last shown to a user
}

/**
 * Generate a safe Redis key from a URL
 * Uses base64 encoding to handle special characters
 */
function getArticleKey(url: string): string {
  // Use base64 encoding for the URL to create a safe key
  const encoded = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
  return `article:${encoded}`;
}

/**
 * Decode an article key back to URL
 */
function decodeArticleKey(key: string): string {
  const encoded = key.replace('article:', '').replace(/_/g, '/');
  // Handle padding
  const paddedEncoded = encoded + '=='.slice(0, (4 - (encoded.length % 4)) % 4);
  return Buffer.from(paddedEncoded, 'base64').toString('utf-8');
}

/**
 * Store a single article permanently
 */
export async function storeArticle(article: Article): Promise<void> {
  if (!article.url) {
    logger.warn('Cannot store article without URL');
    return;
  }

  const key = getArticleKey(article.url);
  const now = Date.now();

  // Check if article already exists to preserve storedAt
  const existing = await getCached<StoredArticle>(key);

  const storedArticle: StoredArticle = {
    ...article,
    storedAt: existing?.storedAt || now,
    lastDisplayedAt: now,
  };

  // Store permanently (no TTL)
  await setCached(key, storedArticle);
  logger.debug(`Stored article: ${article.title?.substring(0, 50)}...`);
}

/**
 * Store multiple articles in batch
 * More efficient than storing one by one
 */
export async function storeArticlesBatch(articles: Article[]): Promise<number> {
  if (!articles || articles.length === 0) return 0;

  const now = Date.now();
  let stored = 0;

  // Process in parallel batches of 50 to avoid overwhelming Redis
  const batchSize = 50;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (article) => {
        if (!article.url) return;

        const key = getArticleKey(article.url);
        const existing = await getCached<StoredArticle>(key);

        const storedArticle: StoredArticle = {
          ...article,
          storedAt: existing?.storedAt || now,
          lastDisplayedAt: now,
        };

        await setCached(key, storedArticle);
        stored++;
      })
    );
  }

  logger.info(`Batch stored ${stored} articles in permanent store`);
  return stored;
}

/**
 * Get an article by its URL
 * This is the primary lookup method for thread pages
 */
export async function getArticleByUrl(url: string): Promise<StoredArticle | null> {
  if (!url) return null;

  try {
    // Try to decode the URL in case it's encoded
    const decodedUrl = decodeURIComponent(url);
    const key = getArticleKey(decodedUrl);
    const article = await getCached<StoredArticle>(key);

    if (article) {
      // Update lastDisplayedAt
      article.lastDisplayedAt = Date.now();
      await setCached(key, article);
      return article;
    }

    // Try with the original URL if decoded didn't work
    if (decodedUrl !== url) {
      const originalKey = getArticleKey(url);
      const originalArticle = await getCached<StoredArticle>(originalKey);
      if (originalArticle) {
        originalArticle.lastDisplayedAt = Date.now();
        await setCached(originalKey, originalArticle);
        return originalArticle;
      }
    }

    return null;
  } catch (error) {
    logger.error('Error getting article by URL:', error);
    return null;
  }
}

/**
 * Check if an article exists in the permanent store
 */
export async function isArticleStored(url: string): Promise<boolean> {
  if (!url) return false;

  try {
    const decodedUrl = decodeURIComponent(url);
    const key = getArticleKey(decodedUrl);
    const article = await getCached<StoredArticle>(key);
    return article !== null;
  } catch {
    return false;
  }
}

/**
 * Get total count of stored articles
 */
export async function getArticleCount(): Promise<number> {
  try {
    const keys = await getAllKeys('article:*');
    return keys.length;
  } catch (error) {
    logger.error('Error getting article count:', error);
    return 0;
  }
}

/**
 * Get storage statistics
 */
export async function getArticleStoreStats(): Promise<{
  totalArticles: number;
  oldestArticle: number | null;
  newestArticle: number | null;
}> {
  try {
    const keys = await getAllKeys('article:*');
    let oldest: number | null = null;
    let newest: number | null = null;

    // Sample a subset for performance
    const sampleSize = Math.min(100, keys.length);
    const sampleKeys = keys.slice(0, sampleSize);

    for (const key of sampleKeys) {
      const article = await getCached<StoredArticle>(key);
      if (article?.storedAt) {
        if (oldest === null || article.storedAt < oldest) {
          oldest = article.storedAt;
        }
        if (newest === null || article.storedAt > newest) {
          newest = article.storedAt;
        }
      }
    }

    return {
      totalArticles: keys.length,
      oldestArticle: oldest,
      newestArticle: newest,
    };
  } catch (error) {
    logger.error('Error getting article store stats:', error);
    return {
      totalArticles: 0,
      oldestArticle: null,
      newestArticle: null,
    };
  }
}

/**
 * Clean up old articles that haven't been displayed recently
 * Only removes articles that:
 * 1. Are older than retentionDays
 * 2. Haven't been displayed in lastDisplayDays
 * 3. Have no associated thread
 */
export async function cleanupOldArticles(options: {
  retentionDays?: number;
  lastDisplayDays?: number;
  dryRun?: boolean;
  maxToDelete?: number;
}): Promise<{ scanned: number; deleted: number; skipped: number }> {
  const {
    retentionDays = 90,
    lastDisplayDays = 7,
    dryRun = false,
    maxToDelete = 1000,
  } = options;

  const now = Date.now();
  const retentionCutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const displayCutoff = now - lastDisplayDays * 24 * 60 * 60 * 1000;

  let scanned = 0;
  let deleted = 0;
  let skipped = 0;

  try {
    const keys = await getAllKeys('article:*');
    logger.info(`Cleanup: scanning ${keys.length} articles`);

    for (const key of keys) {
      if (deleted >= maxToDelete) break;
      scanned++;

      const article = await getCached<StoredArticle>(key);
      if (!article) continue;

      // Check if article qualifies for deletion
      const isOld = article.storedAt < retentionCutoff;
      const notRecentlyDisplayed = article.lastDisplayedAt < displayCutoff;

      if (isOld && notRecentlyDisplayed) {
        // Check if there's an associated thread
        const threadKey = `thread:${article.url}`;
        const hasThread = await getCached(threadKey);

        if (!hasThread) {
          if (!dryRun) {
            const redis = getRedisClient();
            if (redis) {
              await redis.del(key);
            }
          }
          deleted++;
          logger.debug(`${dryRun ? '[DRY RUN] Would delete' : 'Deleted'}: ${article.title?.substring(0, 50)}`);
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    logger.info(`Cleanup complete: scanned=${scanned}, deleted=${deleted}, skipped=${skipped}`);
    return { scanned, deleted, skipped };
  } catch (error) {
    logger.error('Error during cleanup:', error);
    return { scanned, deleted, skipped };
  }
}

/**
 * Get recent articles from permanent store by category
 * Used as fallback when category cache is empty
 * Scans all articles and filters - use sparingly
 */
export async function getRecentArticlesByCategory(
  category: string,
  limit: number = 100,
  maxAgeHours: number = 48
): Promise<StoredArticle[]> {
  try {
    const keys = await getAllKeys('article:*');
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const articles: StoredArticle[] = [];
    const normalizedCategory = category.toLowerCase();

    // Process in batches to avoid overwhelming Redis
    const batchSize = 100;
    for (let i = 0; i < keys.length && articles.length < limit; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          const article = await getCached<StoredArticle>(key);
          if (!article) return null;

          // Check category match and recency
          const articleCategory = article.category?.toLowerCase() || 'general';
          const publishedAt = new Date(article.publishedAt).getTime();

          if (articleCategory === normalizedCategory && publishedAt > cutoff) {
            return article;
          }
          return null;
        })
      );

      articles.push(...batchResults.filter((a): a is StoredArticle => a !== null));
    }

    // Sort by AI score (highest first), then by publishedAt (newest first)
    articles.sort((a, b) => {
      const scoreA = a.aiScore ?? 0;
      const scoreB = b.aiScore ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    logger.info(`Fallback: retrieved ${articles.length} recent ${category} articles from permanent store`);
    return articles.slice(0, limit);
  } catch (error) {
    logger.error('Error getting recent articles by category:', error);
    return [];
  }
}

/**
 * Get all recent articles from permanent store (across all categories)
 * Used as fallback when all category caches are empty
 */
export async function getAllRecentArticles(
  limit: number = 200,
  maxAgeHours: number = 48
): Promise<StoredArticle[]> {
  try {
    const keys = await getAllKeys('article:*');
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const articles: StoredArticle[] = [];

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < keys.length && articles.length < limit * 2; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          const article = await getCached<StoredArticle>(key);
          if (!article) return null;

          const publishedAt = new Date(article.publishedAt).getTime();
          if (publishedAt > cutoff) {
            return article;
          }
          return null;
        })
      );

      articles.push(...batchResults.filter((a): a is StoredArticle => a !== null));
    }

    // Sort by AI score (highest first)
    articles.sort((a, b) => {
      const scoreA = a.aiScore ?? 0;
      const scoreB = b.aiScore ?? 0;
      return scoreB - scoreA;
    });

    logger.info(`Fallback: retrieved ${Math.min(articles.length, limit)} recent articles from permanent store`);
    return articles.slice(0, limit);
  } catch (error) {
    logger.error('Error getting all recent articles:', error);
    return [];
  }
}

/**
 * Migrate existing articles from category cache to permanent store
 */
export async function migrateFromCategoryCache(): Promise<number> {
  let migrated = 0;
  const seenUrls = new Set<string>();

  try {
    // Get all category cache keys
    const categoryKeys = await getAllKeys('news:*');
    logger.info(`Migration: found ${categoryKeys.length} category caches`);

    for (const key of categoryKeys) {
      const cached = await getCached<{ articles: Article[]; timestamp: number }>(key);
      if (!cached?.articles) continue;

      const category = key.replace('news:', '');
      logger.info(`Migrating ${cached.articles.length} articles from ${category}`);

      for (const article of cached.articles) {
        if (!article.url || seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);

        // Store with category info
        const articleWithCategory = {
          ...article,
          category: article.category || category,
        };

        await storeArticle(articleWithCategory);
        migrated++;
      }
    }

    logger.info(`Migration complete: ${migrated} articles migrated`);
    return migrated;
  } catch (error) {
    logger.error('Error during migration:', error);
    return migrated;
  }
}
