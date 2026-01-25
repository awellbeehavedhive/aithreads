# ThreadBot

AI-powered news aggregator that creates smart briefings from multiple sources.

**Live:** [aithreadbot.com](https://aithreadbot.com)

<img width="1362" height="946" alt="ThreadBot Homepage" src="https://github.com/user-attachments/assets/0c0d9c3b-1831-47fc-a6ab-a04e377d4ada" />

## Features

- **AI News Briefings** - Click any article to get an AI-generated briefing with verified facts and primary sources
- **Multi-Source Aggregation** - Pulls from 50+ RSS feeds including Reuters, BBC, NPR, Guardian, and more
- **Topic Discovery** - Clusters related articles from multiple sources into unified topics
- **X-Inspired Ranking** - Multi-factor weighted scoring: quality, authority, freshness, and clickbait detection

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA INGESTION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │  RSS Feeds   │    │   NewsAPI    │    │    GNews     │                 │
│   │   (50+)      │    │  (optional)  │    │  (optional)  │                 │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                 │
│          │                   │                   │                          │
│          └───────────────────┼───────────────────┘                          │
│                              ▼                                              │
│                   ┌──────────────────┐                                      │
│                   │ Multi-Source     │                                      │
│                   │ Fetcher          │                                      │
│                   │ (deduplication)  │                                      │
│                   └────────┬─────────┘                                      │
│                            │                                                │
└────────────────────────────┼────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PROCESSING PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────┐         ┌──────────────────┐                        │
│   │   AI Scoring     │         │ Topic Clustering │                        │
│   │   (Gemini 2.0)   │         │                  │                        │
│   │                  │         │ • Title matching │                        │
│   │ • Quality 0-100  │         │ • Source merging │                        │
│   │ • Spam detection │         │ • Image select   │                        │
│   └────────┬─────────┘         └────────┬─────────┘                        │
│            │                            │                                   │
│            └──────────┬─────────────────┘                                   │
│                       ▼                                                     │
│            ┌──────────────────┐                                             │
│            │ Weighted Ranking │                                             │
│            │                  │                                             │
│            │ Score = Quality (40%)                                          │
│            │       + Authority (15%)                                        │
│            │       + Freshness (20%)                                        │
│            │       × Time Decay (15%)                                       │
│            │       - Clickbait (-10%)                                       │
│            │       - Duplicate Source (-10%)                                │
│            └────────┬─────────┘                                             │
│                     │                                                       │
└─────────────────────┼───────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              STORAGE & CACHING                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────┐         ┌──────────────────┐                        │
│   │   Redis Cache    │         │  Article Store   │                        │
│   │   (Upstash KV)   │         │  (Permanent)     │                        │
│   │                  │         │                  │                        │
│   │ • Category lists │         │ • Individual     │                        │
│   │ • 4-hour TTL     │         │   articles by    │                        │
│   │ • Fast homepage  │         │   URL hash       │                        │
│   └──────────────────┘         │ • Never expires  │                        │
│                                └──────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────┐         ┌──────────────────┐                        │
│   │     Homepage     │         │   Thread Page    │                        │
│   │                  │         │                  │                        │
│   │ • Unified feed   │         │ • AI Briefing    │                        │
│   │ • Topics first   │         │ • Key facts      │                        │
│   │ • Articles grid  │         │ • Sources        │                        │
│   └──────────────────┘         └──────────────────┘                        │
│                                                                             │
│   ┌──────────────────┐         ┌──────────────────┐                        │
│   │   Topic Page     │         │   Discover       │                        │
│   │                  │         │                  │                        │
│   │ • All sources    │         │ • All topics     │                        │
│   │ • AI summary     │         │ • Browse & filter│                        │
│   │ • Timeline       │         │                  │                        │
│   └──────────────────┘         └──────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │────▶│ Vercel  │────▶│  Redis  │────▶│ Gemini  │────▶│ Browser │
│ Request │     │ Edge    │     │ Cache   │     │ AI API  │     │ Response│
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
                     │
                     │ Cache Miss?
                     ▼
              ┌─────────────┐
              │ RSS Feeds   │
              │ NewsAPI     │
              │ GNews       │
              └─────────────┘
```

## Background Jobs (GitHub Actions)

```
Every 4 Hours                    Every 2 Hours
┌─────────────────┐             ┌─────────────────┐
│ refresh-cache   │             │ cluster-topics  │
│                 │             │                 │
│ 1. Fetch RSS    │             │ 1. Load cached  │
│ 2. Deduplicate  │             │    articles     │
│ 3. AI Score     │             │ 2. Group by     │
│ 4. Store Redis  │             │    similarity   │
│                 │             │ 3. Generate     │
│                 │             │    summaries    │
└─────────────────┘             └─────────────────┘
```

## News Sources

| Category | Sources |
|----------|---------|
| **Tier 1** | Reuters, AP, WSJ, NYT, Washington Post, BBC |
| **Tier 2** | NPR, CNBC, Bloomberg, Guardian, Axios, Politico |
| **Tech** | TechCrunch, Ars Technica, The Verge, Wired |
| **Science** | Nature, Science Daily, Space.com, New Scientist |
| **Health** | WHO, Medical News Today, Mayo Clinic, CDC |
| **International** | Al Jazeera, France 24, Deutsche Welle, Japan Times |

## Weighted Ranking Algorithm

The ranking system uses multiple factors to surface high-quality, timely content:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Quality** | 40% | AI-generated score (0-100) based on content analysis |
| **Authority** | 15% | Source reputation boost (Reuters +17, BBC +15, etc.) |
| **Freshness** | 20% | Time since publication (exponential decay) |
| **Time Decay** | 15% | Multiplier that reduces score over time |
| **Clickbait** | -10% | Penalty for sensational headlines |
| **Diversity** | -10% | Penalty for repeated sources in results |

## Setup

### Prerequisites
- Node.js 20+
- Redis (Upstash recommended)
- Gemini API key

### Environment Variables

```bash
# Required
KV_REST_API_URL=        # Upstash Redis URL
KV_REST_API_TOKEN=      # Upstash Redis token
GEMINI_API_KEY=         # Google Gemini API key

# Optional (increases source coverage)
NEWS_API_KEY=           # NewsAPI.org key
GNEWS_API_KEY=          # GNews.io key
ADMIN_PASSWORD=         # Admin dashboard access
```

### Local Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Homepage (unified feed)
│   ├── thread/            # AI briefing page
│   ├── topics/            # Topic pages
│   │   ├── page.tsx       # Discover all topics
│   │   └── [id]/          # Individual topic
│   └── api/               # API routes
│       ├── news/          # Article fetching
│       ├── topics/        # Topic endpoints
│       └── generate/      # AI briefing generation
├── lib/
│   ├── weighted-scoring.ts     # X-inspired ranking algorithm
│   ├── topic-clustering.ts     # Article grouping logic
│   ├── multi-source-fetcher.ts # RSS/API aggregation
│   ├── article-ranker.ts       # AI scoring with Gemini
│   ├── news-cache.ts           # Redis caching layer
│   └── rss-parser.ts           # 50+ RSS feed configs
scripts/
├── refresh-cache.ts       # Manual cache refresh
└── cluster-topics.ts      # Topic generation
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/news` | GET | Fetch articles by category |
| `/api/topics` | GET | Get all clustered topics |
| `/api/topics/[id]` | GET | Get single topic with sources |
| `/api/generate` | POST | Generate AI briefing |

## License

MIT
