'use client';

/**
 * Source Performance Dashboard
 *
 * Provides visibility into:
 * - Source health and contribution metrics
 * - Geographic distribution of content
 * - Category coverage analysis
 * - Display rate and quality metrics
 */

import { useEffect, useState } from 'react';

interface SourceMetrics {
  sourceProvider: string;
  sourceName: string;
  totalFetched: number;
  totalDisplayed: number;
  displayRate: number;
  avgAiScore: number;
  lastSeen: string;
  status: 'active' | 'failed' | 'unknown';
  categories: string[];
}

interface CategoryMetrics {
  category: string;
  totalArticles: number;
  uniqueSources: number;
  avgAiScore: number;
}

interface CacheStats {
  totalArticlesInCache: number;
  byCategory: Record<string, { count: number; ageMinutes: number }>;
}

interface RecentFetch {
  cycleId: string;
  timestamp: string | null;
  articlesFetched: number;
  articlesDisplayed: number;
  articlesDeduplicated: number;
  articlesPurged: number;
}

interface FreshnessReport {
  comparison: {
    baselineCount: number;
    ourCount: number;
    matchedStories: number;
    missingStories: Array<{ title: string; ageMinutes: number }>;
    uniqueStories: number;
    coveragePercent: number;
    freshnessComparison: {
      baselineAvgAgeMinutes: number;
      ourAvgAgeMinutes: number;
      freshnessGapMinutes: number;
      isFresher: boolean;
    };
  };
  grade: { grade: string; label: string; color: string };
  ourStats: {
    breaking: number;
    veryFresh: number;
    fresh: number;
    recent: number;
    today: number;
    older: number;
    averageAgeMinutes: number;
  };
  timestamp: string;
}

interface DashboardData {
  sources: SourceMetrics[];
  categories: CategoryMetrics[];
  cacheStats: CacheStats;
  recentFetch: RecentFetch;
  summary: {
    totalSources: number;
    activeSources: number;
    totalArticlesFetched: number;
    totalArticlesDisplayed: number;
  };
}

export default function SourcePerformanceDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [freshnessReport, setFreshnessReport] = useState<FreshnessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [freshnessLoading, setFreshnessLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/source-performance');

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const json = await response.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFreshnessReport = async () => {
    try {
      setFreshnessLoading(true);
      const response = await fetch('/api/admin/freshness-report');
      if (response.ok) {
        const json = await response.json();
        if (json.success && json.report) {
          setFreshnessReport(json.report);
        }
      }
    } catch (err) {
      console.error('Failed to fetch freshness report:', err);
    } finally {
      setFreshnessLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchFreshnessReport();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchData();
      fetchFreshnessReport();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-red-800 font-semibold text-lg mb-2">Error Loading Dashboard</h2>
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Source Performance Dashboard
              </h1>
              <p className="text-gray-600">
                Real-time analytics for news source health, contribution, and geographic diversity
              </p>
            </div>
            <div className="text-right">
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mb-2"
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <p className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <SummaryCard
            title="Articles in Cache"
            value={data.cacheStats?.totalArticlesInCache || 0}
            subtitle="Total stored in database"
            color="blue"
          />
          <SummaryCard
            title="Active Sources"
            value={data.summary.activeSources}
            subtitle={`${data.summary.totalSources} total sources`}
            color="green"
          />
          <SummaryCard
            title="All-Time Fetched"
            value={data.summary.totalArticlesFetched}
            subtitle="Unique articles logged"
            color="purple"
          />
          <SummaryCard
            title="All-Time Displayed"
            value={data.summary.totalArticlesDisplayed}
            subtitle="Articles shown to users"
            color="orange"
          />
        </div>

        {/* Freshness Report Section */}
        {freshnessReport && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Freshness vs Google News</h2>
              <div className="flex items-center gap-2">
                <span
                  className="px-4 py-2 text-2xl font-bold rounded-lg"
                  style={{
                    backgroundColor: freshnessReport.grade.color + '20',
                    color: freshnessReport.grade.color
                  }}
                >
                  {freshnessReport.grade.grade}
                </span>
                <span className="text-sm text-gray-500">{freshnessReport.grade.label}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Coverage</p>
                <p className="text-2xl font-bold text-gray-900">{freshnessReport.comparison.coveragePercent}%</p>
                <p className="text-xs text-gray-500">{freshnessReport.comparison.matchedStories} of {freshnessReport.comparison.baselineCount} stories</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Our Avg Age</p>
                <p className="text-2xl font-bold text-gray-900">{Math.round(freshnessReport.comparison.freshnessComparison.ourAvgAgeMinutes / 60)}h</p>
                <p className="text-xs text-gray-500">{freshnessReport.comparison.freshnessComparison.ourAvgAgeMinutes % 60}m</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Google Avg Age</p>
                <p className="text-2xl font-bold text-gray-900">{Math.round(freshnessReport.comparison.freshnessComparison.baselineAvgAgeMinutes / 60)}h</p>
                <p className="text-xs text-gray-500">{freshnessReport.comparison.freshnessComparison.baselineAvgAgeMinutes % 60}m</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Freshness Gap</p>
                <p className={`text-2xl font-bold ${freshnessReport.comparison.freshnessComparison.isFresher ? 'text-green-600' : 'text-orange-600'}`}>
                  {freshnessReport.comparison.freshnessComparison.isFresher ? '+' : '-'}{Math.abs(Math.round(freshnessReport.comparison.freshnessComparison.freshnessGapMinutes / 60))}h
                </p>
                <p className="text-xs text-gray-500">{freshnessReport.comparison.freshnessComparison.isFresher ? 'Fresher' : 'Behind'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Unique to Us</p>
                <p className="text-2xl font-bold text-blue-600">{freshnessReport.comparison.uniqueStories}</p>
                <p className="text-xs text-gray-500">exclusive stories</p>
              </div>
            </div>

            {/* Freshness Distribution */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Freshness Distribution</h3>
              <div className="flex gap-2">
                <div className="flex-1 bg-red-100 rounded p-2 text-center">
                  <p className="text-lg font-bold text-red-700">{freshnessReport.ourStats.breaking}</p>
                  <p className="text-xs text-red-600">Breaking</p>
                </div>
                <div className="flex-1 bg-orange-100 rounded p-2 text-center">
                  <p className="text-lg font-bold text-orange-700">{freshnessReport.ourStats.veryFresh}</p>
                  <p className="text-xs text-orange-600">Very Fresh</p>
                </div>
                <div className="flex-1 bg-yellow-100 rounded p-2 text-center">
                  <p className="text-lg font-bold text-yellow-700">{freshnessReport.ourStats.fresh}</p>
                  <p className="text-xs text-yellow-600">Fresh</p>
                </div>
                <div className="flex-1 bg-green-100 rounded p-2 text-center">
                  <p className="text-lg font-bold text-green-700">{freshnessReport.ourStats.recent}</p>
                  <p className="text-xs text-green-600">Recent</p>
                </div>
                <div className="flex-1 bg-blue-100 rounded p-2 text-center">
                  <p className="text-lg font-bold text-blue-700">{freshnessReport.ourStats.today}</p>
                  <p className="text-xs text-blue-600">Today</p>
                </div>
                <div className="flex-1 bg-gray-100 rounded p-2 text-center">
                  <p className="text-lg font-bold text-gray-700">{freshnessReport.ourStats.older}</p>
                  <p className="text-xs text-gray-600">Older</p>
                </div>
              </div>
            </div>

            {/* Missing Stories */}
            {freshnessReport.comparison.missingStories.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Missing from Google News Top Stories</h3>
                <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {freshnessReport.comparison.missingStories.slice(0, 5).map((story, i) => (
                    <div key={i} className="text-sm text-red-800 mb-1">
                      <span className="text-red-500 mr-2">{Math.round(story.ageMinutes / 60)}h</span>
                      {story.title.substring(0, 80)}...
                    </div>
                  ))}
                  {freshnessReport.comparison.missingStories.length > 5 && (
                    <p className="text-xs text-red-500 mt-2">+{freshnessReport.comparison.missingStories.length - 5} more stories</p>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-4">
              Last comparison: {new Date(freshnessReport.timestamp).toLocaleString()}
            </p>
          </div>
        )}

        {freshnessLoading && !freshnessReport && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="grid grid-cols-5 gap-4 mb-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-20 bg-gray-100 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Fetch Stats */}
        {data.recentFetch && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Fetch Cycle</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">New Articles Found</p>
                <p className="text-2xl font-bold text-gray-900">{data.recentFetch.articlesFetched}</p>
                <p className="text-xs text-gray-500">After source aggregation</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Displayed</p>
                <p className="text-2xl font-bold text-green-600">{data.recentFetch.articlesDisplayed}</p>
                <p className="text-xs text-gray-500">Now showing to users</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Deduplicated</p>
                <p className="text-2xl font-bold text-yellow-600">{data.recentFetch.articlesDeduplicated}</p>
                <p className="text-xs text-gray-500">Removed as duplicates</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Purged</p>
                <p className="text-2xl font-bold text-red-600">{data.recentFetch.articlesPurged}</p>
                <p className="text-xs text-gray-500">Expired or over limit</p>
              </div>
            </div>
            {data.recentFetch.timestamp && (
              <p className="text-xs text-gray-500 mt-4">
                Last fetch: {new Date(data.recentFetch.timestamp).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Cache by Category */}
        {data.cacheStats?.byCategory && Object.keys(data.cacheStats.byCategory).length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Cache Status by Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(data.cacheStats.byCategory).map(([category, stats]) => (
                <div key={category} className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 capitalize">{category}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.count}</p>
                  <p className="text-xs text-gray-500">
                    {stats.ageMinutes < 60
                      ? `${stats.ageMinutes}m ago`
                      : `${Math.round(stats.ageMinutes / 60)}h ago`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Coverage Matrix */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Category Coverage</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Articles
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sources
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg AI Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Coverage
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.categories.map((cat) => {
                  const coverage = getCoverageStatus(cat.totalArticles, cat.uniqueSources);
                  return (
                    <tr key={cat.category}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {cat.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {cat.totalArticles}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {cat.uniqueSources}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {cat.avgAiScore.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${coverage.color}`}>
                          {coverage.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Source Performance Table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Source Performance</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fetched
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Displayed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Display Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg AI Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categories
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.sources.map((source) => (
                  <tr key={source.sourceProvider} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{source.sourceName}</div>
                      <div className="text-xs text-gray-500">{source.sourceProvider}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          source.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {source.status === 'active' ? '✓ Active' : '? Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {source.totalFetched}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {source.totalDisplayed}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span
                          className={`text-sm font-medium ${
                            source.displayRate > 50
                              ? 'text-green-600'
                              : source.displayRate > 20
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}
                        >
                          {source.displayRate.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {source.avgAiScore > 0 ? source.avgAiScore.toFixed(1) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {source.categories.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    orange: 'bg-orange-50 border-orange-200 text-orange-900',
  };

  return (
    <div className={`border rounded-lg p-6 ${colors[color]}`}>
      <h3 className="text-sm font-medium opacity-80 mb-1">{title}</h3>
      <p className="text-3xl font-bold mb-1">{value}</p>
      <p className="text-xs opacity-70">{subtitle}</p>
    </div>
  );
}

function getCoverageStatus(articles: number, sources: number) {
  if (articles >= 100 && sources >= 5) {
    return { label: 'Excellent', color: 'bg-green-100 text-green-800' };
  } else if (articles >= 50 && sources >= 3) {
    return { label: 'Good', color: 'bg-blue-100 text-blue-800' };
  } else if (articles >= 20) {
    return { label: 'Fair', color: 'bg-yellow-100 text-yellow-800' };
  } else {
    return { label: 'Needs Attention', color: 'bg-red-100 text-red-800' };
  }
}
