/**
 * SOTA News Sorting Algorithm
 *
 * Implements state-of-the-art news ranking inspired by Twitter/X, NYT, and Reddit:
 * - Time decay: Recent content boosted with exponential decay
 * - Category interleaving: Round-robin across categories for diversity
 * - Cross-source deduplication: Same story from multiple sources → keep best
 * - Featured position logic: Best article from last 6 hours
 */

import { compareTwoStrings } from 'string-similarity';

// ============================================================================
// DATE PARSING
// ============================================================================

/**
 * Parse various date formats robustly (ISO, RFC 2822, etc.)
 * Returns epoch timestamp in milliseconds
 */
export function parseDate(dateStr: string): number {
  if (!dateStr) return 0;

  // Try ISO format first (most reliable)
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    // Check if the date is reasonable (between 2020 and 2030)
    const year = isoDate.getFullYear();
    if (year >= 2020 && year <= 2030) {
      return isoDate.getTime();
    }
  }

  // Try RFC 2822 format: "Mon, 05 Jan 2026 03:00:00 GMT"
  const rfc2822Match = dateStr.match(
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i
  );
  if (rfc2822Match) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const day = parseInt(rfc2822Match[1], 10);
    const month = months[rfc2822Match[2].toLowerCase()];
    const year = parseInt(rfc2822Match[3], 10);

    // Extract time if present
    const timeMatch = dateStr.match(/(\d{2}):(\d{2}):(\d{2})/);
    const hours = timeMatch ? parseInt(timeMatch[1], 10) : 0;
    const minutes = timeMatch ? parseInt(timeMatch[2], 10) : 0;
    const seconds = timeMatch ? parseInt(timeMatch[3], 10) : 0;

    const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // Fallback: return 0 (will be treated as very old)
  console.warn(`[SOTA] Failed to parse date: ${dateStr}`);
  return 0;
}

/**
 * Calculate age in hours from a date string
 */
export function getAgeInHours(dateStr: string): number {
  const timestamp = parseDate(dateStr);
  if (timestamp === 0) return 999; // Treat unparseable as very old

  const now = Date.now();
  return Math.max(0, (now - timestamp) / (1000 * 60 * 60));
}

// ============================================================================
// TIME DECAY
// ============================================================================

/**
 * Calculate time decay factor using exponential decay
 *
 * Formula: decay = 0.5 ^ (age_hours / half_life_hours)
 *
 * With 12-hour half-life:
 * - 0 hours: 1.0 (no decay)
 * - 6 hours: 0.71
 * - 12 hours: 0.5
 * - 24 hours: 0.25
 * - 48 hours: 0.0625
 */
export function calculateTimeDecay(ageInHours: number, halfLifeHours: number = 12): number {
  return Math.pow(0.5, ageInHours / halfLifeHours);
}

/**
 * Calculate effective score with time decay
 */
export function getEffectiveScore(aiScore: number, ageInHours: number): number {
  const decay = calculateTimeDecay(ageInHours);
  return aiScore * decay;
}

// ============================================================================
// CROSS-SOURCE DEDUPLICATION
// ============================================================================

/**
 * Normalize title for comparison (remove source suffix, lowercase, etc.)
 * Exported for use in topic clustering
 */
export function normalizeTitle(title: string): string {
  // Remove common source suffixes like " - The Guardian", " | BBC News"
  // Require whitespace before the delimiter to avoid matching "Ex-Fed" etc.
  let normalized = title
    .replace(/\s+[-|–—]\s+[^-|–—]+$/, '')
    .toLowerCase()
    .trim();

  // Remove common prefixes like "BREAKING:", "EXCLUSIVE:", etc.
  normalized = normalized
    .replace(/^(breaking|exclusive|update|just in|developing|opinion|analysis):\s*/i, '');

  // Normalize common synonym variations
  normalized = normalized
    .replace(/\bsurpasses?\b/g, 'overtakes')
    .replace(/\bbiggest\b/g, 'top')
    .replace(/\blargest\b/g, 'top')
    .replace(/\bworld leader\b/g, 'top')
    .replace(/\belectric car\b/g, 'ev')
    .replace(/\belectric vehicle\b/g, 'ev')
    .replace(/\b(sales|maker|seller|manufacturer)\b/g, '');

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Check if two articles are about the same story
 * Uses title similarity with threshold of 0.5 (catches most duplicate stories)
 */
export function isSameStory(title1: string, title2: string): boolean {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // Similarity check - 0.5 threshold catches most duplicate stories
  // while allowing different angles on the same topic
  const similarity = compareTwoStrings(norm1, norm2);
  return similarity > 0.5;
}

export interface ArticleWithMeta {
  url: string;
  title: string;
  publishedAt: string;
  aiScore?: number;
  category?: string;
  source: { name: string };
  urlToImage?: string | null;
  [key: string]: any;
}

/**
 * Deduplicate articles across sources
 * Keeps the version with: highest AI score, then has image, then most recent
 */
export function deduplicateAcrossSources<T extends ArticleWithMeta>(articles: T[]): T[] {
  const storyGroups: Map<number, T[]> = new Map();
  let groupId = 0;

  // Group articles by story
  for (const article of articles) {
    let foundGroup = false;

    // Check against existing groups
    for (const [id, group] of storyGroups.entries()) {
      if (isSameStory(article.title, group[0].title)) {
        group.push(article);
        foundGroup = true;
        break;
      }
    }

    if (!foundGroup) {
      storyGroups.set(groupId++, [article]);
    }
  }

  // Select best version from each group
  const deduplicated: T[] = [];

  for (const [, group] of storyGroups) {
    // Sort by: AI score (desc) → has image (desc) → recency (desc)
    group.sort((a, b) => {
      // AI score
      const scoreA = a.aiScore ?? 0;
      const scoreB = b.aiScore ?? 0;
      if (scoreA !== scoreB) return scoreB - scoreA;

      // Has image
      const hasImageA = a.urlToImage ? 1 : 0;
      const hasImageB = b.urlToImage ? 1 : 0;
      if (hasImageA !== hasImageB) return hasImageB - hasImageA;

      // Recency
      const timeA = parseDate(a.publishedAt);
      const timeB = parseDate(b.publishedAt);
      return timeB - timeA;
    });

    deduplicated.push(group[0]);
  }

  return deduplicated;
}

// ============================================================================
// CATEGORY DIVERSITY SORTING
// ============================================================================

/**
 * Sort articles by effective score with category diversity
 *
 * Strategy: Sort by score, but apply a penalty when too many articles
 * from the same category appear in a row. This ensures high-quality
 * articles rise to the top while maintaining category diversity.
 *
 * Algorithm:
 * 1. Calculate effective score (AI score × time decay) for all articles
 * 2. Sort by effective score
 * 3. Re-order to avoid more than MAX_CONSECUTIVE from same category
 */
export function sortWithDiversity<T extends ArticleWithMeta>(
  articles: T[],
  categoryOrder: string[] = ['technology', 'science', 'business', 'health']
): T[] {
  if (articles.length === 0) return [];

  // Calculate effective scores for all articles
  const withScores = articles.map(article => {
    const age = getAgeInHours(article.publishedAt);
    const effectiveScore = getEffectiveScore(article.aiScore ?? 0, age);
    return { article, effectiveScore, age };
  });

  // Sort by effective score (highest first)
  withScores.sort((a, b) => b.effectiveScore - a.effectiveScore);

  // Apply diversity constraint: max 2 consecutive from same category
  const MAX_CONSECUTIVE = 2;
  const result: T[] = [];
  const remaining = [...withScores];
  const consecutiveCount: Map<string, number> = new Map();
  let lastCategory = '';

  while (remaining.length > 0) {
    // Find the best article that doesn't violate diversity constraint
    let bestIdx = -1;

    for (let i = 0; i < remaining.length; i++) {
      const cat = remaining[i].article.category?.toLowerCase() || 'other';

      // If different category or we haven't hit max consecutive, use it
      if (cat !== lastCategory || (consecutiveCount.get(cat) || 0) < MAX_CONSECUTIVE) {
        bestIdx = i;
        break;
      }
    }

    // If no valid article found (all remaining are same category), just take the best
    if (bestIdx === -1) {
      bestIdx = 0;
    }

    const selected = remaining.splice(bestIdx, 1)[0];
    const cat = selected.article.category?.toLowerCase() || 'other';

    // Update consecutive tracking
    if (cat === lastCategory) {
      consecutiveCount.set(cat, (consecutiveCount.get(cat) || 0) + 1);
    } else {
      consecutiveCount.clear();
      consecutiveCount.set(cat, 1);
      lastCategory = cat;
    }

    result.push(selected.article);
  }

  return result;
}

// ============================================================================
// FEATURED ARTICLE SELECTION
// ============================================================================

/**
 * Select the best article for featured position
 * Criteria: Highest effective score from last 6 hours
 */
export function selectFeaturedArticle<T extends ArticleWithMeta>(
  articles: T[],
  maxAgeHours: number = 6
): T | null {
  if (articles.length === 0) return null;

  // Filter to recent articles
  const recentArticles = articles.filter(a => {
    const age = getAgeInHours(a.publishedAt);
    return age <= maxAgeHours;
  });

  // If no recent articles, fall back to all articles
  const candidates = recentArticles.length > 0 ? recentArticles : articles;

  // Find best by effective score
  let best = candidates[0];
  let bestEffectiveScore = getEffectiveScore(
    best.aiScore ?? 0,
    getAgeInHours(best.publishedAt)
  );

  for (const article of candidates.slice(1)) {
    const effectiveScore = getEffectiveScore(
      article.aiScore ?? 0,
      getAgeInHours(article.publishedAt)
    );
    if (effectiveScore > bestEffectiveScore) {
      best = article;
      bestEffectiveScore = effectiveScore;
    }
  }

  return best;
}

// ============================================================================
// MAIN SORTING FUNCTION
// ============================================================================

export interface SOTASortOptions {
  /** Categories to include in interleaving order */
  categoryOrder?: string[];
  /** Categories to exclude from results */
  excludeCategories?: string[];
  /** Max age for featured article selection (hours) */
  featuredMaxAgeHours?: number;
  /** Enable time decay scoring */
  enableTimeDecay?: boolean;
  /** Enable cross-source deduplication */
  enableDeduplication?: boolean;
}

export interface SOTASortResult<T> {
  /** Featured article (best from recent) */
  featured: T | null;
  /** All sorted articles (interleaved by category) */
  articles: T[];
  /** Stats about the sorting */
  stats: {
    totalInput: number;
    afterDeduplication: number;
    byCategory: Record<string, number>;
  };
}

/**
 * Main SOTA sorting function
 * Applies all optimizations: deduplication, time decay, category interleaving
 */
export function sotaSort<T extends ArticleWithMeta>(
  articles: T[],
  options: SOTASortOptions = {}
): SOTASortResult<T> {
  const {
    categoryOrder = ['technology', 'science', 'business', 'health'],
    excludeCategories = [],
    featuredMaxAgeHours = 6,
    enableTimeDecay = true,
    enableDeduplication = true,
  } = options;

  const stats = {
    totalInput: articles.length,
    afterDeduplication: 0,
    byCategory: {} as Record<string, number>,
  };

  // Step 1: Filter excluded categories
  let processed = articles.filter(
    a => !excludeCategories.includes(a.category?.toLowerCase() || '')
  );

  // Step 2: Cross-source deduplication
  if (enableDeduplication) {
    processed = deduplicateAcrossSources(processed);
  }
  stats.afterDeduplication = processed.length;

  // Step 3: Count by category
  for (const article of processed) {
    const cat = article.category?.toLowerCase() || 'other';
    stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
  }

  // Step 4: Select featured article
  const featured = selectFeaturedArticle(processed, featuredMaxAgeHours);

  // Step 5: Sort by effective score with category diversity
  // (max 2 consecutive from same category, but score is primary)
  let sortedArticles = sortWithDiversity(processed, categoryOrder);

  // Move featured to front if it exists
  if (featured) {
    sortedArticles = sortedArticles.filter(a => a.url !== featured.url);
    sortedArticles.unshift(featured);
  }

  return {
    featured,
    articles: sortedArticles,
    stats,
  };
}
