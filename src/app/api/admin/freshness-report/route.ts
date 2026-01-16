/**
 * Freshness Report API
 *
 * Compares our article coverage and freshness against Google News baseline.
 * Used by admin dashboard for freshness monitoring.
 */

import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { getCached } from '@/lib/redis';
import { Article } from '@/types';
import {
  compareAgainstBaseline,
  parseGoogleNewsBaseline,
  generateFreshnessReport,
  getFreshnessGrade,
  CoverageComparison,
} from '@/lib/baseline-comparison';
import { getFreshnessStats } from '@/lib/freshness';

const GOOGLE_NEWS_TOP_RSS = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';

interface FreshnessReportResponse {
  success: boolean;
  report: {
    comparison: CoverageComparison;
    grade: { grade: string; label: string; color: string };
    textReport: string;
    ourStats: ReturnType<typeof getFreshnessStats>;
    timestamp: string;
  };
  error?: string;
}

export async function GET(): Promise<NextResponse<FreshnessReportResponse>> {
  try {
    // 1. Fetch our cached articles
    const newsCache = await getCached<string>('news-cache');
    if (!newsCache) {
      return NextResponse.json({
        success: false,
        report: null as any,
        error: 'No cached articles found. Run a cache refresh first.',
      });
    }

    const cache = typeof newsCache === 'string' ? JSON.parse(newsCache) : newsCache;
    const allArticles: Article[] = [];

    // Collect all articles from all categories
    for (const categoryData of Object.values(cache)) {
      if ((categoryData as any).articles) {
        allArticles.push(...(categoryData as any).articles);
      }
    }

    if (allArticles.length === 0) {
      return NextResponse.json({
        success: false,
        report: null as any,
        error: 'No articles in cache.',
      });
    }

    // 2. Fetch Google News RSS as baseline
    const parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)',
      },
    });

    let baselineItems: any[] = [];
    try {
      const feed = await parser.parseURL(GOOGLE_NEWS_TOP_RSS);
      baselineItems = feed.items.slice(0, 50); // Top 50 stories
    } catch (error) {
      console.error('[FreshnessReport] Failed to fetch Google News:', error);
      return NextResponse.json({
        success: false,
        report: null as any,
        error: 'Failed to fetch Google News baseline.',
      });
    }

    // 3. Parse baseline articles
    const baselineArticles = parseGoogleNewsBaseline(baselineItems);

    // 4. Compare against baseline
    const comparison = compareAgainstBaseline(allArticles, baselineArticles);

    // 5. Generate grade and report
    const grade = getFreshnessGrade(comparison);
    const textReport = generateFreshnessReport(comparison);
    const ourStats = getFreshnessStats(allArticles);

    return NextResponse.json({
      success: true,
      report: {
        comparison,
        grade,
        textReport,
        ourStats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[FreshnessReport] Error:', error);
    return NextResponse.json({
      success: false,
      report: null as any,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
