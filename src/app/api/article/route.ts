/**
 * Article Lookup API
 *
 * Retrieves articles from the permanent store by URL.
 * Used by thread pages to look up article data directly.
 */

import { NextResponse } from 'next/server';
import { getArticleByUrl, getArticleStoreStats } from '@/lib/article-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/article?url={encoded_url}
 *
 * Returns the article if found in permanent store
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const articleUrl = searchParams.get('url');
  const stats = searchParams.get('stats');

  // Return stats if requested
  if (stats === 'true') {
    const storeStats = await getArticleStoreStats();
    return NextResponse.json({
      success: true,
      stats: storeStats,
    });
  }

  if (!articleUrl) {
    return NextResponse.json(
      { error: 'Missing url parameter', found: false },
      { status: 400 }
    );
  }

  try {
    // Decode the URL
    const decodedUrl = decodeURIComponent(articleUrl);

    // Look up article in permanent store
    const article = await getArticleByUrl(decodedUrl);

    if (article) {
      return NextResponse.json({
        found: true,
        article,
      });
    }

    return NextResponse.json({
      found: false,
      message: 'Article not found in permanent store',
    });
  } catch (error: any) {
    console.error('[Article API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch article', details: error.message, found: false },
      { status: 500 }
    );
  }
}
