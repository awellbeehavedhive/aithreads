/**
 * Thread Cache Manager (Redis-backed)
 *
 * Stores AI-generated thread content PERMANENTLY to ensure thread URLs never break.
 * - Uses Vercel KV (Redis) for persistent storage across function invocations
 * - Caches both brief summaries and expanded analysis
 * - Uses article URL as cache key
 * - NO TTL - threads persist forever (shared URLs should always work)
 * - Supports mode namespacing (default vs kids mode)
 */

import { getCached, setCached, deleteCached, getAllKeys } from './redis';
import type { SiteMode } from './mode-context';

interface CachedThread {
  brief: string;
  analysis?: string;
  execSummary?: string;
  timestamp: number;
}

// PERMANENT STORAGE - no TTL
// Threads are stored forever to ensure shared URLs always work

/**
 * Generate a cache key from article data with mode namespace
 * Cache keys are namespaced by mode to keep kids and default content separate
 */
function getCacheKey(title: string, url?: string, mode: SiteMode = 'default'): string {
  // Use URL if available (most unique), otherwise use title
  const baseKey = url || title;
  // Namespace by mode: thread:default:URL or thread:kids:URL
  return `thread:${mode}:${baseKey}`;
}

/**
 * Get cached brief for an article
 */
export async function getCachedBrief(title: string, url?: string, mode: SiteMode = 'default'): Promise<string | null> {
  const key = getCacheKey(title, url, mode);
  const cached = await getCached<CachedThread>(key);

  if (!cached) {
    return null;
  }

  console.log(`[ThreadCache] Cache hit for brief (${mode}): ${title.substring(0, 50)}...`);
  return cached.brief;
}

/**
 * Get cached analysis for an article
 */
export async function getCachedAnalysis(title: string, url?: string, mode: SiteMode = 'default'): Promise<string | null> {
  const key = getCacheKey(title, url, mode);
  const cached = await getCached<CachedThread>(key);

  if (!cached || !cached.analysis) {
    return null;
  }

  console.log(`[ThreadCache] Cache hit for analysis (${mode}): ${title.substring(0, 50)}...`);
  return cached.analysis;
}

/**
 * Get cached executive summary for an article
 */
export async function getCachedExecSummary(title: string, url?: string, mode: SiteMode = 'default'): Promise<string | null> {
  const key = getCacheKey(title, url, mode);
  const cached = await getCached<CachedThread>(key);

  if (!cached || !cached.execSummary) {
    return null;
  }

  return cached.execSummary;
}

/**
 * Extract executive summary from brief (first paragraph after "## Executive Summary")
 */
function extractExecSummary(brief: string): string | undefined {
  const execMatch = brief.match(/##\s*Executive Summary\s*\n\n?([\s\S]*?)(?=\n\n##|\n\n\*\*|$)/i);
  if (execMatch && execMatch[1]) {
    return execMatch[1].trim().replace(/\n+/g, ' ');
  }
  return undefined;
}

/**
 * Extract executive summary from kids brief (first paragraph after "## What's Happening?")
 */
function extractKidsExecSummary(brief: string): string | undefined {
  const execMatch = brief.match(/##\s*What's Happening\?\s*\n\n?([\s\S]*?)(?=\n\n##|\n\n\*\*|$)/i);
  if (execMatch && execMatch[1]) {
    return execMatch[1].trim().replace(/\n+/g, ' ');
  }
  return undefined;
}

/**
 * Cache a brief for an article
 */
export async function cacheBrief(title: string, brief: string, url?: string, mode: SiteMode = 'default'): Promise<void> {
  const key = getCacheKey(title, url, mode);

  // Get existing cache to preserve analysis if any
  const existing = await getCached<CachedThread>(key);

  // Extract executive summary from brief (use different pattern for kids mode)
  const execSummary = mode === 'kids'
    ? extractKidsExecSummary(brief)
    : extractExecSummary(brief);

  const cacheData: CachedThread = {
    brief,
    analysis: existing?.analysis, // Preserve existing analysis if any
    execSummary,
    timestamp: Date.now(),
  };

  // Store permanently (no TTL) - threads should never expire
  await setCached(key, cacheData);
  console.log(`[ThreadCache] Permanently cached brief (${mode}) for: ${title.substring(0, 50)}...`);
}

/**
 * Cache analysis for an article (updates existing cache entry)
 */
export async function cacheAnalysis(title: string, analysis: string, url?: string, mode: SiteMode = 'default'): Promise<void> {
  const key = getCacheKey(title, url, mode);

  // Get existing cache
  const existing = await getCached<CachedThread>(key);

  const cacheData: CachedThread = {
    brief: existing?.brief || '', // Preserve existing brief
    analysis,
    timestamp: Date.now(),
  };

  // Store permanently (no TTL) - threads should never expire
  await setCached(key, cacheData);
  console.log(`[ThreadCache] Permanently cached analysis (${mode}) for: ${title.substring(0, 50)}...`);
}

/**
 * Get cache statistics
 */
export async function getThreadCacheStats() {
  try {
    const keys = await getAllKeys('thread:*');
    
    const stats = await Promise.all(
      keys.map(async (key) => {
        const data = await getCached<CachedThread>(key);
        if (!data) return null;
        
        return {
          url: key.replace('thread:', '').substring(0, 60),
          hasBrief: !!data.brief,
          hasAnalysis: !!data.analysis,
          age: Math.round((Date.now() - data.timestamp) / 1000 / 60), // minutes
        };
      })
    );

    const validStats = stats.filter(s => s !== null);

    return {
      threads: validStats,
      totalCached: validStats.length,
      withAnalysis: validStats.filter(s => s?.hasAnalysis).length,
    };
  } catch (error) {
    console.error('[ThreadCache] Error getting stats:', error);
    return {
      threads: [],
      totalCached: 0,
      withAnalysis: 0,
    };
  }
}

/**
 * Clear expired cache entries
 * NOTE: With permanent storage, threads no longer expire.
 * This function now does nothing but is kept for API compatibility.
 * @deprecated Threads are now stored permanently
 */
export async function clearExpiredThreads(): Promise<number> {
  // Threads no longer expire - they are stored permanently
  console.log('[ThreadCache] clearExpiredThreads called but threads are now permanent');
  return 0;
}

/**
 * Clear all cache (for testing/debugging)
 */
export async function clearAllThreadCache(): Promise<void> {
  try {
    const keys = await getAllKeys('thread:*');
    await Promise.all(keys.map(key => deleteCached(key)));
    console.log(`[ThreadCache] Cleared all cache (${keys.length} entries)`);
  } catch (error) {
    console.error('[ThreadCache] Error clearing all:', error);
  }
}

/**
 * Check if cache exists for an article
 */
export async function hasThreadCache(title: string, url?: string, mode: SiteMode = 'default'): Promise<boolean> {
  const key = getCacheKey(title, url, mode);
  const cached = await getCached<CachedThread>(key);
  return !!cached;
}

/**
 * Get cache age in minutes
 */
export async function getThreadCacheAge(title: string, url?: string, mode: SiteMode = 'default'): Promise<number | null> {
  const key = getCacheKey(title, url, mode);
  const cached = await getCached<CachedThread>(key);

  if (!cached) return null;

  return Math.round((Date.now() - cached.timestamp) / 1000 / 60);
}
