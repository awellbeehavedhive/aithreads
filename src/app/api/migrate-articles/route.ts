/**
 * Migration Endpoint
 *
 * Migrates existing articles from category cache to permanent store.
 * Run this once after deploying the persistent storage feature.
 *
 * Also removes TTL from existing thread cache entries.
 */

import { NextResponse } from 'next/server';
import { migrateFromCategoryCache, getArticleStoreStats } from '@/lib/article-store';
import { getRedisClient, getAllKeys } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Migration] Starting migration to permanent article store...');

    // 1. Migrate articles from category cache to permanent store
    const articlesMigrated = await migrateFromCategoryCache();

    // 2. Remove TTL from existing thread cache entries
    const redis = getRedisClient();
    let threadsPersisted = 0;

    if (redis) {
      const threadKeys = await getAllKeys('thread:*');
      for (const key of threadKeys) {
        // PERSIST removes the TTL, making the key permanent
        await redis.persist(key);
        threadsPersisted++;
      }
      console.log(`[Migration] Persisted ${threadsPersisted} thread entries (removed TTL)`);
    }

    // 3. Get final stats
    const stats = await getArticleStoreStats();

    console.log('[Migration] Migration complete');

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
      articlesMigrated,
      threadsPersisted,
      permanentStoreStats: stats,
    });
  } catch (error: any) {
    console.error('[Migration] Error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check migration status
 */
export async function GET() {
  try {
    const stats = await getArticleStoreStats();

    return NextResponse.json({
      success: true,
      permanentStoreStats: stats,
      message: stats.totalArticles > 0
        ? `Permanent store has ${stats.totalArticles} articles`
        : 'Permanent store is empty - run POST to migrate',
    });
  } catch (error: any) {
    console.error('[Migration] Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check status', details: error.message },
      { status: 500 }
    );
  }
}
