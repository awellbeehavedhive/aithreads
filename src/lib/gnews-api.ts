/**
 * GNews API Integration
 *
 * Provides access to real-time news articles from 60,000+ sources
 * Free tier: 100 requests/day
 */

import axios from 'axios';
import { Article } from '@/types';
import { canMakeApiCall, recordApiCall } from './api-rate-limiter';

const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GNEWS_BASE_URL = 'https://gnews.io/api/v4';

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  image: string | null;
  publishedAt: string;
  content: string;
  source: { name: string; url: string };
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

/**
 * Fetch news from GNews API for a specific category
 * Respects rate limits: 100 requests/day
 */
export async function fetchGNews(category: string): Promise<Article[]> {
  if (!GNEWS_API_KEY) {
    console.warn('[GNews] API key not configured, skipping GNews fetch');
    return [];
  }

  // Check rate limit before making the call
  const canCall = await canMakeApiCall('gnews');
  if (!canCall) {
    console.log(`[GNews] Skipping ${category} - daily limit reached`);
    return [];
  }

  // Map our categories to GNews categories
  const categoryMap: Record<string, string> = {
    general: 'general',
    business: 'business',
    technology: 'technology',
    science: 'science',
    health: 'health',
    sports: 'sports',
    entertainment: 'entertainment'
  };

  const gNewsCategory = categoryMap[category.toLowerCase()];
  if (!gNewsCategory) {
    console.log(`[GNews] No mapping for category: ${category}`);
    return [];
  }

  console.log(`[GNews] Fetching articles for category: ${category}`);

  try {
    const response = await axios.get<GNewsResponse>(`${GNEWS_BASE_URL}/top-headlines`, {
      params: {
        category: gNewsCategory,
        lang: 'en',
        country: 'us',
        max: 10, // Limit to 10 articles to conserve API quota
        apikey: GNEWS_API_KEY
      },
      timeout: 10000 // 10 second timeout
    });

    // Record successful API call
    await recordApiCall('gnews');

    const articles: Article[] = response.data.articles.map((article: GNewsArticle) => ({
      title: article.title,
      description: article.description || null,
      url: article.url,
      urlToImage: article.image,
      publishedAt: article.publishedAt,
      content: article.content || null,
      source: {
        id: null,
        name: article.source.name
      },
      sourceProvider: 'gnews' as const,
      author: null
    }));

    console.log(`[GNews] Fetched ${articles.length} articles for ${category}`);
    return articles;

  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        console.warn('[GNews] Rate limit exceeded (100 requests/day)');
      } else if (error.response?.status === 401) {
        console.error('[GNews] Invalid API key');
      } else {
        console.error('[GNews] API error:', error.response?.data || error.message);
      }
    } else {
      console.error('[GNews] Unexpected error:', error);
    }
    return [];
  }
}

/**
 * Check if GNews API is configured and available
 */
export function isGNewsAvailable(): boolean {
  return !!GNEWS_API_KEY;
}

