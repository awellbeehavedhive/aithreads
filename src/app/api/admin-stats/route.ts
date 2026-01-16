import { NextResponse } from 'next/server';
import { getCacheStats, getRawCache } from '@/lib/news-cache';
import { getThreadCacheStats } from '@/lib/thread-cache';
import { isRedisAvailable } from '@/lib/redis';

/**
 * Fetch GitHub Actions workflow status
 */
async function getGitHubActionsStatus() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = 'awellbeehavedhive';
  const REPO_NAME = 'aithreads';
  const WORKFLOW_FILE = 'refresh-service.yml';

  if (!GITHUB_TOKEN) {
    console.warn('[AdminStats] GITHUB_TOKEN not configured, skipping GitHub Actions status');
    return null;
  }

  try {
    // Get workflow runs
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`,
      {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ThreadBot-Admin',
        },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const runs = data.workflow_runs || [];
    const lastRun = runs[0];
    const nextScheduledRun = lastRun ? new Date(new Date(lastRun.created_at).getTime() + 60 * 60 * 1000) : null; // Hourly schedule

    return {
      lastRun: lastRun ? {
        status: lastRun.status,
        conclusion: lastRun.conclusion,
        createdAt: lastRun.created_at,
        updatedAt: lastRun.updated_at,
        runNumber: lastRun.run_number,
        htmlUrl: lastRun.html_url,
      } : null,
      nextScheduledRun: nextScheduledRun ? nextScheduledRun.toISOString() : null,
      recentRuns: runs.slice(0, 5).map((run: any) => ({
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        runNumber: run.run_number,
      })),
    };
  } catch (error) {
    console.error('[AdminStats] Error fetching GitHub Actions status:', error);
    return null;
  }
}

/**
 * Admin Stats API
 * Provides comprehensive data flow accounting for the entire system
 */
export async function GET() {
  try {
    console.log('[AdminStats] Fetching comprehensive system stats...');
    
    // Fetch GitHub Actions status in parallel with other stats
    const githubActionsPromise = getGitHubActionsStatus();
    
    // 1. Redis Status
    const redisStatus = {
      available: isRedisAvailable(),
      mode: isRedisAvailable() ? 'Redis (Vercel KV)' : 'In-Memory Fallback',
      envVars: {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN,
      },
    };

    // 2. News Cache Stats
    const newsCacheStats = await getCacheStats();
    const rawCache = await getRawCache();
    
    // Calculate detailed news cache metrics
    const newsCacheDetails = await Promise.all(
      newsCacheStats.categories.map(async (cat) => {
        const categoryData = rawCache[cat.category];
        const articles = categoryData?.articles || [];
        
        // Count articles with AI scores
        const rankedCount = articles.filter((a: any) => a.aiScore !== undefined).length;
        const avgScore = rankedCount > 0
          ? articles
              .filter((a: any) => a.aiScore !== undefined)
              .reduce((sum: number, a: any) => sum + a.aiScore, 0) / rankedCount
          : 0;
        
        // Get score distribution
        const scores = articles
          .filter((a: any) => a.aiScore !== undefined)
          .map((a: any) => a.aiScore)
          .sort((a: number, b: number) => b - a);
        
        return {
          category: cat.category,
          totalArticles: cat.articles,
          rankedArticles: rankedCount,
          unrankedArticles: cat.articles - rankedCount,
          avgScore: Math.round(avgScore * 10) / 10,
          topScore: scores[0] || null,
          lowestScore: scores[scores.length - 1] || null,
          cacheAge: cat.age,
          isRanked: rankedCount > 0,
        };
      })
    );

    // 3. Thread Cache Stats
    const threadCacheStats = await getThreadCacheStats();
    
    // Count only threads for articles in the current cache (not stale threads)
    const currentArticleUrls = new Set<string>();
    Object.values(rawCache).forEach((categoryData: any) => {
      if (categoryData?.articles) {
        categoryData.articles.forEach((article: any) => {
          if (article.url) {
            currentArticleUrls.add(article.url);
          }
        });
      }
    });
    
    // Filter thread stats to only include current articles
    const relevantThreads = threadCacheStats.threads.filter((thread) => {
      const url = thread.url;
      // Check if this thread's URL matches any current article
      return Array.from(currentArticleUrls).some(currentUrl => 
        currentUrl.includes(url) || url.includes(currentUrl)
      );
    });

    // 4. Source Breakdown
    const sourceBreakdown = {
      newsapi: 0,
      gnews: 0,
      rss: 0,
    };
    
    Object.values(rawCache).forEach((categoryData: any) => {
      if (categoryData?.articles) {
        categoryData.articles.forEach((article: any) => {
          const provider = article.sourceProvider;
          if (provider === 'newsapi') {
            sourceBreakdown.newsapi++;
          } else if (provider === 'gnews') {
            sourceBreakdown.gnews++;
          } else if (provider && provider.startsWith('rss-')) {
            sourceBreakdown.rss++;
          }
        });
      }
    });

    // 5. Validation Metrics - Calculate validated articles (displayed on site)
    let validatedArticles = 0;
    let duplicatesRemoved = 0;
    let missingImages = 0;
    let failedValidation = 0;
    
    Object.values(rawCache).forEach((categoryData: any) => {
      if (categoryData?.articles) {
        categoryData.articles.forEach((article: any) => {
          // An article is "validated" if it has: image, AI score, and is not marked as duplicate
          const hasImage = !!article.urlToImage;
          const hasAiScore = article.aiScore !== undefined && article.aiScore > 0;
          
          if (hasImage && hasAiScore) {
            validatedArticles++;
          } else {
            if (!hasImage) missingImages++;
            if (!hasAiScore) failedValidation++;
          }
        });
      }
    });
    
    // Note: duplicatesRemoved is handled at fetch time, so we estimate based on source diversity
    // In a real scenario, we'd track this during the deduplication process
    const totalArticlesCached = newsCacheStats.categories.reduce((sum, cat) => sum + cat.articles, 0);
    
    // 6. System Health Metrics
    const totalRankedArticles = newsCacheDetails.reduce((sum, cat) => sum + cat.rankedArticles, 0);
    const totalThreadsCached = relevantThreads.length; // Only count threads for current articles
    const totalStaleThreads = threadCacheStats.totalCached - relevantThreads.length;
    
    // Calculate expected threads (top 4 per category: 1 featured + 3 side)
    const expectedThreads = newsCacheStats.totalCached * 4;
    const threadCoverage = expectedThreads > 0 
      ? Math.round((totalThreadsCached / expectedThreads) * 100) 
      : 0;
    
    // Calculate validation rate and quality score
    const validationRate = totalArticlesCached > 0 
      ? Math.round((validatedArticles / totalArticlesCached) * 100) 
      : 0;
    const imagesCoverage = totalArticlesCached > 0
      ? Math.round(((totalArticlesCached - missingImages) / totalArticlesCached) * 100)
      : 0;
    const duplicateRate = totalArticlesCached > 0
      ? Math.round((duplicatesRemoved / (totalArticlesCached + duplicatesRemoved)) * 100)
      : 0;

    // Get previous counts for delta calculation
    const { getRedisClient } = await import('@/lib/redis');
    const redis = getRedisClient();
    const prevTotalKey = 'admin:metrics:prevTotal';
    const prevValidatedKey = 'admin:metrics:prevValidated';
    
    let prevTotal = 0;
    let prevValidated = 0;
    
    if (redis) {
      try {
        const prevTotalStr = await redis.get(prevTotalKey);
        const prevValidatedStr = await redis.get(prevValidatedKey);
        prevTotal = prevTotalStr ? parseInt(prevTotalStr as string) : 0;
        prevValidated = prevValidatedStr ? parseInt(prevValidatedStr as string) : 0;
        
        // NOTE: Redis keys are only updated by the refresh script after actual fetches
      } catch (error) {
        console.error('[AdminStats] Error reading/writing metrics:', error);
      }
    }
    
    const articlesAddedTotal = totalArticlesCached - prevTotal;
    const articlesAddedValidated = validatedArticles - prevValidated;

    // 7. Data Flow Status (Enhanced with validation)
    const dataFlowStatus = {
      step1_newsFetch: {
        status: totalArticlesCached > 0 ? 'complete' : 'pending',
        categories: newsCacheStats.totalCached,
        articles: totalArticlesCached,
        articlesAddedTotal: articlesAddedTotal >= 0 ? articlesAddedTotal : 0,
        articlesAddedValidated: articlesAddedValidated >= 0 ? articlesAddedValidated : 0,
      },
      step2_aiRanking: {
        status: totalRankedArticles > 0 ? 'complete' : 'pending',
        rankedArticles: totalRankedArticles,
        unrankedArticles: totalArticlesCached - totalRankedArticles,
        coverage: totalArticlesCached > 0 
          ? Math.round((totalRankedArticles / totalArticlesCached) * 100) 
          : 0,
      },
      step3_validation: {
        status: validatedArticles > 0 ? 'complete' : 'pending',
        validatedArticles,
        filteredOut: totalArticlesCached - validatedArticles,
        validationRate,
        breakdown: {
          missingImages,
          failedValidation,
          duplicatesRemoved,
        },
      },
      step4_threadPregen: {
        status: totalThreadsCached > 0 ? 'complete' : 'pending',
        threadsGenerated: totalThreadsCached,
        threadsExpected: expectedThreads,
        coverage: threadCoverage,
      },
    };

    // 7. API Keys Status
    const apiKeysStatus = {
      newsApi: !!process.env.NEWS_API_KEY,
      geminiApi: !!process.env.GEMINI_API_KEY,
      gnewsApi: !!process.env.GNEWS_API_KEY,
      allConfigured: !!(process.env.NEWS_API_KEY && process.env.GEMINI_API_KEY),
    };

    // 8. Recommendations
    const recommendations: string[] = [];
    if (!redisStatus.available) {
      recommendations.push('⚠️ Redis not configured - using in-memory cache (data lost on restart)');
    }
    if (totalRankedArticles === 0 && totalArticlesCached > 0) {
      recommendations.push('⚠️ Articles not ranked - call /api/refresh-cache to trigger AI ranking');
    }
    if (threadCoverage < 50 && totalArticlesCached > 0) {
      recommendations.push('⚠️ Low thread coverage - call /api/refresh-cache to pre-generate threads');
    }
    if (!apiKeysStatus.allConfigured) {
      recommendations.push('❌ Missing API keys - check NEWS_API_KEY and GEMINI_API_KEY');
    }
    if (recommendations.length === 0) {
      recommendations.push('✅ All systems operational');
    }

    // Wait for GitHub Actions status
    const githubActions = await githubActionsPromise;

    // Calculate articles added in last fetch (compare with previous cache timestamp)
    const cacheTimestamps = newsCacheDetails.map(cat => cat.cacheAge);
    const oldestCacheAge = Math.max(...cacheTimestamps);
    const newestCacheAge = Math.min(...cacheTimestamps);
    const lastFetchTime = newestCacheAge < 60 ? new Date(Date.now() - newestCacheAge * 60 * 1000) : null;
    
    // Calculate cache freshness
    const cacheFreshness = newestCacheAge < 10 ? 'Fresh' : newestCacheAge < 30 ? 'Good' : newestCacheAge < 60 ? 'Aging' : 'Stale';
    const cacheQualityScore = Math.round(
      (validationRate * 0.4) + // 40% weight on validation rate
      (imagesCoverage * 0.3) + // 30% weight on image coverage
      ((100 - duplicateRate) * 0.2) + // 20% weight on low duplicate rate
      (threadCoverage * 0.1) // 10% weight on thread coverage
    );

    // Compile final response
    const response = {
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      apiKeys: apiKeysStatus,
      articleMetrics: {
        total: totalArticlesCached,
        validated: validatedArticles,
        validationRate,
        filteredOut: totalArticlesCached - validatedArticles,
        breakdown: {
          duplicatesRemoved,
          missingImages,
          failedValidation,
        },
      },
      cacheHealth: {
        freshness: cacheFreshness,
        ageMinutes: newestCacheAge,
        qualityScore: cacheQualityScore,
        duplicateRate,
        imageCoverage: imagesCoverage,
      },
      newsCache: {
        summary: {
          totalCategories: newsCacheStats.totalCached,
          totalArticles: totalArticlesCached,
          rankedArticles: totalRankedArticles,
          unrankedArticles: totalArticlesCached - totalRankedArticles,
        },
        byCategory: newsCacheDetails,
      },
      threadCache: {
        summary: {
          totalThreads: totalThreadsCached,
          expectedThreads,
          coverage: `${threadCoverage}%`,
          withAnalysis: threadCacheStats.withAnalysis,
          staleThreads: totalStaleThreads,
          note: totalStaleThreads > 0 ? `${totalStaleThreads} stale threads (old articles, will expire in 24h)` : undefined,
        },
        threads: relevantThreads.slice(0, 10), // Show first 10 relevant threads
      },
      dataFlow: dataFlowStatus,
      fetchTiming: {
        lastFetchTime: githubActions?.lastRun?.createdAt || lastFetchTime?.toISOString() || null,
        nextScheduledFetch: githubActions?.nextScheduledRun || null,
        cacheAge: newestCacheAge,
        articlesInLastFetch: {
          total: articlesAddedTotal >= 0 ? articlesAddedTotal : totalArticlesCached, // Articles added in last fetch
          validated: articlesAddedValidated >= 0 ? articlesAddedValidated : validatedArticles, // Validated articles added
        },
        githubActionsEnabled: !!githubActions,
      },
      githubActions: githubActions || {
        enabled: false,
        message: 'Set GITHUB_TOKEN to enable GitHub Actions monitoring',
      },
      recommendations,
      systemHealth: {
        overall: recommendations.length === 1 && recommendations[0].startsWith('✅') 
          ? 'healthy' 
          : 'needs-attention',
        score: Math.round(
          ((redisStatus.available ? 25 : 0) +
          (apiKeysStatus.allConfigured ? 25 : 0) +
          (totalRankedArticles > 0 ? 25 : 0) +
          (threadCoverage > 50 ? 25 : 0))
        ),
      },
      sourceBreakdown,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[AdminStats] Error fetching stats:', err.message);
    return NextResponse.json(
      { 
        error: 'Failed to fetch admin stats', 
        details: err.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

