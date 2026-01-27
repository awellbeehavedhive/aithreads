import { NextResponse } from 'next/server';
import { getCachedNews, getPaginatedResults, getRawCache } from '@/lib/news-cache';
import { initializeCache } from '@/lib/startup';
import { getRecentArticlesByCategory, getAllRecentArticles } from '@/lib/article-store';
import { unifiedSort, ScoredArticle } from '@/lib/weighted-scoring';
import { getTopics } from '@/lib/topic-cache';
import { Article, Topic } from '@/types';

// Initialize cache on first request
let cacheInitialized = false;

export async function GET(request: Request) {
  // Lazy initialization on first request
  if (!cacheInitialized) {
    initializeCache().catch(console.error);
    cacheInitialized = true;
  }
  const { searchParams } = new URL(request.url);
  const categoryParam = searchParams.get('category')?.toLowerCase() || 'general';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

  try {
    let result;

    // Handle "All" category - unified ranking matching website homepage
    if (categoryParam === 'all') {
      const rawCache = await getRawCache();
      const allArticles: Article[] = [];
      const categories = ['technology', 'science', 'business', 'health'];

      // Combine articles from known categories (with category tag)
      for (const cat of categories) {
        const data = rawCache[cat];
        if (data?.articles && Array.isArray(data.articles)) {
          allArticles.push(...(data.articles as Article[]).map(a => ({ ...a, category: cat })));
        }
      }

      // Also pull from other cached categories
      for (const [cat, data] of Object.entries(rawCache)) {
        if (!categories.includes(cat) && cat !== 'all' && data.articles && Array.isArray(data.articles)) {
          allArticles.push(...(data.articles as Article[]).map(a => ({ ...a, category: cat })));
        }
      }

      // Filter: minimum quality + must have image
      const MIN_QUALITY_SCORE = 10;
      const qualityArticles = allArticles.filter((a: Article) => {
        if (a.aiScore !== undefined && a.aiScore !== null && (a.aiScore as number) < MIN_QUALITY_SCORE) return false;
        if (!a.urlToImage || !a.urlToImage.startsWith('http')) return false;
        if (a.url?.includes('bloomberg.com/news/videos/')) return false;
        return true;
      });

      // Fetch topics for unified ranking (same as website page.tsx)
      let topics: Topic[] = [];
      try {
        topics = await getTopics(20);
      } catch {
        // Topics are optional
      }

      // Deduplicate: remove articles that share images with topics
      const normalizeImageUrl = (url: string): string => {
        try {
          const parsed = new URL(url);
          return `${parsed.origin}${parsed.pathname}`.toLowerCase();
        } catch {
          return url.toLowerCase();
        }
      };

      const topicImageUrls = new Set<string>();
      topics.forEach(topic => {
        if (topic.image) topicImageUrls.add(normalizeImageUrl(topic.image));
        topic.sources?.forEach(source => {
          if (source.urlToImage) topicImageUrls.add(normalizeImageUrl(source.urlToImage));
        });
      });

      const seenImages = new Set<string>();
      const dedupedArticles = qualityArticles.filter(a => {
        if (!a.urlToImage) return false;
        const normalized = normalizeImageUrl(a.urlToImage);
        if (topicImageUrls.has(normalized)) return false;
        if (seenImages.has(normalized)) return false;
        seenImages.add(normalized);
        return true;
      });

      // Apply unified sort (topics + articles ranked together) — matches website
      const sortResult = unifiedSort(topics, dedupedArticles as ScoredArticle[], {
        enableDiversityAttenuation: true,
        enableDeduplication: true,
      });

      const rankedContent = sortResult.content;

      // Paginate
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedItems = rankedContent.slice(startIndex, endIndex);

      // Map to response format — topics become article-like objects with contentType
      const articles = paginatedItems.map(item => {
        if (item.contentType === 'topic') {
          const topic = item as any;
          const sourceNames = [...new Set((topic.sources || []).map((s: any) => s.source))].slice(0, 5) as string[];
          const primarySource = sourceNames[0] || 'Multiple sources';
          return {
            title: topic.title,
            description: topic.summary || null,
            url: topic.sources?.[0]?.url || `https://aithreads-prod.vercel.app/topics/${topic.id}`,
            urlToImage: topic.image || null,
            publishedAt: topic.publishedAt,
            source: { name: primarySource, id: null },
            aiScore: Math.round(item.weightedScore ?? 0),
            category: topic.categories?.[0] || 'all',
            contentType: 'topic',
            topicId: topic.id,
            sourceCount: topic.sourceCount,
            sourceNames,
          };
        } else {
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
          };
        }
      });

      result = {
        articles,
        totalResults: rankedContent.length,
      };
    } else {
      // Single category - get all articles, filter, then paginate
      const cached = await getCachedNews(categoryParam);

      // Filter out low-quality articles (score < 10)
      // But allow unscored articles through (they haven't been rated yet)
      const MIN_QUALITY_SCORE = 10;
      const qualityArticles = (cached.articles as any[]).filter((a: any) =>
        a.aiScore === undefined || a.aiScore === null || a.aiScore >= MIN_QUALITY_SCORE
      );

      // Sort by AI score (highest first)
      qualityArticles.sort((a: any, b: any) => {
        const scoreA = a.aiScore ?? 0;
        const scoreB = b.aiScore ?? 0;
        return scoreB - scoreA;
      });

      // Paginate
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedArticles = qualityArticles.slice(startIndex, endIndex);

      result = {
        articles: paginatedArticles,
        totalResults: qualityArticles.length,
      };
    }

    // Note: Pre-generation is now handled exclusively by /api/refresh-cache
    // This ensures it only happens during scheduled refreshes, not on every page load

    // If we got results, return them
    if (result.articles.length > 0 || result.totalResults > 0) {
      return NextResponse.json({
        status: 'ok',
        totalResults: result.totalResults,
        articles: result.articles,
      });
    }

    // FALLBACK: Category cache is empty, try permanent article store
    console.log(`[API] Category cache empty for ${categoryParam}, trying permanent store fallback`);
    let fallbackArticles;
    if (categoryParam === 'all') {
      fallbackArticles = await getAllRecentArticles(200, 72);
    } else {
      fallbackArticles = await getRecentArticlesByCategory(categoryParam, 100, 72);
    }

    if (fallbackArticles.length > 0) {
      console.log(`[API] Fallback succeeded: ${fallbackArticles.length} articles from permanent store`);
      const startIndex = (page - 1) * pageSize;
      const paginatedArticles = fallbackArticles.slice(startIndex, startIndex + pageSize);

      return NextResponse.json({
        status: 'ok',
        totalResults: fallbackArticles.length,
        articles: paginatedArticles,
        cached: true,
        fallback: true,
      });
    }

    // No cache available and fetch failed
    return NextResponse.json(
      {
        error: 'No articles available',
        message: 'Unable to fetch news at this time. Please try again later.'
      },
      { status: 503 }
    );
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown, status?: number }, message?: string };
    console.error('Error fetching news:', err.response?.data || err.message);

    // Check if we have any cached data despite the error
    if (categoryParam !== 'all') {
      const fallbackResult = await getPaginatedResults(categoryParam, page, pageSize);
      if (fallbackResult.articles.length > 0) {
        console.log(`[API] Returning cached data despite error for ${categoryParam}`);
        return NextResponse.json({
          status: 'ok',
          totalResults: fallbackResult.totalResults,
          articles: fallbackResult.articles,
          cached: true,
        });
      }
    }

    // FALLBACK: Try permanent article store
    console.log(`[API] Attempting fallback to permanent article store for ${categoryParam}`);
    try {
      let fallbackArticles;
      if (categoryParam === 'all') {
        fallbackArticles = await getAllRecentArticles(200, 72); // 72 hours max age
      } else {
        fallbackArticles = await getRecentArticlesByCategory(categoryParam, 100, 72);
      }

      if (fallbackArticles.length > 0) {
        console.log(`[API] Fallback succeeded: ${fallbackArticles.length} articles from permanent store`);
        const startIndex = (page - 1) * pageSize;
        const paginatedArticles = fallbackArticles.slice(startIndex, startIndex + pageSize);

        return NextResponse.json({
          status: 'ok',
          totalResults: fallbackArticles.length,
          articles: paginatedArticles,
          cached: true,
          fallback: true,
        });
      }
    } catch (fallbackError) {
      console.error('[API] Fallback also failed:', fallbackError);
    }

    // No cache available, return error
    return NextResponse.json(
      { error: 'Failed to fetch news', details: err.response?.data },
      { status: err.response?.status || 500 }
    );
  }
}
