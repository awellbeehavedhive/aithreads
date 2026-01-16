import { NextResponse } from 'next/server';
import { getRedisClient, getAllKeys } from '@/lib/redis';
import { clearAllThreadCache, getThreadCacheStats } from '@/lib/thread-cache';

/**
 * API route to clear cached news categories
 *
 * BY DEFAULT: Only clears the category cache (news:*) - performance layer
 * This is safe because articles are stored permanently in the article store.
 *
 * WITH ?permanent=true: Also clears permanent article and thread stores
 * USE WITH EXTREME CAUTION - This will break all existing thread URLs!
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clearPermanent = searchParams.get('permanent') === 'true';

    const redis = getRedisClient();

    if (!redis) {
      return NextResponse.json(
        { error: 'Redis not available' },
        { status: 500 }
      );
    }

    let newsCleared = 0;
    let articlesCleared = 0;
    let threadsCleared = 0;

    // Always clear category cache (performance layer)
    const newsKeys = await getAllKeys('news:*');
    for (const key of newsKeys) {
      await redis.del(key);
      newsCleared++;
    }

    console.log(`[ClearCache] Cleared ${newsCleared} category cache entries`);

    // Only clear permanent stores if explicitly requested
    if (clearPermanent) {
      console.warn('[ClearCache] WARNING: Clearing permanent stores - thread URLs may break!');

      // Clear permanent article store
      const articleKeys = await getAllKeys('article:*');
      for (const key of articleKeys) {
        await redis.del(key);
        articlesCleared++;
      }

      // Clear thread store
      const statsBefore = await getThreadCacheStats();
      threadsCleared = statsBefore.totalCached;
      await clearAllThreadCache();

      console.log(`[ClearCache] Cleared ${articlesCleared} articles and ${threadsCleared} threads (PERMANENT)`);
    }

    return NextResponse.json({
      success: true,
      message: clearPermanent
        ? 'All caches cleared including permanent stores (thread URLs may break!)'
        : 'Category cache cleared (permanent stores preserved)',
      categoryCacheCleared: newsCleared,
      permanentStoresCleared: clearPermanent,
      articlesCleared: clearPermanent ? articlesCleared : 0,
      threadsCleared: clearPermanent ? threadsCleared : 0,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[ClearCache] Error:', err.message);
    return NextResponse.json(
      { error: 'Failed to clear cache', details: err.message },
      { status: 500 }
    );
  }
}
