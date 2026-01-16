/**
 * RSS Feed Parser
 *
 * Fetches and parses RSS feeds from reputable news sources (NYT, BBC, CNN, health outlets)
 * Transforms RSS items into our Article format with sourceProvider tracking
 */

import Parser from 'rss-parser';
import { isPlaceholderImage } from './constants';

type RSSProvider = 'rss-nyt' | 'rss-bbc' | 'rss-cnn' | 'rss-health' | 'rss-reuters' | 'rss-guardian' | 'rss-tech' | 'rss-npr' | 'rss-business' | 'rss-science' | 'rss-france24' | 'rss-abcnews' | 'rss-dw' | 'rss-japan' | 'rss-euronews' | 'rss-timesofindia' | 'rss-aljazeera' | 'rss-google-news' | 'rss-techcrunch' | 'rss-wapo' | 'rss-axios' | 'rss-ap' | 'rss-cnbc' | 'rss-nbcnews' | 'rss-cbsnews' | 'rss-space' | 'rss-nature' | 'rss-wsj' | 'rss-usatoday' | 'rss-politico';

interface RSSArticle {
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
  source: { id: string | null; name: string };
  author: string | null;
  sourceProvider: RSSProvider;
}

interface RSSFeedConfig {
  url: string;
  sourceName: string;
  provider: RSSProvider;
  category: string;
}

const RSS_FEEDS: Record<string, RSSFeedConfig> = {
  // New York Times
  'nyt-world': {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    sourceName: 'New York Times',
    provider: 'rss-nyt',
    category: 'general'
  },
  'nyt-business': {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    sourceName: 'New York Times',
    provider: 'rss-nyt',
    category: 'business'
  },
  'nyt-tech': {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    sourceName: 'New York Times',
    provider: 'rss-nyt',
    category: 'technology'
  },
  'nyt-science': {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
    sourceName: 'New York Times',
    provider: 'rss-nyt',
    category: 'science'
  },
  'nyt-health': {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    sourceName: 'New York Times',
    provider: 'rss-nyt',
    category: 'health'
  },
  
  // BBC News
  'bbc-world': {
    url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    sourceName: 'BBC News',
    provider: 'rss-bbc',
    category: 'general'
  },
  'bbc-business': {
    url: 'http://feeds.bbci.co.uk/news/business/rss.xml',
    sourceName: 'BBC News',
    provider: 'rss-bbc',
    category: 'business'
  },
  'bbc-tech': {
    url: 'http://feeds.bbci.co.uk/news/technology/rss.xml',
    sourceName: 'BBC News',
    provider: 'rss-bbc',
    category: 'technology'
  },
  'bbc-science': {
    url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    sourceName: 'BBC News',
    provider: 'rss-bbc',
    category: 'science'
  },
  'bbc-health': {
    url: 'http://feeds.bbci.co.uk/news/health/rss.xml',
    sourceName: 'BBC News',
    provider: 'rss-bbc',
    category: 'health'
  },
  
  // CNN
  'cnn-top': {
    url: 'http://rss.cnn.com/rss/cnn_topstories.rss',
    sourceName: 'CNN',
    provider: 'rss-cnn',
    category: 'general'
  },
  'cnn-world': {
    url: 'http://rss.cnn.com/rss/cnn_world.rss',
    sourceName: 'CNN',
    provider: 'rss-cnn',
    category: 'general'
  },
  'cnn-business': {
    url: 'http://rss.cnn.com/rss/money_latest.rss',
    sourceName: 'CNN',
    provider: 'rss-cnn',
    category: 'business'
  },
  'cnn-tech': {
    url: 'http://rss.cnn.com/rss/cnn_tech.rss',
    sourceName: 'CNN',
    provider: 'rss-cnn',
    category: 'technology'
  },
  
  // Health Sources - Using working feeds
  'health-mayoclinic': {
    url: 'https://newsnetwork.mayoclinic.org/feed/',
    sourceName: 'Mayo Clinic',
    provider: 'rss-health',
    category: 'health'
  },
  'health-nih': {
    // Updated: NIH main RSS was discontinued, using NLM (National Library of Medicine) instead
    url: 'https://www.nlm.nih.gov/rss/nlmnews.rss',
    sourceName: 'NIH/NLM News',
    provider: 'rss-health',
    category: 'health'
  },
  'health-cdc': {
    url: 'https://tools.cdc.gov/api/v2/resources/media/132608.rss',
    sourceName: 'CDC',
    provider: 'rss-health',
    category: 'health'
  },
  'health-who': {
    // Updated: WHO global RSS discontinued, using WHO Africa region (most active)
    url: 'https://www.afro.who.int/rss/featured-news.xml',
    sourceName: 'WHO',
    provider: 'rss-health',
    category: 'health'
  },
  'health-sciencedaily': {
    url: 'https://www.sciencedaily.com/rss/health_medicine.xml',
    sourceName: 'ScienceDaily Health',
    provider: 'rss-health',
    category: 'health'
  },
  'health-medicalnewstoday': {
    url: 'https://www.medicalnewstoday.com/rss',
    sourceName: 'Medical News Today',
    provider: 'rss-health',
    category: 'health'
  },
  'health-medlineplus': {
    // Added: MedlinePlus for health news
    url: 'https://medlineplus.gov/feeds/whatsnew.xml',
    sourceName: 'MedlinePlus',
    provider: 'rss-health',
    category: 'health'
  },

  // Reuters - Discontinued official RSS in 2020, using Google News RSS search instead
  'reuters-world': {
    url: 'https://news.google.com/rss/search?q=site:reuters.com/world+when:24h&hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Reuters',
    provider: 'rss-reuters',
    category: 'general'
  },
  'reuters-business': {
    url: 'https://news.google.com/rss/search?q=site:reuters.com/business+when:24h&hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Reuters',
    provider: 'rss-reuters',
    category: 'business'
  },
  'reuters-tech': {
    url: 'https://news.google.com/rss/search?q=site:reuters.com/technology+when:24h&hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Reuters',
    provider: 'rss-reuters',
    category: 'technology'
  },
  
  // The Guardian
  'guardian-world': {
    url: 'https://www.theguardian.com/world/rss',
    sourceName: 'The Guardian',
    provider: 'rss-guardian',
    category: 'general'
  },
  'guardian-business': {
    url: 'https://www.theguardian.com/business/rss',
    sourceName: 'The Guardian',
    provider: 'rss-guardian',
    category: 'business'
  },
  'guardian-tech': {
    url: 'https://www.theguardian.com/technology/rss',
    sourceName: 'The Guardian',
    provider: 'rss-guardian',
    category: 'technology'
  },
  'guardian-science': {
    url: 'https://www.theguardian.com/science/rss',
    sourceName: 'The Guardian',
    provider: 'rss-guardian',
    category: 'science'
  },
  
  // Tech-focused sources (excellent image coverage)
  'wired': {
    url: 'https://www.wired.com/feed/rss',
    sourceName: 'Wired',
    provider: 'rss-tech',
    category: 'technology'
  },
  'theverge': {
    url: 'https://www.theverge.com/rss/index.xml',
    sourceName: 'The Verge',
    provider: 'rss-tech',
    category: 'technology'
  },
  'arstechnica': {
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    sourceName: 'Ars Technica',
    provider: 'rss-tech',
    category: 'technology'
  },
  
  // NPR (good image coverage across categories)
  'npr-news': {
    url: 'https://feeds.npr.org/1001/rss.xml',
    sourceName: 'NPR',
    provider: 'rss-npr',
    category: 'general'
  },
  'npr-business': {
    url: 'https://feeds.npr.org/1006/rss.xml',
    sourceName: 'NPR',
    provider: 'rss-npr',
    category: 'business'
  },
  'npr-tech': {
    url: 'https://feeds.npr.org/1019/rss.xml',
    sourceName: 'NPR',
    provider: 'rss-npr',
    category: 'technology'
  },
  'npr-science': {
    url: 'https://feeds.npr.org/1007/rss.xml',
    sourceName: 'NPR',
    provider: 'rss-npr',
    category: 'science'
  },
  'npr-health': {
    url: 'https://feeds.npr.org/1128/rss.xml',
    sourceName: 'NPR',
    provider: 'rss-npr',
    category: 'health'
  },

  // Additional validated feeds with 100% image coverage
  'engadget': {
    url: 'https://www.engadget.com/rss.xml',
    sourceName: 'Engadget',
    provider: 'rss-tech',
    category: 'technology'
  },
  'venturebeat': {
    url: 'https://venturebeat.com/feed/',
    sourceName: 'VentureBeat',
    provider: 'rss-tech',
    category: 'technology'
  },
  'bloomberg-business': {
    url: 'https://feeds.bloomberg.com/markets/news.rss',
    sourceName: 'Bloomberg',
    provider: 'rss-business',
    category: 'business'
  },
  'fortune-business': {
    url: 'https://fortune.com/feed/',
    sourceName: 'Fortune',
    provider: 'rss-business',
    category: 'business'
  },
  'physorg-science': {
    url: 'https://phys.org/rss-feed/',
    sourceName: 'Phys.org',
    provider: 'rss-science',
    category: 'science'
  },
  'newscientist-science': {
    url: 'https://www.newscientist.com/feed/home/',
    sourceName: 'New Scientist',
    provider: 'rss-science',
    category: 'science'
  },

  // International sources for 24/7 coverage
  // France 24 (European/Global, 24/7 multilingual coverage)
  'france24-top': {
    url: 'https://www.france24.com/en/rss',
    sourceName: 'France 24',
    provider: 'rss-france24',
    category: 'general'
  },
  'france24-americas': {
    url: 'https://www.france24.com/en/americas/rss',
    sourceName: 'France 24',
    provider: 'rss-france24',
    category: 'general'
  },
  'france24-middle-east': {
    url: 'https://www.france24.com/en/middle-east/rss',
    sourceName: 'France 24',
    provider: 'rss-france24',
    category: 'general'
  },
  'france24-africa': {
    url: 'https://www.france24.com/en/africa/rss',
    sourceName: 'France 24',
    provider: 'rss-france24',
    category: 'general'
  },

  // ABC News US (American coverage with images)
  'abcnews-us': {
    url: 'https://abcnews.go.com/abcnews/usheadlines',
    sourceName: 'ABC News',
    provider: 'rss-abcnews',
    category: 'general'
  },
  'abcnews-world': {
    url: 'https://abcnews.go.com/abcnews/internationalheadlines',
    sourceName: 'ABC News',
    provider: 'rss-abcnews',
    category: 'general'
  },
  'abcnews-business': {
    url: 'https://abcnews.go.com/abcnews/businessheadlines',
    sourceName: 'ABC News',
    provider: 'rss-abcnews',
    category: 'business'
  },
  'abcnews-tech': {
    url: 'https://abcnews.go.com/abcnews/technologyheadlines',
    sourceName: 'ABC News',
    provider: 'rss-abcnews',
    category: 'technology'
  },
  'abcnews-health': {
    url: 'https://abcnews.go.com/abcnews/healthheadlines',
    sourceName: 'ABC News',
    provider: 'rss-abcnews',
    category: 'health'
  },

  // Deutsche Welle (German international broadcaster, 24/7)
  'dw-top': {
    url: 'https://rss.dw.com/rdf/rss-en-top',
    sourceName: 'Deutsche Welle',
    provider: 'rss-dw',
    category: 'general'
  },
  'dw-business': {
    url: 'https://rss.dw.com/rdf/rss-en-bus',
    sourceName: 'Deutsche Welle',
    provider: 'rss-dw',
    category: 'business'
  },
  'dw-science': {
    url: 'https://rss.dw.com/xml/rss_en_science',
    sourceName: 'Deutsche Welle',
    provider: 'rss-dw',
    category: 'science'
  },
  'dw-asia': {
    url: 'https://rss.dw.com/rdf/rss-en-asia',
    sourceName: 'Deutsche Welle',
    provider: 'rss-dw',
    category: 'general'
  },

  // Japan Times (Asia-Pacific coverage, covers US overnight hours)
  'japan-news': {
    url: 'https://www.japantimes.co.jp/feed/',
    sourceName: 'The Japan Times',
    provider: 'rss-japan',
    category: 'general'
  },

  // Euronews (Pan-European perspective, multilingual coverage)
  'euronews-world': {
    url: 'https://www.euronews.com/rss',
    sourceName: 'Euronews',
    provider: 'rss-euronews',
    category: 'general'
  },
  'euronews-business': {
    url: 'https://www.euronews.com/rss?level=theme&name=business',
    sourceName: 'Euronews',
    provider: 'rss-euronews',
    category: 'business'
  },
  'euronews-tech': {
    url: 'https://www.euronews.com/rss?level=vertical&name=next',
    sourceName: 'Euronews',
    provider: 'rss-euronews',
    category: 'technology'
  },

  // Times of India (Indian/South Asian perspective)
  'timesofindia-world': {
    url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    sourceName: 'Times of India',
    provider: 'rss-timesofindia',
    category: 'general'
  },
  'timesofindia-business': {
    url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms',
    sourceName: 'Times of India',
    provider: 'rss-timesofindia',
    category: 'business'
  },
  'timesofindia-tech': {
    url: 'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms',
    sourceName: 'Times of India',
    provider: 'rss-timesofindia',
    category: 'technology'
  },

  // Al Jazeera English (Middle East/International perspective)
  'aljazeera-news': {
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    sourceName: 'Al Jazeera',
    provider: 'rss-aljazeera',
    category: 'general'
  },

  // Google News (Real-time aggregation with freshest content)
  'google-news-top': {
    url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Google News',
    provider: 'rss-google-news',
    category: 'general'
  },
  'google-news-world': {
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Google News',
    provider: 'rss-google-news',
    category: 'general'
  },
  'google-news-business': {
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Google News',
    provider: 'rss-google-news',
    category: 'business'
  },
  'google-news-tech': {
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Google News',
    provider: 'rss-google-news',
    category: 'technology'
  },
  'google-news-science': {
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Google News',
    provider: 'rss-google-news',
    category: 'science'
  },
  'google-news-health': {
    url: 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ?hl=en-US&gl=US&ceid=US:en',
    sourceName: 'Google News',
    provider: 'rss-google-news',
    category: 'health'
  },

  // === NEW SOURCES (Jan 2026) ===

  // TechCrunch - Leading startup/VC/tech coverage
  'techcrunch-main': {
    url: 'https://techcrunch.com/feed/',
    sourceName: 'TechCrunch',
    provider: 'rss-techcrunch',
    category: 'technology'
  },
  'techcrunch-startups': {
    url: 'https://techcrunch.com/category/startups/feed/',
    sourceName: 'TechCrunch',
    provider: 'rss-techcrunch',
    category: 'business'
  },

  // Washington Post - Major US newspaper
  'wapo-world': {
    url: 'https://feeds.washingtonpost.com/rss/world',
    sourceName: 'Washington Post',
    provider: 'rss-wapo',
    category: 'general'
  },
  'wapo-business': {
    url: 'https://feeds.washingtonpost.com/rss/business',
    sourceName: 'Washington Post',
    provider: 'rss-wapo',
    category: 'business'
  },
  'wapo-tech': {
    url: 'https://feeds.washingtonpost.com/rss/business/technology',
    sourceName: 'Washington Post',
    provider: 'rss-wapo',
    category: 'technology'
  },
  'wapo-health': {
    url: 'https://feeds.washingtonpost.com/rss/national/health-science',
    sourceName: 'Washington Post',
    provider: 'rss-wapo',
    category: 'health'
  },

  // Axios - Fast, concise news
  'axios-main': {
    url: 'https://api.axios.com/feed/',
    sourceName: 'Axios',
    provider: 'rss-axios',
    category: 'general'
  },
  'axios-tech': {
    url: 'https://api.axios.com/feed/technology/',
    sourceName: 'Axios',
    provider: 'rss-axios',
    category: 'technology'
  },

  // Associated Press - Wire service
  'ap-top': {
    url: 'https://rsshub.app/apnews/topics/apf-topnews',
    sourceName: 'Associated Press',
    provider: 'rss-ap',
    category: 'general'
  },
  'ap-business': {
    url: 'https://rsshub.app/apnews/topics/apf-business',
    sourceName: 'Associated Press',
    provider: 'rss-ap',
    category: 'business'
  },
  'ap-tech': {
    url: 'https://rsshub.app/apnews/topics/apf-technology',
    sourceName: 'Associated Press',
    provider: 'rss-ap',
    category: 'technology'
  },
  'ap-science': {
    url: 'https://rsshub.app/apnews/topics/apf-science',
    sourceName: 'Associated Press',
    provider: 'rss-ap',
    category: 'science'
  },
  'ap-health': {
    url: 'https://rsshub.app/apnews/topics/apf-Health',
    sourceName: 'Associated Press',
    provider: 'rss-ap',
    category: 'health'
  },

  // CNBC - Financial/business news
  'cnbc-top': {
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    sourceName: 'CNBC',
    provider: 'rss-cnbc',
    category: 'business'
  },
  'cnbc-tech': {
    url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html',
    sourceName: 'CNBC',
    provider: 'rss-cnbc',
    category: 'technology'
  },
  'cnbc-health': {
    url: 'https://www.cnbc.com/id/10000108/device/rss/rss.html',
    sourceName: 'CNBC',
    provider: 'rss-cnbc',
    category: 'health'
  },

  // NBC News - Major broadcast network
  'nbcnews-top': {
    url: 'https://feeds.nbcnews.com/nbcnews/public/news',
    sourceName: 'NBC News',
    provider: 'rss-nbcnews',
    category: 'general'
  },
  'nbcnews-business': {
    url: 'https://feeds.nbcnews.com/nbcnews/public/business',
    sourceName: 'NBC News',
    provider: 'rss-nbcnews',
    category: 'business'
  },
  'nbcnews-tech': {
    url: 'https://feeds.nbcnews.com/nbcnews/public/tech',
    sourceName: 'NBC News',
    provider: 'rss-nbcnews',
    category: 'technology'
  },
  'nbcnews-health': {
    url: 'https://feeds.nbcnews.com/nbcnews/public/health',
    sourceName: 'NBC News',
    provider: 'rss-nbcnews',
    category: 'health'
  },
  'nbcnews-science': {
    url: 'https://feeds.nbcnews.com/nbcnews/public/science',
    sourceName: 'NBC News',
    provider: 'rss-nbcnews',
    category: 'science'
  },

  // CBS News - Major broadcast network
  'cbsnews-top': {
    url: 'https://www.cbsnews.com/latest/rss/main',
    sourceName: 'CBS News',
    provider: 'rss-cbsnews',
    category: 'general'
  },
  'cbsnews-tech': {
    url: 'https://www.cbsnews.com/latest/rss/technology',
    sourceName: 'CBS News',
    provider: 'rss-cbsnews',
    category: 'technology'
  },
  'cbsnews-health': {
    url: 'https://www.cbsnews.com/latest/rss/health',
    sourceName: 'CBS News',
    provider: 'rss-cbsnews',
    category: 'health'
  },
  'cbsnews-science': {
    url: 'https://www.cbsnews.com/latest/rss/science',
    sourceName: 'CBS News',
    provider: 'rss-cbsnews',
    category: 'science'
  },

  // Space.com - Space/astronomy news
  'space-all': {
    url: 'https://www.space.com/feeds/all',
    sourceName: 'Space.com',
    provider: 'rss-space',
    category: 'science'
  },

  // Nature - Top scientific journal
  'nature-main': {
    url: 'https://www.nature.com/nature.rss',
    sourceName: 'Nature',
    provider: 'rss-nature',
    category: 'science'
  },
  'nature-news': {
    url: 'https://www.nature.com/subjects/science-and-technology.rss',
    sourceName: 'Nature',
    provider: 'rss-nature',
    category: 'science'
  },

  // Wall Street Journal - via Bing News (provides images, unlike WSJ direct RSS)
  'wsj-news': {
    url: 'https://www.bing.com/news/search?q=site:wsj.com&format=rss',
    sourceName: 'Wall Street Journal',
    provider: 'rss-wsj',
    category: 'general'
  },

  // USA Today - via Bing News RSS (direct RSS discontinued)
  'usatoday-news': {
    url: 'https://www.bing.com/news/search?q=site:usatoday.com&format=rss',
    sourceName: 'USA Today',
    provider: 'rss-usatoday',
    category: 'general'
  },

  // Politico - US Politics breaking news
  'politico-politics': {
    url: 'https://rss.politico.com/politics-news.xml',
    sourceName: 'Politico',
    provider: 'rss-politico',
    category: 'general'
  },
  'politico-congress': {
    url: 'https://rss.politico.com/congress.xml',
    sourceName: 'Politico',
    provider: 'rss-politico',
    category: 'general'
  }
};

/**
 * Fetch and parse a single RSS feed
 */
export async function fetchRSSFeed(feedKey: string): Promise<RSSArticle[]> {
  const feedConfig = RSS_FEEDS[feedKey];
  if (!feedConfig) {
    throw new Error(`Unknown RSS feed: ${feedKey}`);
  }

  console.log(`[RSS] Fetching ${feedConfig.sourceName} (${feedKey})...`);

  const parser = new Parser({
    timeout: 10000, // 10 second timeout
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)',
    },
    customFields: {
      item: [
        ['media:content', 'media:content'],
        ['media:thumbnail', 'media:thumbnail'],
        ['content:encoded', 'content:encoded'],
        ['News:Image', 'News:Image'], // Bing News RSS image tag
      ]
    }
  });

  try {
    const feed = await parser.parseURL(feedConfig.url);
    const articles: RSSArticle[] = [];

    for (const item of feed.items.slice(0, 20)) { // Limit to 20 most recent
      if (!item.link || !item.title) continue;

      // Extract image from various RSS formats
      let imageUrl: string | null = null;
      
      // Helper to check if URL is a video (not an image)
      const isVideoUrl = (url: string) => /\.(m3u8|mp4|webm|mov|avi)(\?|$)/i.test(url);

      // Helper to extract thumbnail from media:thumbnail object
      const extractThumbnail = (thumbnail: any): string | null => {
        if (!thumbnail) return null;
        if (Array.isArray(thumbnail)) {
          return thumbnail[0]?.$?.url || thumbnail[0]?.url || (typeof thumbnail[0] === 'string' ? thumbnail[0] : null);
        } else if (typeof thumbnail === 'object') {
          return thumbnail.$?.url || thumbnail.url || null;
        } else if (typeof thumbnail === 'string') {
          return thumbnail;
        }
        return null;
      };

      // Try Bing News:Image first (most reliable for Bing RSS)
      if (item['News:Image']) {
        const newsImage = item['News:Image'];
        if (typeof newsImage === 'string') {
          imageUrl = newsImage;
        } else if (newsImage?.$?.url) {
          imageUrl = newsImage.$.url;
        } else if (newsImage?.url) {
          imageUrl = newsImage.url;
        }
        // Convert Bing HTTP to HTTPS to avoid mixed content issues
        if (imageUrl && imageUrl.startsWith('http://www.bing.com')) {
          imageUrl = imageUrl.replace('http://', 'https://');
        }
      }
      // Try enclosure (most common) - but skip video enclosures
      if (!imageUrl && item.enclosure?.url && !isVideoUrl(item.enclosure.url)) {
        imageUrl = item.enclosure.url;
      }
      // Try media:content - check for nested thumbnail if it's a video
      if (!imageUrl && item['media:content']) {
        const mediaContent: any = item['media:content'];
        const contentArray = Array.isArray(mediaContent) ? mediaContent : [mediaContent];

        for (const content of contentArray) {
          // First, check for nested media:thumbnail inside media:content
          const nestedThumbnail = content?.['media:thumbnail'] || content?.$?.['media:thumbnail'];
          if (nestedThumbnail) {
            imageUrl = extractThumbnail(nestedThumbnail);
            if (imageUrl) break;
          }

          // If no nested thumbnail, try the content URL (if it's not a video)
          const contentUrl = content?.$?.url || content?.url || (typeof content === 'string' ? content : null);
          if (contentUrl && !isVideoUrl(contentUrl)) {
            imageUrl = contentUrl;
            break;
          }
        }
      }
      // Try top-level media:thumbnail
      if (!imageUrl && item['media:thumbnail']) {
        imageUrl = extractThumbnail(item['media:thumbnail']);
      }
      // Try content:encoded (some feeds embed images here)
      if (!imageUrl && item['content:encoded']) {
        const content = item['content:encoded'];
        const imgMatch = content.match(/<img[^>]+src=["']([^"'>]+)["']/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }
      // Try content field
      if (!imageUrl && item.content) {
        const imgMatch = item.content.match(/<img[^>]+src=["']([^"'>]+)["']/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }
      // Try description for embedded images
      if (!imageUrl && item.contentSnippet) {
        const imgMatch = item.contentSnippet.match(/<img[^>]+src=["']([^"'>]+)["']/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }

      // Filter out tracking pixels, placeholder images, and brand logos
      if (imageUrl) {
        // NPR tracking pixel
        if (imageUrl.includes('npr-rss-pixel.png')) {
          imageUrl = null;
        }
        // Generic 1x1 tracking pixels
        else if (imageUrl.match(/1x1|tracking|pixel/i)) {
          imageUrl = null;
        }
        // Very small images (likely icons/tracking)
        else if (imageUrl.match(/\d+x\d+/) && imageUrl.match(/([1-9]|[1-9]\d)x([1-9]|[1-9]\d)/)) {
          imageUrl = null;
        }
        // Placeholder/brand logo detection (comprehensive check)
        else if (isPlaceholderImage(imageUrl)) {
          imageUrl = null;
        }
      }

      // Extract real URL from Bing redirect links (e.g., bing.com/news/apiclick.aspx?...url=https%3a%2f%2fwww.wsj.com...)
      let articleUrl = item.link;
      if (articleUrl && articleUrl.includes('bing.com/news/apiclick.aspx')) {
        const urlMatch = articleUrl.match(/[?&]url=([^&]+)/);
        if (urlMatch) {
          articleUrl = decodeURIComponent(urlMatch[1]);
        }
      }

      articles.push({
        title: item.title,
        description: item.contentSnippet || item.content || null,
        url: articleUrl,
        urlToImage: imageUrl,
        publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
        content: item.content || item.contentSnippet || null,
        source: {
          id: null,
          name: feedConfig.sourceName
        },
        author: (item as any).creator || (item as any).author || null,
        sourceProvider: feedConfig.provider
      });
    }

    console.log(`[RSS] Fetched ${articles.length} articles from ${feedConfig.sourceName}`);
    return articles;
  } catch (error) {
    console.error(`[RSS] Error fetching ${feedKey}:`, error);
    return [];
  }
}

/**
 * Fetch RSS feeds for a specific category
 */
export async function fetchRSSByCategory(category: string): Promise<RSSArticle[]> {
  // Map our categories to RSS feed keys
  // NOTE: Google News RSS re-enabled (Jan 2026) for coverage boost.
  // URLs redirect but stories still match for topic clustering.
  const categoryMap: Record<string, string[]> = {
    general: [
      // Google News - re-enabled for coverage (URLs may redirect but captures trending stories)
      'google-news-top', 'google-news-world',
      'nyt-world', 'bbc-world', 'cnn-top', 'cnn-world', 'reuters-world', 'guardian-world', 'npr-news',
      'france24-top', 'france24-americas', 'france24-middle-east', 'france24-africa',
      'abcnews-us', 'abcnews-world', 'dw-top', 'dw-asia', 'japan-news',
      'euronews-world', 'timesofindia-world', 'aljazeera-news',
      // New sources (Jan 2026)
      'wapo-world', 'axios-main', 'ap-top', 'nbcnews-top', 'cbsnews-top',
      'wsj-news', // WSJ via Bing News RSS (has images)
      'usatoday-news', // USA Today via Bing News RSS
      'politico-politics', 'politico-congress' // Politico US politics
    ],
    business: [
      'google-news-business', // Re-enabled for coverage
      'nyt-business', 'bbc-business', 'cnn-business', 'reuters-business', 'guardian-business', 'npr-business',
      'bloomberg-business', 'fortune-business', 'abcnews-business', 'dw-business',
      'euronews-business', 'timesofindia-business',
      // New sources (Jan 2026)
      'techcrunch-startups', 'wapo-business', 'ap-business', 'cnbc-top', 'nbcnews-business'
    ],
    technology: [
      'google-news-tech', // Re-enabled for coverage
      'nyt-tech', 'bbc-tech', 'cnn-tech', 'reuters-tech', 'guardian-tech', 'wired', 'theverge',
      'arstechnica', 'npr-tech', 'engadget', 'venturebeat', 'abcnews-tech',
      'euronews-tech', 'timesofindia-tech',
      // New sources (Jan 2026)
      'techcrunch-main', 'wapo-tech', 'axios-tech', 'ap-tech', 'cnbc-tech', 'nbcnews-tech', 'cbsnews-tech'
    ],
    science: [
      'google-news-science', // Re-enabled for coverage
      'nyt-science', 'bbc-science', 'guardian-science', 'npr-science', 'physorg-science',
      'newscientist-science', 'dw-science',
      // New sources (Jan 2026)
      'ap-science', 'nbcnews-science', 'cbsnews-science', 'space-all', 'nature-main', 'nature-news'
    ],
    health: [
      'google-news-health', // Re-enabled for coverage
      'nyt-health', 'bbc-health', 'health-mayoclinic', 'health-nih', 'npr-health', 'abcnews-health',
      'health-cdc', 'health-who', 'health-sciencedaily', 'health-medicalnewstoday', 'health-medlineplus',
      // New sources (Jan 2026)
      'wapo-health', 'ap-health', 'cnbc-health', 'nbcnews-health', 'cbsnews-health'
    ]
  };

  const feedKeys = categoryMap[category.toLowerCase()] || [];
  
  if (feedKeys.length === 0) {
    console.log(`[RSS] No RSS feeds configured for category: ${category}`);
    return [];
  }

  console.log(`[RSS] Fetching ${feedKeys.length} RSS feeds for category: ${category}`);

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(
    feedKeys.map(key => fetchRSSFeed(key))
  );

  // Combine all successful results
  const allArticles: RSSArticle[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  console.log(`[RSS] Total ${allArticles.length} articles fetched for ${category}`);
  return allArticles;
}

