import { NextResponse } from 'next/server';
import { getRawCache } from '@/lib/news-cache';

/**
 * API endpoint to get article metadata by URL
 * Used for Open Graph metadata generation
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const articleUrl = searchParams.get('url');

  if (!articleUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Decode URL in case it's encoded
    const decodedUrl = decodeURIComponent(articleUrl);

    // Get all cached articles
    const cache = await getRawCache();

    // Search through all categories
    for (const [category, data] of Object.entries(cache)) {
      if (!data.articles || !Array.isArray(data.articles)) continue;

      const article = (data.articles as any[]).find((a: any) =>
        a.url === decodedUrl || a.url === articleUrl
      );

      if (article) {
        return NextResponse.json({
          found: true,
          article: {
            title: article.title,
            description: article.description,
            urlToImage: article.urlToImage,
            publishedAt: article.publishedAt,
            source: article.source,
            category,
          },
        });
      }
    }

    return NextResponse.json({ found: false });
  } catch (error) {
    console.error('[ArticleMetadata] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
  }
}
