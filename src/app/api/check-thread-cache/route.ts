import { NextResponse } from 'next/server';
import { hasThreadCache } from '@/lib/thread-cache';

/**
 * Check if threads are cached for multiple articles
 * POST body: { articles: Array<{ title: string, url?: string }> }
 */
export async function POST(request: Request) {
  try {
    const { articles } = await request.json();

    if (!Array.isArray(articles)) {
      return NextResponse.json(
        { error: 'articles must be an array' },
        { status: 400 }
      );
    }

    // Check cache status for each article
    const results = await Promise.all(
      articles.map(async (article: { title: string; url?: string }) => {
        const cached = await hasThreadCache(article.title, article.url);
        return {
          url: article.url || article.title,
          cached,
        };
      })
    );

    // Return as a map for easy lookup
    const cacheMap: Record<string, boolean> = {};
    results.forEach((result) => {
      cacheMap[result.url] = result.cached;
    });

    return NextResponse.json({ cacheMap });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[CheckThreadCache] Error:', err.message);
    return NextResponse.json(
      { error: 'Failed to check thread cache', details: err.message },
      { status: 500 }
    );
  }
}

