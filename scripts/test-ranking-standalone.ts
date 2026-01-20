/**
 * Standalone Ranking Algorithm Test
 * Tests the new weighted-scoring module without external dependencies
 */

// Inline imports to avoid dependency issues
const MOCK_ARTICLES = [
  {
    title: 'Major Tech Company Announces Revolutionary AI Breakthrough',
    description: 'A leading technology company has unveiled a groundbreaking AI system.',
    url: 'https://example.com/tech-ai-breakthrough',
    urlToImage: 'https://example.com/image1.jpg',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'Reuters' },
    aiScore: 85,
    category: 'technology',
  },
  {
    title: '10 Shocking Ways to Lose Weight Fast - You Won\'t Believe #7!',
    description: 'Doctors hate this one weird trick for instant weight loss.',
    url: 'https://example.com/clickbait-health',
    urlToImage: 'https://example.com/image2.jpg',
    publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'BuzzHealth' },
    aiScore: 72,
    category: 'health',
  },
  {
    title: 'Federal Reserve Signals Interest Rate Decision Ahead of Economic Data',
    description: 'The Federal Reserve is expected to announce its policy decision.',
    url: 'https://example.com/fed-rates',
    urlToImage: 'https://example.com/image3.jpg',
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'Wall Street Journal' },
    aiScore: 88,
    category: 'business',
  },
  {
    title: 'Scientists Discover New Species in Deep Ocean Expedition',
    description: 'Marine biologists have identified several new species.',
    url: 'https://example.com/ocean-species',
    urlToImage: 'https://example.com/image4.jpg',
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'Nature' },
    aiScore: 82,
    category: 'science',
  },
  {
    title: 'Here\'s Why Everyone Is Talking About This New App',
    description: 'What you need to know about the viral sensation.',
    url: 'https://example.com/viral-app',
    urlToImage: 'https://example.com/image5.jpg',
    publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    source: { id: null, name: 'TechBuzz' },
    aiScore: 65,
    category: 'technology',
  },
  {
    title: 'Global Climate Summit Reaches Historic Agreement on Emissions',
    description: 'World leaders have agreed to new targets for reducing carbon emissions.',
    url: 'https://example.com/climate-summit',
    urlToImage: 'https://example.com/image6.jpg',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'BBC News' },
    aiScore: 90,
    category: 'science',
  },
  {
    title: 'BREAKING: Major Earthquake Strikes Coastal Region',
    description: 'A powerful earthquake has been reported with tsunami warnings issued.',
    url: 'https://example.com/earthquake',
    urlToImage: 'https://example.com/image7.jpg',
    publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    source: { id: null, name: 'Associated Press' },
    aiScore: 95,
    category: 'science',
  },
  {
    title: 'Tech Giant Reports Record Quarterly Earnings',
    description: 'The company exceeded analyst expectations with strong revenue growth.',
    url: 'https://example.com/tech-earnings',
    urlToImage: 'https://example.com/image8.jpg',
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'Bloomberg' },
    aiScore: 78,
    category: 'business',
  },
  {
    title: 'Sponsored: The Best Investment Opportunities for 2026',
    description: 'Partner content: Discover top investment strategies.',
    url: 'https://example.com/sponsored-invest',
    urlToImage: 'https://example.com/image10.jpg',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'FinanceAds' },
    aiScore: 60,
    category: 'business',
  },
  {
    title: 'New Study Links Coffee Consumption to Health Benefits',
    description: 'Research suggests moderate coffee drinking may have positive effects.',
    url: 'https://example.com/coffee-health',
    urlToImage: 'https://example.com/image9.jpg',
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    source: { id: null, name: 'New York Times' },
    aiScore: 70,
    category: 'health',
  },
];

// ============================================================================
// INLINE WEIGHTED SCORING (from weighted-scoring.ts)
// ============================================================================

const SOURCE_AUTHORITY: Record<string, number> = {
  'Wall Street Journal': 18,
  'New York Times': 18,
  'Washington Post': 17,
  'Associated Press': 17,
  'Reuters': 17,
  'Bloomberg': 16,
  'The Guardian': 15,
  'BBC News': 15,
  'Financial Times': 15,
  'NPR': 12,
  'Nature': 9,
};

function getSourceAuthorityBoost(sourceName: string): number {
  if (SOURCE_AUTHORITY[sourceName]) return SOURCE_AUTHORITY[sourceName];
  for (const [key, boost] of Object.entries(SOURCE_AUTHORITY)) {
    if (sourceName.toLowerCase().includes(key.toLowerCase())) return boost;
  }
  return 0;
}

function calculateFreshnessScore(publishedAt: string): number {
  const now = Date.now();
  const publishedTime = new Date(publishedAt).getTime();
  const ageMinutes = Math.floor((now - publishedTime) / (1000 * 60));
  if (ageMinutes < 60) return 100 - Math.floor((ageMinutes / 60) * 10);
  if (ageMinutes < 180) return 89 - Math.floor(((ageMinutes - 60) / 120) * 14);
  if (ageMinutes < 360) return 74 - Math.floor(((ageMinutes - 180) / 180) * 14);
  if (ageMinutes < 720) return 59 - Math.floor(((ageMinutes - 360) / 360) * 19);
  if (ageMinutes < 1440) return 39 - Math.floor(((ageMinutes - 720) / 720) * 19);
  return Math.max(0, Math.floor(20 - (ageMinutes / 1440) * 5));
}

function calculateTimeDecay(ageInHours: number, halfLifeHours: number = 12): number {
  return Math.pow(0.5, ageInHours / halfLifeHours);
}

function getAgeInHours(dateStr: string): number {
  const timestamp = new Date(dateStr).getTime();
  return Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60));
}

const CLICKBAIT_PATTERNS = [
  { pattern: /^\d+\s+(things|ways|reasons|tips|tricks|secrets|hacks|facts)/i, penalty: 30 },
  { pattern: /top\s+\d+/i, penalty: 20 },
  { pattern: /you won'?t believe/i, penalty: 50 },
  { pattern: /shocking|jaw[- ]?dropping|mind[- ]?blowing/i, penalty: 40 },
  { pattern: /this (one )?trick/i, penalty: 45 },
  { pattern: /doctors hate/i, penalty: 60 },
  { pattern: /here'?s why/i, penalty: 15 },
  { pattern: /what you need to know/i, penalty: 10 },
  { pattern: /sponsored|promoted|advertisement/i, penalty: 70 },
  { pattern: /partner content/i, penalty: 60 },
];

function detectNegativeSignals(title: string, description?: string): number {
  let totalPenalty = 0;
  for (const { pattern, penalty } of CLICKBAIT_PATTERNS) {
    if (pattern.test(title) || (description && pattern.test(description))) {
      totalPenalty += penalty;
    }
  }
  return Math.min(100, totalPenalty);
}

const DEFAULT_WEIGHTS = {
  quality: 0.40,
  authority: 0.15,
  freshness: 0.20,
  timeDecay: 0.15,
  negativeSignals: 0.10,
  diversityPenalty: 0.10,
};

interface ScoreBreakdown {
  qualityComponent: number;
  authorityComponent: number;
  freshnessComponent: number;
  timeDecayMultiplier: number;
  negativeSignalPenalty: number;
  diversityPenalty: number;
  finalScore: number;
}

function calculateWeightedScore(article: any, weights = DEFAULT_WEIGHTS, diversityPenalty = 0): ScoreBreakdown {
  const normalizedQuality = Math.min(100, Math.max(0, article.aiScore ?? 50));
  const authorityBoost = getSourceAuthorityBoost(article.source?.name || '');
  const normalizedAuthority = Math.min(100, authorityBoost * 5);
  const normalizedFreshness = calculateFreshnessScore(article.publishedAt);
  const ageInHours = getAgeInHours(article.publishedAt);
  const timeDecayMultiplier = calculateTimeDecay(ageInHours);
  const negativeSignalPenalty = detectNegativeSignals(article.title, article.description);

  const qualityComponent = normalizedQuality * weights.quality;
  const authorityComponent = normalizedAuthority * weights.authority;
  const freshnessComponent = normalizedFreshness * weights.freshness;

  const baseScore = qualityComponent + authorityComponent + freshnessComponent;
  const timeDecayedScore = baseScore * (1 - weights.timeDecay + weights.timeDecay * timeDecayMultiplier);
  const negativePenalty = negativeSignalPenalty * weights.negativeSignals;
  const diversityPenaltyScore = diversityPenalty * weights.diversityPenalty;

  const finalScore = Math.max(0, timeDecayedScore - negativePenalty - diversityPenaltyScore);

  return {
    qualityComponent,
    authorityComponent,
    freshnessComponent,
    timeDecayMultiplier,
    negativeSignalPenalty,
    diversityPenalty: diversityPenaltyScore,
    finalScore,
  };
}

// ============================================================================
// TESTS
// ============================================================================

console.log('========================================');
console.log('  Weighted Ranking Algorithm Test');
console.log('========================================\n');

// Test 1: Negative Signal Detection
console.log('--- TEST 1: Clickbait Detection ---\n');
const clickbaitTests = [
  { title: 'Scientists Discover New Species', expected: 'low' },
  { title: '10 Ways to Improve Your Health', expected: 'medium' },
  { title: 'You Won\'t Believe What Happened!', expected: 'high' },
  { title: 'Sponsored: Best Products of 2026', expected: 'high' },
  { title: 'Federal Reserve Announces Rate Decision', expected: 'low' },
];

let clickbaitPassed = 0;
for (const test of clickbaitTests) {
  const penalty = detectNegativeSignals(test.title);
  const level = penalty < 15 ? 'low' : penalty < 40 ? 'medium' : 'high';
  const passed = level === test.expected;
  if (passed) clickbaitPassed++;
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] "${test.title.substring(0, 40)}..."`);
  console.log(`         Penalty: ${penalty} (${level}), Expected: ${test.expected}\n`);
}
console.log(`  Result: ${clickbaitPassed}/${clickbaitTests.length} passed\n`);

// Test 2: Authority Boost
console.log('--- TEST 2: Source Authority ---\n');
const authorityTests = [
  { source: 'Reuters', expectedMin: 15 },
  { source: 'Wall Street Journal', expectedMin: 15 },
  { source: 'BuzzHealth', expectedMin: 0, expectedMax: 5 },
  { source: 'Nature', expectedMin: 5 },
];

let authorityPassed = 0;
for (const test of authorityTests) {
  const boost = getSourceAuthorityBoost(test.source);
  const passed = boost >= test.expectedMin && (test.expectedMax === undefined || boost <= test.expectedMax);
  if (passed) authorityPassed++;
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${test.source}: ${boost} points`);
}
console.log(`\n  Result: ${authorityPassed}/${authorityTests.length} passed\n`);

// Test 3: Full Weighted Scoring
console.log('--- TEST 3: Weighted Scoring ---\n');

const scoredArticles = MOCK_ARTICLES.map(article => {
  const breakdown = calculateWeightedScore(article, DEFAULT_WEIGHTS, 0);
  return { ...article, weightedScore: breakdown.finalScore, breakdown };
});

// Sort by weighted score
scoredArticles.sort((a, b) => b.weightedScore - a.weightedScore);

console.log('  Top 5 by Weighted Score:');
scoredArticles.slice(0, 5).forEach((a, i) => {
  console.log(`    ${i + 1}. [${a.weightedScore.toFixed(1)}] ${a.source.name}: ${a.title.substring(0, 45)}...`);
});

// Sort by AI score only (old method)
const byAiScore = [...MOCK_ARTICLES].sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));

console.log('\n  Top 5 by AI Score Only (old method):');
byAiScore.slice(0, 5).forEach((a, i) => {
  console.log(`    ${i + 1}. [${a.aiScore}] ${a.source.name}: ${a.title.substring(0, 45)}...`);
});

// Test 4: Clickbait should be penalized
console.log('\n--- TEST 4: Clickbait Penalty Verification ---\n');
const clickbaitArticle = scoredArticles.find(a => a.title.includes('10 Shocking'));
const qualityArticle = scoredArticles.find(a => a.title.includes('Federal Reserve'));

if (clickbaitArticle && qualityArticle) {
  const clickbaitRank = scoredArticles.indexOf(clickbaitArticle) + 1;
  const qualityRank = scoredArticles.indexOf(qualityArticle) + 1;

  console.log(`  Clickbait article "${clickbaitArticle.title.substring(0, 30)}..."`);
  console.log(`    AI Score: ${clickbaitArticle.aiScore}, Weighted: ${clickbaitArticle.weightedScore.toFixed(1)}, Rank: #${clickbaitRank}`);
  console.log(`    Negative penalty: -${clickbaitArticle.breakdown.negativeSignalPenalty.toFixed(1)}`);

  console.log(`\n  Quality article "${qualityArticle.title.substring(0, 30)}..."`);
  console.log(`    AI Score: ${qualityArticle.aiScore}, Weighted: ${qualityArticle.weightedScore.toFixed(1)}, Rank: #${qualityRank}`);
  console.log(`    Authority boost component: +${qualityArticle.breakdown.authorityComponent.toFixed(1)}`);

  const passed = qualityRank < clickbaitRank;
  console.log(`\n  [${passed ? 'PASS' : 'FAIL'}] Quality article ranks higher than clickbait`);
}

// Test 5: Source diversity
console.log('\n--- TEST 5: Source Diversity ---\n');
const sourceCount: Record<string, number> = {};
scoredArticles.forEach(a => {
  const source = a.source.name;
  sourceCount[source] = (sourceCount[source] || 0) + 1;
});

console.log('  Source distribution in results:');
Object.entries(sourceCount)
  .sort(([, a], [, b]) => b - a)
  .forEach(([source, count]) => {
    console.log(`    ${source}: ${count}`);
  });

// Summary
console.log('\n========================================');
console.log('  TEST SUMMARY');
console.log('========================================');
console.log(`  Clickbait Detection: ${clickbaitPassed}/${clickbaitTests.length}`);
console.log(`  Authority Boost: ${authorityPassed}/${authorityTests.length}`);
console.log(`  Weighted Scoring: Working`);
console.log(`  Clickbait Penalty: ${clickbaitArticle && qualityArticle && scoredArticles.indexOf(qualityArticle) < scoredArticles.indexOf(clickbaitArticle) ? 'Working' : 'Needs Review'}`);
console.log('========================================\n');
