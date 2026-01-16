import { NextResponse } from 'next/server';
import { getCachedExecSummary } from '@/lib/thread-cache';

/**
 * Get executive summaries for multiple articles
 * POST body: { articles: Array<{ title: string, url: string }> }
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

    // Fetch exec summaries for each article
    const summaries = await Promise.all(
      articles.map(async (article: { title: string; url: string }) => {
        const execSummary = await getCachedExecSummary(article.title, article.url);
        return {
          url: article.url,
          execSummary,
        };
      })
    );

    // Return as a map for easy lookup
    const summaryMap: Record<string, string | null> = {};
    summaries.forEach((result) => {
      summaryMap[result.url] = result.execSummary;
    });

    return NextResponse.json({ summaryMap });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[ExecSummaries] Error:', err.message);
    return NextResponse.json(
      { error: 'Failed to fetch executive summaries', details: err.message },
      { status: 500 }
    );
  }
}

