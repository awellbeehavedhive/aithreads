/**
 * Server Startup Script
 * - Initializes news cache on server startup
 * - Pre-generation and AI ranking are handled by /api/refresh-cache endpoint
 */

import { prefetchAllCategories } from './news-cache';

let initialized = false;

/**
 * Initialize cache on server startup
 * Note: Pre-generation happens via /api/refresh-cache (after AI ranking)
 */
export async function initializeCache() {
  if (initialized) {
    console.log('[Startup] Cache already initialized');
    return;
  }

  console.log('[Startup] Initializing cache system...');
  
  try {
    // Just fetch and cache the news articles
    // AI ranking and pre-generation will be triggered by /api/refresh-cache
    await prefetchAllCategories();
    initialized = true;
    console.log('[Startup] Cache initialization complete');
    console.log('[Startup] AI ranking and pre-generation will be triggered by /api/refresh-cache');
  } catch (error) {
    console.error('[Startup] Failed to initialize cache:', error);
    // Don't block server startup on cache failure
  }
}

