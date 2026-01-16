/**
 * Google News Fetcher
 *
 * Uses google-news-scraper with Puppeteer to fetch articles from Google News.
 * Automatically decodes Google's redirect URLs to get actual article URLs.
 *
 * Run: npx tsx scripts/fetch-google-news.ts
 */

// @ts-expect-error - google-news-scraper types not properly exported
import googleNewsScraper from 'google-news-scraper';
import { getCached, setCached, isRedisAvailable } from '../src/lib/redis';

// Topics to fetch from Google News - simpler queries work better
const TOPICS = [
  { searchTerm: 'technology', category: 'technology' },
  { searchTerm: 'science', category: 'science' },
  { searchTerm: 'business', category: 'business' },
  { searchTerm: 'health', category: 'health' },
];

// Cache configuration
const CACHE_KEY_PREFIX = 'news:';
const ARTICLE_KEY_PREFIX = 'article:';
const CACHE_DURATION_SECONDS = 4 * 60 * 60; // 4 hours

interface Article {
  title: string;
  url: string;
  urlToImage: string | null;
  description: string;
  source: { id: string | null; name: string };
  publishedAt: string;
  category: string;
  sourceProvider: string;
  author: string | null;
}

interface StoredArticle extends Article {
  storedAt: number;
  lastDisplayedAt: number;
}

interface CachedData {
  articles: Article[];
  totalResults: number;
  timestamp: number;
}

function getArticleKey(url: string): string {
  const encoded = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
  return `${ARTICLE_KEY_PREFIX}${encoded}`;
}

async function fetchGoogleNews() {
  console.log('=== Google News Fetcher ===');
  console.log(`Time: ${new Date().toISOString()}`);

  if (!isRedisAvailable()) {
    console.error('Redis not available - check KV_REST_API_URL and KV_REST_API_TOKEN');
    process.exit(1);
  }

  console.log(`Fetching ${TOPICS.length} topics: ${TOPICS.map(t => t.category).join(', ')}`);

  let totalArticles = 0;
  let totalStored = 0;

  for (const topic of TOPICS) {
    console.log(`\n--- Fetching: ${topic.searchTerm} (${topic.category}) ---`);

    try {
      // Configure puppeteer with stealth-like settings
      const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ];

      const articles = await googleNewsScraper({
        searchTerm: topic.searchTerm,
        prettyURLs: true, // Decode Google redirect URLs
        timeframe: '7d', // Last 7 days - more results
        queryVars: {
          hl: 'en-US',
          gl: 'US',
          ceid: 'US:en',
        },
        puppeteerArgs,
      });

      console.log(`Found ${articles.length} articles for ${topic.category}`);

      if (articles.length === 0) {
        console.log(`Warning: No articles returned for ${topic.category} - Google may be blocking requests`);
        continue;
      }

      totalArticles += articles.length;

      // Transform to our Article format
      const formattedArticles: Article[] = articles
        .filter((a: any) => a.link && a.title)
        .map((a: any) => ({
          title: a.title || '',
          url: a.link || '',
          urlToImage: a.image || null,
          description: a.snippet || a.title || '',
          source: { id: null, name: a.source || 'Google News' },
          publishedAt: a.datetime || new Date().toISOString(),
          category: topic.category,
          sourceProvider: 'google-news',
          author: null,
        }));

      // Store each article in permanent store
      for (const article of formattedArticles) {
        if (!article.url) continue;

        const key = getArticleKey(article.url);
        const existing = await getCached<StoredArticle>(key);
        const now = Date.now();

        const storedArticle: StoredArticle = {
          ...article,
          storedAt: existing?.storedAt || now,
          lastDisplayedAt: now,
        };

        await setCached(key, storedArticle); // No expiry for permanent store
        totalStored++;
      }

      console.log(`Stored ${formattedArticles.length} articles in permanent store`);

      // Update category cache
      const cacheKey = `${CACHE_KEY_PREFIX}${topic.category}`;
      const existingCache = await getCached<CachedData>(cacheKey);
      let mergedArticles = formattedArticles;

      if (existingCache?.articles) {
        // Merge with existing, dedupe by URL
        const urlMap = new Map<string, Article>();
        for (const article of existingCache.articles) {
          urlMap.set(article.url, article);
        }
        for (const article of formattedArticles) {
          urlMap.set(article.url, article); // New articles override old
        }
        mergedArticles = Array.from(urlMap.values()).slice(0, 500);
        console.log(`Merged with existing cache: ${existingCache.articles.length} + ${formattedArticles.length} = ${mergedArticles.length}`);
      }

      const cacheData: CachedData = {
        articles: mergedArticles,
        totalResults: mergedArticles.length,
        timestamp: Date.now(),
      };

      await setCached(cacheKey, cacheData, CACHE_DURATION_SECONDS);
      console.log(`Category cache updated: ${mergedArticles.length} total articles`);

    } catch (error: any) {
      console.error(`Failed to fetch ${topic.category}:`, error.message);
      if (error.stack) {
        console.error('Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
      }
      // Continue with other topics - isolation is key
    }

    // Longer delay between topics to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log(`\n=== Google News Fetch Complete ===`);
  console.log(`Total articles found: ${totalArticles}`);
  console.log(`Total articles stored: ${totalStored}`);
  console.log(`Time: ${new Date().toISOString()}`);

  // Exit with success only if we got some articles
  if (totalArticles > 0) {
    console.log('✅ Success');
    process.exit(0);
  } else {
    console.log('⚠️ No articles fetched - Google may be blocking. RSS feeds unaffected.');
    process.exit(0); // Still exit 0 so workflow doesn't fail
  }
}

// Run the fetcher
fetchGoogleNews().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
