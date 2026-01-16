import { NextResponse } from 'next/server';
import { getTopics, getTopicCacheStats } from '@/lib/topic-cache';

/**
 * GET /api/topics
 *
 * Returns all topics in ranked order (most important first)
 *
 * Query params:
 * - limit: Max number of topics to return (default: 15)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '15', 10);

    const topics = await getTopics(Math.min(limit, 50)); // Cap at 50
    const stats = await getTopicCacheStats();

    return NextResponse.json({
      topics,
      meta: {
        count: topics.length,
        lastUpdated: stats.lastUpdated,
        totalAvailable: stats.topicCount,
      },
    });
  } catch (error) {
    console.error('[API] Error fetching topics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch topics', topics: [], meta: { count: 0 } },
      { status: 500 }
    );
  }
}
