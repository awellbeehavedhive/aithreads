/**
 * Freshness Assessment System
 *
 * Calculates freshness scores for articles based on their publish time.
 * Fresher articles get higher scores, with breaking news getting bonuses.
 */

import { Article } from '@/types';

// Freshness thresholds in minutes
const BREAKING_NEWS_THRESHOLD = 60;       // < 1 hour = breaking
const VERY_FRESH_THRESHOLD = 180;         // < 3 hours = very fresh
const FRESH_THRESHOLD = 360;              // < 6 hours = fresh
const RECENT_THRESHOLD = 720;             // < 12 hours = recent
const TODAY_THRESHOLD = 1440;             // < 24 hours = today

/**
 * Calculate freshness score for an article (0-100)
 * Higher score = fresher article
 */
export function calculateFreshnessScore(publishedAt: string): number {
  const now = Date.now();
  const publishedTime = new Date(publishedAt).getTime();
  const ageMinutes = Math.floor((now - publishedTime) / (1000 * 60));

  // Breaking news: 90-100
  if (ageMinutes < BREAKING_NEWS_THRESHOLD) {
    return 100 - Math.floor((ageMinutes / BREAKING_NEWS_THRESHOLD) * 10);
  }

  // Very fresh: 75-89
  if (ageMinutes < VERY_FRESH_THRESHOLD) {
    const range = VERY_FRESH_THRESHOLD - BREAKING_NEWS_THRESHOLD;
    const position = ageMinutes - BREAKING_NEWS_THRESHOLD;
    return 89 - Math.floor((position / range) * 14);
  }

  // Fresh: 60-74
  if (ageMinutes < FRESH_THRESHOLD) {
    const range = FRESH_THRESHOLD - VERY_FRESH_THRESHOLD;
    const position = ageMinutes - VERY_FRESH_THRESHOLD;
    return 74 - Math.floor((position / range) * 14);
  }

  // Recent: 40-59
  if (ageMinutes < RECENT_THRESHOLD) {
    const range = RECENT_THRESHOLD - FRESH_THRESHOLD;
    const position = ageMinutes - FRESH_THRESHOLD;
    return 59 - Math.floor((position / range) * 19);
  }

  // Today: 20-39
  if (ageMinutes < TODAY_THRESHOLD) {
    const range = TODAY_THRESHOLD - RECENT_THRESHOLD;
    const position = ageMinutes - RECENT_THRESHOLD;
    return 39 - Math.floor((position / range) * 19);
  }

  // Older than 24 hours: 0-19 (decaying gradually)
  const daysOld = ageMinutes / TODAY_THRESHOLD;
  return Math.max(0, Math.floor(20 - daysOld * 5));
}

/**
 * Calculate age in minutes from publish date
 */
export function calculateAgeMinutes(publishedAt: string): number {
  const now = Date.now();
  const publishedTime = new Date(publishedAt).getTime();
  return Math.floor((now - publishedTime) / (1000 * 60));
}

/**
 * Check if an article qualifies as breaking news
 */
export function isBreakingNews(publishedAt: string): boolean {
  return calculateAgeMinutes(publishedAt) < BREAKING_NEWS_THRESHOLD;
}

/**
 * Enhance articles with freshness metadata
 */
export function enrichWithFreshness(articles: Article[]): Article[] {
  return articles.map(article => ({
    ...article,
    freshnessScore: calculateFreshnessScore(article.publishedAt),
    publishedAgeMinutes: calculateAgeMinutes(article.publishedAt),
    isBreaking: isBreakingNews(article.publishedAt),
  }));
}

/**
 * Get freshness label for display
 */
export function getFreshnessLabel(ageMinutes: number): string {
  if (ageMinutes < BREAKING_NEWS_THRESHOLD) return 'Breaking';
  if (ageMinutes < VERY_FRESH_THRESHOLD) return 'Just In';
  if (ageMinutes < FRESH_THRESHOLD) return 'Fresh';
  if (ageMinutes < RECENT_THRESHOLD) return 'Recent';
  if (ageMinutes < TODAY_THRESHOLD) return 'Today';
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Calculate combined score (quality + freshness)
 * Weights can be adjusted based on preference
 */
export function calculateCombinedScore(
  aiScore: number,
  freshnessScore: number,
  qualityWeight: number = 0.6,
  freshnessWeight: number = 0.4
): number {
  return Math.round(aiScore * qualityWeight + freshnessScore * freshnessWeight);
}

/**
 * Sort articles by combined quality and freshness
 */
export function sortByFreshness(
  articles: Article[],
  qualityWeight: number = 0.6,
  freshnessWeight: number = 0.4
): Article[] {
  const enriched = enrichWithFreshness(articles);

  return enriched.sort((a, b) => {
    const scoreA = calculateCombinedScore(
      a.aiScore || 0,
      a.freshnessScore || 0,
      qualityWeight,
      freshnessWeight
    );
    const scoreB = calculateCombinedScore(
      b.aiScore || 0,
      b.freshnessScore || 0,
      qualityWeight,
      freshnessWeight
    );
    return scoreB - scoreA;
  });
}

/**
 * Get freshness stats for a set of articles
 */
export function getFreshnessStats(articles: Article[]): {
  breaking: number;
  veryFresh: number;
  fresh: number;
  recent: number;
  today: number;
  older: number;
  averageAgeMinutes: number;
  oldestAgeMinutes: number;
  newestAgeMinutes: number;
} {
  let breaking = 0;
  let veryFresh = 0;
  let fresh = 0;
  let recent = 0;
  let today = 0;
  let older = 0;
  let totalAge = 0;
  let oldest = 0;
  let newest = Infinity;

  for (const article of articles) {
    const age = calculateAgeMinutes(article.publishedAt);
    totalAge += age;
    if (age > oldest) oldest = age;
    if (age < newest) newest = age;

    if (age < BREAKING_NEWS_THRESHOLD) breaking++;
    else if (age < VERY_FRESH_THRESHOLD) veryFresh++;
    else if (age < FRESH_THRESHOLD) fresh++;
    else if (age < RECENT_THRESHOLD) recent++;
    else if (age < TODAY_THRESHOLD) today++;
    else older++;
  }

  return {
    breaking,
    veryFresh,
    fresh,
    recent,
    today,
    older,
    averageAgeMinutes: articles.length > 0 ? Math.round(totalAge / articles.length) : 0,
    oldestAgeMinutes: oldest,
    newestAgeMinutes: newest === Infinity ? 0 : newest,
  };
}
