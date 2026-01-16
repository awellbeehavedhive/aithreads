import { NextResponse } from 'next/server';
import { getRawCache } from '@/lib/news-cache';
import { pregenerateFromCache } from '@/lib/thread-pregenerate';

/**
 * API route to trigger pre-generation of AI threads
 * for the top 3 articles in each category
 * 
 * This can be called:
 * - Manually for testing
 * - After news cache refresh
 * - On a schedule (future: Vercel Cron)
 */
export async function POST() {
  try {
    console.log('[API] Pre-generation triggered');
    
    // Get current news cache
    const newsCache = await getRawCache();
    
    // Check if we have any cached news
    const categories = Object.keys(newsCache);
    if (categories.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No news cache available. Fetch news first.',
      }, { status: 400 });
    }

    // Start pre-generation in background
    // Note: In serverless, this will block the request until complete
    // For true background processing, would need a queue system
    const results = await pregenerateFromCache(newsCache);

    const totalSuccess = Object.values(results).reduce((sum, r) => sum + r.success, 0);
    const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failed, 0);
    const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);

    return NextResponse.json({
      success: true,
      message: 'Pre-generation complete',
      summary: {
        totalSuccess,
        totalFailed,
        totalSkipped,
        totalProcessed: totalSuccess + totalFailed + totalSkipped,
      },
      byCategory: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[API] Pre-generation error:', err.message);
    return NextResponse.json(
      { error: 'Failed to pre-generate threads', details: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check pre-generation status
 */
export async function GET() {
  try {
    const newsCache = await getRawCache();
    const categories = Object.keys(newsCache);
    
    const info = {
      available: categories.length > 0,
      categories: categories.map(cat => ({
        name: cat,
        articles: newsCache[cat]?.articles?.length || 0,
        top3: newsCache[cat]?.articles?.slice(0, 3).map((a: any) => a.title.substring(0, 50)) || [],
      })),
      message: categories.length > 0 
        ? 'Ready for pre-generation. POST to this endpoint to trigger.'
        : 'No news cache available. Fetch news first.',
    };

    return NextResponse.json(info);
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json(
      { error: 'Failed to get pre-generation info', details: err.message },
      { status: 500 }
    );
  }
}

