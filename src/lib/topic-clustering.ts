/**
 * Topic Clustering Algorithm
 *
 * Groups related articles from multiple sources into topic clusters.
 * Uses title similarity detection from sota-sorting.ts to identify
 * articles covering the same story.
 */

import { createHash } from 'crypto';
import { Article, ArticleCluster } from '@/types';
import { normalizeTitle, isSameStory, parseDate, getAgeInHours } from './sota-sorting';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Minimum sources required to form a topic cluster */
export const MIN_CLUSTER_SIZE = 3;

/** Maximum number of topics to generate */
export const MAX_TOPICS = 20;

/** Maximum age of articles to include (hours) */
export const MAX_ARTICLE_AGE_HOURS = 48;

// ============================================================================
// CLUSTER ID GENERATION
// ============================================================================

/**
 * Generate a stable cluster ID from normalized title
 * Uses first 12 chars of MD5 hash for compact, URL-safe IDs
 */
export function generateClusterId(normalizedTitle: string): string {
  const hash = createHash('md5').update(normalizedTitle).digest('hex');
  return hash.substring(0, 12);
}

// ============================================================================
// IMAGE SELECTION
// ============================================================================

/**
 * Select the best image from a cluster of articles
 * Prefers: articles with highest AI score that have images
 */
export function selectBestImage(articles: Article[]): string | null {
  // Sort by AI score descending, then filter those with images
  const withImages = articles
    .filter(a => a.urlToImage && !a.urlToImage.includes('.m3u8'))
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));

  return withImages[0]?.urlToImage || null;
}

// ============================================================================
// IMPORTANCE SCORING
// ============================================================================

/**
 * Calculate topic importance based on multiple factors
 * Higher score = more important story
 */
export function calculateTopicImportance(cluster: ArticleCluster): number {
  const sourceCount = cluster.articles.length;
  const avgAiScore = cluster.avgAiScore;

  // Recency bonus: newer stories get significantly higher scores
  // Use exponential decay so stories fall off faster after peak freshness
  const newestAge = getAgeInHours(cluster.newestPublishedAt);
  const recencyBonus = Math.exp(-newestAge / 8); // ~1.0 at 0h, ~0.5 at 5.5h, ~0.1 at 18h

  // Category diversity: stories spanning multiple categories are more significant
  const categoryDiversity = cluster.categories.length;

  // Weighted formula
  // - Source count is primary factor (more coverage = more important)
  // - AI quality matters
  // - Recency gives strong time-sensitive boost (newer stories compete better)
  // - Cross-category stories get bonus
  const importance = Math.round(
    sourceCount * 2.5 +            // ~12-50 points from sources (reduced from 3x)
    avgAiScore * 0.3 +             // ~15-30 points from quality
    recencyBonus * 30 +            // ~0-30 points from recency (doubled)
    categoryDiversity * 3          // ~3-12 points from diversity
  );

  return Math.min(100, Math.max(0, importance));
}

// ============================================================================
// MAIN CLUSTERING ALGORITHM
// ============================================================================

/**
 * Cluster articles by story similarity
 *
 * Algorithm:
 * 1. Filter articles by age (last 48 hours)
 * 2. For each article, check if it matches an existing cluster
 * 3. If match found, add to cluster; otherwise create new cluster
 * 4. Filter clusters to min size requirement
 * 5. Sort clusters by size (more sources = more important)
 * 6. Return top N clusters with metadata
 */
export function clusterArticles(
  articles: Article[],
  options: {
    minClusterSize?: number;
    maxTopics?: number;
    maxAgeHours?: number;
  } = {}
): ArticleCluster[] {
  const {
    minClusterSize = MIN_CLUSTER_SIZE,
    maxTopics = MAX_TOPICS,
    maxAgeHours = MAX_ARTICLE_AGE_HOURS,
  } = options;

  // Step 1: Filter by age
  const now = Date.now();
  const recentArticles = articles.filter(article => {
    const age = getAgeInHours(article.publishedAt);
    return age <= maxAgeHours;
  });

  console.log(`[Clustering] ${articles.length} articles → ${recentArticles.length} within ${maxAgeHours}h`);

  // Step 2: Build clusters using title similarity
  const clusters: Map<string, Article[]> = new Map();

  for (const article of recentArticles) {
    const normalizedTitle = normalizeTitle(article.title);
    let foundCluster = false;

    // Check if article belongs to existing cluster
    for (const [clusterId, clusterArticles] of clusters) {
      const representative = clusterArticles[0];
      if (isSameStory(article.title, representative.title)) {
        clusterArticles.push(article);
        foundCluster = true;
        break;
      }
    }

    // Create new cluster if no match
    if (!foundCluster) {
      const clusterId = generateClusterId(normalizedTitle);
      clusters.set(clusterId, [article]);
    }
  }

  console.log(`[Clustering] Found ${clusters.size} unique story clusters`);

  // Step 3: Convert to ArticleCluster format and filter by size
  const articleClusters: ArticleCluster[] = [];

  for (const [id, clusterArticles] of clusters) {
    if (clusterArticles.length < minClusterSize) continue;

    // Calculate cluster metadata
    const categories = [...new Set(clusterArticles.map(a => a.category).filter(Boolean))] as string[];
    const avgAiScore = clusterArticles.reduce((sum, a) => sum + (a.aiScore || 50), 0) / clusterArticles.length;

    // Find newest article
    let newestTimestamp = 0;
    let newestPublishedAt = clusterArticles[0].publishedAt;
    for (const article of clusterArticles) {
      const timestamp = parseDate(article.publishedAt);
      if (timestamp > newestTimestamp) {
        newestTimestamp = timestamp;
        newestPublishedAt = article.publishedAt;
      }
    }

    articleClusters.push({
      id,
      articles: clusterArticles,
      representativeTitle: normalizeTitle(clusterArticles[0].title),
      categories,
      avgAiScore,
      newestPublishedAt,
    });
  }

  console.log(`[Clustering] ${articleClusters.length} clusters with ${minClusterSize}+ sources`);

  // Step 4: Sort by importance (source count + quality + recency)
  articleClusters.sort((a, b) => {
    const importanceA = calculateTopicImportance(a);
    const importanceB = calculateTopicImportance(b);
    return importanceB - importanceA;
  });

  // Step 5: Return top N clusters
  const topClusters = articleClusters.slice(0, maxTopics);

  console.log(`[Clustering] Returning top ${topClusters.length} topics`);
  for (const cluster of topClusters.slice(0, 5)) {
    console.log(`  - ${cluster.articles.length} sources: "${cluster.articles[0].title.substring(0, 60)}..."`);
  }

  return topClusters;
}

// ============================================================================
// CLUSTER STATS
// ============================================================================

export interface ClusteringStats {
  totalArticles: number;
  recentArticles: number;
  totalClusters: number;
  qualifiedClusters: number;
  avgSourcesPerCluster: number;
  topClusterSources: number;
}

/**
 * Get statistics about clustering results
 */
export function getClusteringStats(
  articles: Article[],
  clusters: ArticleCluster[]
): ClusteringStats {
  const recentArticles = articles.filter(a => getAgeInHours(a.publishedAt) <= MAX_ARTICLE_AGE_HOURS);
  const totalSources = clusters.reduce((sum, c) => sum + c.articles.length, 0);

  return {
    totalArticles: articles.length,
    recentArticles: recentArticles.length,
    totalClusters: clusters.length,
    qualifiedClusters: clusters.filter(c => c.articles.length >= MIN_CLUSTER_SIZE).length,
    avgSourcesPerCluster: clusters.length > 0 ? Math.round(totalSources / clusters.length) : 0,
    topClusterSources: clusters[0]?.articles.length || 0,
  };
}
