'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import { Article } from '@/components/article-card';
import { Clock, Bot, Newspaper } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Topic } from '@/types';
import { sotaSort } from '@/lib/sota-sorting';

export default function HomePage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch both topics and articles
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
        setTopics(fetchedTopics);

        // Collect all topic image URLs for deduplication
        const topicImageUrls = new Set<string>();
        fetchedTopics.forEach((topic: Topic) => {
          if (topic.image) {
            topicImageUrls.add(topic.image);
          }
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

        // Filter valid articles AND exclude articles using same image as any topic
        const validArticles = allArticles.filter(a => {
          if (!a.url || !a.urlToImage) return false;
          if (!a.urlToImage.startsWith('http')) return false;
          if (a.aiScore !== undefined && a.aiScore <= 0) return false;
          // Exclude articles that share an image with a topic
          if (topicImageUrls.has(a.urlToImage)) return false;
          return true;
        });

        // Apply SOTA sorting
        const sortResult = sotaSort(validArticles, {
          categoryOrder: categories,
          excludeCategories: [],
          featuredMaxAgeHours: 6,
          enableTimeDecay: true,
          enableDeduplication: true,
        });

        setArticles(sortResult.articles);
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

  // Build interleaved content: 1 topic + 3 articles pattern
  const buildInterleavedContent = () => {
    const content: Array<{ type: 'topic'; data: Topic } | { type: 'articles'; data: Article[] }> = [];
    let topicIndex = 0;
    let articleIndex = 0;

    while (topicIndex < topics.length || articleIndex < articles.length) {
      // Add a topic if available
      if (topicIndex < topics.length) {
        content.push({ type: 'topic', data: topics[topicIndex] });
        topicIndex++;
      }

      // Add up to 3 articles
      const articleBatch = articles.slice(articleIndex, articleIndex + 3);
      if (articleBatch.length > 0) {
        content.push({ type: 'articles', data: articleBatch });
        articleIndex += 3;
      }
    }

    return content;
  };

  const interleavedContent = buildInterleavedContent();

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

        {/* Interleaved Content */}
        {!loading && interleavedContent.length > 0 && (
          <div className="space-y-6">
            {interleavedContent.map((item, index) => (
              <div key={index}>
                {item.type === 'topic' ? (
                  <FeaturedTopicCard topic={item.data} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {item.data.map((article) => (
                      <CompactArticleCard
                        key={article.url}
                        article={article}
                        onThreadClick={() => openThread(article)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && interleavedContent.length === 0 && (
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
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
