/**
 * Shared Type Definitions
 *
 * Centralized type definitions used across the application to maintain
 * type safety and consistency.
 */

// ============================================================================
// ARTICLE TYPES
// ============================================================================

/**
 * Source provider type for news articles
 */
export type SourceProvider =
  | 'newsapi'
  | 'gnews'
  | 'rss-nyt'
  | 'rss-bbc'
  | 'rss-cnn'
  | 'rss-health'
  | 'rss-reuters'
  | 'rss-guardian'
  | 'rss-tech'
  | 'rss-npr'
  | 'rss-business'
  | 'rss-science'
  | 'rss-france24'
  | 'rss-abcnews'
  | 'rss-dw'
  | 'rss-japan'
  | 'rss-euronews'
  | 'rss-timesofindia'
  | 'rss-aljazeera'
  | 'rss-google-news'
  | 'rss-techcrunch'
  | 'rss-wapo'
  | 'rss-axios'
  | 'rss-ap'
  | 'rss-cnbc'
  | 'rss-nbcnews'
  | 'rss-cbsnews'
  | 'rss-space'
  | 'rss-nature'
  | 'rss-wsj'
  | 'rss-usatoday'
  | 'rss-politico';

/**
 * News article source information
 */
export interface ArticleSource {
  id: string | null;
  name: string;
}

/**
 * News Article
 *
 * The primary data structure for news articles throughout the application.
 * This interface represents the union of all article properties from various
 * sources (NewsAPI, GNews, RSS feeds) with additional computed fields.
 */
export interface Article {
  // Core article data
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;

  // Source information
  source: ArticleSource;
  author: string | null;

  // AI-generated metadata
  aiScore?: number;           // Quality score from AI ranking (0-100)
  aiReason?: string;          // Explanation for the AI score
  threadCached?: boolean;     // Whether thread content is pre-generated
  execSummary?: string;       // AI-generated executive summary

  // Kids mode metadata
  kidsScore?: number;         // Kid-friendliness score (0-100), higher = more appropriate
  kidsTitle?: string;         // Simplified, kid-friendly title

  // Classification & routing
  category?: string;          // Article category (technology, science, etc.)
  sourceProvider?: SourceProvider; // Which API/feed provided this article

  // Freshness assessment
  freshnessScore?: number;       // Freshness score (0-100), higher = fresher
  publishedAgeMinutes?: number;  // Age of article in minutes
  isBreaking?: boolean;          // Whether article is breaking news (< 60 min old)
}

/**
 * Article with binning metadata for SOTA sorting
 */
export interface ArticleWithBin extends Article {
  fetchBin: number;    // Time bin (hours since fetch)
  ageInHours: number;  // Age of article in hours
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * News API response structure
 */
export interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: Article[];
}

// ============================================================================
// THREAD/CONTENT TYPES
// ============================================================================

/**
 * Thread content structure
 */
export interface ThreadContent {
  articleUrl: string;
  content: string;
  generatedAt: number;  // Timestamp
  model?: string;       // AI model used
}

/**
 * Thread generation request
 */
export interface ThreadGenerationRequest {
  articleUrl: string;
  articleTitle: string;
  articleDescription?: string;
  articleContent?: string;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Cache metadata
 */
export interface CacheMetadata {
  key: string;
  ttl: number;        // Time to live in seconds
  createdAt: number;  // Timestamp
  expiresAt: number;  // Timestamp
}

/**
 * Cached brief structure
 */
export interface CachedBrief {
  briefContent: string;
  analysisContent?: string;
  generatedAt: number;
  expiresAt: number;
}

// ============================================================================
// COMPONENT PROPS TYPES
// ============================================================================

/**
 * Loading step structure for UI
 */
export interface LoadingStep {
  title: string;
  subtitle: string;
}

/**
 * Category type (matching constants)
 */
export type Category =
  | 'All'
  | 'Technology'
  | 'Science'
  | 'Business'
  | 'Health'
  | 'Entertainment'
  | 'Sports';

// ============================================================================
// TOPIC CLUSTERING TYPES
// ============================================================================

/**
 * Source article reference within a topic cluster
 */
export interface TopicSource {
  title: string;
  url: string;
  source: string;           // e.g., "BBC", "Reuters"
  publishedAt: string;
  aiScore?: number;
  urlToImage?: string;      // Thumbnail image from source article
}

/**
 * Topic - A cluster of related articles aggregated into a unified story
 * Similar to Perplexity Discover's topic cards
 */
export interface Topic {
  id: string;                    // Hash of normalized title
  title: string;                 // AI-generated unified title
  summary: string;               // 2-3 sentence executive summary
  fullBrief: string;             // Full markdown brief (like thread)
  image: string | null;          // Best image from source articles
  sourceCount: number;           // Number of aggregated sources
  sources: TopicSource[];        // Array of source articles
  categories: string[];          // Categories covered
  importance: number;            // 0-100 ranking score
  publishedAt: string;           // Newest article timestamp
  createdAt: number;             // When topic was created
}

/**
 * Article cluster before AI processing
 */
export interface ArticleCluster {
  id: string;
  articles: Article[];
  representativeTitle: string;   // First article's normalized title
  categories: string[];
  avgAiScore: number;
  newestPublishedAt: string;
}
