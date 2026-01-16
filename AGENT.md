# 🤖 AI Agent Context & Codebase Guide

> **Purpose**: This document provides complete context for AI coding agents to understand and work with this codebase effectively. It includes architecture, conventions, known issues, and decision history.

**Last Updated**: January 16, 2026
**Project**: ThreadBot - AI-Powered News Aggregator
**Version**: 1.2.0

---

## 📋 Table of Contents

- [Project Overview](#-project-overview)
- [Tech Stack & Dependencies](#-tech-stack--dependencies)
- [Architecture & Design Decisions](#-architecture--design-decisions)
- [File Structure](#-file-structure)
- [Key Components Deep Dive](#-key-components-deep-dive)
- [API Routes & Endpoints](#-api-routes--endpoints)
- [State Management Patterns](#-state-management-patterns)
- [Styling & UI Conventions](#-styling--ui-conventions)
- [Known Issues & Workarounds](#-known-issues--workarounds)
- [Development Workflow](#-development-workflow)
- [Testing & Debugging](#-testing--debugging)
- [Deployment & Environment](#-deployment--environment)
- [Performance Optimizations](#-performance-optimizations)
- [Security Considerations](#-security-considerations)
- [Common Tasks & Patterns](#-common-tasks--patterns)
- [Decision Log](#-decision-log)

---

## 🎯 Project Overview

### What It Does

ThreadBot is a news aggregation platform that:
1. Fetches news from multiple sources (NewsAPI, GNews, RSS feeds from NYT/BBC/CNN/WebMD/etc.)
2. Displays articles in a modern, responsive UI with SOTA sorting algorithm
3. Generates AI-powered "threads" (smart briefings) using Google Gemini
4. Implements aggressive backend caching to avoid API rate limits
5. Provides split-screen UI (desktop) and drawer UI (mobile)
6. Pre-generates threads for top articles based on fetch-time binning

### Advanced Sorting Algorithm

ThreadBot uses a **state-of-the-art (SOTA) sorting algorithm** that mirrors professional news sites:

**1. Fetch-Time Binning**
- Articles grouped by age: 0-1h, 1-2h, 2-3h, etc.
- Each bin represents content from a specific time window

**2. Within-Bin Sorting**
- Articles within each bin sorted by AI score (highest first)
- Ensures best content from each time period rises to top

**3. Quality Thresholds**
- **Current hour (Bin 0)**: Show all articles (no threshold)
- **Recent (1-6 hours)**: Require score ≥ 80
- **Older (6+ hours)**: Require score ≥ 85
- Maintains quality bar while showing recent content

**4. Interleaving**
- Top articles from each bin are interleaved
- Creates optimal content flow: fresh + high-quality + variety

### Core User Flow

```
1. User visits site → Middleware checks auth → Login if needed
2. User sees Home dashboard (SOTA-sorted articles across categories)
3. User clicks category tab → Infinite scroll feed loads (SOTA-sorted)
4. User clicks article → AI thread opens in sidebar/drawer
5. AI generates briefing → User reads analysis
6. User clicks source link → Opens original article
```

### Key Metrics

- **API Call Reduction**: 99% (via caching)
- **Response Time**: 30-50ms (cached), 1000-2000ms (fresh)
- **Cache Duration**: 4 hours news, persistent threads
- **Articles Cached**: ~500+ total across all sources
- **Supported Categories**: 7 (Home, Technology, Science, Business, Health, Entertainment, Sports)
- **Sorting Algorithm**: SOTA fetch-time binning (like NYT/WSJ)
- **Sources**: 3 APIs + 10+ RSS feeds
- **Thread Pre-generation**: Top articles per category

---

## 🔧 Tech Stack & Dependencies

### Core Framework

```json
{
  "next": "16.1.0",           // React framework with Turbopack
  "react": "19.x",            // UI library
  "typescript": "5.x"         // Type safety
}
```

### UI & Styling

```json
{
  "tailwindcss": "3.4.x",     // Utility-first CSS
  "framer-motion": "11.x",    // Animations (drawer, sidebar)
  "lucide-react": "latest",   // Icon library
  "class-variance-authority": "latest", // CVA for component variants
  "clsx": "latest",           // Class name utilities
  "tailwind-merge": "latest"  // Merge Tailwind classes
}
```

### Data & APIs

```json
{
  "axios": "1.7.x",                    // HTTP client
  "@google/generative-ai": "0.21.x",  // Gemini API client
  "react-markdown": "9.x",            // Markdown rendering
  "remark-gfm": "latest",             // GitHub Flavored Markdown
  "date-fns": "4.x"                   // Date formatting
}
```

### Development

```json
{
  "eslint": "9.x",            // Linting
  "vercel": "latest",         // Deployment CLI
  "@tailwindcss/typography": "latest" // Prose styling
}
```

### External Services

| Service | Purpose | API Key Env Var | Rate Limits |
|---------|---------|------------------|-------------|
| **NewsAPI** | News aggregation (legacy) | `NEWS_API_KEY` | 100 req/24h (developer) |
| **GNews API** | Real-time news (60K+ sources) | `GNEWS_API_KEY` | 100 req/day (free) |
| **RSS Feeds** | Premium content (NYT/BBC/CNN/etc.) | N/A | Unlimited |
| **Google Gemini** | AI ranking & generation | `GEMINI_API_KEY` | Free tier |
| **Upstash Redis** | Persistent cache | `KV_REST_API_*` | 10K commands/day (free) |
| **Vercel** | Hosting & deployment | N/A | Hobby plan |
| **GitHub Actions** | Background worker | N/A | 2000 min/month (free) |

---

## 🏗️ Architecture & Design Decisions

### 1. Backend Caching System

**Decision**: Implement Redis/Upstash cache with 4-hour TTL for news, persistent for threads

**Rationale**:
- Multi-source fetching (NewsAPI + GNews + RSS) increases API calls
- Thread pre-generation requires persistent storage
- Vercel KV/Upstash provides cross-deployment consistency

**Implementation**:
```typescript
// src/lib/redis.ts - Upstash Redis client
export async function getCached<T>(key: string): Promise<T | null> {
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    return await redis.get(key);
  }
  return getCachedInMemory(key); // Fallback
}

// src/lib/news-cache.ts - Multi-source fetching
const CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours for news

export async function getCachedNews(category: string): Promise<CachedData> {
  // Fetch from all sources: NewsAPI + GNews + RSS feeds
  // Filter out articles without images
  // Deduplicate across sources
  // Return ranked articles
}
```

**Trade-offs**:
- ✅ Pro: 99% API call reduction
- ✅ Pro: 20-40x faster responses
- ✅ Pro: Persistent thread cache
- ✅ Pro: Cross-deployment consistency
- ❌ Con: External dependency on Redis

### 2. Split-Screen UI Pattern

**Decision**: Desktop sidebar + mobile drawer

**Rationale**:
- Desktop: Users want to browse articles while reading threads
- Mobile: Limited screen space requires overlay pattern

**Implementation**:
```tsx
// Desktop: Sticky sidebar (lg:col-span-4)
<motion.div className="hidden lg:block lg:col-span-4 sticky top-20">
  <ThreadView />
</motion.div>

// Mobile: Full-screen drawer (lg:hidden)
<motion.div className="lg:hidden fixed inset-0 z-[100]">
  <ThreadView />
</motion.div>
```

**Trade-offs**:
- ✅ Pro: Optimal UX for each device type
- ✅ Pro: No layout shift on desktop
- ❌ Con: More complex state management

### 3. Password Protection via Middleware

**Decision**: Custom middleware instead of Vercel's built-in protection

**Rationale**:
- Vercel SSO blocked API routes (caused "no articles" bug)
- Need fine-grained control over protected routes
- API routes must be accessible after login

**Implementation**:
```typescript
// src/middleware.ts
export function middleware(request: NextRequest) {
  // Exclude API routes from protection
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  // Check auth cookie for other routes
  const authCookie = request.cookies.get('site-auth');
  if (authCookie?.value === 'authenticated') {
    return NextResponse.next();
  }
  
  // Redirect to login
  return NextResponse.redirect(new URL('/login', request.url));
}
```

**Trade-offs**:
- ✅ Pro: Full control over authentication
- ✅ Pro: API routes accessible after login
- ❌ Con: Custom implementation (more code to maintain)

### 4. Multi-Source News Aggregation

**Decision**: Aggregate from NewsAPI + GNews + RSS feeds with deduplication

**Rationale**:
- Single source (NewsAPI) was limiting coverage
- RSS feeds provide premium content (NYT, BBC, CNN)
- GNews provides real-time updates from 60K+ sources
- Need comprehensive coverage for AI ranking to work well

**Implementation**:
```typescript
// src/lib/multi-source-fetcher.ts
export async function fetchFromAllSources(category: string) {
  const allArticles = [];

  // 1. NewsAPI (structured, reliable)
  const newsApiArticles = await fetchFromNewsAPI(category);

  // 2. GNews (real-time, broad coverage)
  const gNewsArticles = await fetchGNews(category);

  // 3. RSS feeds (premium content)
  const rssArticles = await fetchRSSByCategory(category);

  // 4. Filter out articles without images
  const articlesWithImages = [...newsApiArticles, ...gNewsArticles, ...rssArticles]
    .filter(a => a.urlToImage && a.urlToImage.trim() !== '');

  // 5. Deduplicate by URL and title similarity
  const deduplicated = deduplicateArticles(articlesWithImages);

  return { articles: deduplicated, sources: ['newsapi', 'gnews', 'rss'] };
}
```

**Sources**:
- **NewsAPI**: 100+ sources, structured data
- **GNews**: 60K+ sources, real-time updates
- **RSS Feeds**: NYT, BBC, CNN, WebMD, Mayo Clinic, NIH, Reuters, Wired, Ars Technica, NPR

**Trade-offs**:
- ✅ Pro: Comprehensive coverage
- ✅ Pro: Better AI ranking (more diverse articles)
- ✅ Pro: Resilience (multiple sources)
- ❌ Con: More complex deduplication
- ❌ Con: Higher API rate limits to manage

### 5. Gemini Prompt Engineering

**Decision**: Highly structured, factual prompt with specific sections

**Rationale**:
- Initial prompts were too brief and sensational
- User wanted Bloomberg/Economist quality
- Need citations and deep context

**Current Prompt Structure**:
```
1. Executive Summary (1-2 paragraphs)
   - Core event, key actors, outcomes

2. Key Details (6-8 bullets)
   - Who, What, When, Where
   - Numbers, quotes, timeline

3. Context & Analysis (3-4 paragraphs)
   - Historical context
   - Broader implications
   - Key questions/perspectives
```

**Key Instructions**:
- "Leverage Google Search" for grounding
- "Strictly factual, neutral"
- "Avoid sensationalism, hype, emojis"
- "Similar to Bloomberg, The Economist"

**Trade-offs**:
- ✅ Pro: High-quality, professional output
- ✅ Pro: Factual and neutral tone
- ❌ Con: Longer generation time (~5-10 seconds)

### 5. Infinite Scroll with Race Condition Prevention

**Decision**: Use `useRef` lock + `useInView` hook

**Rationale**:
- Initial implementation had duplicate fetches
- Intersection Observer fires multiple times
- Need to prevent concurrent API calls

**Implementation**:
```typescript
const isLoadingRef = useRef(false);

const fetchPage = useCallback(async (page: number) => {
  if (isLoadingRef.current) return; // Lock
  isLoadingRef.current = true;
  
  // ... fetch logic ...
  
  isLoadingRef.current = false; // Unlock
}, []);
```

**Trade-offs**:
- ✅ Pro: No duplicate fetches
- ✅ Pro: Smooth scrolling experience
- ❌ Con: Slightly more complex state management

---

## 📁 File Structure

```
aithreads/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth-check/
│   │   │   │   └── route.ts          # Password validation endpoint
│   │   │   ├── generate/
│   │   │   │   └── route.ts          # AI thread generation (Gemini)
│   │   │   ├── news/
│   │   │   │   └── route.ts          # News fetching (with cache)
│   │   │   └── refresh-cache/
│   │   │       └── route.ts          # Manual cache refresh
│   │   ├── login/
│   │   │   └── page.tsx              # Login page
│   │   ├── globals.css               # Global styles, Tailwind config
│   │   ├── layout.tsx                # Root layout, metadata
│   │   └── page.tsx                  # Main app (Home + categories)
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx            # shadcn/ui button
│   │   │   ├── card.tsx              # shadcn/ui card
│   │   │   ├── badge.tsx             # shadcn/ui badge
│   │   │   ├── skeleton.tsx          # shadcn/ui skeleton
│   │   │   └── input.tsx             # shadcn/ui input
│   │   ├── article-card.tsx          # Article list item (compact)
│   │   └── thread-view.tsx           # AI thread display (sidebar/drawer)
│   ├── lib/
│   │   ├── news-cache.ts             # Caching system (CRITICAL)
│   │   ├── startup.ts                # Server initialization
│   │   └── utils.ts                  # cn() utility
│   └── middleware.ts                 # Auth middleware
├── public/
│   └── robot-icon.png                # Favicon/app icon
├── .env.local                        # Environment variables (gitignored)
├── .vercel/
│   └── project.json                  # Vercel project config
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript config
├── tailwind.config.ts                # Tailwind config
├── next.config.ts                    # Next.js config
├── README.md                         # User-facing documentation
├── DEVELOPMENT.md                    # Development workflow guide
└── AGENT.md                          # This file (AI agent context)
```

### Critical Files (Do Not Break)

| File | Why Critical | Breaking Changes Impact |
|------|--------------|------------------------|
| `src/lib/news-cache.ts` | Core caching logic | API rate limits hit immediately |
| `src/app/page.tsx` | Main UI orchestration | Entire app breaks |
| `src/middleware.ts` | Authentication | Site becomes inaccessible |
| `src/app/api/news/route.ts` | News fetching | No articles load |
| `src/app/api/generate/route.ts` | AI threads | No AI content |

---

## 🧩 Key Components Deep Dive

### 1. `src/app/page.tsx` - Main Application

**Purpose**: Orchestrates entire app with SOTA sorting algorithm

**State Management**:
```typescript
// Article data (SOTA-sorted)
const [articles, setArticles] = useState<Article[]>([]);

// UI state
const [category, setCategory] = useState('All');
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);

// Thread state
const [activeArticle, setActiveArticle] = useState<Article | null>(null);
const [threadContent, setThreadContent] = useState<string | null>(null);
const [loadingThread, setLoadingThread] = useState(false);

// Loading/error
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

// Race condition prevention
const isLoadingRef = useRef(false);
```

**SOTA Sorting Implementation**:
```typescript
const fetchTopArticles = useCallback(async () => {
  // 1. Fetch from all sources (NewsAPI + GNews + RSS)
  const responses = await Promise.all(requests);

  // 2. Deduplicate articles
  const deduplicatedArticles = deduplicateArticles(allArticles);

  // 3. Filter out articles without images
  const validArticles = deduplicatedArticles.filter(a =>
    a.aiScore && a.aiScore > 0 && a.urlToImage
  );

  // 4. Apply SOTA sorting algorithm
  const articlesWithBin = validArticles.map(article => {
    const publishedTime = new Date(article.publishedAt).getTime();
    const ageInHours = Math.floor((now - publishedTime) / ONE_HOUR);
    const fetchBin = ageInHours; // Bin by hour
    return { ...article, fetchBin, ageInHours };
  });

  // 5. Sort within bins by AI score
  articlesByBin.forEach(articles => {
    articles.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
  });

  // 6. Interleave bins with quality thresholds
  const topArticles = [];
  for (const bin of sortedBins) {
    const binArticles = articlesByBin.get(bin)!;
    const threshold = bin === 0 ? 0 : (bin <= 6 ? 80 : 85);
    const qualityArticles = binArticles.filter(a => (a.aiScore || 0) >= threshold);
    topArticles.push(...qualityArticles);
  }

  setArticles(uniqueTopArticles);
}, []);
```

**Key Functions**:

```typescript
// Fetch dashboard (Home tab)
const fetchDashboard = useCallback(async () => {
  // Fetch 3 articles from each of 7 categories
  // Store in groupedArticles state
}, []);

// Fetch category feed (infinite scroll)
const fetchPage = useCallback(async (pageToFetch: number, isReset: boolean) => {
  // Check lock (isLoadingRef)
  // Fetch from /api/news
  // Append to articles or reset
}, [category]);

// Handle thread selection
const handleThreadSelect = async (article: Article) => {
  setActiveArticle(article);
  setLoadingThread(true);
  
  // Call /api/generate
  const response = await axios.post('/api/generate', {
    title: article.title,
    description: article.description,
    content: article.content
  });
  
  setThreadContent(response.data.thread);
  setLoadingThread(false);
};
```

**Layout Structure**:
```tsx
<div className="min-h-screen">
  {/* Header with categories */}
  <header className="sticky top-0">
    {/* Category tabs */}
  </header>
  
  {/* Main content grid */}
  <div className="grid grid-cols-1 lg:grid-cols-12">
    {/* Left: Articles (8/12 or 12/12) */}
    <div className={activeArticle ? "lg:col-span-8" : "lg:col-span-12"}>
      {category === 'Home' ? <Dashboard /> : <Feed />}
    </div>
    
    {/* Right: Thread sidebar (4/12, desktop only) */}
    {activeArticle && (
      <motion.div className="hidden lg:block lg:col-span-4 sticky">
        <ThreadView />
      </motion.div>
    )}
    
    {/* Mobile drawer (overlay) */}
    {activeArticle && (
      <motion.div className="lg:hidden fixed inset-0">
        <ThreadView />
      </motion.div>
    )}
  </div>
</div>
```

**Important Notes**:
- Uses `suppressHydrationWarning` on categories container (fixes hydration error)
- Body scroll locked when mobile drawer open (`document.body.style.overflow = 'hidden'`)
- Auto-refresh every 2 hours via `setInterval`

### 2. `src/components/article-card.tsx` - Article Display

**Purpose**: Compact horizontal card for article list

**Props**:
```typescript
interface ArticleCardProps {
  article: Article;
  onThreadSelect: () => void;
  isActive?: boolean;
}
```

**Layout** (96px fixed height):
```
┌─────────────────────────────────────────────────┐
│ [Source] • [Time]                    [Image]    │
│ Article Title (2 lines max)          72x72px    │
│ [AI Icon]                                       │
└─────────────────────────────────────────────────┘
```

**Interaction Model**:
- **Click card** → Opens AI thread
- **Click source name** → Opens original article (stopPropagation)
- **Click AI icon** → Opens AI thread (stopPropagation)

**Styling**:
```typescript
// Active state (thread open)
isActive ? "bg-primary/5 border-primary/20" : "hover:bg-muted/20"

// Fixed height
"h-[96px]"

// Image size (Safari fix)
style={{ width: '100%', height: '100%' }}
```

### 3. `src/components/thread-view.tsx` - AI Thread Display

**Purpose**: Renders AI-generated briefing in sidebar/drawer

**Props**:
```typescript
interface ThreadViewProps {
  article: Article;
  content: string | null;
  loading: boolean;
  onClose: () => void;
}
```

**Structure**:
```tsx
<div className="flex flex-col h-full">
  {/* Header (fixed) */}
  <div className="p-4 border-b shrink-0">
    <Bot icon /> Thread
    <X button onClick={onClose} />
  </div>
  
  {/* Content (scrollable) */}
  <div className="overflow-y-auto flex-1 p-5">
    {/* Article context */}
    <div className="mb-6">
      <h3>{article.title}</h3>
      <img src={article.urlToImage} />
      <a href={article.url}>{article.source.name}</a>
    </div>
    
    {/* AI content or loading */}
    {loading ? <LoadingSteps /> : <ReactMarkdown>{content}</ReactMarkdown>}
  </div>
</div>
```

**LoadingSteps Component**:
```typescript
// Cycles through 4 steps, stops at last
const LOADING_STEPS = [
  { title: 'Reading article...', subtitle: 'Extracting key information' },
  { title: 'Searching web...', subtitle: 'Verifying facts with Google Search' },
  { title: 'Analyzing context...', subtitle: 'Understanding the bigger picture' },
  { title: 'Generating briefing...', subtitle: 'Crafting your smart summary' },
];

// Changes every 1.5s, stops at step 4
useEffect(() => {
  const interval = setInterval(() => {
    setStepIndex((prev) => prev < 3 ? prev + 1 : prev);
  }, 1500);
  return () => clearInterval(interval);
}, []);
```

**Markdown Styling**:
```typescript
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    h1: (props) => <h1 className="text-base font-bold text-primary" {...props} />,
    h2: (props) => <h2 className="text-sm font-bold" {...props} />,
    p: (props) => <p className="mb-3 text-sm" {...props} />,
    ul: (props) => <ul className="list-none pl-0" {...props} />,
    li: (props) => <li className="pl-3 border-l-2 border-primary/30" {...props} />,
  }}
>
```

### 4. `src/lib/multi-source-fetcher.ts` - Multi-Source Aggregation

**Purpose**: Fetch from NewsAPI + GNews + RSS feeds, deduplicate, filter images

**Key Functions**:
```typescript
export async function fetchFromAllSources(category: string) {
  const allArticles = [];

  // 1. NewsAPI (structured, reliable)
  const newsApiArticles = await fetchFromNewsAPI(category);
  allArticles.push(...newsApiArticles);

  // 2. GNews (real-time, broad coverage)
  const gNewsArticles = await fetchGNews(category);
  allArticles.push(...gNewsArticles);

  // 3. RSS feeds (premium content)
  const rssArticles = await fetchRSSByCategory(category);
  allArticles.push(...rssArticles);

  // 4. Filter out articles without images
  const articlesWithImages = allArticles.filter(a =>
    a.urlToImage && a.urlToImage.trim() !== ''
  );

  // 5. Deduplicate by URL and title similarity
  const deduplicated = deduplicateArticles(articlesWithImages);

  return {
    articles: deduplicated,
    sources: ['newsapi', 'gnews', 'rss'],
    duplicatesRemoved: allArticles.length - deduplicated.length
  };
}
```

### 5. `src/lib/news-cache.ts` - Caching System (CRITICAL)

**Purpose**: Redis/Upstash cache with 4-hour TTL for news, persistent threads

**Data Structure**:
```typescript
interface CachedData {
  articles: Article[];
  totalResults: number;
  timestamp: number;
}

const CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours for news
```

**Key Functions**:

```typescript
// Get cached news with multi-source fetching
export async function getCachedNews(category: string): Promise<CachedData> {
  const cacheKey = `news:${category}`;
  const cached = await getCached<CachedData>(cacheKey);

  if (cached && !isExpired(cached.timestamp)) {
    return cached;
  }

  // Fetch from all sources
  const result = await fetchFromAllSources(category);

  // Store in cache
  const data = {
    articles: result.articles,
    totalResults: result.articles.length,
    timestamp: Date.now()
  };

  await setCached(cacheKey, data, CACHE_DURATION);
  return data;
}
```

**Cache Behavior**:
- **First request**: Fetch from multi-source (2000-4000ms)
- **Subsequent requests**: Serve from Redis (30-50ms)
- **After 4 hours**: Next request triggers refresh
- **Thread cache**: Persistent (no expiry)

**Important Notes**:
- Redis (Upstash) provides cross-deployment consistency
- Thread pre-generation uses persistent cache
- Fallback to in-memory cache if Redis unavailable

---

## 🌐 API Routes & Endpoints

### 1. `GET /api/news`

**Purpose**: Fetch SOTA-sorted news articles from multi-source cache

**Query Parameters**:
```typescript
{
  category?: string;  // Default: 'general'
  page?: number;      // Default: 1
  pageSize?: number;  // Default: 10
}
```

**Response**:
```json
{
  "status": "ok",
  "totalResults": 69,
  "articles": [
    {
      "source": { "id": "techcrunch", "name": "TechCrunch" },
      "author": "John Doe",
      "title": "Article Title",
      "description": "Description...",
      "url": "https://...",
      "urlToImage": "https://...",
      "publishedAt": "2025-12-23T10:00:00Z",
      "content": "Content..."
    }
  ]
}
```

**Flow**:
```
1. Parse query params
2. Call getCachedNews(category) → Multi-source fetching
   ├─ Cache hit → Return SOTA-sorted articles
   └─ Cache miss → Fetch NewsAPI + GNews + RSS
3. Return JSON (articles include AI scores, source providers)
```

**Error Handling**:
```typescript
try {
  await getCachedNews(category);
  const result = getPaginatedResults(category, page, pageSize);
  return NextResponse.json(result);
} catch (error) {
  return NextResponse.json(
    { error: 'Failed to fetch news', details: error.message },
    { status: 500 }
  );
}
```

### 2. `POST /api/generate`

**Purpose**: Generate AI thread using Gemini

**Request Body**:
```json
{
  "title": "Article Title",
  "description": "Article description",
  "content": "Article content snippet"
}
```

**Response**:
```json
{
  "thread": "# Executive Summary\n\n..."
}
```

**Flow**:
```
1. Validate GEMINI_API_KEY
2. Initialize Gemini client (gemini-2.5-flash)
3. Construct detailed prompt
4. Call Gemini API
5. Return Markdown string
```

**Prompt Template**:
```typescript
const prompt = `
You are an expert news analyst...

Instructions:
1. Leverage Google Search for grounding
2. Strictly factual, neutral
3. Structure:
   - Executive Summary (1-2 paragraphs)
   - Key Details (6-8 bullets)
   - Context & Analysis (3-4 paragraphs)

Input Article:
Title: ${title}
Description: ${description}
Content: ${content}
`;
```

**Error Handling**:
```typescript
if (!API_KEY) {
  return NextResponse.json(
    { error: 'Gemini API key is not configured' },
    { status: 500 }
  );
}

try {
  const result = await model.generateContent(prompt);
  return NextResponse.json({ thread: result.response.text() });
} catch (error) {
  return NextResponse.json(
    { error: 'Failed to generate content' },
    { status: 500 }
  );
}
```

### 3. `GET /api/refresh-cache`

**Purpose**: Manually refresh cache (all categories)

**Response**:
```json
{
  "success": true,
  "message": "Cache refreshed successfully",
  "stats": {
    "categories": [
      { "category": "technology", "articles": 66, "age": 0 }
    ],
    "totalCached": 7
  },
  "timestamp": "2025-12-23T10:00:00Z"
}
```

**Flow**:
```
1. Call prefetchAllCategories()
2. Fetch all 7 categories in parallel
3. Update cache for each
4. Return stats
```

**Use Cases**:
- Manual refresh via browser
- Vercel Cron job (future)
- Testing cache behavior

### 4. `GET /api/admin-stats`

**Purpose**: Get comprehensive system health metrics and monitoring data

**Response**:
```json
{
  "redis": { "available": true, "mode": "Redis (Upstash)" },
  "newsCache": {
    "summary": {
      "totalArticles": 528,
      "rankedArticles": 526,
      "validationRate": 99.6
    },
    "byCategory": { /* detailed breakdown */ }
  },
  "threadCache": {
    "summary": { "totalThreads": 56, "coverage": "233%" }
  },
  "dataFlow": {
    "step1_newsFetch": { "status": "complete", "articles": 528 },
    "step2_aiRanking": { "status": "complete", "coverage": 99.6 },
    "step3_threadPregen": { "status": "complete", "coverage": 233 }
  },
  "sourceBreakdown": {
    "newsapi": 245,
    "gnews": 183,
    "rss": 100
  },
  "githubActions": { /* workflow status */ }
}
```

**Provides**:
- Cache health and article counts
- Source distribution (NewsAPI/GNews/RSS)
- Thread pre-generation coverage
- GitHub Actions workflow monitoring
- Data flow pipeline status

### 5. `POST /api/auth-check`

**Purpose**: Validate password and set auth cookie

**Request Body**:
```json
{
  "password": "user_entered_password"
}
```

**Response (Success)**:
```json
{
  "success": true
}
```

**Response (Failure)**:
```json
{
  "success": false,
  "message": "Invalid password"
}
```

**Flow**:
```
1. Compare password with SITE_PASSWORD env var
2. If valid:
   - Set httpOnly cookie (site-auth=authenticated)
   - maxAge: 7 days
   - Return success
3. If invalid:
   - Return error (401)
```

**Cookie Configuration**:
```typescript
cookies().set('site-auth', 'authenticated', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: '/',
});
```

---

## 🎨 State Management Patterns

### 1. Article Fetching (Infinite Scroll)

**Pattern**: `useCallback` + `useRef` lock + `useInView` trigger

```typescript
// Lock to prevent race conditions
const isLoadingRef = useRef(false);

// Memoized fetch function
const fetchPage = useCallback(async (page: number, isReset: boolean) => {
  if (isLoadingRef.current) return; // Check lock
  isLoadingRef.current = true;      // Acquire lock
  
  try {
    const response = await axios.get('/api/news', { params: { category, page } });
    setArticles(prev => isReset ? response.data.articles : [...prev, ...response.data.articles]);
  } finally {
    isLoadingRef.current = false;   // Release lock
  }
}, [category]);

// Intersection observer trigger
const { ref, inView } = useInView({ threshold: 0 });

useEffect(() => {
  if (inView && hasMore && !loading) {
    fetchPage(page, false);
  }
}, [inView, hasMore, loading, page]);
```

**Why This Pattern**:
- `useCallback`: Prevents function recreation on every render
- `useRef`: Synchronous lock (useState would be async)
- `useInView`: Triggers when sentinel element visible
- `isReset`: Distinguishes category change (reset) from scroll (append)

### 2. Thread Generation (Async State)

**Pattern**: Multi-state tracking with error handling

```typescript
const [activeArticle, setActiveArticle] = useState<Article | null>(null);
const [threadContent, setThreadContent] = useState<string | null>(null);
const [loadingThread, setLoadingThread] = useState(false);

const handleThreadSelect = async (article: Article) => {
  setActiveArticle(article);
  setThreadContent(null);  // Clear previous content
  setLoadingThread(true);
  
  try {
    const response = await axios.post('/api/generate', {
      title: article.title,
      description: article.description,
      content: article.content
    });
    setThreadContent(response.data.thread);
  } catch (error) {
    console.error('Failed to generate thread:', error);
    setThreadContent('Failed to generate briefing. Please try again.');
  } finally {
    setLoadingThread(false);
  }
};
```

**Why This Pattern**:
- Separate `loading` and `content` states
- Clear previous content before loading new
- Error handling with fallback message
- `finally` ensures loading state always cleared

### 3. Mobile Drawer Body Scroll Lock

**Pattern**: `useEffect` with DOM manipulation

```typescript
useEffect(() => {
  if (typeof window === 'undefined') return;
  
  if (activeArticle) {
    // Lock body scroll when drawer open
    document.body.style.overflow = 'hidden';
  } else {
    // Restore scroll when drawer closed
    document.body.style.overflow = '';
  }
  
  // Cleanup on unmount
  return () => {
    document.body.style.overflow = '';
  };
}, [activeArticle]);
```

**Why This Pattern**:
- Prevents background scroll on mobile
- Cleanup ensures scroll restored
- SSR check (`typeof window`)

### 4. Auto-Refresh (Background Timer)

**Pattern**: `setInterval` in `useEffect` with cleanup

```typescript
useEffect(() => {
  const refreshInterval = setInterval(() => {
    console.log('Auto-refreshing news...');
    if (category === 'Home') {
      fetchDashboard();
    } else {
      fetchPage(1, true);
    }
  }, 7200000); // 2 hours
  
  return () => clearInterval(refreshInterval);
}, [category, fetchDashboard, fetchPage]);
```

**Why This Pattern**:
- Keeps content fresh without user action
- Cleanup prevents memory leaks
- Respects current category

---

## 🎨 Styling & UI Conventions

### Tailwind Configuration

**Theme** (Pure White):
```css
:root {
  --background: 0 0% 100%;        /* Pure white */
  --foreground: 240 10% 3.9%;     /* Near black */
  --primary: 240 5.9% 10%;        /* Dark gray */
  --border: 240 5.9% 90%;         /* Light gray */
  --radius: 0.75rem;              /* 12px */
}
```

**No Dark Mode**: Intentionally removed for consistent branding

### Component Patterns

#### 1. Card Hover States

```tsx
className={cn(
  "transition-colors",
  isActive 
    ? "bg-primary/5 border-primary/20"    // Active
    : "hover:bg-muted/20"                 // Hover
)}
```

#### 2. Responsive Grid

```tsx
// Desktop: 3 columns, Tablet: 2 columns, Mobile: 1 column
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
```

#### 3. Sticky Header

```tsx
className="sticky top-0 z-50 bg-background/95 backdrop-blur-md"
```

#### 4. Fixed Height Cards

```tsx
// Ensures consistent layout regardless of content
className="h-[96px]"
```

#### 5. Scrollable Containers

```tsx
// Parent: fixed height
className="h-[calc(100vh-6rem)]"

// Child: scrollable
className="overflow-y-auto flex-1"
```

### Icon Usage (Lucide React)

```tsx
import { Flame, Bot, Sparkles, X, RefreshCcw, ChevronRight } from 'lucide-react';

// Standard sizes
<Flame className="w-4 h-4" />      // Small (16px)
<Bot className="h-6 w-6" />        // Medium (24px)
```

### Animation Patterns (Framer Motion)

```tsx
// Fade + slide
<motion.div
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: 20 }}
>

// Slide up (mobile drawer)
<motion.div
  initial={{ y: "100%" }}
  animate={{ y: 0 }}
  exit={{ y: "100%" }}
  transition={{ type: "spring", damping: 25, stiffness: 200 }}
>
```

### Typography

```tsx
// Headings
className="text-lg font-bold"              // H1 (18px)
className="text-base font-bold"            // H2 (16px)
className="text-sm font-medium"            // H3 (14px)

// Body
className="text-sm"                        // Body (14px)
className="text-xs text-muted-foreground"  // Caption (12px)

// Line clamping
className="line-clamp-2"                   // Max 2 lines
```

---

## ⚠️ Known Issues & Workarounds

### 1. Hydration Mismatch (Date Formatting)

**Issue**: `formatDistanceToNow` causes hydration error (server/client mismatch)

**Workaround**:
```tsx
<span suppressHydrationWarning>
  {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
</span>
```

**Why**: Server renders at build time, client renders at runtime → different timestamps

### 2. Safari Image Sizing

**Issue**: Images in article cards don't respect `w-full h-full` in Safari

**Workaround**:
```tsx
<img
  src={article.urlToImage}
  className="w-full h-full object-cover"
  style={{ width: '100%', height: '100%' }}  // Force with inline styles
/>
```

**Why**: Safari bug with flexbox + aspect-ratio + img sizing

### 3. Vercel SSO Blocking API Routes

**Issue**: Vercel's deployment protection blocked `/api/*` routes

**Solution**: Disabled Vercel SSO, implemented custom middleware

**Command Used**:
```bash
curl -X PATCH "https://api.vercel.com/v9/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ssoProtection": null}'
```

### 4. NewsAPI Rate Limits

**Issue**: Developer plan limited to 100 requests/24 hours

**Solution**: Implemented aggressive caching (2-hour TTL)

**Result**: 99% reduction in API calls

### 5. Gemini Model Availability

**Issue**: `gemini-1.5-flash` returned 404 errors

**Solution**: Switched to `gemini-2.5-flash` (latest model)

**Debug Process**:
```typescript
// Listed available models
const models = await genAI.listModels();
console.log(models.map(m => m.name));

// Found: gemini-2.5-flash
```

### 6. Desktop Sidebar Not Scrollable

**Issue**: Parent container had `overflow-hidden`

**Solution**: Removed `overflow-hidden`, changed `max-h` to `h`

```tsx
// Before
className="max-h-[calc(100vh-6rem)] overflow-hidden"

// After
className="h-[calc(100vh-6rem)]"
```

### 7. Mobile Background Scrolling

**Issue**: Background content scrolled when drawer open

**Solution**: Lock body scroll with `useEffect`

```typescript
useEffect(() => {
  if (activeArticle) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
}, [activeArticle]);
```

### 8. Loading Steps Cycling Continuously

**Issue**: Loading steps cycled infinitely (looked fake)

**Solution**: Stop at last step instead of cycling

```typescript
setStepIndex((prev) => {
  if (prev < LOADING_STEPS.length - 1) {
    return prev + 1;
  }
  return prev; // Stop at last step
});
```

### 9. Multiple Vercel Projects (CRITICAL)

**Issue**: There are TWO Vercel projects for this codebase:
- `aithreads` → https://aithreads-three.vercel.app
- `aithreads-prod` → https://aithreads-prod.vercel.app

**Problem**: Env vars added to wrong project don't affect production.

**Solution**: Always verify which project CLI is linked to:
```bash
# Check current link
cat .vercel/project.json

# List all projects
vercel projects

# Link to correct project
vercel link --yes --project=aithreads-prod

# Check env vars for correct project
vercel env ls
```

**Warning**: When adding env vars, always verify you're in the correct project context!

### 10. Module-Level Env Vars in Serverless

**Issue**: Reading env vars at module load time can fail in serverless:
```typescript
// BAD - May be cached as undefined
const API_KEY = process.env.MY_API_KEY;

export function myFunction() {
  // API_KEY might be undefined even if env var is set
}
```

**Solution**: Read env vars inside functions:
```typescript
// GOOD - Always reads current value
export function myFunction() {
  const API_KEY = process.env.MY_API_KEY;
  // API_KEY will have the correct value
}
```

**File Fixed**: `src/lib/sheets-logger.ts`

### 11. Trailing Newlines in Environment Variables

**Issue**: Adding env vars via echo includes trailing newline:
```bash
# BAD - Includes \n at end
echo "value" | vercel env add MY_VAR production
```

**Solution**: Use printf with no newline:
```bash
# GOOD - No trailing newline
printf '%s' 'value' | vercel env add MY_VAR production
```

### 12. OpenGraph Metadata for Crawlers

**Issue**: Social media link previews don't show article info

**Solution**:
1. Dynamic metadata in `src/app/thread/layout.tsx` with `generateMetadata()`
2. Bot detection in middleware to bypass auth for crawlers

**Allowed Bots** (in `src/middleware.ts`):
```typescript
const ALLOWED_BOTS = [
  'facebookexternalhit', 'Twitterbot', 'LinkedInBot',
  'Slackbot', 'Discordbot', 'WhatsApp', 'Googlebot', etc.
];
```

---

## 🔄 Development Workflow

### Branch Strategy

```
main (production)  ──────●────●────●────●───→  https://aithreads-three.vercel.app
                          ↑    ↑    ↑    ↑
                          │    │    │    │
dev (development)  ●──●──●────●────●────●───→  https://aithreads-git-dev-*.vercel.app
```

### Typical Workflow

```bash
# 1. Switch to dev
git checkout dev

# 2. Make changes
# ... edit files ...

# 3. Test locally
npm run dev

# 4. Commit and push
git add .
git commit -m "feat: new feature"
git push origin dev

# 5. Vercel auto-deploys to preview URL
# Test on preview

# 6. When ready, merge to main
git checkout main
git merge dev
git push origin main

# 7. Vercel auto-deploys to production
```

### Environment Variables

**Local** (`.env.local`):
```bash
NEWS_API_KEY=your_newsapi_key_here
GEMINI_API_KEY=your_gemini_key_here
SITE_PASSWORD=your_password_here
```

**Vercel** (all environments):
```bash
vercel env add NEWS_API_KEY production
vercel env add NEWS_API_KEY preview
vercel env add NEWS_API_KEY development
```

### Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run lint             # Run ESLint
npx tsc --noEmit         # Type check

# Deployment
vercel                   # Deploy to preview
vercel --prod            # Deploy to production
vercel ls                # List deployments
vercel logs <url>        # View logs

# Git
git checkout dev         # Switch to dev branch
git checkout main        # Switch to main branch
git merge dev            # Merge dev into current branch
git push origin <branch> # Push to GitHub
```

---

## 🧪 Testing & Debugging

### Manual Testing Checklist

```
□ Login page works
□ All 7 categories load
□ Articles display correctly
□ Infinite scroll works
□ AI thread generation works
□ Desktop sidebar scrolls
□ Mobile drawer opens/closes
□ Mobile drawer doesn't scroll background
□ Source links open in new tab
□ Images load (check Safari)
□ No console errors
□ Cache refresh endpoint works
```

### Debugging Tools

**1. Check API Responses**:
```bash
# Test news API
curl 'http://localhost:3000/api/news?category=technology&pageSize=3'

# Test cache refresh
curl 'http://localhost:3000/api/refresh-cache'

# Test AI generation
curl -X POST 'http://localhost:3000/api/generate' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","description":"Test","content":"Test"}'
```

**2. Check Cache Stats**:
```bash
curl 'http://localhost:3000/api/refresh-cache' | jq '.stats'
```

**3. Check Vercel Logs**:
```bash
vercel logs <deployment-url>
```

**4. Check Browser Console**:
- Open DevTools → Console
- Look for errors (red)
- Check network tab for failed requests

### Common Errors

**"No articles available"**:
- Check NewsAPI key is set
- Check cache is initialized
- Check API rate limits not exceeded
- Check `/api/news` endpoint works

**"Failed to generate thread"**:
- Check Gemini API key is set
- Check model name is correct (`gemini-2.5-flash`)
- Check article data is valid

**"Hydration error"**:
- Add `suppressHydrationWarning` to dynamic content
- Check for server/client rendering mismatches

**"Sidebar not scrolling"**:
- Check parent has fixed height
- Check parent doesn't have `overflow-hidden`
- Check child has `overflow-y-auto`

---

## 🚀 Deployment & Environment

### Vercel Configuration

**⚠️ IMPORTANT: There are TWO Vercel projects:**

| Project | URL | Use Case |
|---------|-----|----------|
| `aithreads-prod` | https://aithreads-prod.vercel.app | **PRODUCTION** - Use this |
| `aithreads` | https://aithreads-three.vercel.app | Legacy/development |

**Always verify project link before deploying:**
```bash
vercel link --yes --project=aithreads-prod
vercel env ls  # Confirm correct project
```

**Team**: `awellbeehavedhives-projects`
**Framework**: Next.js 16
**Build Command**: `npm run build`
**Output Directory**: `.next`
**Install Command**: `npm install`

### Environment Variables

| Variable | Required | Scope | Description |
|----------|----------|-------|-------------|
| `NEWS_API_KEY` | ✅ | All | NewsAPI.org API key |
| `GEMINI_API_KEY` | ✅ | All | Google Gemini API key |
| `SITE_PASSWORD` | ✅ | All | Password for site access |

### Deployment URLs

**Production**:
- Main: https://aithreads-three.vercel.app
- Branch: `main`
- Auto-deploy: ✅

**Preview (Dev)**:
- Pattern: `https://aithreads-git-dev-*.vercel.app`
- Branch: `dev`
- Auto-deploy: ✅

### Build Configuration

**`next.config.ts`**:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No special config needed
};

export default nextConfig;
```

**`vercel.json`** (not used, defaults are fine)

### Middleware Configuration

**`src/middleware.ts`**:
```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg).*)',
  ],
};
```

**Excludes**:
- Static files (`_next/static`)
- Images (`_next/image`, `*.png`, `*.jpg`)
- Favicon
- API routes (handled in middleware logic)

---

## ⚡ Performance Optimizations

### 1. Backend Caching

**Impact**: 99% API call reduction, 20-40x faster responses

**Implementation**:
- In-memory cache with 2-hour TTL
- Pending fetch deduplication
- Startup prefetching

**Metrics**:
```
Before: 1000-2000ms per request
After:  30-50ms (cached)
```

### 2. Image Lazy Loading

**Implementation**:
```tsx
<img loading="lazy" />
```

**Impact**: Faster initial page load

### 3. Intersection Observer (Infinite Scroll)

**Implementation**:
```typescript
const { ref, inView } = useInView({
  threshold: 0,
  rootMargin: '400px', // Load before user reaches bottom
});
```

**Impact**: Smooth scrolling, no janky loading

### 4. Code Splitting

**Automatic** (Next.js default):
- Route-based splitting
- Dynamic imports for heavy components

### 5. Memoization

**Implementation**:
```typescript
const fetchPage = useCallback(async () => { ... }, [category]);
```

**Impact**: Prevents unnecessary re-renders

### 6. Turbopack

**Enabled** (Next.js 16 default):
- Faster builds (3-5x)
- Faster HMR (Hot Module Replacement)

---

## 🔐 Security Considerations

### 0. Git Repository Hygiene (CRITICAL)

**Policy**: Keep public GitHub repository clean with minimal commit history.

**Why**:
- Prevents accidental credential exposure in commit history
- Simplifies security audits
- Reduces attack surface from leaked secrets in old commits

**Current Setup**:
```
GitHub (public):  Single clean commit - fresh start
Local (private):  Full history preserved in local branches
```

**How to Maintain**:

When making changes that should go to production:
```bash
# 1. Make your changes on main branch
git add .
git commit -m "feat: your feature"

# 2. Squash into clean history before pushing
git checkout --orphan temp-branch
git add -A
git commit -m "Initial commit: AIThreads - AI-powered news aggregation"
git branch -D main
git branch -m main

# 3. Force push clean history (keeps local branches intact)
git push origin main --force
```

**Alternative (preserve local history)**:
```bash
# Create orphan with current code
git checkout --orphan clean-main
git add -A
git commit -m "Initial commit: AIThreads - AI-powered news aggregation"

# Push only clean branch to remote
git push origin clean-main:main --force

# Rename branches locally
git branch -m main old-main
git branch -m clean-main main
git branch -u origin/main main
```

**Local Branches** (preserved, not pushed):
- `old-main` - Original history backup
- `dev`, `feature/*` - Development branches
- `claude/*` - AI agent work branches

**Rules**:
1. **NEVER** commit credentials, API keys, or secrets
2. **NEVER** commit `.env` files (use `.env.local`, gitignored)
3. **ALWAYS** check `git diff` before committing
4. **PERIODICALLY** squash public history to single commit
5. If credentials are accidentally committed, rotate them immediately AND clean history

**Emergency: Credential Leak Response**:
```bash
# 1. Immediately rotate the leaked credential
# 2. Clean git history:
git checkout --orphan clean
git add -A
git commit -m "Initial commit: AIThreads"
git branch -D main
git branch -m main
git push origin main --force

# 3. Verify on GitHub that history is clean
# 4. Update any services using the old credential
```

### 1. API Key Protection

**Storage**: Environment variables (never committed)

**Access**:
```typescript
const API_KEY = process.env.NEWS_API_KEY; // Server-side only
```

**Never**:
- Commit to Git
- Expose in client-side code
- Log to console in production

### 2. Authentication

**Method**: Cookie-based sessions

**Cookie Configuration**:
```typescript
{
  httpOnly: true,              // Not accessible via JavaScript
  secure: NODE_ENV === 'production', // HTTPS only in prod
  maxAge: 60 * 60 * 24 * 7,   // 7 days
  path: '/',                   // Site-wide
}
```

**Middleware Protection**:
- All routes protected except `/login` and `/api/*`
- Cookie checked on every request
- Redirect to login if invalid

### 3. XSS Prevention

**React** (automatic):
- Escapes all user input
- Sanitizes HTML

**Markdown Rendering**:
```typescript
<ReactMarkdown remarkPlugins={[remarkGfm]}>
  {content} // Sanitized by react-markdown
</ReactMarkdown>
```

### 4. CSRF Protection

**Next.js** (automatic):
- CSRF tokens on forms
- SameSite cookies

### 5. Rate Limiting

**NewsAPI**: 100 requests/24 hours (handled by caching)

**Gemini**: Free tier limits (no explicit handling)

**Future**: Consider implementing rate limiting on `/api/generate`

---

## 🛠️ Common Tasks & Patterns

### Adding a New Category

1. **Update categories array**:
```typescript
// src/app/page.tsx
const CATEGORIES = [
  'Home',
  'Technology',
  'Science',
  'Business',
  'Health',
  'Entertainment',
  'Sports',
  'YourNewCategory', // Add here
];
```

2. **Update cache prefetch**:
```typescript
// src/lib/news-cache.ts
const categories = [
  'general',
  'technology',
  'science',
  'business',
  'health',
  'entertainment',
  'sports',
  'yournewcategory', // Add here (lowercase)
];
```

3. **Verify NewsAPI supports the category**:
- Check https://newsapi.org/docs/endpoints/top-headlines
- Valid categories: business, entertainment, general, health, science, sports, technology

### Changing Cache Duration

```typescript
// src/lib/news-cache.ts
const CACHE_DURATION = 2 * 60 * 60 * 1000; // Change this (milliseconds)

// Examples:
// 1 hour:  1 * 60 * 60 * 1000
// 30 min:  30 * 60 * 1000
// 4 hours: 4 * 60 * 60 * 1000
```

### Modifying AI Prompt

```typescript
// src/app/api/generate/route.ts
const prompt = `
Your instructions here...

Structure:
- Section 1
- Section 2

Input Article:
Title: ${title}
Description: ${description}
Content: ${content}
`;
```

**Tips**:
- Be specific about tone and style
- Provide clear structure requirements
- Include examples if needed
- Test with various article types

### Adding a New UI Component

1. **Create component file**:
```bash
# shadcn/ui component
npx shadcn@latest add <component-name>

# Custom component
touch src/components/my-component.tsx
```

2. **Follow naming convention**:
```typescript
// PascalCase for component name
export function MyComponent({ prop1, prop2 }: MyComponentProps) {
  return <div>...</div>;
}

// Interface for props
interface MyComponentProps {
  prop1: string;
  prop2: number;
}
```

3. **Use Tailwind for styling**:
```tsx
<div className="flex items-center gap-2 p-4 rounded-lg border">
  {/* content */}
</div>
```

### Debugging Cache Issues

```typescript
// Add logging to news-cache.ts
export async function getCachedNews(category: string) {
  console.log(`[Cache] Checking cache for ${category}`);
  const cached = cache[category];
  
  if (cached) {
    const age = Math.round((Date.now() - cached.timestamp) / 1000 / 60);
    console.log(`[Cache] Found cached data (age: ${age}min)`);
  } else {
    console.log(`[Cache] No cached data, fetching...`);
  }
  
  // ... rest of function
}
```

---

## 📝 Decision Log

### December 23, 2025

**Decision**: Implement backend caching system

**Context**: NewsAPI developer plan limited to 100 requests/24h. With multiple users, would hit limit quickly.

**Options Considered**:
1. Upgrade to paid NewsAPI plan ($449/month)
2. Implement frontend caching (localStorage)
3. Implement backend caching (in-memory)

**Decision**: Option 3 (backend caching)

**Rationale**:
- Cost-effective (free)
- Serves all users from single cache
- 99% API call reduction
- Fast response times (30-50ms)

**Trade-offs**:
- Cache resets on serverless cold start
- Slightly stale data (max 2 hours)
- More complex implementation

---

### December 23, 2025

**Decision**: Use split-screen UI (desktop) + drawer (mobile)

**Context**: Users want to browse articles while reading AI threads.

**Options Considered**:
1. Modal overlay (all devices)
2. Full-page navigation
3. Split-screen (desktop) + drawer (mobile)

**Decision**: Option 3

**Rationale**:
- Best UX for each device type
- No layout shift on desktop
- Natural mobile pattern (drawer)

**Trade-offs**:
- More complex state management
- Two UI patterns to maintain

---

### December 23, 2025

**Decision**: Disable Vercel SSO, use custom middleware

**Context**: Vercel's deployment protection blocked API routes, causing "no articles" error.

**Options Considered**:
1. Keep Vercel SSO, make API routes public
2. Disable Vercel SSO, implement custom auth
3. Use Vercel's API key authentication

**Decision**: Option 2

**Rationale**:
- Full control over authentication
- API routes accessible after login
- Simple cookie-based sessions

**Trade-offs**:
- Custom implementation (more code)
- No built-in SSO features

---

### December 24, 2025

**Decision**: Use `gemini-2.5-flash` model

**Context**: `gemini-1.5-flash` returned 404 errors.

**Options Considered**:
1. Use `gemini-pro` (older, more expensive)
2. Use `gemini-2.5-flash` (latest)
3. Switch to different AI provider

**Decision**: Option 2

**Rationale**:
- Latest model with best performance
- Free tier available
- Fast generation (~5-10 seconds)

**Trade-offs**:
- Model may change/deprecate in future
- Need to monitor API changes

---

### December 24, 2025

**Decision**: Create two-branch workflow (main + dev)

**Context**: User wants to experiment without affecting production.

**Options Considered**:
1. Single branch (main only)
2. Two branches (main + dev)
3. Multiple feature branches

**Decision**: Option 2

**Rationale**:
- Safe experimentation on dev
- Production stays stable
- Automatic preview deployments
- Simple workflow

**Trade-offs**:
- Need to keep branches in sync
- Merge conflicts possible

---

### December 29, 2025

**Decision**: Implement SOTA news sorting algorithm with fetch-time binning

**Context**: Need to prioritize high-quality recent content like NYT/WSJ.

**Options Considered**:
1. Simple recency sort (newest first)
2. AI score only (best quality first)
3. Hybrid: recency + quality with binning

**Decision**: Option 3 (SOTA binning algorithm)

**Rationale**:
- Mirrors professional news sites (NYT, WSJ, etc.)
- Ensures fresh content gets visibility
- High-quality older articles still surface
- Balances timeliness with quality

**Implementation**:
```typescript
// Bin by fetch time (hourly)
const fetchBin = Math.floor((now - publishedTime) / ONE_HOUR);

// Apply quality thresholds by age
const threshold = bin === 0 ? 0 : (bin <= 6 ? 80 : 85);

// Interleave bins for optimal flow
```

**Trade-offs**:
- ✅ Pro: Professional-quality sorting
- ✅ Pro: Fresh content prioritized
- ✅ Pro: Quality maintained
- ❌ Con: More complex algorithm

---

### December 29, 2025

**Decision**: Multi-source news aggregation with image filtering

**Context**: Single NewsAPI source was limiting coverage and quality.

**Options Considered**:
1. Upgrade NewsAPI plan ($449/month)
2. Add GNews API (free, 60K sources)
3. Add RSS feeds (free, premium content)
4. All of the above + deduplication

**Decision**: Option 4 (multi-source + filtering)

**Rationale**:
- Comprehensive coverage (3 APIs + 10+ RSS feeds)
- Cost-effective (mostly free)
- Better AI ranking (diverse content)
- Resilience (multiple sources)

**Implementation**:
```typescript
// Filter out articles without images at source
const articlesWithImages = allArticles.filter(a =>
  a.urlToImage && a.urlToImage.trim() !== ''
);

// Deduplicate by URL + title similarity
const deduplicated = deduplicateArticles(articlesWithImages);
```

**Trade-offs**:
- ✅ Pro: Better coverage and quality
- ✅ Pro: Cost-effective
- ✅ Pro: No more imageless articles
- ❌ Con: More complex deduplication
- ❌ Con: Higher API management overhead

---

### January 4, 2026

**Decision**: Implement SOTA sorting with time decay and category diversity

**Context**: Need Twitter/X-style sorting with recency decay and category balance.

**Options Considered**:
1. Pure AI score sorting
2. Round-robin category interleaving
3. Time-decayed score with diversity constraints

**Decision**: Option 3

**Implementation** (`src/lib/sota-sorting.ts`):
```typescript
// Time decay: 12-hour half-life
function calculateTimeDecay(ageInHours: number): number {
  return Math.pow(0.5, ageInHours / 12);
}

// Effective score = aiScore × timeDecay
function getEffectiveScore(aiScore: number, ageInHours: number): number {
  return aiScore * calculateTimeDecay(ageInHours);
}

// Diversity: max 2 consecutive from same category
function sortWithDiversity(articles: T[]): T[] {
  // Score-first sorting with diversity constraint
}
```

**Trade-offs**:
- ✅ Pro: Fresh content prioritized naturally
- ✅ Pro: Category diversity maintained
- ✅ Pro: No low-scoring articles appearing early
- ❌ Con: More complex scoring logic

---

### January 4, 2026

**Decision**: Add Primary Sources section to thread generation

**Context**: User wanted authoritative "source of truth" citations.

**Implementation** (`src/app/api/generate/route.ts`):
```markdown
## Primary Sources
- Scientific: Peer-reviewed papers, research institution press releases
- Government: Official statements, legislation, court filings
- Corporate: SEC filings, earnings reports, press releases
- Health: CDC reports, WHO statements, medical journals
```

**Trade-offs**:
- ✅ Pro: Higher credibility and transparency
- ✅ Pro: Users can verify claims
- ❌ Con: Longer generation time

---

### January 4, 2026

**Decision**: First principles reasoning in "Explore Further" analysis

**Context**: User wanted deeper analytical approach without mentioning methodology.

**Implementation** (`src/app/api/generate-analysis/route.ts`):
```
**Broader Implications**
- Break down to fundamental truths
- Identify underlying forces, incentives, constraints
- Reason from ground up: what must logically follow?
- Consider second and third-order effects

Do NOT mention "first principles" in output - just apply the reasoning.
```

---

### January 4, 2026

**Decision**: Consolidate on `aithreads-prod` for production deployments

**Context**: Two Vercel projects caused env var confusion.

**Recommendation**:
- **Production**: `aithreads-prod` → https://aithreads-prod.vercel.app
- **Development**: Consider deprecating `aithreads` or clearly documenting its purpose
- **Always**: Verify project link before adding env vars

**Commands**:
```bash
vercel link --yes --project=aithreads-prod
vercel env ls  # Confirm correct project
```

---

## 🎓 Learning Resources

### Next.js 16

- **Docs**: https://nextjs.org/docs
- **Turbopack**: https://nextjs.org/docs/architecture/turbopack
- **API Routes**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- **Middleware**: https://nextjs.org/docs/app/building-your-application/routing/middleware

### Tailwind CSS

- **Docs**: https://tailwindcss.com/docs
- **Cheat Sheet**: https://nerdcave.com/tailwind-cheat-sheet

### shadcn/ui

- **Docs**: https://ui.shadcn.com
- **Components**: https://ui.shadcn.com/docs/components

### Framer Motion

- **Docs**: https://www.framer.com/motion
- **Examples**: https://www.framer.com/motion/examples

### NewsAPI

- **Docs**: https://newsapi.org/docs
- **Endpoints**: https://newsapi.org/docs/endpoints/top-headlines

### Google Gemini

- **Docs**: https://ai.google.dev/docs
- **API Reference**: https://ai.google.dev/api/rest
- **Models**: https://ai.google.dev/models/gemini

---

## 🚨 Emergency Procedures

### Production is Down

1. **Check Vercel status**: https://vercel.com/status
2. **Check deployment logs**: `vercel logs <url>`
3. **Rollback to previous deployment**:
   ```bash
   vercel ls  # Find working deployment
   vercel promote <deployment-url>
   ```

### API Rate Limit Hit

1. **Check cache is working**:
   ```bash
   curl 'https://aithreads-three.vercel.app/api/refresh-cache'
   ```
2. **Verify cache stats show recent data**
3. **If cache broken, fix and redeploy**

### Environment Variables Missing

1. **Check Vercel dashboard**: https://vercel.com/dashboard
2. **Re-add variables**:
   ```bash
   vercel env add NEWS_API_KEY production
   ```
3. **Redeploy**: `vercel --prod`

### Database/Cache Corruption

**Note**: We don't have a persistent database. Cache is in-memory and resets on restart.

**If cache seems broken**:
1. Redeploy (forces cold start, clears cache)
2. Check `/api/refresh-cache` endpoint works
3. Verify NewsAPI key is valid

---

## 📞 Contact & Support

### For AI Agents

If you encounter issues or need clarification:
1. Check this document first
2. Check `DEVELOPMENT.md` for workflow questions
3. Check `README.md` for user-facing documentation
4. Review Git commit history for context
5. Check Vercel deployment logs

### Key Files to Reference

- **Architecture**: This file (AGENT.md)
- **Workflow**: DEVELOPMENT.md
- **User Docs**: README.md
- **Caching Logic**: src/lib/news-cache.ts
- **Main App**: src/app/page.tsx
- **API Routes**: src/app/api/*/route.ts

---

## ✅ Checklist for New Agents

When starting work on this codebase:

- [ ] Read this entire document
- [ ] Review DEVELOPMENT.md for workflow
- [ ] Check README.md for user-facing features
- [ ] Run `npm install` to install dependencies
- [ ] Create `.env.local` with API keys
- [ ] Run `npm run dev` to start local server
- [ ] Test all 7 categories load
- [ ] Test AI thread generation works
- [ ] Check desktop sidebar scrolls
- [ ] Check mobile drawer works
- [ ] Review recent Git commits for context
- [ ] Check Vercel dashboard for deployment status

---

**Last Updated**: January 16, 2026
**Maintainer**: AI Agent (Cursor/Claude)
**Version**: 1.2.0

---

**End of AI Agent Context Document**

