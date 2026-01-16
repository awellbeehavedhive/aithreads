/**
 * Multi-Source News Fetcher
 *
 * Aggregates news from multiple sources (NewsAPI, GNews, RSS feeds)
 * Deduplicates articles by URL and title similarity
 * Provides resilient news fetching with fallbacks
 */

import { fetchGNews } from './gnews-api';
import { fetchRSSByCategory } from './rss-parser';
import { compareTwoStrings } from 'string-similarity';
import { Article } from '@/types';
import { SIMILARITY_THRESHOLD, isValidArticleImage } from './constants';
import { enrichWithFreshness, getFreshnessStats } from './freshness';
import { enrichArticlesWithImages } from './image-extractor';
import { canMakeApiCall, recordApiCall, getRateLimitStatus } from './api-rate-limiter';

export interface FetchResult {
  articles: Article[];
  sources: string[];
  duplicatesRemoved: number;
  freshnessStats?: {
    breaking: number;
    veryFresh: number;
    fresh: number;
    recent: number;
    today: number;
    older: number;
    averageAgeMinutes: number;
    oldestAgeMinutes: number;
    newestAgeMinutes: number;
  };
}

/**
 * Normalize URL for comparison (remove query params, fragments, trailing slashes)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Check if two articles are duplicates based on URL or title similarity
 */
function isDuplicate(article1: Article, article2: Article): boolean {
  // Check exact URL match (normalized)
  const url1 = normalizeUrl(article1.url);
  const url2 = normalizeUrl(article2.url);
  if (url1 === url2) {
    return true;
  }

  // Check title similarity (Levenshtein distance)
  const titleSimilarity = compareTwoStrings(
    article1.title.toLowerCase(),
    article2.title.toLowerCase()
  );

  // Consider duplicates if titles are >80% similar
  return titleSimilarity > 0.8;
}

/**
 * Deduplicate articles, preferring those with images, higher AI scores, and more recent dates
 */
function deduplicateArticles(articles: Article[]): Article[] {
  const unique: Article[] = [];
  const seen = new Set<string>();

  // Sort by: has image (yes first), then by AI score (highest first), then by recency
  const sorted = [...articles].sort((a, b) => {
    // Prefer articles with images
    if (a.urlToImage && !b.urlToImage) return -1;
    if (!a.urlToImage && b.urlToImage) return 1;

    // Then by AI score (highest first)
    const scoreA = (a as any).aiScore ?? 0;
    const scoreB = (b as any).aiScore ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    // Then by recency
    const dateA = new Date(a.publishedAt).getTime();
    const dateB = new Date(b.publishedAt).getTime();
    return dateB - dateA;
  });

  for (const article of sorted) {
    // Check if we've seen this URL before
    const normalizedUrl = normalizeUrl(article.url);
    if (seen.has(normalizedUrl)) {
      continue;
    }

    // Check if title is too similar to existing articles
    const isTitleDuplicate = unique.some(existing => {
      const similarity = compareTwoStrings(
        article.title.toLowerCase(),
        existing.title.toLowerCase()
      );
      return similarity > 0.8;
    });

    if (!isTitleDuplicate) {
      unique.push(article);
      seen.add(normalizedUrl);
    }
  }

  return unique;
}

/**
 * Fetch news from NewsAPI (optimized for max value)
 * Uses pageSize=100 to get maximum articles per request (free tier limit)
 * Respects rate limits: 100 requests/day
 */
async function fetchFromNewsAPI(category: string): Promise<Article[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.warn('[NewsAPI] API key not configured');
    return [];
  }

  // Check rate limit before making the call
  const canCall = await canMakeApiCall('newsapi');
  if (!canCall) {
    console.log(`[NewsAPI] Skipping ${category} - daily limit reached`);
    return [];
  }

  // Use pageSize=100 (max allowed) to get maximum articles per API call
  // This optimizes our 100 requests/day limit
  const url = `https://newsapi.org/v2/top-headlines?country=us&category=${category}&pageSize=100&apiKey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'error') {
      throw new Error(data.message || 'NewsAPI error');
    }

    // Record successful API call
    await recordApiCall('newsapi');

    const articles = (data.articles || []).map((article: any) => ({
      ...article,
      sourceProvider: 'newsapi' as const
    }));

    console.log(`[NewsAPI] Fetched ${articles.length} articles for ${category}`);
    return articles;

  } catch (error) {
    console.error('[NewsAPI] Error:', error);
    return [];
  }
}

/**
 * Fetch articles from all available sources and deduplicate
 */
export async function fetchFromAllSources(category: string): Promise<FetchResult> {
  console.log(`[MultiSource] Fetching articles for category: ${category}`);
  
  let allArticles: Article[] = [];
  const sources: string[] = [];

  // 1. Fetch from NewsAPI
  try {
    const newsApiArticles = await fetchFromNewsAPI(category);
    if (newsApiArticles.length > 0) {
      allArticles.push(...newsApiArticles);
      sources.push('newsapi');
      console.log(`[MultiSource] NewsAPI contributed ${newsApiArticles.length} articles`);
    }
  } catch (error) {
    console.warn('[MultiSource] NewsAPI failed:', error);
  }

  // 2. Fetch from GNews
  try {
    const gNewsArticles = await fetchGNews(category);
    if (gNewsArticles.length > 0) {
      allArticles.push(...gNewsArticles);
      sources.push('gnews');
      console.log(`[MultiSource] GNews contributed ${gNewsArticles.length} articles`);
    }
  } catch (error) {
    console.warn('[MultiSource] GNews failed:', error);
  }

  // 3. Fetch from RSS Feeds
  try {
    const rssArticles = await fetchRSSByCategory(category);
    if (rssArticles.length > 0) {
      allArticles.push(...rssArticles);
      sources.push('rss');
      console.log(`[MultiSource] RSS contributed ${rssArticles.length} articles`);
    }
  } catch (error) {
    console.warn('[MultiSource] RSS failed:', error);
  }

  // 3.5. Enrich ALL articles missing images by fetching og:image from article pages
  const articlesNeedingImages = allArticles.filter(a => !a.urlToImage).length;

  if (articlesNeedingImages > 0) {
    console.log(`[MultiSource] Extracting images for ${articlesNeedingImages} articles missing images...`);
    allArticles = await enrichArticlesWithImages(allArticles, {
      concurrency: 10
      // No provider filter - extract for all sources
    });
  }

  // 4. Filter out articles without valid images AND articles older than 7 days
  const MAX_ARTICLE_AGE_DAYS = 7;
  const maxAge = Date.now() - (MAX_ARTICLE_AGE_DAYS * 24 * 60 * 60 * 1000);

  const articlesWithImages = allArticles.filter(a => {
    // Must have valid image (not a placeholder/logo)
    if (!isValidArticleImage(a.urlToImage)) {
      return false;
    }

    // Must be within 7 days
    try {
      const publishDate = new Date(a.publishedAt).getTime();
      return publishDate > maxAge;
    } catch {
      // If date parsing fails, exclude the article
      return false;
    }
  });

  const missingImages = allArticles.filter(a =>
    !isValidArticleImage(a.urlToImage)
  ).length;
  const tooOld = allArticles.filter(a => {
    try {
      const publishDate = new Date(a.publishedAt).getTime();
      return publishDate <= maxAge;
    } catch {
      return true;
    }
  }).length;

  if (missingImages > 0) {
    console.log(`[MultiSource] Filtered out ${missingImages} articles without images`);
  }
  if (tooOld > 0) {
    console.log(`[MultiSource] Filtered out ${tooOld} articles older than ${MAX_ARTICLE_AGE_DAYS} days`);
  }

  // 5. Deduplicate
  const beforeCount = articlesWithImages.length;
  const deduplicated = deduplicateArticles(articlesWithImages);
  const duplicatesRemoved = beforeCount - deduplicated.length;

  console.log(`[MultiSource] Total: ${allArticles.length} articles, after image filter: ${articlesWithImages.length}, after deduplication: ${deduplicated.length} (removed ${duplicatesRemoved} duplicates)`);
  console.log(`[MultiSource] Sources used: ${sources.join(', ')}`);

  // Enrich articles with freshness data
  const enrichedArticles = enrichWithFreshness(deduplicated);
  const freshnessStats = getFreshnessStats(enrichedArticles);

  console.log(`[MultiSource] Freshness stats: ${freshnessStats.breaking} breaking, ${freshnessStats.veryFresh} very fresh, ${freshnessStats.fresh} fresh, avg age ${Math.round(freshnessStats.averageAgeMinutes / 60)}h`);

  return {
    articles: enrichedArticles,
    sources,
    duplicatesRemoved,
    freshnessStats
  };
}

