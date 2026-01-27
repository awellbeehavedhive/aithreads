import { NextResponse } from 'next/server';
import { getCachedNews, getRawCache } from '@/lib/news-cache';
import { initializeCache } from '@/lib/startup';
import { getAllRecentArticles } from '@/lib/article-store';
import { unifiedSort, ScoredArticle } from '@/lib/weighted-scoring';
import { Article, Topic } from '@/types';

// Lazy initialization
let cacheInitialized = false;

/**
 * GET /api/feed
 *
 * Returns articles ranked using the same weighted scoring algorithm as the website.
 * Combines articles from all categories, applies unified sort (quality, authority,
 * freshness, time decay, clickbait penalty, source diversity), then paginates.
 *
 * Query params:
 *   page     - Page number (default: 1)
 *   pageSize - Items per page (default: 20)
 *   topics   - Include topics in ranking (default: false)
 */
export async function GET(request: Request) {
  if (!cacheInitialized) {
    initializeCache().catch(console.error);
    cacheInitialized = true;
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const includeTopics = searchParams.get('topics') === 'true';

  try {
    // Fetch articles from all categories (same as website page.tsx)
    const categories = ['technology', 'science', 'business', 'health'];
    const allArticles: Article[] = [];

    const rawCache = await getRawCache();

    for (const cat of categories) {
      const cached = rawCache[cat];
      if (cached?.articles && Array.isArray(cached.articles)) {
        const catArticles = (cached.articles as Article[]).map(a => ({
          ...a,
          category: cat,
        }));
        allArticles.push(...catArticles);
      }
    }

    // Also check "all" cache for any extra articles
    if (rawCache['all']?.articles) {
      for (const article of rawCache['all'].articles as Article[]) {
        if (!allArticles.some(a => a.url === article.url)) {
          allArticles.push(article);
        }
      }
    }

    // Filter: minimum quality, valid images, no Bloomberg videos
    const MIN_QUALITY_SCORE = 10;
    const normalizeImageUrl = (url: string): string => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`.toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    };

    const seenImages = new Set<string>();
    const validArticles = allArticles.filter(a => {
      if (!a.url) return false;
      if (a.aiScore !== undefined && a.aiScore !== null && a.aiScore < MIN_QUALITY_SCORE) return false;
      if (a.url.includes('bloomberg.com/news/videos/')) return false;

      // Deduplicate by image URL
      if (a.urlToImage && a.urlToImage.startsWith('http')) {
        const normalized = normalizeImageUrl(a.urlToImage);
        if (seenImages.has(normalized)) return false;
        seenImages.add(normalized);
      }

      return true;
    });

    // Optionally fetch topics
    let topics: Topic[] = [];
    if (includeTopics) {
      try {
        const topicsModule = await import('@/lib/news-cache');
        // Topics may be stored differently; try fetching from the topics API
        const topicsRes = await fetch(new URL('/api/topics', request.url).toString());
        if (topicsRes.ok) {
          const topicsData = await topicsRes.json();
          topics = topicsData.topics || [];
        }
      } catch {
        // Topics are optional, continue without them
      }
    }

    // Apply the same unifiedSort algorithm used by the website
    const sortResult = unifiedSort(topics, validArticles as ScoredArticle[], {
      enableDiversityAttenuation: true,
      enableDeduplication: true,
    });

    // Extract just articles (iOS doesn't support topics yet)
    // But preserve the unified ranking order
    const rankedItems = sortResult.content;

    // Paginate
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = rankedItems.slice(startIndex, endIndex);

    // Map to the response format expected by iOS
    const articles = paginatedItems.map(item => {
      if (item.contentType === 'topic') {
        // Convert topic to article-like format for iOS
        const topic = item as any;
        return {
          title: topic.title,
          description: topic.summary || null,
          url: `/topics/${topic.id}`,
          urlToImage: topic.image || null,
          publishedAt: topic.publishedAt,
          source: { name: `${topic.sourceCount} sources`, id: null },
          aiScore: Math.round(item.weightedScore ?? 0),
          category: topic.categories?.[0] || 'all',
          contentType: 'topic',
          topicId: topic.id,
        };
      } else {
        // Article - pass through with weighted score
        const article = item as any;
        return {
          title: article.title,
          description: article.description || null,
          url: article.url,
          urlToImage: article.urlToImage || null,
          publishedAt: article.publishedAt,
          source: article.source || { name: 'Unknown', id: null },
          aiScore: article.aiScore ?? 0,
          aiReason: article.aiReason || null,
          kidsScore: article.kidsScore ?? null,
          kidsTitle: article.kidsTitle ?? null,
          category: article.category || 'all',
          contentType: 'article',
          weightedScore: item.weightedScore,
        };
      }
    });

    return NextResponse.json({
      status: 'ok',
      totalResults: rankedItems.length,
      articles,
      page,
      pageSize,
    });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[API/feed] Error:', err.message);

    // Fallback to article store
    try {
      const fallbackArticles = await getAllRecentArticles(200, 72);
      if (fallbackArticles.length > 0) {
        const startIndex = (page - 1) * pageSize;
        const paginatedArticles = fallbackArticles.slice(startIndex, startIndex + pageSize);

        return NextResponse.json({
          status: 'ok',
          totalResults: fallbackArticles.length,
          articles: paginatedArticles,
          page,
          pageSize,
          fallback: true,
        });
      }
    } catch (fallbackError) {
      console.error('[API/feed] Fallback failed:', fallbackError);
    }

    return NextResponse.json(
      { error: 'Failed to generate feed', details: err.message },
      { status: 500 }
    );
  }
}
