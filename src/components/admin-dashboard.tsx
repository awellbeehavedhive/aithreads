'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RefreshCcw, Database, Sparkles, Zap, CheckCircle, AlertCircle, XCircle, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import axios from 'axios';
import { cn } from '@/lib/utils';

interface AdminStats {
  timestamp: string;
  redis: {
    available: boolean;
    mode: string;
  };
  apiKeys: {
    newsApi: boolean;
    geminiApi: boolean;
    allConfigured: boolean;
  };
  articleMetrics?: {
    total: number;
    validated: number;
    validationRate: number;
    filteredOut: number;
    breakdown: {
      duplicatesRemoved: number;
      missingImages: number;
      failedValidation: number;
    };
  };
  cacheHealth?: {
    freshness: string;
    ageMinutes: number;
    qualityScore: number;
    duplicateRate: number;
    imageCoverage: number;
  };
  newsCache: {
    summary: {
      totalCategories: number;
      totalArticles: number;
      rankedArticles: number;
      unrankedArticles: number;
    };
    byCategory: Array<{
      category: string;
      totalArticles: number;
      rankedArticles: number;
      avgScore: number;
      topScore: number | null;
      cacheAge: number;
      isRanked: boolean;
    }>;
  };
  threadCache: {
    summary: {
      totalThreads: number;
      expectedThreads: number;
      coverage: string;
      staleThreads?: number;
      note?: string;
    };
  };
  dataFlow: {
    step1_newsFetch: { status: string; categories: number; articles: number };
    step2_aiRanking: { status: string; rankedArticles: number; coverage: number };
    step3_validation?: { 
      status: string; 
      validatedArticles: number; 
      filteredOut: number;
      validationRate: number;
      breakdown: {
        missingImages: number;
        failedValidation: number;
        duplicatesRemoved: number;
      };
    };
    step4_threadPregen: { status: string; threadsGenerated: number; coverage: number };
  };
  fetchTiming?: {
    lastFetchTime: string | null;
    nextScheduledFetch: string | null;
    cacheAge: number;
    articlesInLastFetch: {
      total: number;
      validated: number;
      delta: number | null;
    };
    githubActionsEnabled: boolean;
  };
  githubActions?: {
    enabled?: boolean;
    message?: string;
    lastRun?: {
      status: string;
      conclusion: string;
      createdAt: string;
      updatedAt: string;
      runNumber: number;
      htmlUrl: string;
    };
    nextScheduledRun?: string | null;
    recentRuns?: Array<{
      status: string;
      conclusion: string;
      createdAt: string;
      runNumber: number;
    }>;
  };
  recommendations: string[];
  systemHealth: {
    overall: string;
    score: number;
  };
  sourceBreakdown?: {
    newsapi: number;
    gnews: number;
    rss: number;
  };
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false); // Start collapsed
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/admin-stats');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
      setError('Failed to load admin stats');
    } finally {
      setLoading(false);
    }
  };

  const triggerRefresh = async () => {
    setRefreshing(true);
    try {
      await axios.get('/api/refresh-cache');
      // Wait a bit for the refresh to complete
      setTimeout(() => {
        fetchStats();
        setRefreshing(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to refresh cache:', err);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (!expanded) {
    return (
      <div className="fixed bottom-2 right-2 sm:bottom-4 sm:right-4 z-50">
        <Button
          onClick={() => setExpanded(true)}
          variant="outline"
          size="sm"
          className="shadow-lg bg-background text-foreground border-border hover:bg-accent hover:text-primary text-xs sm:text-sm"
        >
          <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
          <span className="hidden xs:inline">Admin Stats</span>
          <span className="xs:hidden">Stats</span>
          <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1.5 sm:ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-2 right-2 left-2 sm:bottom-4 sm:right-4 sm:left-auto z-50 sm:w-[500px] max-h-[85vh] sm:max-h-[80vh] overflow-hidden flex flex-col bg-background border border-border rounded-lg shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm">System Admin</h3>
          {stats && (
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              stats.systemHealth.overall === 'healthy' 
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
            )}>
              {stats.systemHealth.score}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={triggerRefresh}
            disabled={refreshing}
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-foreground hover:text-primary hover:bg-accent"
            title="Trigger full refresh (fetch + rank + pre-gen)"
          >
            <RefreshCcw className={cn("h-3 w-3 mr-1", refreshing && "animate-spin")} />
            <span className="text-[10px]">Refresh All</span>
          </Button>
          <Button
            onClick={() => setExpanded(false)}
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-foreground hover:text-primary hover:bg-accent"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto p-2.5 sm:p-3 space-y-2.5 sm:space-y-3 custom-scrollbar">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
            {error}
          </div>
        )}

        {loading && !stats ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Loading stats...
          </div>
        ) : stats ? (
          <>
            {/* Quick Stats Summary */}
            {stats.articleMetrics && (
              <Card className="p-3 bg-gradient-to-br from-teal-600/10 to-teal-600/5 border-teal-600/20">
                <h4 className="text-xs font-bold mb-2.5 flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Quick Stats
                </h4>
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Articles Live on Site</span>
                    <span className="text-xl font-bold text-teal-600 dark:text-teal-400">
                      {stats.articleMetrics.validated}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">from {stats.articleMetrics.total} fetched</span>
                    <span className={cn(
                      "font-medium",
                      stats.articleMetrics.validationRate >= 85 ? "text-green-600 dark:text-green-400" :
                      stats.articleMetrics.validationRate >= 70 ? "text-yellow-600 dark:text-yellow-400" :
                      "text-red-600 dark:text-red-400"
                    )}>
                      {stats.articleMetrics.validationRate}% validated
                    </span>
                  </div>
                  {stats.fetchTiming && (
                    <>
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                        <span className="text-muted-foreground">Last Updated</span>
                        <span className="font-medium">
                          {stats.fetchTiming.cacheAge < 1 ? 'Just now' : `${stats.fetchTiming.cacheAge} min ago`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Next Refresh</span>
                        <span className="font-medium text-primary">
                          {stats.fetchTiming.nextScheduledFetch 
                            ? `in ${Math.max(0, Math.round((new Date(stats.fetchTiming.nextScheduledFetch).getTime() - Date.now()) / 60000))} min`
                            : 'Not scheduled'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Recommendations */}
            {stats.recommendations.length > 0 && (
              <Card className="p-2.5">
                <div className="space-y-1.5">
                  {stats.recommendations.map((rec, i) => (
                    <div key={i} className="text-[11px] leading-relaxed">
                      {rec}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Fetch Timing & GitHub Actions */}
            {stats.fetchTiming && (
              <Card className="p-2.5">
                <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Fetch Schedule
                </h4>
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last Fetch</span>
                    <span className="font-medium">
                      {stats.fetchTiming.lastFetchTime 
                        ? new Date(stats.fetchTiming.lastFetchTime).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Next Fetch</span>
                    <span className="font-medium text-primary">
                      {stats.fetchTiming.nextScheduledFetch 
                        ? new Date(stats.fetchTiming.nextScheduledFetch).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Not scheduled'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-muted-foreground">Articles Added</span>
                      <span className="font-bold text-lg">
                        {typeof stats.fetchTiming.articlesInLastFetch === 'object' 
                          ? stats.fetchTiming.articlesInLastFetch.total 
                          : stats.fetchTiming.articlesInLastFetch}
                      </span>
                    </div>
                    {typeof stats.fetchTiming.articlesInLastFetch === 'object' && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Validated for display</span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {stats.fetchTiming.articlesInLastFetch.validated} articles
                        </span>
                      </div>
                    )}
                  </div>
                  {stats.githubActions?.lastRun && (
                    <div className="pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground">GitHub Actions</span>
                        <a 
                          href={stats.githubActions.lastRun.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-500 hover:text-teal-400 text-[10px]"
                        >
                          Run #{stats.githubActions.lastRun.runNumber} →
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-medium",
                          stats.githubActions.lastRun.conclusion === 'success'
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : stats.githubActions.lastRun.conclusion === 'failure'
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                        )}>
                          {stats.githubActions.lastRun.conclusion || stats.githubActions.lastRun.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(stats.githubActions.lastRun.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  )}
                  {!stats.fetchTiming.githubActionsEnabled && (
                    <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                      💡 Set GITHUB_TOKEN for live workflow monitoring
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Article Metrics */}
            {stats.articleMetrics && (
              <Card className="p-2.5">
                <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <Database className="h-3 w-3" />
                  Article Metrics
                </h4>
                <div className="space-y-2 text-[11px]">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-muted-foreground text-[10px]">Total in Cache</div>
                      <div className="text-xl font-bold">{stats.articleMetrics.total}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Validated</div>
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">
                        {stats.articleMetrics.validated}
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-muted-foreground">Validation Rate</span>
                      <span className={cn(
                        "font-bold",
                        stats.articleMetrics.validationRate >= 85 ? "text-green-600 dark:text-green-400" :
                        stats.articleMetrics.validationRate >= 70 ? "text-yellow-600 dark:text-yellow-400" :
                        "text-red-600 dark:text-red-400"
                      )}>
                        {stats.articleMetrics.validationRate}%
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <div className="flex justify-between">
                        <span>• Filtered out:</span>
                        <span>{stats.articleMetrics.filteredOut} articles</span>
                      </div>
                      {stats.articleMetrics.breakdown.missingImages > 0 && (
                        <div className="flex justify-between pl-3">
                          <span>- Missing images:</span>
                          <span>{stats.articleMetrics.breakdown.missingImages}</span>
                        </div>
                      )}
                      {stats.articleMetrics.breakdown.failedValidation > 0 && (
                        <div className="flex justify-between pl-3">
                          <span>- Failed validation:</span>
                          <span>{stats.articleMetrics.breakdown.failedValidation}</span>
                        </div>
                      )}
                      {stats.articleMetrics.breakdown.duplicatesRemoved > 0 && (
                        <div className="flex justify-between pl-3">
                          <span>- Duplicates removed:</span>
                          <span>{stats.articleMetrics.breakdown.duplicatesRemoved}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Cache Health */}
            {stats.cacheHealth && (
              <Card className="p-2.5">
                <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <Zap className="h-3 w-3" />
                  Cache Health
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-muted-foreground text-[10px]">Freshness</div>
                    <div className={cn(
                      "font-bold",
                      stats.cacheHealth.freshness === 'Fresh' ? "text-green-600 dark:text-green-400" :
                      stats.cacheHealth.freshness === 'Good' ? "text-blue-600 dark:text-blue-400" :
                      stats.cacheHealth.freshness === 'Aging' ? "text-yellow-600 dark:text-yellow-400" :
                      "text-red-600 dark:text-red-400"
                    )}>
                      {stats.cacheHealth.freshness}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">Quality Score</div>
                    <div className={cn(
                      "font-bold",
                      stats.cacheHealth.qualityScore >= 85 ? "text-green-600 dark:text-green-400" :
                      stats.cacheHealth.qualityScore >= 70 ? "text-yellow-600 dark:text-yellow-400" :
                      "text-red-600 dark:text-red-400"
                    )}>
                      {stats.cacheHealth.qualityScore}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">Image Coverage</div>
                    <div className="font-medium">{stats.cacheHealth.imageCoverage}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">Duplicate Rate</div>
                    <div className="font-medium">{stats.cacheHealth.duplicateRate}%</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Data Flow Pipeline */}
            <Card className="p-2.5">
              <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                Data Flow Pipeline
              </h4>
              <div className="space-y-2">
                <FlowStep
                  number={1}
                  title="News Fetch"
                  status={stats.dataFlow.step1_newsFetch.status}
                  details={`${stats.dataFlow.step1_newsFetch.articles} articles across ${stats.dataFlow.step1_newsFetch.categories} categories`}
                />
                <FlowStep
                  number={2}
                  title="AI Ranking"
                  status={stats.dataFlow.step2_aiRanking.status}
                  details={`${stats.dataFlow.step2_aiRanking.rankedArticles} ranked (${stats.dataFlow.step2_aiRanking.coverage}% coverage)`}
                />
                {stats.dataFlow.step3_validation && (
                  <FlowStep
                    number={3}
                    title="Validation"
                    status={stats.dataFlow.step3_validation.status}
                    details={`${stats.dataFlow.step3_validation.validatedArticles} validated (${stats.dataFlow.step3_validation.validationRate}% pass rate)`}
                  />
                )}
                <FlowStep
                  number={4}
                  title="Thread Pre-gen"
                  status={stats.dataFlow.step4_threadPregen.status}
                  details={`${stats.dataFlow.step4_threadPregen.threadsGenerated} threads (${stats.dataFlow.step4_threadPregen.coverage}% coverage)`}
                />
              </div>
            </Card>

            {/* System Status */}
            <Card className="p-2.5">
              <h4 className="text-xs font-bold mb-2">System Status</h4>
              <div className="space-y-1.5 text-[11px]">
                <StatusRow
                  label="Redis"
                  value={stats.redis.mode}
                  status={stats.redis.available ? 'success' : 'warning'}
                />
                <StatusRow
                  label="NewsAPI Key"
                  value={stats.apiKeys.newsApi ? 'Configured' : 'Missing'}
                  status={stats.apiKeys.newsApi ? 'success' : 'error'}
                />
                <StatusRow
                  label="Gemini API Key"
                  value={stats.apiKeys.geminiApi ? 'Configured' : 'Missing'}
                  status={stats.apiKeys.geminiApi ? 'success' : 'error'}
                />
              </div>
            </Card>

            {/* News Cache Summary */}
            <Card className="p-2.5">
              <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                <Database className="h-3 w-3" />
                News Cache
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                <div>
                  <div className="text-muted-foreground">Total Articles</div>
                  <div className="font-bold text-lg">{stats.newsCache.summary.totalArticles}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Ranked</div>
                  <div className="font-bold text-lg text-primary">{stats.newsCache.summary.rankedArticles}</div>
                </div>
              </div>
              
              {/* Category Breakdown Table */}
              <div className="border border-border rounded overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-1 sm:p-1.5 font-semibold whitespace-nowrap">Category</th>
                      <th className="text-center p-1 sm:p-1.5 font-semibold whitespace-nowrap">Articles</th>
                      <th className="text-center p-1 sm:p-1.5 font-semibold whitespace-nowrap">Ranked</th>
                      <th className="text-center p-1 sm:p-1.5 font-semibold whitespace-nowrap">Top Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.newsCache.byCategory.map((cat, i) => (
                      <tr key={cat.category} className={cn(
                        "border-t border-border/50",
                        i % 2 === 0 && "bg-muted/20"
                      )}>
                        <td className="p-1 sm:p-1.5 font-medium whitespace-nowrap">{cat.category}</td>
                        <td className="p-1 sm:p-1.5 text-center">{cat.totalArticles}</td>
                        <td className="p-1 sm:p-1.5 text-center">
                          {cat.isRanked ? (
                            <span className="text-green-600 dark:text-green-400">✓ {cat.rankedArticles}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-1 sm:p-1.5 text-center">
                          {cat.topScore ? (
                            <span className="font-bold text-primary">{cat.topScore}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Source Breakdown */}
            {stats.sourceBreakdown && (
              <Card className="p-2.5">
                <h4 className="text-xs font-bold mb-2">Article Sources</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-[10px] text-muted-foreground">NewsAPI</div>
                    <div className="text-xl font-bold">{stats.sourceBreakdown.newsapi || 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-muted-foreground">GNews</div>
                    <div className="text-xl font-bold">{stats.sourceBreakdown.gnews || 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-muted-foreground">RSS</div>
                    <div className="text-xl font-bold">{stats.sourceBreakdown.rss || 0}</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Thread Cache Summary */}
            <Card className="p-2.5">
              <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Thread Cache
              </h4>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-muted-foreground">Generated</div>
                  <div className="font-bold text-lg">{stats.threadCache.summary.totalThreads}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Expected</div>
                  <div className="font-bold text-lg">{stats.threadCache.summary.expectedThreads}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Coverage</div>
                  <div className="font-bold text-lg text-primary">{stats.threadCache.summary.coverage}</div>
                </div>
              </div>
              {stats.threadCache.summary.staleThreads && stats.threadCache.summary.staleThreads > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                  ℹ️ {stats.threadCache.summary.note}
                </div>
              )}
            </Card>

            {/* Timestamp */}
            <div className="text-[10px] text-muted-foreground text-center">
              Last updated: {new Date(stats.timestamp).toLocaleTimeString()}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function FlowStep({ number, title, status, details }: {
  number: number;
  title: string;
  status: string;
  details: string;
}) {
  const StatusIcon = status === 'complete' ? CheckCircle : status === 'pending' ? AlertCircle : XCircle;
  const statusColor = status === 'complete' 
    ? 'text-green-600 dark:text-green-400' 
    : status === 'pending' 
    ? 'text-yellow-600 dark:text-yellow-400' 
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
          {number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground truncate">{details}</div>
        </div>
      </div>
      <StatusIcon className={cn("h-4 w-4 shrink-0", statusColor)} />
    </div>
  );
}

function StatusRow({ label, value, status }: {
  label: string;
  value: string;
  status: 'success' | 'warning' | 'error';
}) {
  const statusColors = {
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", statusColors[status])}>{value}</span>
    </div>
  );
}

