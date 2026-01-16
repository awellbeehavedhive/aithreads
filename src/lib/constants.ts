/**
 * Shared Constants
 *
 * Centralized constants used across the application to maintain consistency
 * and reduce code duplication.
 */

// ============================================================================
// CATEGORIES
// ============================================================================

// Categories shown in the dropdown filter (includes all categories)
export const CATEGORIES = [
  'All',
  'Technology',
  'Science',
  'Business',
  'Health',
  'Entertainment',
  'Sports',
] as const;

export type Category = typeof CATEGORIES[number];

// ============================================================================
// PAGINATION & DISPLAY
// ============================================================================

export const ARTICLES_PER_PAGE = 20;
export const PATTERN_SIZE = 4; // 1 featured + 3 small tiles = 4 articles per pattern

// ============================================================================
// LOADING STEPS (UI)
// ============================================================================

export const LOADING_STEPS = [
  { title: 'Reading article...', subtitle: 'Extracting key information' },
  { title: 'Searching web...', subtitle: 'Verifying facts with Google Search' },
  { title: 'Generating briefing...', subtitle: 'Crafting your smart summary' },
] as const;

export const ANALYSIS_LOADING_STEPS = [
  { title: 'Researching context...', subtitle: 'Finding historical patterns' },
  { title: 'Consulting experts...', subtitle: 'Gathering analyst perspectives' },
  { title: 'Connecting dots...', subtitle: 'Analyzing broader implications' },
  { title: 'Finalizing analysis...', subtitle: 'Crafting deep insights' },
] as const;

export type LoadingStep = { readonly title: string; readonly subtitle: string };

// ============================================================================
// SOTA SORTING CONFIGURATION
// ============================================================================

/**
 * Time constants for binning
 */
export const ONE_HOUR = 60 * 60 * 1000; // milliseconds
export const MAX_BIN_AGE = 168; // Maximum age in hours to display articles (7 days)
export const MAX_PER_BIN = 100; // Maximum articles per time bin

/**
 * Dynamic quality thresholds based on article recency
 *
 * Strategy: Prioritize high-quality recent content with exponential quality decay
 * - Bin 0 (0-1h): Show all articles (threshold = 0)
 * - Bin 1 (1-2h): Moderate quality (threshold = 40)
 * - Bin 2 (2-3h): Good quality (threshold = 50)
 * - Bin 3-6: Higher quality required (threshold = 60-70)
 * - Bin 7+: High quality only (threshold = 70)
 *
 * @param bin - The time bin (hours since fetch)
 * @returns The minimum quality score required for the bin
 */
export function getQualityThreshold(bin: number): number {
  if (bin === 0) return 0;   // Show all non-negative scored articles
  if (bin === 1) return 40;  // Moderate quality recent
  if (bin === 2) return 50;  // Good quality
  if (bin <= 6) return 60;   // Higher quality for older recent articles
  return 70;                 // High quality for old articles
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

export const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds - articles persist until they expire
export const THREAD_CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

// ============================================================================
// HOMEPAGE CATEGORIES (excluded from default view)
// ============================================================================

export const HOMEPAGE_EXCLUDED_CATEGORIES = ['sports', 'entertainment'] as const;

// ============================================================================
// SIMILARITY & DEDUPLICATION
// ============================================================================

export const SIMILARITY_THRESHOLD = 0.8; // Threshold for considering articles as duplicates

// ============================================================================
// SOURCE AUTHORITY WEIGHTS
// ============================================================================

/**
 * Authority weights for news sources (0-20 point boost to AI score)
 * Premium sources get higher boosts to ensure quality journalism surfaces
 *
 * Tier 1 (15-20): Major newspapers of record, wire services
 * Tier 2 (10-14): Respected national outlets, financial press
 * Tier 3 (5-9): Quality regional/specialized sources
 * Default: 0 (no boost)
 */
export const SOURCE_AUTHORITY: Record<string, number> = {
  // Tier 1: Newspapers of record & wire services (15-20 boost)
  'Wall Street Journal': 18,
  'New York Times': 18,
  'Washington Post': 17,
  'Associated Press': 17,
  'Reuters': 17,
  'Bloomberg': 16,
  'The Guardian': 15,
  'BBC News': 15,
  'Financial Times': 15,

  // Tier 2: Major national outlets (10-14 boost)
  'NPR': 12,
  'The Economist': 12,
  'CNBC': 11,
  'USA Today': 11,
  'CNN': 10,
  'NBC News': 10,
  'CBS News': 10,
  'ABC News': 10,
  'Axios': 10,
  'Politico': 10,

  // Tier 3: Quality specialized sources (5-9 boost)
  'Wired': 8,
  'Ars Technica': 8,
  'The Verge': 7,
  'TechCrunch': 7,
  'Nature': 9,
  'New Scientist': 8,
  'Space.com': 7,
  'Fortune': 7,
  'Al Jazeera': 7,
  'France 24': 6,
  'Deutsche Welle': 6,
  'Euronews': 5,
  'The Japan Times': 5,
};

/**
 * Get authority boost for a source name
 * Matches partial names (e.g., "Wall Street Journal" matches "The Wall Street Journal")
 */
export function getSourceAuthorityBoost(sourceName: string): number {
  // Direct match
  if (SOURCE_AUTHORITY[sourceName]) {
    return SOURCE_AUTHORITY[sourceName];
  }

  // Partial match (check if source name contains any authority key)
  for (const [key, boost] of Object.entries(SOURCE_AUTHORITY)) {
    if (sourceName.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(sourceName.toLowerCase())) {
      return boost;
    }
  }

  return 0; // No boost for unknown sources
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ============================================================================
// AI GENERATION PROMPTS
// ============================================================================

/**
 * Generate the briefing prompt for an article
 * Single source of truth for both pre-generation and on-the-fly generation
 */
export function getBriefingPrompt(article: { title: string; description?: string; content?: string; url?: string }): string {
  return `You are an expert news analyst providing quick, factual briefings.

CRITICAL REQUIREMENTS:
1. Be specific with numbers, dates, names, and quotes - avoid vague summaries
2. Keep it concise but informative - aim for 200-300 words total

DO NOT use emojis or sensationalist language.

STRUCTURE (follow exactly):

## Executive Summary
Write 2-3 sentences providing a complete overview of the story. Include the most important facts.

## Key Facts
Provide exactly 5 bullet points covering the most important details:
- **Specific facts**: Include exact numbers, dates, locations, and names
- **Direct quotes**: From officials, experts, or key figures (with attribution)
- **Verified data**: Statistics, financial figures, technical specifications

Format each bullet with **bold key terms**.

## Sources
CRITICAL: Each source MUST be a clickable markdown link. Use this EXACT format:
- [Source Name](https://full-url-here.com/path) - Description of what this source provided

You MUST include 2-3 sources as markdown links:
1. [${article.url ? new URL(article.url).hostname.replace('www.', '') : 'Original Source'}](${article.url || '#'}) - Description of the original article's contribution
2. Additional sources mentioned (agencies, institutions, companies) - use their actual URLs

Example format:
- [Bloomberg](https://bloomberg.com/news/article-name) - Breaking news coverage with official quotes
- [NBA.com](https://nba.com/news/topic) - Official league statement on the matter
- [Reuters](https://reuters.com/sports/article) - Additional reporting with expert analysis

NEVER use plain text sources like "Bloomberg: description" - ALWAYS use [Name](URL) format.

TONE: Professional, factual, and concise. Write as if for Bloomberg or Reuters.

Input Article:
Title: ${article.title}
Description: ${article.description || 'N/A'}
Content Snippet: ${article.content || 'N/A'}
Original URL: ${article.url || 'N/A'}

Provide a concise briefing.`;
}

/**
 * Format source provider name for display
 *
 * @param provider - The raw provider string
 * @returns Formatted provider name
 */
export function formatSourceProvider(provider?: string): string {
  if (!provider) return 'Unknown';
  if (provider === 'newsapi') return 'NewsAPI.org';
  if (provider === 'gnews') return 'GNews';
  if (provider.startsWith('rss-')) {
    const source = provider.replace('rss-', '').toUpperCase();
    return `RSS: ${source}`;
  }
  return provider;
}

// ============================================================================
// PLACEHOLDER IMAGE DETECTION
// ============================================================================

/**
 * Known placeholder/brand logo image patterns that should be filtered out
 * These are images that don't provide meaningful visual content for articles
 */
export const PLACEHOLDER_IMAGE_PATTERNS = {
  // URL patterns that indicate placeholder/logo images
  urlPatterns: [
    // NPR logo/branding
    /npr\.org\/.*logo/i,
    /media\.npr\.org\/assets\/img\/.*npr.*logo/i,
    /media\.npr\.org\/chrome/i,
    // Generic placeholders
    /placeholder/i,
    /default[-_]?image/i,
    /no[-_]?image/i,
    /missing[-_]?image/i,
    // Tracking pixels (backup check)
    /1x1|tracking|pixel|spacer|blank/i,
  ],

  // Image URLs containing these exact brand logo identifiers
  brandLogoUrls: [
    // NPR specific logo URLs
    'media.npr.org/assets/img/2019/06/17/npr_logo_white',
    'media.npr.org/chrome_svg/npr-logo',
    // Bloomberg Markets banner
    'assets.bwbx.io/images/users/iqjWHBFdfxIU/iqU7dE_logo',
  ],

  // Known placeholder og:image patterns (often brand logos as fallbacks)
  ogImagePlaceholders: [
    // WSJ default share image
    /wsj\.com\/.*wsj[-_]?logo/i,
    /wsj\.com\/.*share[-_]?default/i,
    // Bloomberg default
    /bloomberg\.com\/.*og[-_]?image[-_]?default/i,
    // Generic social share defaults
    /share[-_]?default/i,
    /og[-_]?default/i,
    /social[-_]?default/i,
  ],
} as const;

/**
 * Detects if an image URL is likely a placeholder or brand logo
 * that shouldn't be displayed as article imagery
 *
 * @param imageUrl - The URL of the image to check
 * @returns true if the image appears to be a placeholder/logo
 */
export function isPlaceholderImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return true;

  const url = imageUrl.toLowerCase();

  // Check URL patterns
  for (const pattern of PLACEHOLDER_IMAGE_PATTERNS.urlPatterns) {
    if (pattern.test(url)) {
      return true;
    }
  }

  // Check known brand logo URLs
  for (const logoUrl of PLACEHOLDER_IMAGE_PATTERNS.brandLogoUrls) {
    if (url.includes(logoUrl.toLowerCase())) {
      return true;
    }
  }

  // Check og:image placeholder patterns
  for (const pattern of PLACEHOLDER_IMAGE_PATTERNS.ogImagePlaceholders) {
    if (pattern.test(url)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that an image URL is usable (not a placeholder and properly formatted)
 *
 * @param imageUrl - The URL to validate
 * @returns true if the image is valid and should be displayed
 */
export function isValidArticleImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl || imageUrl.trim() === '') return false;

  // Must be http/https
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    return false;
  }

  // Check if it's a placeholder
  if (isPlaceholderImage(imageUrl)) {
    return false;
  }

  return true;
}
