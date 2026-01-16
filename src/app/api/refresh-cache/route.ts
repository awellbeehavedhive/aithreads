import { NextResponse } from 'next/server';
import { forceRefreshAllCategories, getCacheStats, getRawCache, updateCacheWithRankedArticles } from '@/lib/news-cache';
import { pregenerateFromCache } from '@/lib/thread-pregenerate';
import { rankArticlesByCategory } from '@/lib/article-ranker';

/**
 * API route to manually trigger cache refresh
 * Can be called by Vercel Cron or manually
 * 
 * Query params:
 * - pregenerate=true: Also pre-generate AI threads for top articles (default: true)
 * - rank=true: AI-rank articles by interest/importance (default: true)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Check for authorization header (simple Cron secret)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // Only require auth if CRON_SECRET is set in environment (for local dev convenience if unset)
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Also allow Vercel Cron signature if running on Vercel
      if (request.headers.get('user-agent') !== 'vercel-cron/1.0') {
         return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const shouldPregenerate = searchParams.get('pregenerate') !== 'false'; // Default true
    const shouldRank = searchParams.get('rank') !== 'false'; // Default true

    console.log('[Refresh] Starting cache refresh with Google Sheets logging...');
    await forceRefreshAllCategories();
    
    let stats = await getCacheStats();
    
    // AI-rank articles if requested
    let rankingResults = null;
    if (shouldRank && stats.totalCached > 0) {
      console.log('[Refresh] Starting AI ranking...');
      try {
        const newsCache = await getRawCache();
        
        // Extract articles by category
        const categorizedArticles: Record<string, any[]> = {};
        for (const [category, data] of Object.entries(newsCache)) {
          if (data.articles && data.articles.length > 0) {
            categorizedArticles[category] = data.articles as any[];
          }
        }
        
        // Rank all categories
        rankingResults = await rankArticlesByCategory(categorizedArticles);
        
        // Update cache with ranked articles
        for (const [category, result] of Object.entries(rankingResults)) {
          await updateCacheWithRankedArticles(category, result.rankedArticles);
        }
        
        console.log(`[Refresh] AI ranking complete for ${Object.keys(rankingResults).length} categories`);
        stats = await getCacheStats(); // Refresh stats after ranking
      } catch (error) {
        console.error('[Refresh] AI ranking failed:', error);
        // Continue without ranking
      }
    }
    
    // Pre-generate threads for top AI-ranked articles if requested
    // This happens AFTER ranking to ensure we pre-generate the most interesting articles
    let pregenerateResults = null;
    if (shouldPregenerate && stats.totalCached > 0) {
      console.log('[Refresh] Starting automatic pre-generation for AI-ranked articles...');
      try {
        // Get the NOW-RANKED cache (after AI ranking has updated it)
        const newsCache = await getRawCache();
        pregenerateResults = await pregenerateFromCache(newsCache);
        
        const totalSuccess = Object.values(pregenerateResults).reduce((sum, r) => sum + r.success, 0);
        console.log(`[Refresh] Pre-generation complete: ${totalSuccess} threads generated for top-ranked articles`);
      } catch (error) {
        console.error('[Refresh] Pre-generation failed:', error);
        // Don't fail the whole request if pre-generation fails
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Cache refreshed successfully',
      stats,
      ranking: rankingResults ? {
        enabled: true,
        categoriesRanked: Object.keys(rankingResults).length,
      } : {
        enabled: false,
        reason: shouldRank ? 'No cached news available' : 'Disabled via query param',
      },
      pregeneration: pregenerateResults ? {
        enabled: true,
        results: pregenerateResults,
      } : {
        enabled: false,
        reason: shouldPregenerate ? 'No cached news available' : 'Disabled via query param',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[Refresh] Error refreshing cache:', err.message);
    return NextResponse.json(
      { error: 'Failed to refresh cache', details: err.message },
      { status: 500 }
    );
  }
}

