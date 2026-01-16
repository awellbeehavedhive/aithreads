/**
 * Topic Clustering Script
 *
 * Runs as a GitHub Action to:
 * 1. Fetch all recent articles from Redis category caches
 * 2. Cluster related articles by story similarity
 * 3. Generate AI summaries for top clusters
 * 4. Store topics in Redis for the /topics page
 *
 * Run: npx tsx scripts/cluster-topics.ts
 */

import { getCached, isRedisAvailable } from '../src/lib/redis';
import { clusterArticles, getClusteringStats } from '../src/lib/topic-clustering';
import { generateTopics, createFallbackTopic } from '../src/lib/topic-generator';
import { storeTopics, getTopicCacheStats } from '../src/lib/topic-cache';
import { Article, Topic } from '../src/types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CATEGORIES = ['technology', 'science', 'business', 'health', 'general'];
const MAX_TOPICS = 15;
const MIN_CLUSTER_SIZE = 3;
const MAX_ARTICLE_AGE_HOURS = 48;

// ============================================================================
// ARTICLE FETCHING
// ============================================================================

interface CachedData {
  articles: Article[];
  totalResults: number;
  timestamp: number;
}

/**
 * Fetch all articles from category caches
 */
async function fetchAllArticles(): Promise<Article[]> {
  console.log('[ClusterTopics] Fetching articles from category caches...');

  const allArticles: Article[] = [];
  const seenUrls = new Set<string>();

  for (const category of CATEGORIES) {
    const key = `news:${category}`;
    const cached = await getCached<CachedData>(key);

    if (cached && cached.articles) {
      let added = 0;
      for (const article of cached.articles) {
        // Deduplicate across categories by URL
        if (!seenUrls.has(article.url)) {
          seenUrls.add(article.url);
          allArticles.push({
            ...article,
            category: article.category || category,
          });
          added++;
        }
      }
      console.log(`  - ${category}: ${cached.articles.length} total, ${added} unique added`);
    } else {
      console.log(`  - ${category}: No cached data`);
    }
  }

  console.log(`[ClusterTopics] Total unique articles: ${allArticles.length}`);
  return allArticles;
}

// ============================================================================
// MAIN CLUSTERING PIPELINE
// ============================================================================

async function runTopicClustering() {
  console.log('=== Topic Clustering Pipeline ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  // Check Redis availability
  if (!isRedisAvailable()) {
    console.error('Redis not available - check KV_REST_API_URL and KV_REST_API_TOKEN');
    process.exit(1);
  }

  // Check Gemini API key
  if (!process.env.GEMINI_API_KEY) {
    console.warn('Warning: GEMINI_API_KEY not set - will use fallback topic generation');
  }

  try {
    // Step 1: Fetch all articles
    const articles = await fetchAllArticles();

    if (articles.length === 0) {
      console.error('No articles found in cache. Run news fetch first.');
      process.exit(1);
    }

    // Step 2: Cluster articles
    console.log('\n[ClusterTopics] Running clustering algorithm...');
    const clusters = clusterArticles(articles, {
      minClusterSize: MIN_CLUSTER_SIZE,
      maxTopics: MAX_TOPICS,
      maxAgeHours: MAX_ARTICLE_AGE_HOURS,
    });

    if (clusters.length === 0) {
      console.error('No clusters formed. Try lowering MIN_CLUSTER_SIZE or increasing article pool.');
      process.exit(1);
    }

    // Log clustering stats
    const stats = getClusteringStats(articles, clusters);
    console.log('\n[ClusterTopics] Clustering Stats:');
    console.log(`  - Total articles: ${stats.totalArticles}`);
    console.log(`  - Recent articles (${MAX_ARTICLE_AGE_HOURS}h): ${stats.recentArticles}`);
    console.log(`  - Total clusters: ${stats.totalClusters}`);
    console.log(`  - Qualified clusters (${MIN_CLUSTER_SIZE}+ sources): ${stats.qualifiedClusters}`);
    console.log(`  - Avg sources/cluster: ${stats.avgSourcesPerCluster}`);
    console.log(`  - Top cluster sources: ${stats.topClusterSources}`);

    // Step 3: Generate topic summaries
    console.log('\n[ClusterTopics] Generating topic summaries...');
    let topics: Topic[] = [];

    if (process.env.GEMINI_API_KEY) {
      // Use AI generation
      const result = await generateTopics(clusters, {
        delayMs: 1500, // 1.5s between requests to avoid rate limits
        maxTopics: MAX_TOPICS,
      });
      topics = result.topics;

      if (result.failed > 0) {
        console.warn(`[ClusterTopics] ${result.failed} topics failed AI generation`);
      }
    } else {
      // Fallback: create basic topics without AI
      console.log('[ClusterTopics] Using fallback topic generation (no AI)');
      topics = clusters.slice(0, MAX_TOPICS).map(cluster => createFallbackTopic(cluster));
    }

    if (topics.length === 0) {
      console.error('No topics generated. Check Gemini API key and rate limits.');
      process.exit(1);
    }

    // Step 4: Store topics
    console.log('\n[ClusterTopics] Storing topics in Redis...');
    await storeTopics(topics);

    // Step 5: Log final stats
    const cacheStats = await getTopicCacheStats();
    console.log('\n[ClusterTopics] Cache Stats:');
    console.log(`  - Topics stored: ${cacheStats.topicCount}`);
    console.log(`  - Last updated: ${cacheStats.lastUpdated ? new Date(cacheStats.lastUpdated).toISOString() : 'N/A'}`);

    // Summary
    console.log('\n=== Topic Clustering Complete ===');
    console.log(`Generated ${topics.length} topics from ${articles.length} articles`);
    console.log(`Top topics:`);
    for (const topic of topics.slice(0, 5)) {
      console.log(`  - [${topic.sourceCount} sources] ${topic.title.substring(0, 60)}...`);
    }
    console.log(`Time: ${new Date().toISOString()}`);

    process.exit(0);
  } catch (error: any) {
    console.error('\n[ClusterTopics] Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

// Run the pipeline
runTopicClustering();
