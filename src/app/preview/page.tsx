'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { Article } from '@/types';
import { Bot, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronRight, FlaskConical, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sotaSort } from '@/lib/sota-sorting';
import {
  weightedSort,
  compareRankings,
  DEFAULT_WEIGHTS,
  ScoringWeights,
  ScoredArticle,
  ScoreBreakdown,
} from '@/lib/weighted-scoring';

type ArticleWithScores = Article & {
  weightedScore?: number;
  scoreBreakdown?: ScoreBreakdown;
};

export default function PreviewPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [showWeightEditor, setShowWeightEditor] = useState(false);

  // Fetch articles
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const responses = await Promise.all(
          ['technology', 'science', 'business', 'health'].map(cat =>
            axios.get('/api/news', { params: { category: cat, pageSize: 50 } })
              .catch(() => ({ data: { articles: [] } }))
          )
        );

        const allArticles: Article[] = [];
        const categories = ['technology', 'science', 'business', 'health'];
        responses.forEach((response, index) => {
          const categoryArticles = response.data.articles || [];
          categoryArticles.forEach((article: Article) => {
            allArticles.push({ ...article, category: categories[index] });
          });
        });

        // Filter valid articles
        const validArticles = allArticles.filter(a => {
          if (!a.url || !a.urlToImage) return false;
          if (!a.urlToImage.startsWith('http')) return false;
          if (a.aiScore !== undefined && a.aiScore <= 0) return false;
          return true;
        });

        setArticles(validArticles);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Calculate both rankings
  const oldRanking = sotaSort(articles, {
    categoryOrder: ['technology', 'science', 'business', 'health'],
    enableTimeDecay: true,
    enableDeduplication: true,
  }).articles;

  const newRankingResult = weightedSort(articles as ScoredArticle[], {
    weights,
    enableDiversityAttenuation: true,
    enableDeduplication: true,
  });
  const newRanking = newRankingResult.articles as ArticleWithScores[];

  // Compare rankings
  const comparison = articles.length > 0
    ? compareRankings(oldRanking as ScoredArticle[], newRanking)
    : null;

  // Weight adjustment handler
  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-sm z-50">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="bg-teal-600 text-white p-1.5 rounded-lg">
                <Bot className="w-5 h-5" />
              </div>
              <span className="text-xl font-serif tracking-tight text-white">ThreadBot</span>
            </Link>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-600/20 text-amber-400 text-xs font-semibold">
                <FlaskConical className="h-3.5 w-3.5" />
                Preview Mode
              </span>
              <Link
                href="/"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Weight Editor */}
        <div className="mb-6 bg-[#1A1A1A] rounded-xl border border-white/10 overflow-hidden">
          <button
            onClick={() => setShowWeightEditor(!showWeightEditor)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showWeightEditor ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span className="font-medium">Scoring Weights Configuration</span>
            </div>
            <span className="text-xs text-gray-500">
              Click to {showWeightEditor ? 'collapse' : 'expand'}
            </span>
          </button>

          {showWeightEditor && (
            <div className="p-4 pt-0 border-t border-white/5">
              <p className="text-sm text-gray-400 mb-4">
                Adjust weights to see how they affect ranking. All weights should sum to ~1.0.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Object.entries(weights).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-gray-400 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={value * 100}
                      onChange={(e) => updateWeight(key as keyof ScoringWeights, parseInt(e.target.value) / 100)}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="text-xs text-center text-teal-400 font-mono">
                      {(value * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setWeights(DEFAULT_WEIGHTS)}
                className="mt-4 px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          )}
        </div>

        {/* Stats Summary */}
        {comparison && !loading && (
          <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Articles Analyzed"
              value={newRankingResult.stats.totalInput}
              subtext={`${newRankingResult.stats.afterDeduplication} after dedup`}
            />
            <StatCard
              label="Avg Position Change"
              value={comparison.averagePositionChange.toFixed(1)}
              subtext="positions shifted"
            />
            <StatCard
              label="New in Top 10"
              value={comparison.newInTop10.length}
              subtext="articles promoted"
              highlight={comparison.newInTop10.length > 0}
            />
            <StatCard
              label="Clickbait Flagged"
              value={newRankingResult.stats.negativeFlagged}
              subtext="articles penalized"
              warning={newRankingResult.stats.negativeFlagged > 5}
            />
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Loading articles for comparison...</p>
          </div>
        )}

        {/* Side-by-Side Comparison */}
        {!loading && articles.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Old Ranking */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold">Current Ranking</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-600/50 text-gray-300">
                  SOTA Sort
                </span>
              </div>
              <div className="space-y-2">
                {oldRanking.slice(0, 20).map((article, index) => (
                  <RankingCard
                    key={article.url}
                    article={article}
                    rank={index + 1}
                    isOld
                    newRank={newRanking.findIndex(a => a.url === article.url) + 1}
                  />
                ))}
              </div>
            </div>

            {/* New Ranking */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold">New Ranking</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-600/50 text-teal-300">
                  X-Inspired Weighted
                </span>
              </div>
              <div className="space-y-2">
                {newRanking.slice(0, 20).map((article, index) => (
                  <RankingCard
                    key={article.url}
                    article={article}
                    rank={index + 1}
                    oldRank={oldRanking.findIndex(a => a.url === article.url) + 1}
                    showBreakdown
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Biggest Movers */}
        {comparison && comparison.positionChanges.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">Biggest Position Changes</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Biggest Gainers */}
              <div className="bg-[#1A1A1A] rounded-xl p-4 border border-green-500/20">
                <h3 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-2">
                  <ArrowUp className="w-4 h-4" />
                  Biggest Gainers
                </h3>
                <div className="space-y-2">
                  {comparison.positionChanges
                    .filter(p => p.change > 0)
                    .slice(0, 5)
                    .map(p => (
                      <div key={p.url} className="flex items-center gap-3 text-sm">
                        <span className="text-green-400 font-mono w-12">+{p.change}</span>
                        <span className="text-gray-400 truncate flex-1">{p.title}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Biggest Losers */}
              <div className="bg-[#1A1A1A] rounded-xl p-4 border border-red-500/20">
                <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                  <ArrowDown className="w-4 h-4" />
                  Biggest Drops
                </h3>
                <div className="space-y-2">
                  {comparison.positionChanges
                    .filter(p => p.change < 0)
                    .slice(0, 5)
                    .map(p => (
                      <div key={p.url} className="flex items-center gap-3 text-sm">
                        <span className="text-red-400 font-mono w-12">{p.change}</span>
                        <span className="text-gray-400 truncate flex-1">{p.title}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Source Distribution */}
        {newRankingResult.stats.sourceDistribution && Object.keys(newRankingResult.stats.sourceDistribution).length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">Source Distribution (Top 20)</h2>
            <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/10">
              <div className="flex flex-wrap gap-2">
                {Object.entries(newRankingResult.stats.sourceDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 15)
                  .map(([source, count]) => (
                    <span
                      key={source}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-xs"
                    >
                      <span className="text-gray-400">{source}</span>
                      <span className="text-teal-400 font-mono">{count}</span>
                    </span>
                  ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  subtext,
  highlight,
  warning,
}: {
  label: string;
  value: number | string;
  subtext: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`bg-[#1A1A1A] rounded-xl p-4 border ${
      highlight ? 'border-teal-500/30' :
      warning ? 'border-amber-500/30' :
      'border-white/10'
    }`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${
        highlight ? 'text-teal-400' :
        warning ? 'text-amber-400' :
        'text-white'
      }`}>
        {value}
      </div>
      <div className="text-xs text-gray-500">{subtext}</div>
    </div>
  );
}

// Ranking Card Component
function RankingCard({
  article,
  rank,
  isOld,
  oldRank,
  newRank,
  showBreakdown,
}: {
  article: ArticleWithScores;
  rank: number;
  isOld?: boolean;
  oldRank?: number;
  newRank?: number;
  showBreakdown?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const comparisonRank = isOld ? newRank : oldRank;
  const change = comparisonRank ? comparisonRank - rank : 0;

  const cleanTitle = article.title.replace(/ - [^-]+$/, '');

  return (
    <div
      className={`bg-[#1A1A1A] rounded-lg p-3 border transition-all cursor-pointer hover:bg-[#222] ${
        showBreakdown && article.scoreBreakdown?.negativeSignalPenalty && article.scoreBreakdown.negativeSignalPenalty > 20
          ? 'border-amber-500/30'
          : 'border-white/5'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        {/* Rank Badge */}
        <div className="flex flex-col items-center gap-1">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            rank <= 3 ? 'bg-teal-600 text-white' :
            rank <= 10 ? 'bg-white/10 text-white' :
            'bg-white/5 text-gray-400'
          }`}>
            {rank}
          </span>
          {/* Position Change Indicator */}
          {comparisonRank && comparisonRank > 0 && (
            <span className={`text-[10px] font-mono flex items-center ${
              change > 0 ? 'text-green-400' :
              change < 0 ? 'text-red-400' :
              'text-gray-500'
            }`}>
              {change > 0 && <ArrowUp className="w-3 h-3" />}
              {change < 0 && <ArrowDown className="w-3 h-3" />}
              {change === 0 && <Minus className="w-3 h-3" />}
              {Math.abs(change) > 0 && Math.abs(change)}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium leading-tight line-clamp-2 mb-1">
            {cleanTitle}
          </h3>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span className="font-medium text-gray-400">{article.source?.name}</span>
            <span>•</span>
            <span>{article.category}</span>
            <span>•</span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
            </span>
          </div>

          {/* Score Info */}
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            <span className="text-gray-400">
              AI: <span className="text-teal-400 font-mono">{article.aiScore ?? 'N/A'}</span>
            </span>
            {showBreakdown && article.weightedScore !== undefined && (
              <span className="text-gray-400">
                Weighted: <span className="text-teal-400 font-mono">{article.weightedScore.toFixed(1)}</span>
              </span>
            )}
            {showBreakdown && article.scoreBreakdown?.negativeSignalPenalty && article.scoreBreakdown.negativeSignalPenalty > 0 && (
              <span className="text-amber-400 flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" />
                -{article.scoreBreakdown.negativeSignalPenalty.toFixed(0)} clickbait
              </span>
            )}
          </div>

          {/* Expanded Score Breakdown */}
          {expanded && showBreakdown && article.scoreBreakdown && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <ScoreComponent label="Quality" value={article.scoreBreakdown.qualityComponent} />
                <ScoreComponent label="Authority" value={article.scoreBreakdown.authorityComponent} />
                <ScoreComponent label="Freshness" value={article.scoreBreakdown.freshnessComponent} />
                <ScoreComponent label="Time Decay" value={article.scoreBreakdown.timeDecayMultiplier} isMultiplier />
                <ScoreComponent label="Negative" value={-article.scoreBreakdown.negativeSignalPenalty} isNegative />
                <ScoreComponent label="Diversity" value={-article.scoreBreakdown.diversityPenalty} isNegative />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Score Component
function ScoreComponent({
  label,
  value,
  isMultiplier,
  isNegative,
}: {
  label: string;
  value: number;
  isMultiplier?: boolean;
  isNegative?: boolean;
}) {
  return (
    <div className="bg-white/5 rounded px-2 py-1">
      <div className="text-gray-500">{label}</div>
      <div className={`font-mono ${
        isNegative && value < 0 ? 'text-red-400' :
        isMultiplier ? 'text-blue-400' :
        'text-teal-400'
      }`}>
        {isMultiplier ? `×${value.toFixed(2)}` : value.toFixed(1)}
      </div>
    </div>
  );
}
