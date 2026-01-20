/**
 * Preview Ranking Algorithm Test Script
 *
 * Tests the new X-inspired weighted ranking algorithm against the current SOTA sorting.
 * Runs independently of production to avoid impacting live data.
 *
 * Usage:
 *   npx tsx scripts/test-ranking.ts
 *
 * Environment variables:
 *   TEST_MODE: 'comparison' | 'full_test' | 'weights_sweep'
 *   SAMPLE_SIZE: number of articles to test (default: 100)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { sotaSort } from '../src/lib/sota-sorting';
import {
  weightedSort,
  compareRankings,
  DEFAULT_WEIGHTS,
  ScoringWeights,
  ScoredArticle,
  detectNegativeSignals,
} from '../src/lib/weighted-scoring';
import { Article } from '../src/types';

// Test configuration
const TEST_MODE = process.env.TEST_MODE || 'comparison';
const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE || '100', 10);

// Mock articles for testing (when no API access)
const MOCK_ARTICLES: Article[] = [
  {
    title: 'Major Tech Company Announces Revolutionary AI Breakthrough',
    description: 'A leading technology company has unveiled a groundbreaking AI system.',
    url: 'https://example.com/tech-ai-breakthrough',
    urlToImage: 'https://example.com/image1.jpg',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    content: null,
    source: { id: null, name: 'Reuters' },
    author: null,
    aiScore: 85,
    category: 'technology',
  },
  {
    title: '10 Shocking Ways to Lose Weight Fast - You Won\'t Believe #7!',
    description: 'Doctors hate this one weird trick for instant weight loss.',
    url: 'https://example.com/clickbait-health',
    urlToImage: 'https://example.com/image2.jpg',
    publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    content: null,
    source: { id: null, name: 'BuzzHealth' },
    author: null,
    aiScore: 72,
    category: 'health',
  },
  {
    title: 'Federal Reserve Signals Interest Rate Decision Ahead of Economic Data',
    description: 'The Federal Reserve is expected to announce its policy decision.',
    url: 'https://example.com/fed-rates',
    urlToImage: 'https://example.com/image3.jpg',
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    content: null,
    source: { id: null, name: 'Wall Street Journal' },
    author: null,
    aiScore: 88,
    category: 'business',
  },
  {
    title: 'Scientists Discover New Species in Deep Ocean Expedition',
    description: 'Marine biologists have identified several new species during exploration.',
    url: 'https://example.com/ocean-species',
    urlToImage: 'https://example.com/image4.jpg',
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    content: null,
    source: { id: null, name: 'Nature' },
    author: null,
    aiScore: 82,
    category: 'science',
  },
  {
    title: 'Here\'s Why Everyone Is Talking About This New App',
    description: 'What you need to know about the viral sensation sweeping the internet.',
    url: 'https://example.com/viral-app',
    urlToImage: 'https://example.com/image5.jpg',
    publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    content: null,
    source: { id: null, name: 'TechBuzz' },
    author: null,
    aiScore: 65,
    category: 'technology',
  },
  {
    title: 'Global Climate Summit Reaches Historic Agreement on Emissions',
    description: 'World leaders have agreed to new targets for reducing carbon emissions.',
    url: 'https://example.com/climate-summit',
    urlToImage: 'https://example.com/image6.jpg',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    content: null,
    source: { id: null, name: 'BBC News' },
    author: null,
    aiScore: 90,
    category: 'science',
  },
  {
    title: 'BREAKING: Major Earthquake Strikes Coastal Region',
    description: 'A powerful earthquake has been reported with tsunami warnings issued.',
    url: 'https://example.com/earthquake',
    urlToImage: 'https://example.com/image7.jpg',
    publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
    content: null,
    source: { id: null, name: 'Associated Press' },
    author: null,
    aiScore: 95,
    category: 'science',
  },
  {
    title: 'Tech Giant Reports Record Quarterly Earnings',
    description: 'The company exceeded analyst expectations with strong revenue growth.',
    url: 'https://example.com/tech-earnings',
    urlToImage: 'https://example.com/image8.jpg',
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    content: null,
    source: { id: null, name: 'Bloomberg' },
    author: null,
    aiScore: 78,
    category: 'business',
  },
  {
    title: 'New Study Links Coffee Consumption to Health Benefits',
    description: 'Research suggests moderate coffee drinking may have positive effects.',
    url: 'https://example.com/coffee-health',
    urlToImage: 'https://example.com/image9.jpg',
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
    content: null,
    source: { id: null, name: 'New York Times' },
    author: null,
    aiScore: 70,
    category: 'health',
  },
  {
    title: 'Sponsored: The Best Investment Opportunities for 2026',
    description: 'Partner content: Discover top investment strategies from experts.',
    url: 'https://example.com/sponsored-invest',
    urlToImage: 'https://example.com/image10.jpg',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    content: null,
    source: { id: null, name: 'FinanceAds' },
    author: null,
    aiScore: 60,
    category: 'business',
  },
];

// Generate more mock articles for larger sample sizes
function generateMockArticles(count: number): Article[] {
  const sources = ['Reuters', 'BBC News', 'Wall Street Journal', 'New York Times', 'Bloomberg', 'Nature', 'TechCrunch', 'The Guardian', 'CNN', 'AP News'];
  const categories = ['technology', 'science', 'business', 'health'];
  const articles: Article[] = [...MOCK_ARTICLES];

  while (articles.length < count) {
    const sourceIdx = articles.length % sources.length;
    const catIdx = articles.length % categories.length;
    const hoursAgo = Math.random() * 24;

    articles.push({
      title: `News Article ${articles.length + 1}: Important Development in ${categories[catIdx]}`,
      description: `A significant update regarding ${categories[catIdx]} sector developments.`,
      url: `https://example.com/article-${articles.length + 1}`,
      urlToImage: `https://example.com/image-${articles.length + 1}.jpg`,
      publishedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
      content: null,
      source: { id: null, name: sources[sourceIdx] },
      author: null,
      aiScore: Math.floor(50 + Math.random() * 50),
      category: categories[catIdx],
    });
  }

  return articles;
}

// Test functions
async function runComparisonTest(articles: Article[]): Promise<void> {
  console.log('\n=== COMPARISON TEST ===\n');
  console.log(`Testing with ${articles.length} articles\n`);

  // Run old ranking
  const oldResult = sotaSort(articles, {
    categoryOrder: ['technology', 'science', 'business', 'health'],
    enableTimeDecay: true,
    enableDeduplication: true,
  });

  // Run new ranking
  const newResult = weightedSort(articles as ScoredArticle[], {
    weights: DEFAULT_WEIGHTS,
    enableDiversityAttenuation: true,
    enableDeduplication: true,
  });

  // Compare
  const comparison = compareRankings(
    oldResult.articles as ScoredArticle[],
    newResult.articles
  );

  // Output results
  console.log('--- OLD RANKING (SOTA Sort) ---');
  oldResult.articles.slice(0, 10).forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.aiScore}] ${a.source.name}: ${a.title.substring(0, 60)}...`);
  });

  console.log('\n--- NEW RANKING (Weighted) ---');
  newResult.articles.slice(0, 10).forEach((a, i) => {
    const score = a.weightedScore?.toFixed(1) || 'N/A';
    console.log(`  ${i + 1}. [${score}] ${a.source.name}: ${a.title.substring(0, 60)}...`);
  });

  console.log('\n--- STATISTICS ---');
  console.log(`  Total articles: ${newResult.stats.totalInput}`);
  console.log(`  After dedup: ${newResult.stats.afterDeduplication}`);
  console.log(`  Avg score: ${newResult.stats.averageScore.toFixed(2)}`);
  console.log(`  Clickbait flagged: ${newResult.stats.negativeFlagged}`);
  console.log(`  Avg position change: ${comparison.averagePositionChange.toFixed(1)}`);

  console.log('\n--- BIGGEST GAINERS ---');
  comparison.positionChanges
    .filter(p => p.change > 0)
    .slice(0, 5)
    .forEach(p => {
      console.log(`  +${p.change} positions: ${p.title.substring(0, 50)}...`);
    });

  console.log('\n--- BIGGEST DROPS ---');
  comparison.positionChanges
    .filter(p => p.change < 0)
    .slice(0, 5)
    .forEach(p => {
      console.log(`  ${p.change} positions: ${p.title.substring(0, 50)}...`);
    });

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    testMode: 'comparison',
    articleCount: articles.length,
    oldRanking: oldResult.articles.slice(0, 20).map((a, i) => ({
      rank: i + 1,
      title: a.title,
      source: a.source.name,
      aiScore: a.aiScore,
    })),
    newRanking: newResult.articles.slice(0, 20).map((a, i) => ({
      rank: i + 1,
      title: a.title,
      source: a.source.name,
      aiScore: a.aiScore,
      weightedScore: a.weightedScore,
      breakdown: a.scoreBreakdown,
    })),
    statistics: {
      ...newResult.stats,
      comparison: {
        avgPositionChange: comparison.averagePositionChange,
        newInTop10: comparison.newInTop10.length,
        droppedFromTop10: comparison.droppedFromTop10.length,
      },
    },
  };

  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/comparison-results.json', JSON.stringify(results, null, 2));
  console.log('\n[Results saved to test-results/comparison-results.json]');
}

async function runWeightsSweepTest(articles: Article[]): Promise<void> {
  console.log('\n=== WEIGHTS SWEEP TEST ===\n');

  const weightConfigs: Array<{ name: string; weights: ScoringWeights }> = [
    { name: 'Default', weights: DEFAULT_WEIGHTS },
    { name: 'Quality Focus', weights: { ...DEFAULT_WEIGHTS, quality: 0.60, freshness: 0.10 } },
    { name: 'Freshness Focus', weights: { ...DEFAULT_WEIGHTS, quality: 0.20, freshness: 0.40 } },
    { name: 'Authority Focus', weights: { ...DEFAULT_WEIGHTS, authority: 0.30, quality: 0.30 } },
    { name: 'Anti-Clickbait', weights: { ...DEFAULT_WEIGHTS, negativeSignals: 0.25, quality: 0.30 } },
    { name: 'High Diversity', weights: { ...DEFAULT_WEIGHTS, diversityPenalty: 0.25, quality: 0.30 } },
  ];

  const results: Array<{
    config: string;
    top5: Array<{ title: string; score: number }>;
    clickbaitFlagged: number;
  }> = [];

  for (const config of weightConfigs) {
    const result = weightedSort(articles as ScoredArticle[], {
      weights: config.weights,
      enableDiversityAttenuation: true,
      enableDeduplication: true,
    });

    console.log(`\n--- ${config.name.toUpperCase()} ---`);
    console.log(`Weights: Q=${config.weights.quality} A=${config.weights.authority} F=${config.weights.freshness}`);
    result.articles.slice(0, 5).forEach((a, i) => {
      console.log(`  ${i + 1}. [${a.weightedScore?.toFixed(1)}] ${a.title.substring(0, 50)}...`);
    });

    results.push({
      config: config.name,
      top5: result.articles.slice(0, 5).map(a => ({
        title: a.title,
        score: a.weightedScore || 0,
      })),
      clickbaitFlagged: result.stats.negativeFlagged,
    });
  }

  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/weights-sweep-results.json', JSON.stringify(results, null, 2));
  console.log('\n[Results saved to test-results/weights-sweep-results.json]');
}

async function runNegativeSignalTest(): Promise<void> {
  console.log('\n=== NEGATIVE SIGNAL DETECTION TEST ===\n');

  const testCases = [
    { title: 'Scientists Discover New Species', expected: 0 },
    { title: '10 Ways to Improve Your Health', expected: 30 },
    { title: 'You Won\'t Believe What Happened Next!', expected: 50 },
    { title: 'BREAKING: Major Event Unfolds', expected: 0 },
    { title: 'Sponsored: Best Products of 2026', expected: 70 },
    { title: 'This One Trick Will Change Everything', expected: 45 },
    { title: 'Federal Reserve Announces Rate Decision', expected: 0 },
    { title: 'Top 5 Shocking Secrets Revealed', expected: 60 },
  ];

  console.log('Testing clickbait detection:\n');

  let passed = 0;
  for (const test of testCases) {
    const penalty = detectNegativeSignals(test.title);
    const status = Math.abs(penalty - test.expected) <= 15 ? 'PASS' : 'FAIL';
    if (status === 'PASS') passed++;

    console.log(`  [${status}] "${test.title}"`);
    console.log(`         Expected: ~${test.expected}, Got: ${penalty}\n`);
  }

  console.log(`\nResults: ${passed}/${testCases.length} tests passed`);
}

// Main execution
async function main(): Promise<void> {
  console.log('========================================');
  console.log('  Preview Ranking Algorithm Test');
  console.log('========================================');
  console.log(`Mode: ${TEST_MODE}`);
  console.log(`Sample Size: ${SAMPLE_SIZE}`);

  // Generate test articles
  const articles = generateMockArticles(SAMPLE_SIZE);

  switch (TEST_MODE) {
    case 'comparison':
      await runComparisonTest(articles);
      break;
    case 'weights_sweep':
      await runWeightsSweepTest(articles);
      break;
    case 'full_test':
      await runComparisonTest(articles);
      await runWeightsSweepTest(articles);
      await runNegativeSignalTest();
      break;
    default:
      await runComparisonTest(articles);
  }

  console.log('\n========================================');
  console.log('  Test Complete');
  console.log('========================================\n');
}

main().catch(console.error);
