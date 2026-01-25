/**
 * X-Inspired Weighted Scoring System
 *
 * Implements ranking improvements inspired by X's open-sourced algorithm:
 * - Weighted multi-factor scoring: Final Score = Σ (weight_i × factor_i)
 * - Source diversity attenuation: Penalize repeated sources (like X's author diversity)
 * - Negative signal detection: Detect clickbait patterns as negative weights
 * - Independent scoring: Scores don't depend on batch context (cacheable)
 *
 * @see https://github.com/xai-org/x-algorithm
 */

import { getSourceAuthorityBoost } from './constants';
import { calculateFreshnessScore } from './freshness';
import { getAgeInHours, calculateTimeDecay, normalizeTitle } from './sota-sorting';
import { Article, Topic } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

export interface ScoringWeights {
  /** Weight for AI quality score (0-1) */
  quality: number;
  /** Weight for source authority (0-1) */
  authority: number;
  /** Weight for freshness (0-1) */
  freshness: number;
  /** Weight for time decay (0-1) */
  timeDecay: number;
  /** Weight for negative signals (0-1, applied as penalty) */
  negativeSignals: number;
  /** Weight for source diversity attenuation (0-1) */
  diversityPenalty: number;
}

/**
 * Article with weighted scoring metadata
 */
export interface ScoredArticle extends Article {
  // Weighted scoring components
  weightedScore?: number;
  scoreBreakdown?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  qualityComponent: number;
  authorityComponent: number;
  freshnessComponent: number;
  timeDecayMultiplier: number;
  negativeSignalPenalty: number;
  diversityPenalty: number;
  finalScore: number;
}

// ============================================================================
// DEFAULT WEIGHTS (Tunable)
// ============================================================================

export const DEFAULT_WEIGHTS: ScoringWeights = {
  quality: 0.40,        // 40% - AI quality score
  authority: 0.15,      // 15% - Source credibility
  freshness: 0.20,      // 20% - How recent
  timeDecay: 0.15,      // 15% - Exponential decay over time
  negativeSignals: 0.10, // 10% - Clickbait/low-quality penalty
  diversityPenalty: 0.10, // 10% - Repeated source penalty
};

// ============================================================================
// NEGATIVE SIGNAL DETECTION (Clickbait Patterns)
// ============================================================================

/**
 * Patterns that indicate clickbait or low-quality content
 * Returns a penalty score from 0 (no penalty) to 100 (maximum penalty)
 */
const CLICKBAIT_PATTERNS = [
  // Listicles
  { pattern: /^\d+\s+(things|ways|reasons|tips|tricks|secrets|hacks|facts)/i, penalty: 30 },
  { pattern: /top\s+\d+/i, penalty: 20 },

  // Sensationalism
  { pattern: /you won'?t believe/i, penalty: 50 },
  { pattern: /shocking|jaw[- ]?dropping|mind[- ]?blowing/i, penalty: 40 },
  { pattern: /this (one )?trick/i, penalty: 45 },
  { pattern: /doctors hate/i, penalty: 60 },
  { pattern: /what happens next/i, penalty: 35 },

  // Vague engagement bait
  { pattern: /here'?s why/i, penalty: 15 },
  { pattern: /what you need to know/i, penalty: 10 },
  { pattern: /everything you need/i, penalty: 15 },

  // Promotional patterns
  { pattern: /sponsored|promoted|advertisement/i, penalty: 70 },
  { pattern: /partner content/i, penalty: 60 },

  // Question headlines (often clickbait)
  { pattern: /^(is|are|was|were|will|can|could|should|does|did)\s+.+\?$/i, penalty: 20 },

  // ALL CAPS abuse (more than 3 consecutive caps words)
  { pattern: /\b[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\b/, penalty: 25 },
];

/**
 * Detect negative signals in article title/description
 * Returns penalty score 0-100 (higher = worse content quality indicators)
 */
export function detectNegativeSignals(title: string, description?: string): number {
  const text = `${title} ${description || ''}`.toLowerCase();
  let totalPenalty = 0;

  for (const { pattern, penalty } of CLICKBAIT_PATTERNS) {
    if (pattern.test(title) || (description && pattern.test(description))) {
      totalPenalty += penalty;
    }
  }

  // Cap at 100
  return Math.min(100, totalPenalty);
}

// ============================================================================
// SOURCE DIVERSITY ATTENUATION
// ============================================================================

/**
 * Track source appearances and calculate diversity penalty
 * Inspired by X's "Author Diversity Scorer" - attenuates repeated sources
 */
export class SourceDiversityTracker {
  private sourceAppearances: Map<string, number> = new Map();
  private readonly decayFactor: number;

  /**
   * @param decayFactor - How much to penalize each repeated appearance (0.15 = 15% penalty per repeat)
   */
  constructor(decayFactor: number = 0.15) {
    this.decayFactor = decayFactor;
  }

  /**
   * Get diversity penalty for a source (0-100)
   * First appearance: 0 penalty
   * Second appearance: decayFactor * 100 penalty
   * Third appearance: 2 * decayFactor * 100 penalty
   * etc.
   */
  getPenalty(sourceName: string): number {
    const normalizedSource = sourceName.toLowerCase().trim();
    const appearances = this.sourceAppearances.get(normalizedSource) || 0;

    // Exponential penalty for repeated sources
    // First article: 0 penalty, second: 15%, third: 28%, fourth: 39%, etc.
    const penalty = (1 - Math.pow(1 - this.decayFactor, appearances)) * 100;

    return Math.min(100, penalty);
  }

  /**
   * Record a source appearance (call after scoring/selecting an article)
   */
  recordAppearance(sourceName: string): void {
    const normalizedSource = sourceName.toLowerCase().trim();
    const current = this.sourceAppearances.get(normalizedSource) || 0;
    this.sourceAppearances.set(normalizedSource, current + 1);
  }

  /**
   * Reset tracker (for new ranking session)
   */
  reset(): void {
    this.sourceAppearances.clear();
  }

  /**
   * Get current source distribution stats
   */
  getStats(): Record<string, number> {
    return Object.fromEntries(this.sourceAppearances);
  }
}

// ============================================================================
// WEIGHTED SCORING FORMULA
// ============================================================================

/**
 * Calculate weighted score for a single article
 * Formula: Final = Σ (weight_i × normalized_factor_i) × timeDecay - penalties
 *
 * All factors are normalized to 0-100 scale before weighting
 */
export function calculateWeightedScore(
  article: ScoredArticle,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  diversityPenalty: number = 0
): ScoreBreakdown {
  // Normalize AI score to 0-100 (already in this range, but ensure bounds)
  const normalizedQuality = Math.min(100, Math.max(0, article.aiScore ?? 50));

  // Normalize authority boost to 0-100 (original is 0-20, scale by 5)
  const authorityBoost = getSourceAuthorityBoost(article.source?.name || '');
  const normalizedAuthority = Math.min(100, authorityBoost * 5);

  // Freshness is already 0-100
  const normalizedFreshness = calculateFreshnessScore(article.publishedAt);

  // Time decay is 0-1, keep as multiplier
  const ageInHours = getAgeInHours(article.publishedAt);
  const timeDecayMultiplier = calculateTimeDecay(ageInHours);

  // Negative signals (penalty 0-100)
  const negativeSignalPenalty = detectNegativeSignals(
    article.title,
    article.description ?? undefined
  );

  // Calculate weighted components
  const qualityComponent = normalizedQuality * weights.quality;
  const authorityComponent = normalizedAuthority * weights.authority;
  const freshnessComponent = normalizedFreshness * weights.freshness;

  // Base score from positive factors
  const baseScore = qualityComponent + authorityComponent + freshnessComponent;

  // Apply time decay as a multiplier on the time-sensitive portion
  const timeDecayedScore = baseScore * (1 - weights.timeDecay + weights.timeDecay * timeDecayMultiplier);

  // Apply penalties (negative signals and diversity)
  const negativePenalty = negativeSignalPenalty * weights.negativeSignals;
  const diversityPenaltyScore = diversityPenalty * weights.diversityPenalty;

  const finalScore = Math.max(0, timeDecayedScore - negativePenalty - diversityPenaltyScore);

  return {
    qualityComponent,
    authorityComponent,
    freshnessComponent,
    timeDecayMultiplier,
    negativeSignalPenalty,
    diversityPenalty: diversityPenaltyScore,
    finalScore,
  };
}

// ============================================================================
// MAIN SORTING FUNCTION
// ============================================================================

export interface WeightedSortOptions {
  /** Scoring weights (defaults to DEFAULT_WEIGHTS) */
  weights?: ScoringWeights;
  /** Enable source diversity attenuation */
  enableDiversityAttenuation?: boolean;
  /** Diversity decay factor (0.15 = 15% penalty per repeated source) */
  diversityDecayFactor?: number;
  /** Maximum consecutive articles from same category */
  maxConsecutiveCategory?: number;
  /** Categories to exclude */
  excludeCategories?: string[];
  /** Enable cross-source deduplication */
  enableDeduplication?: boolean;
}

export interface WeightedSortResult<T extends ScoredArticle> {
  /** Sorted articles with weighted scores */
  articles: T[];
  /** Statistics about the sorting */
  stats: {
    totalInput: number;
    afterDeduplication: number;
    averageScore: number;
    topScore: number;
    bottomScore: number;
    sourceDistribution: Record<string, number>;
    negativeFlagged: number;
  };
}

/**
 * Sort articles using X-inspired weighted scoring
 */
export function weightedSort<T extends ScoredArticle>(
  articles: T[],
  options: WeightedSortOptions = {}
): WeightedSortResult<T> {
  const {
    weights = DEFAULT_WEIGHTS,
    enableDiversityAttenuation = true,
    diversityDecayFactor = 0.15,
    maxConsecutiveCategory = 2,
    excludeCategories = [],
    enableDeduplication = true,
  } = options;

  // Filter excluded categories
  let processed = articles.filter(
    a => !excludeCategories.includes(a.category?.toLowerCase() || '')
  );

  // Deduplication (simple title-based)
  if (enableDeduplication) {
    const seen = new Map<string, T>();
    for (const article of processed) {
      const normalized = normalizeTitle(article.title);
      const existing = seen.get(normalized);
      if (!existing || (article.aiScore ?? 0) > (existing.aiScore ?? 0)) {
        seen.set(normalized, article);
      }
    }
    processed = Array.from(seen.values());
  }

  const afterDeduplication = processed.length;

  // Phase 1: Calculate initial scores without diversity penalty
  const scored = processed.map(article => {
    const breakdown = calculateWeightedScore(article, weights, 0);
    return {
      article,
      breakdown,
      initialScore: breakdown.finalScore,
    };
  });

  // Sort by initial score
  scored.sort((a, b) => b.initialScore - a.initialScore);

  // Phase 2: Re-score with diversity attenuation (greedy selection)
  const diversityTracker = new SourceDiversityTracker(diversityDecayFactor);
  const result: T[] = [];
  const remaining = [...scored];
  let lastCategory = '';
  let consecutiveCategoryCount = 0;
  let negativeFlagged = 0;

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const cat = item.article.category?.toLowerCase() || 'other';

      // Check category constraint
      if (cat === lastCategory && consecutiveCategoryCount >= maxConsecutiveCategory) {
        continue;
      }

      // Calculate score with diversity penalty
      let score = item.initialScore;
      if (enableDiversityAttenuation) {
        const diversityPenalty = diversityTracker.getPenalty(item.article.source?.name || '');
        score = item.initialScore - (diversityPenalty * weights.diversityPenalty);
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // If no valid article found (category constraint), take best remaining
    if (bestIdx === -1) {
      bestIdx = 0;
      bestScore = remaining[0].initialScore;
    }

    const selected = remaining.splice(bestIdx, 1)[0];
    const cat = selected.article.category?.toLowerCase() || 'other';

    // Update category tracking
    if (cat === lastCategory) {
      consecutiveCategoryCount++;
    } else {
      consecutiveCategoryCount = 1;
      lastCategory = cat;
    }

    // Record source appearance for diversity
    if (enableDiversityAttenuation) {
      diversityTracker.recordAppearance(selected.article.source?.name || '');
    }

    // Track negative flagged articles
    if (selected.breakdown.negativeSignalPenalty > 20) {
      negativeFlagged++;
    }

    // Attach score breakdown to article
    const articleWithScore = {
      ...selected.article,
      weightedScore: bestScore,
      scoreBreakdown: selected.breakdown,
    } as T;

    result.push(articleWithScore);
  }

  // Calculate stats
  const scores = result.map(a => a.weightedScore ?? 0);
  const stats = {
    totalInput: articles.length,
    afterDeduplication,
    averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    topScore: scores.length > 0 ? Math.max(...scores) : 0,
    bottomScore: scores.length > 0 ? Math.min(...scores) : 0,
    sourceDistribution: diversityTracker.getStats(),
    negativeFlagged,
  };

  return { articles: result, stats };
}

// ============================================================================
// COMPARISON UTILITIES
// ============================================================================

/**
 * Compare old vs new ranking for analysis
 */
export function compareRankings<T extends ScoredArticle>(
  oldRanking: T[],
  newRanking: T[]
): {
  positionChanges: Array<{ url: string; title: string; oldPos: number; newPos: number; change: number }>;
  newInTop10: T[];
  droppedFromTop10: T[];
  averagePositionChange: number;
} {
  const oldPositions = new Map(oldRanking.map((a, i) => [a.url, i]));
  const newPositions = new Map(newRanking.map((a, i) => [a.url, i]));

  const positionChanges: Array<{ url: string; title: string; oldPos: number; newPos: number; change: number }> = [];

  for (const article of newRanking) {
    const oldPos = oldPositions.get(article.url) ?? oldRanking.length;
    const newPos = newPositions.get(article.url)!;
    positionChanges.push({
      url: article.url,
      title: article.title,
      oldPos,
      newPos,
      change: oldPos - newPos, // Positive = moved up
    });
  }

  // Sort by absolute change
  positionChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Find articles new to top 10
  const oldTop10 = new Set(oldRanking.slice(0, 10).map(a => a.url));
  const newTop10 = newRanking.slice(0, 10);
  const newInTop10 = newTop10.filter(a => !oldTop10.has(a.url));

  // Find articles dropped from top 10
  const newTop10Set = new Set(newTop10.map(a => a.url));
  const droppedFromTop10 = oldRanking.slice(0, 10).filter(a => !newTop10Set.has(a.url));

  const averagePositionChange = positionChanges.reduce((sum, p) => sum + Math.abs(p.change), 0) / positionChanges.length;

  return {
    positionChanges,
    newInTop10,
    droppedFromTop10,
    averagePositionChange,
  };
}

// ============================================================================
// TOPIC SCORING (Extension for aggregated content)
// ============================================================================

/**
 * Scored topic with weighted score breakdown
 */
export interface ScoredTopic extends Topic {
  weightedScore?: number;
  topicScoreBreakdown?: TopicScoreBreakdown;
}

export interface TopicScoreBreakdown {
  qualityComponent: number;      // Based on importance
  sourceCountBoost: number;      // Bonus for multi-source
  freshnessComponent: number;    // Based on publishedAt
  timeDecayMultiplier: number;
  finalScore: number;
}

/**
 * Calculate weighted score for a Topic
 * Topics get a boost for having multiple sources (like authority for articles)
 */
export function calculateTopicScore(
  topic: Topic,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): TopicScoreBreakdown {
  // Quality component: use importance (0-100)
  const normalizedQuality = Math.min(100, Math.max(0, topic.importance ?? 50));

  // Source count boost: +5 points per source, capped at 25
  // This replaces authority for topics (multi-source = authoritative)
  const sourceCountBoost = Math.min(25, (topic.sourceCount || 1) * 5);
  const normalizedAuthority = sourceCountBoost * 4; // Scale to 0-100

  // Freshness based on publishedAt
  const normalizedFreshness = calculateFreshnessScore(topic.publishedAt);

  // Time decay
  const ageInHours = getAgeInHours(topic.publishedAt);
  const timeDecayMultiplier = calculateTimeDecay(ageInHours);

  // Calculate weighted components (no negative signals for topics - they're curated)
  const qualityComponent = normalizedQuality * weights.quality;
  const authorityComponent = normalizedAuthority * weights.authority;
  const freshnessComponent = normalizedFreshness * weights.freshness;

  // Base score
  const baseScore = qualityComponent + authorityComponent + freshnessComponent;

  // Apply time decay
  const timeDecayedScore = baseScore * (1 - weights.timeDecay + weights.timeDecay * timeDecayMultiplier);

  // Topics get a significant boost (+15) for being aggregated multi-source content
  // This ensures topics generally rank above individual articles
  const finalScore = Math.min(100, timeDecayedScore + 15);

  return {
    qualityComponent,
    sourceCountBoost,
    freshnessComponent,
    timeDecayMultiplier,
    finalScore,
  };
}

// ============================================================================
// UNIFIED CONTENT SORTING (Topics + Articles together)
// ============================================================================

/**
 * Union type for sortable content
 */
export type ScoredContent =
  | (ScoredArticle & { contentType: 'article' })
  | (ScoredTopic & { contentType: 'topic' });

export interface UnifiedSortResult {
  content: ScoredContent[];
  stats: {
    totalTopics: number;
    totalArticles: number;
    topicsInTop10: number;
    averageScore: number;
  };
}

/**
 * Sort topics and articles together by weighted score
 */
export function unifiedSort(
  topics: Topic[],
  articles: ScoredArticle[],
  options: WeightedSortOptions = {}
): UnifiedSortResult {
  const { weights = DEFAULT_WEIGHTS } = options;

  // Score all topics
  const scoredTopics: ScoredContent[] = topics.map(topic => {
    const breakdown = calculateTopicScore(topic, weights);
    return {
      ...topic,
      contentType: 'topic' as const,
      weightedScore: breakdown.finalScore,
      topicScoreBreakdown: breakdown,
    };
  });

  // Score all articles using existing weighted sort
  const articleResult = weightedSort(articles, options);
  const scoredArticles: ScoredContent[] = articleResult.articles.map(article => ({
    ...article,
    contentType: 'article' as const,
  }));

  // Combine and sort by weighted score
  const allContent = [...scoredTopics, ...scoredArticles];
  allContent.sort((a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0));

  // Calculate stats
  const topicsInTop10 = allContent.slice(0, 10).filter(c => c.contentType === 'topic').length;
  const scores = allContent.map(c => c.weightedScore ?? 0);

  return {
    content: allContent,
    stats: {
      totalTopics: topics.length,
      totalArticles: articles.length,
      topicsInTop10,
      averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    },
  };
}
