/**
 * Baseline Comparison System
 *
 * Compares our article coverage against Google News as a baseline.
 * Identifies coverage gaps and measures freshness parity.
 */

import { compareTwoStrings } from 'string-similarity';
import { Article } from '@/types';
import { getFreshnessStats, calculateAgeMinutes } from './freshness';

/**
 * Baseline article structure (simplified for comparison)
 */
export interface BaselineArticle {
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  ageMinutes: number;
}

/**
 * Coverage comparison result
 */
export interface CoverageComparison {
  /** Total articles in baseline */
  baselineCount: number;
  /** Total articles in our feed */
  ourCount: number;
  /** Stories we have that match baseline */
  matchedStories: number;
  /** Stories in baseline that we're missing */
  missingStories: BaselineArticle[];
  /** Stories we have that aren't in baseline (unique coverage) */
  uniqueStories: number;
  /** Coverage percentage (matched / baseline * 100) */
  coveragePercent: number;
  /** Freshness comparison */
  freshnessComparison: {
    baselineAvgAgeMinutes: number;
    ourAvgAgeMinutes: number;
    freshnessGapMinutes: number;
    isFresher: boolean;
  };
}

/**
 * Story match result
 */
interface StoryMatch {
  baselineArticle: BaselineArticle;
  ourArticle: Article | null;
  similarity: number;
}

/**
 * Check if two articles are about the same story
 * Uses title similarity with threshold of 0.4 (lower than dedup to catch related stories)
 */
function isSameStory(title1: string, title2: string): { match: boolean; similarity: number } {
  // Normalize titles
  const normalize = (t: string) => t
    .toLowerCase()
    .replace(/\s*[-|–—]\s*[^-|–—]+$/, '') // Remove source suffix
    .replace(/^(breaking|exclusive|update|just in|developing|opinion|analysis):\s*/i, '')
    .trim();

  const norm1 = normalize(title1);
  const norm2 = normalize(title2);

  // Exact match
  if (norm1 === norm2) {
    return { match: true, similarity: 1.0 };
  }

  // Similarity check
  const similarity = compareTwoStrings(norm1, norm2);
  return { match: similarity > 0.4, similarity };
}

/**
 * Find the best matching article from our feed for a baseline article
 */
function findBestMatch(
  baselineArticle: BaselineArticle,
  ourArticles: Article[]
): StoryMatch {
  let bestMatch: Article | null = null;
  let bestSimilarity = 0;

  for (const article of ourArticles) {
    const { match, similarity } = isSameStory(baselineArticle.title, article.title);
    if (match && similarity > bestSimilarity) {
      bestMatch = article;
      bestSimilarity = similarity;
    }
  }

  return {
    baselineArticle,
    ourArticle: bestMatch,
    similarity: bestSimilarity,
  };
}

/**
 * Compare our article coverage against a baseline (e.g., Google News)
 */
export function compareAgainstBaseline(
  ourArticles: Article[],
  baselineArticles: BaselineArticle[]
): CoverageComparison {
  // Calculate freshness stats
  const ourStats = getFreshnessStats(ourArticles);
  let baselineTotalAge = 0;

  // Find matches for each baseline article
  const matches: StoryMatch[] = baselineArticles.map(baseline => {
    baselineTotalAge += baseline.ageMinutes;
    return findBestMatch(baseline, ourArticles);
  });

  // Categorize results
  const matchedStories = matches.filter(m => m.ourArticle !== null);
  const missingStories = matches
    .filter(m => m.ourArticle === null)
    .map(m => m.baselineArticle);

  // Find unique stories (ours that don't match any baseline)
  const matchedUrls = new Set(matchedStories.map(m => m.ourArticle!.url));
  const uniqueStories = ourArticles.filter(a => !matchedUrls.has(a.url));

  // Calculate baseline average age
  const baselineAvgAgeMinutes = baselineArticles.length > 0
    ? Math.round(baselineTotalAge / baselineArticles.length)
    : 0;

  return {
    baselineCount: baselineArticles.length,
    ourCount: ourArticles.length,
    matchedStories: matchedStories.length,
    missingStories,
    uniqueStories: uniqueStories.length,
    coveragePercent: baselineArticles.length > 0
      ? Math.round((matchedStories.length / baselineArticles.length) * 100)
      : 100,
    freshnessComparison: {
      baselineAvgAgeMinutes,
      ourAvgAgeMinutes: ourStats.averageAgeMinutes,
      freshnessGapMinutes: ourStats.averageAgeMinutes - baselineAvgAgeMinutes,
      isFresher: ourStats.averageAgeMinutes < baselineAvgAgeMinutes,
    },
  };
}

/**
 * Parse Google News RSS items into baseline articles
 */
export function parseGoogleNewsBaseline(
  items: Array<{ title: string; link: string; pubDate?: string; isoDate?: string; source?: { name: string } }>
): BaselineArticle[] {
  return items.map(item => {
    const publishedAt = item.pubDate || item.isoDate || new Date().toISOString();
    return {
      title: item.title,
      url: item.link,
      publishedAt,
      source: item.source?.name || 'Google News',
      ageMinutes: calculateAgeMinutes(publishedAt),
    };
  });
}

/**
 * Generate a freshness report comparing our feed to baseline
 */
export function generateFreshnessReport(comparison: CoverageComparison): string {
  const lines: string[] = [];

  lines.push('=== Freshness Comparison Report ===\n');

  // Coverage summary
  lines.push('📊 Coverage Summary:');
  lines.push(`   Baseline stories: ${comparison.baselineCount}`);
  lines.push(`   Our stories: ${comparison.ourCount}`);
  lines.push(`   Matched: ${comparison.matchedStories} (${comparison.coveragePercent}%)`);
  lines.push(`   Missing: ${comparison.missingStories.length}`);
  lines.push(`   Unique to us: ${comparison.uniqueStories}`);
  lines.push('');

  // Freshness comparison
  lines.push('⏱️ Freshness Comparison:');
  lines.push(`   Baseline avg age: ${Math.round(comparison.freshnessComparison.baselineAvgAgeMinutes / 60)}h ${comparison.freshnessComparison.baselineAvgAgeMinutes % 60}m`);
  lines.push(`   Our avg age: ${Math.round(comparison.freshnessComparison.ourAvgAgeMinutes / 60)}h ${comparison.freshnessComparison.ourAvgAgeMinutes % 60}m`);

  const gapMinutes = Math.abs(comparison.freshnessComparison.freshnessGapMinutes);
  const gapHours = Math.round(gapMinutes / 60);
  const gapDirection = comparison.freshnessComparison.isFresher ? 'fresher' : 'older';
  lines.push(`   Gap: ${gapHours}h ${gapMinutes % 60}m ${gapDirection} than baseline`);
  lines.push('');

  // Missing stories (top 5)
  if (comparison.missingStories.length > 0) {
    lines.push('❌ Top Missing Stories:');
    comparison.missingStories.slice(0, 5).forEach((story, i) => {
      const age = Math.round(story.ageMinutes / 60);
      lines.push(`   ${i + 1}. [${age}h old] ${story.title.substring(0, 60)}...`);
    });
  }

  return lines.join('\n');
}

/**
 * Get freshness grade based on comparison
 */
export function getFreshnessGrade(comparison: CoverageComparison): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  color: string;
} {
  const { coveragePercent, freshnessComparison } = comparison;

  // Score based on coverage and freshness
  let score = 0;

  // Coverage scoring (0-50 points)
  if (coveragePercent >= 80) score += 50;
  else if (coveragePercent >= 60) score += 40;
  else if (coveragePercent >= 40) score += 30;
  else if (coveragePercent >= 20) score += 20;
  else score += 10;

  // Freshness scoring (0-50 points)
  const gapHours = freshnessComparison.freshnessGapMinutes / 60;
  if (freshnessComparison.isFresher || gapHours < 1) score += 50;
  else if (gapHours < 2) score += 40;
  else if (gapHours < 4) score += 30;
  else if (gapHours < 8) score += 20;
  else score += 10;

  // Determine grade
  if (score >= 90) return { grade: 'A', label: 'Excellent', color: '#10b981' };
  if (score >= 75) return { grade: 'B', label: 'Good', color: '#22c55e' };
  if (score >= 60) return { grade: 'C', label: 'Fair', color: '#eab308' };
  if (score >= 40) return { grade: 'D', label: 'Poor', color: '#f97316' };
  return { grade: 'F', label: 'Critical', color: '#ef4444' };
}
