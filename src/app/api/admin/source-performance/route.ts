/**
 * Source Performance API
 *
 * Aggregates article lifecycle data from Google Sheets to provide source-level performance metrics
 * Also fetches live cache stats from Redis
 */

import { NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/sheets-logger';
import { getCacheStats, getRawCache } from '@/lib/news-cache';

export const dynamic = 'force-dynamic';

interface SourceMetrics {
  sourceProvider: string;
  sourceName: string;
  totalFetched: number;
  totalDisplayed: number;
  displayRate: number;
  avgAiScore: number;
  lastSeen: string;
  status: 'active' | 'failed' | 'unknown';
  categories: Set<string>;
}

interface CategoryMetrics {
  category: string;
  totalArticles: number;
  uniqueSources: number;
  avgAiScore: number;
}

export async function GET() {
  try {
    const sheets = await getGoogleSheetsClient();
    if (!sheets) {
      return NextResponse.json({ error: 'Google Sheets not configured' }, { status: 500 });
    }

    const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ARTICLE_LOG_ID;
    if (!SPREADSHEET_ID) {
      return NextResponse.json({ error: 'Spreadsheet ID not configured' }, { status: 500 });
    }

    // First, get total row count to fetch the MOST RECENT 5000 rows
    const countResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ArticleLog!A:A',
    });

    const totalRows = countResponse.data.values?.length || 0;
    const maxRows = 5000;
    const startRow = Math.max(2, totalRows - maxRows + 1); // Start from recent rows, skip header

    console.log(`[SourcePerformance] Total rows: ${totalRows}, fetching rows ${startRow} to ${totalRows}`);

    // Fetch most recent article log data (limit to 5000 rows for performance)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `ArticleLog!A${startRow}:K${totalRows}`,
    });

    const rows = response.data.values || [];

    // Parse rows into structured data
    const events = rows.map(row => ({
      timestamp: row[0] || '',
      cycleId: row[1] || '',
      category: row[2] || '',
      eventType: row[3] || '',
      articleUrl: row[4] || '',
      articleTitle: row[5] || '',
      sourceProvider: row[6] || '',
      sourceName: row[7] || '',
      aiScore: parseFloat(row[8]) || 0,
      reason: row[9] || '',
    }));

    // Filter out garbage/invalid source names
    const isValidSourceName = (name: string): boolean => {
      if (!name || name.trim() === '') return false;
      // Filter out numeric-only entries (e.g., "72", "99")
      if (/^\d+$/.test(name.trim())) return false;
      // Filter out test providers
      if (name.toLowerCase().includes('test')) return false;
      return true;
    };

    // Clean source name - return cleaned version or provider as fallback
    const cleanSourceName = (name: string, provider: string): string => {
      if (isValidSourceName(name)) return name;
      return provider; // Fall back to provider if name is garbage
    };

    // Aggregate by source provider
    const sourceMap = new Map<string, SourceMetrics>();
    const categoryMap = new Map<string, CategoryMetrics>();
    const categorySourceSets = new Map<string, Set<string>>(); // Track unique sources per category

    // Track unique articles per source (by URL) to fix display rate calculation
    const sourceDisplayedUrls = new Map<string, Set<string>>();
    const sourceFetchedUrls = new Map<string, Set<string>>();

    for (const event of events) {
      if (!isValidSourceName(event.sourceProvider)) continue;

      // Initialize source metrics if not exists
      if (!sourceMap.has(event.sourceProvider)) {
        sourceMap.set(event.sourceProvider, {
          sourceProvider: event.sourceProvider,
          sourceName: cleanSourceName(event.sourceName, event.sourceProvider),
          totalFetched: 0,
          totalDisplayed: 0,
          displayRate: 0,
          avgAiScore: 0,
          lastSeen: event.timestamp,
          status: 'unknown',
          categories: new Set<string>(),
        });
      }

      const source = sourceMap.get(event.sourceProvider)!;

      // Initialize URL tracking sets if not exists
      if (!sourceDisplayedUrls.has(event.sourceProvider)) {
        sourceDisplayedUrls.set(event.sourceProvider, new Set<string>());
      }
      if (!sourceFetchedUrls.has(event.sourceProvider)) {
        sourceFetchedUrls.set(event.sourceProvider, new Set<string>());
      }

      // Update metrics based on event type - dedupe by URL
      if (event.eventType === 'FETCH') {
        // Only count unique URLs for fetched
        if (event.articleUrl && !sourceFetchedUrls.get(event.sourceProvider)!.has(event.articleUrl)) {
          sourceFetchedUrls.get(event.sourceProvider)!.add(event.articleUrl);
          source.totalFetched++;
        }
        source.lastSeen = event.timestamp; // Update last seen
        source.status = 'active';
      } else if (event.eventType === 'DISPLAY') {
        // Only count unique URLs for displayed (prevents multi-category inflation)
        if (event.articleUrl && !sourceDisplayedUrls.get(event.sourceProvider)!.has(event.articleUrl)) {
          sourceDisplayedUrls.get(event.sourceProvider)!.add(event.articleUrl);
          source.totalDisplayed++;
        }
      }

      // Track categories this source contributes to
      if (event.category) {
        source.categories.add(event.category);
      }

      // Aggregate category metrics
      if (event.category && event.eventType === 'DISPLAY') {
        if (!categoryMap.has(event.category)) {
          categoryMap.set(event.category, {
            category: event.category,
            totalArticles: 0,
            uniqueSources: 0,
            avgAiScore: 0,
          });
          categorySourceSets.set(event.category, new Set<string>());
        }

        const cat = categoryMap.get(event.category)!;
        cat.totalArticles++;

        // Track unique sources using the separate Set
        categorySourceSets.get(event.category)!.add(event.sourceProvider);
        cat.uniqueSources = categorySourceSets.get(event.category)!.size;
      }
    }

    // Calculate derived metrics
    const sources = Array.from(sourceMap.values()).map(source => {
      // Calculate display rate - cap at 100% to handle historical data anomalies
      // where DISPLAY events exist without corresponding FETCH events
      let displayRate = 0;
      if (source.totalFetched > 0) {
        displayRate = Math.min((source.totalDisplayed / source.totalFetched) * 100, 100);
      } else if (source.totalDisplayed > 0) {
        // Has displays but no fetches logged - mark as 100% (data issue)
        displayRate = 100;
      }

      // Calculate avg AI score from DISPLAY events
      const displayEvents = events.filter(
        e => e.sourceProvider === source.sourceProvider && e.eventType === 'DISPLAY' && e.aiScore > 0
      );
      const avgAiScore = displayEvents.length > 0
        ? displayEvents.reduce((sum, e) => sum + e.aiScore, 0) / displayEvents.length
        : 0;

      return {
        ...source,
        displayRate: Math.round(displayRate * 10) / 10, // Round to 1 decimal
        avgAiScore: Math.round(avgAiScore * 10) / 10,
        categories: Array.from(source.categories),
      };
    });

    // Sort by total displayed (most active sources first)
    sources.sort((a, b) => b.totalDisplayed - a.totalDisplayed);

    // Calculate category metrics
    const categories = Array.from(categoryMap.values()).map(cat => {
      const catEvents = events.filter(
        e => e.category === cat.category && e.eventType === 'DISPLAY' && e.aiScore > 0
      );
      const avgAiScore = catEvents.length > 0
        ? catEvents.reduce((sum, e) => sum + e.aiScore, 0) / catEvents.length
        : 0;

      return {
        ...cat,
        avgAiScore: Math.round(avgAiScore * 10) / 10,
      };
    });

    // Get live cache stats from Redis
    const cacheStats = await getCacheStats();
    const rawCache = await getRawCache();

    // Calculate total articles in cache (DB)
    let totalArticlesInCache = 0;
    const cacheByCategory: Record<string, { count: number; ageMinutes: number }> = {};

    for (const [category, data] of Object.entries(rawCache)) {
      const articleCount = (data.articles || []).length;
      totalArticlesInCache += articleCount;
      const ageMinutes = Math.round((Date.now() - data.timestamp) / 1000 / 60);
      cacheByCategory[category] = { count: articleCount, ageMinutes };
    }

    // Find most recent fetch cycle for "recent fetch" stats
    const cycleIds = [...new Set(events.map(e => e.cycleId))].sort().reverse();
    const mostRecentCycleId = cycleIds[0];

    const recentFetchEvents = events.filter(e => e.cycleId === mostRecentCycleId);
    const recentFetchStats = {
      cycleId: mostRecentCycleId,
      timestamp: recentFetchEvents[0]?.timestamp || null,
      articlesFetched: recentFetchEvents.filter(e => e.eventType === 'FETCH').length,
      articlesDisplayed: recentFetchEvents.filter(e => e.eventType === 'DISPLAY').length,
      articlesDeduplicated: recentFetchEvents.filter(e => e.eventType === 'DEDUPE').length,
      articlesPurged: recentFetchEvents.filter(e => e.eventType === 'PURGE').length,
    };

    return NextResponse.json({
      sources,
      categories,
      cacheStats: {
        totalArticlesInCache,
        byCategory: cacheByCategory,
      },
      recentFetch: recentFetchStats,
      summary: {
        totalSources: sources.length,
        activeSources: sources.filter(s => s.status === 'active').length,
        totalArticlesFetched: sources.reduce((sum, s) => sum + s.totalFetched, 0),
        totalArticlesDisplayed: sources.reduce((sum, s) => sum + s.totalDisplayed, 0),
      }
    });

  } catch (error: any) {
    console.error('[SourcePerformance API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch source performance data', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Calculate geographic distribution based on source names/providers
 */
function calculateGeographicDistribution(sources: any[]) {
  const regions: Record<string, { count: number; percentage: number; sources: string[] }> = {
    'United States': { count: 0, percentage: 0, sources: [] },
    'United Kingdom': { count: 0, percentage: 0, sources: [] },
    'Europe': { count: 0, percentage: 0, sources: [] },
    'Asia-Pacific': { count: 0, percentage: 0, sources: [] },
    'Middle East': { count: 0, percentage: 0, sources: [] },
    'API Aggregators': { count: 0, percentage: 0, sources: [] },
  };

  const total = sources.reduce((sum, s) => sum + s.totalDisplayed, 0);

  for (const source of sources) {
    const name = source.sourceName.toLowerCase();
    const provider = source.sourceProvider.toLowerCase();
    // Combine name and provider for matching
    const combined = `${name} ${provider}`;

    let region = 'API Aggregators'; // default

    // Determine region - check both name and provider
    if (provider === 'newsapi' || provider === 'gnews') {
      region = 'API Aggregators';
    } else if (combined.includes('bbc') || combined.includes('guardian') || combined.includes('reuters')) {
      region = 'United Kingdom';
    } else if (combined.includes('nyt') || combined.includes('new york times') || combined.includes('cnn') ||
               combined.includes('npr') || combined.includes('bloomberg') ||
               combined.includes('fortune') || combined.includes('wired') || combined.includes('verge') ||
               combined.includes('cdc') || combined.includes('nih') || combined.includes('mayo') ||
               combined.includes('techcrunch') || combined.includes('arstechnica') || combined.includes('engadget')) {
      region = 'United States';
    } else if (combined.includes('euronews') || combined.includes('france24') || combined.includes('france 24') ||
               combined.includes('deutschewelle') || combined.includes('deutsche welle') || combined.includes('dw.com')) {
      region = 'Europe';
    } else if (combined.includes('timesofindia') || combined.includes('times of india') ||
               combined.includes('hindustantimes') || combined.includes('ndtv') ||
               combined.includes('japantimes') || combined.includes('japan times') || combined.includes('nhk') ||
               combined.includes('scmp') || combined.includes('south china') ||
               combined.includes('abc.net.au') || combined.includes('smh.com.au') ||
               combined.includes('straitstimes') || combined.includes('channelnewsasia')) {
      region = 'Asia-Pacific';
    } else if (combined.includes('aljazeera') || combined.includes('al jazeera') ||
               combined.includes('middleeast') || combined.includes('arabnews')) {
      region = 'Middle East';
    } else if (provider.startsWith('rss-')) {
      // For RSS sources, try to classify by common patterns in provider name
      if (provider.includes('tech') || provider.includes('science') || provider.includes('business')) {
        // Generic RSS feeds default to US for tech/science/business
        region = 'United States';
      }
    }

    regions[region].count += source.totalDisplayed;
    regions[region].sources.push(source.sourceName);
  }

  // Calculate percentages
  for (const region in regions) {
    regions[region].percentage = total > 0
      ? Math.round((regions[region].count / total) * 1000) / 10
      : 0;
    regions[region].sources = Array.from(new Set(regions[region].sources)); // Unique sources
  }

  return regions;
}
