# ThreadBot

AI-powered news aggregator that creates smart briefings from multiple sources.

**Live:** [aithreadbot.com](https://aithreadbot.com)

<img width="1362" height="946" alt="image" src="https://github.com/user-attachments/assets/0c0d9c3b-1831-47fc-a6ab-a04e377d4ada" />


## Features

- **AI News Briefings** - Click any article to get an AI-generated briefing with verified facts and primary sources
- **Multi-Source Aggregation** - Pulls from 20+ RSS feeds including Reuters, BBC, NPR, Guardian, and more
- **Topic Discovery** - Clusters related articles into unified topics
- **Smart Ranking** - AI scores articles 0-100 for quality, with time decay for freshness

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  RSS Feeds (20+)│────▶│  GitHub Actions │────▶│   Redis Cache   │
│  NewsAPI, GNews │     │  (hourly refresh)│     │   (Upstash KV)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              │
│   Gemini 2.0    │◀────│   Next.js App   │◀─────────────┘
│   (AI Briefs)   │────▶│   (Vercel)      │
└─────────────────┘     └─────────────────┘
```

## News Sources

| Category | Sources |
|----------|---------|
| General | Reuters, AP News, BBC, NPR, Guardian |
| Technology | TechCrunch, Ars Technica, The Verge |
| Business | CNBC, Bloomberg, Financial Times |
| Science | Nature, Science Daily, Space.com |
| Health | WHO, Medical News Today, WebMD |

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

# Optional
NEWS_API_KEY=           # NewsAPI.org key (free tier)
GNEWS_API_KEY=          # GNews.io key (free tier)
ADMIN_PASSWORD=         # Admin dashboard password
```

### Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

### Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

## GitHub Actions

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| Background Refresh | Hourly | Fetches articles from all RSS feeds |
| Topic Clustering | Every 2h | Clusters articles into unified topics |
| Google News | Every 3h | Scrapes Google News (experimental) |

## Project Structure

```
src/
├── app/                    # Next.js pages
│   ├── page.tsx           # Homepage
│   ├── thread/            # Article briefing page
│   ├── topics/            # Topic discovery page
│   └── api/               # API routes
├── components/            # React components
├── lib/                   # Core logic
│   ├── multi-source-fetcher.ts  # RSS/API aggregation
│   ├── article-ranker.ts        # AI scoring
│   ├── sota-sorting.ts          # Smart sorting algorithm
│   ├── topic-clustering.ts      # Topic aggregation
│   └── thread-cache.ts          # Brief caching
scripts/
├── refresh-cache.ts       # Manual cache refresh
└── cluster-topics.ts      # Topic generation
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/news?category=all` | Get articles by category |
| `POST /api/generate` | Generate AI briefing |
| `GET /api/topics` | Get clustered topics |
| `GET /api/topics/[id]` | Get single topic |

## License

MIT
