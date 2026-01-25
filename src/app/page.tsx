'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import { Article } from '@/components/article-card';
import { Clock, Bot, Newspaper } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Topic } from '@/types';
import { unifiedSort, ScoredContent, ScoredArticle } from '@/lib/weighted-scoring';

export default function HomePage() {
  const router = useRouter();
  const [rankedContent, setRankedContent] = useState<ScoredContent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch both topics and articles, then rank together
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch topics and articles in parallel
        const [topicsRes, ...articleResponses] = await Promise.all([
          fetch('/api/topics').then(r => r.json()),
          ...['technology', 'science', 'business', 'health'].map(cat =>
            axios.get('/api/news', { params: { category: cat, pageSize: 50 } })
              .catch(() => ({ data: { articles: [] } }))
          ),
        ]);

        // Process topics
        const fetchedTopics: Topic[] = topicsRes.topics || [];

        // Helper to normalize image URLs for comparison (strip query params)
        const normalizeImageUrl = (url: string): string => {
          try {
            const parsed = new URL(url);
            return `${parsed.origin}${parsed.pathname}`.toLowerCase();
          } catch {
            return url.toLowerCase();
          }
        };

        // Collect all topic image URLs for deduplication (including source article images)
        const topicImageUrls = new Set<string>();
        fetchedTopics.forEach((topic: Topic) => {
          if (topic.image) {
            topicImageUrls.add(normalizeImageUrl(topic.image));
          }
          // Also exclude images from topic source articles
          topic.sources?.forEach(source => {
            if (source.urlToImage) {
              topicImageUrls.add(normalizeImageUrl(source.urlToImage));
            }
          });
        });

        // Process articles
        const allArticles: Article[] = [];
        const categories = ['technology', 'science', 'business', 'health'];
        articleResponses.forEach((response, index) => {
          const categoryArticles = response.data.articles || [];
          categoryArticles.forEach((article: Article) => {
            allArticles.push({ ...article, category: categories[index] });
          });
        });

        // Track seen images to prevent duplicates among articles
        const seenArticleImages = new Set<string>();

        // Filter valid articles AND exclude duplicate images
        const validArticles = allArticles.filter(a => {
          if (!a.url || !a.urlToImage) return false;
          if (!a.urlToImage.startsWith('http')) return false;
          if (a.aiScore !== undefined && a.aiScore <= 0) return false;

          // Skip Bloomberg video articles (no reliable thumbnails)
          if (a.url.includes('bloomberg.com/news/videos/')) return false;

          const normalizedImage = normalizeImageUrl(a.urlToImage);

          // Exclude articles that share an image with a topic
          if (topicImageUrls.has(normalizedImage)) return false;

          // Exclude articles with duplicate images (keep first occurrence)
          if (seenArticleImages.has(normalizedImage)) return false;
          seenArticleImages.add(normalizedImage);

          return true;
        });

        // Apply unified weighted sorting (topics + articles ranked together by score)
        const sortResult = unifiedSort(fetchedTopics, validArticles as ScoredArticle[], {
          enableDiversityAttenuation: true,
          enableDeduplication: true,
        });

        setRankedContent(sortResult.content);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Navigate to thread page
  const openThread = (article: Article) => {
    const params = new URLSearchParams();
    params.set('article', article.url);
    router.push(`/thread?${params.toString()}`);
  };

  // Build display pattern: 1 featured (full-width) + 3 grid cards, repeating
  // Pattern: [Featured, Grid(3), Featured, Grid(3), ...]
  const buildDisplayPattern = () => {
    const patterns: Array<{
      featured: ScoredContent;
      grid: ScoredContent[];
    }> = [];

    let i = 0;
    while (i < rankedContent.length) {
      // Featured item (position 1 of each group of 4)
      const featured = rankedContent[i];
      i++;

      // Grid items (next 3)
      const grid: ScoredContent[] = [];
      while (grid.length < 3 && i < rankedContent.length) {
        grid.push(rankedContent[i]);
        i++;
      }

      patterns.push({ featured, grid });
    }

    return patterns;
  };

  const displayPatterns = buildDisplayPattern();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-sm z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <div className="bg-teal-600 text-white p-1.5 rounded-lg">
                <Bot className="w-5 h-5" />
              </div>
              <span className="text-xl font-serif tracking-tight text-white">ThreadBot</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Ranked Content - Pattern: 1 Featured + 3 Grid Cards */}
        {!loading && displayPatterns.length > 0 && (
          <div className="space-y-8">
            {displayPatterns.map((pattern, patternIndex) => (
              <div key={patternIndex}>
                {/* Featured Item (full-width) */}
                {pattern.featured.contentType === 'topic' ? (
                  <FeaturedTopicCard topic={pattern.featured as any} />
                ) : (
                  <FeaturedArticleCard
                    article={pattern.featured as any}
                    onThreadClick={() => openThread(pattern.featured as any)}
                  />
                )}

                {/* Grid Items (3 columns) */}
                {pattern.grid.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
                    {pattern.grid.map((item, itemIndex) => (
                      item.contentType === 'topic' ? (
                        <CompactTopicCard key={(item as any).id} topic={item as any} />
                      ) : (
                        <CompactArticleCard
                          key={(item as any).url || itemIndex}
                          article={item as any}
                          onThreadClick={() => openThread(item as any)}
                        />
                      )
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && rankedContent.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No content available.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Featured Topic Card (Large, horizontal)
function FeaturedTopicCard({ topic }: { topic: Topic }) {
  const sourceNames = [...new Set(topic.sources.map(s => s.source))].slice(0, 5);
  const moreCount = topic.sourceCount - sourceNames.length;

  return (
    <Link href={`/topics/${topic.id}`}>
      <div className="group relative overflow-hidden rounded-xl bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border border-white/5 cursor-pointer">
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          {topic.image && (
            <div className="relative w-full md:w-[45%] h-48 md:h-64 overflow-hidden bg-[#222]">
              <img
                src={topic.image}
                alt={topic.title}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 p-5 flex flex-col justify-between">
            {/* Meta - Topic badge */}
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-600/20 text-teal-400 text-xs font-semibold">
                <Newspaper className="h-3.5 w-3.5" />
                {topic.sourceCount} sources
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(topic.publishedAt), { addSuffix: true })}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-base sm:text-xl md:text-2xl font-serif leading-tight mb-2 sm:mb-3 group-hover:text-teal-400 transition-colors line-clamp-2">
              {topic.title}
            </h2>

            {/* Summary */}
            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed mb-3 sm:mb-4 line-clamp-2">
              {topic.summary}
            </p>

            {/* Source Pills */}
            <div className="flex flex-wrap gap-1.5">
              {sourceNames.map((name) => (
                <span
                  key={name}
                  className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-gray-400 font-medium"
                >
                  {name}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-teal-600/20 text-teal-400 font-semibold">
                  +{moreCount} more
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Featured Article Card (Large, horizontal - for articles in featured position)
function FeaturedArticleCard({
  article,
  onThreadClick,
}: {
  article: Article;
  onThreadClick: () => void;
}) {
  const cleanTitle = article.title.replace(/ - [^-]+$/, '');

  return (
    <div
      className="group relative overflow-hidden rounded-xl bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border border-white/5 cursor-pointer"
      onClick={onThreadClick}
    >
      <div className="flex flex-col md:flex-row">
        {/* Image */}
        {article.urlToImage && (
          <div className="relative w-full md:w-[45%] h-48 md:h-64 overflow-hidden bg-[#222]">
            <img
              src={article.urlToImage}
              alt={cleanTitle}
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col justify-between">
          {/* Category */}
          <div className="flex items-center gap-3 mb-3">
            {article.category && (
              <span className="text-xs font-medium text-teal-500 uppercase tracking-wider">
                {article.category}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-base sm:text-xl md:text-2xl font-serif leading-tight mb-2 sm:mb-3 group-hover:text-teal-400 transition-colors line-clamp-2">
            {cleanTitle}
          </h2>

          {/* Description */}
          {article.description && (
            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed mb-3 sm:mb-4 line-clamp-2">
              {article.description}
            </p>
          )}

          {/* Source */}
          {article.source.name && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-gray-400 font-medium hover:text-teal-400 transition-colors w-fit"
            >
              {article.source.name}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact Topic Card (Grid tile - for topics in grid position)
function CompactTopicCard({ topic }: { topic: Topic }) {
  const sourceCount = topic.sourceCount || topic.sources?.length || 0;

  return (
    <Link href={`/topics/${topic.id}`}>
      <div className="group relative overflow-hidden rounded-lg bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border border-white/5 flex flex-col h-full cursor-pointer">
        {/* Image */}
        {topic.image && (
          <div className="relative w-full h-40 overflow-hidden bg-[#222]">
            <img
              src={topic.image}
              alt={topic.title}
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col">
          {/* Sources badge */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-600/20 text-teal-400 text-[10px] font-semibold w-fit mb-2">
            <Newspaper className="h-3 w-3" />
            {sourceCount} sources
          </span>

          {/* Title */}
          <h3 className="text-sm font-serif leading-snug mb-2 group-hover:text-teal-400 transition-colors line-clamp-3 flex-1">
            {topic.title}
          </h3>

          {/* Meta */}
          <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-auto pt-2">
            <Clock className="h-3 w-3" />
            <span className="whitespace-nowrap">
              {formatDistanceToNow(new Date(topic.publishedAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Compact Article Card (Grid tile, vertical)
function CompactArticleCard({
  article,
  onThreadClick,
}: {
  article: Article;
  onThreadClick: () => void;
}) {
  const cleanTitle = article.title.replace(/ - [^-]+$/, '');

  return (
    <div
      className="group relative overflow-hidden rounded-lg bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border border-white/5 flex flex-col h-full cursor-pointer"
      onClick={onThreadClick}
    >
      {/* Image */}
      {article.urlToImage && (
        <div className="relative w-full h-40 overflow-hidden bg-[#222]">
          <img
            src={article.urlToImage}
            alt={cleanTitle}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col">
        {/* Category */}
        {article.category && (
          <span className="text-[10px] font-medium text-teal-500 uppercase tracking-wider mb-2">
            {article.category}
          </span>
        )}

        {/* Title - matching topic card font style */}
        <h3 className="text-sm font-serif leading-snug mb-2 group-hover:text-teal-400 transition-colors line-clamp-3 flex-1">
          {cleanTitle}
        </h3>

        {/* Meta */}
        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-auto pt-2">
          {article.source.name && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-medium truncate hover:text-teal-400 transition-colors"
            >
              {article.source.name}
            </a>
          )}
          <span>•</span>
          <span className="whitespace-nowrap">
            {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
