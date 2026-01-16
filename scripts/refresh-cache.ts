
import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });
import { forceRefreshAllCategories, getCacheStats, getRawCache, updateCacheWithRankedArticles } from '@/lib/news-cache';
import { pregenerateFromCache } from '@/lib/thread-pregenerate';
import { rankArticlesByCategory } from '@/lib/article-ranker';

async function run() {
  console.log('[Worker] Starting background cache refresh...');
  const startTime = Date.now();

  try {
    // 1. Fetch News (force refresh to bypass cache)
    console.log('[Worker] Step 1: Force fetching fresh news...');
    const beforeStats = await getCacheStats();
    const beforeTotalArticles = beforeStats.categories.reduce((sum, cat) => sum + cat.articles, 0);
    console.log(`[Worker] Before fetch: ${beforeTotalArticles} total articles`);

    await forceRefreshAllCategories();

    const afterStats = await getCacheStats();
    const afterTotalArticles = afterStats.categories.reduce((sum, cat) => sum + cat.articles, 0);
    console.log(`[Worker] After fetch: ${afterTotalArticles} total articles`);
    console.log(`[Worker] Articles added: ${afterTotalArticles - beforeTotalArticles}`);

    // Check if we actually added new articles
    if (afterTotalArticles === beforeTotalArticles) {
      console.warn('[Worker] WARNING: No new articles added during fetch!');
      console.warn('[Worker] Possible causes:');
      console.warn('[Worker] - All articles were duplicates');
      console.warn('[Worker] - API rate limits exceeded');
      console.warn('[Worker] - API keys invalid or missing');
      console.warn('[Worker] - Network/API failures');
    } else {
      // Update admin metrics baseline only when articles were actually added
      console.log(`[Worker] Updating admin metrics baseline: ${beforeTotalArticles} → ${afterTotalArticles}`);
      const { getRedisClient } = await import('@/lib/redis');
      const redis = getRedisClient();
      if (redis) {
        try {
          // Count validated articles (those with images and passing filters)
          const validatedCount = afterTotalArticles; // All cached articles are validated in our current system

          await redis.set('admin:metrics:prevTotal', afterTotalArticles.toString());
          await redis.set('admin:metrics:prevValidated', validatedCount.toString());
          console.log(`[Worker] ✅ Updated admin metrics baseline: ${afterTotalArticles} total, ${validatedCount} validated articles`);

          // Verify the keys were set
          const checkTotal = await redis.get('admin:metrics:prevTotal');
          const checkValidated = await redis.get('admin:metrics:prevValidated');
          console.log(`[Worker] ✅ Verification - Redis keys set: prevTotal=${checkTotal}, prevValidated=${checkValidated}`);
        } catch (error) {
          console.error('[Worker] ❌ Error updating admin metrics:', error);
        }
      } else {
        console.warn('[Worker] ❌ Redis client not available for metrics update');
      }
    }

    let stats = afterStats;
    console.log(`[Worker] Cache stats: ${stats.totalCached} total articles cached across ${stats.categories.length} categories`);

    if (stats.totalCached === 0) {
      console.warn('[Worker] No articles cached. Aborting ranking/pre-generation.');
      return;
    }

    // 2. AI Ranking
    console.log('[Worker] Step 2: AI Ranking...');
    const newsCache = await getRawCache();
    
    // Extract articles by category
    const categorizedArticles: Record<string, any[]> = {};
    for (const [category, data] of Object.entries(newsCache)) {
      if (data.articles && data.articles.length > 0) {
        categorizedArticles[category] = data.articles as any[];
      }
    }
    
    const rankingResults = await rankArticlesByCategory(categorizedArticles);
    
    // Update cache with ranked articles
    for (const [category, result] of Object.entries(rankingResults)) {
      await updateCacheWithRankedArticles(category, result.rankedArticles);
    }
    console.log(`[Worker] AI ranking complete for ${Object.keys(rankingResults).length} categories`);

    // 3. Thread Pre-generation
    console.log('[Worker] Step 3: Thread Pre-generation...');
    // Get the NOW-RANKED cache
    const updatedCache = await getRawCache();
    const pregenResults = await pregenerateFromCache(updatedCache);
    
    const totalSuccess = Object.values(pregenResults).reduce((sum, r) => sum + r.success, 0);
    console.log(`[Worker] Pre-generation complete: ${totalSuccess} threads generated`);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[Worker] Job complete in ${duration.toFixed(2)}s`);
    process.exit(0);

  } catch (error) {
    console.error('[Worker] Fatal error:', error);
    process.exit(1);
  }
}

run();

