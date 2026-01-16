'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Newspaper, ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Topic } from '@/types';
import { formatDistanceToNow } from 'date-fns';

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTopics() {
      try {
        const res = await fetch('/api/topics');
        const data = await res.json();
        setTopics(data.topics || []);
      } catch (error) {
        console.error('Failed to fetch topics:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchTopics();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white">
        <Header />
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white">
        <Header />
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
            <Newspaper className="h-12 w-12 text-gray-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Topics Coming Soon</h1>
            <p className="text-gray-400 max-w-md">
              We're aggregating news from multiple sources into unified topics.
              Check back soon for AI-curated topic briefs.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const [featured, ...rest] = topics;
  const totalSources = topics.reduce((sum, t) => sum + t.sourceCount, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <Header />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Discover</h1>
          <p className="text-sm text-gray-400">
            Top stories aggregated from {totalSources} sources
          </p>
        </div>

        {/* Featured Topic (Large) */}
        {featured && (
          <div className="mb-6">
            <FeaturedTopicCard topic={featured} />
          </div>
        )}

        {/* Topic Grid */}
        {rest.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rest.map((topic) => (
              <TopicGridCard key={topic.id} topic={topic} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Shared Header Component (matching homepage)
function Header() {
  return (
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

          {/* Navigation Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/topics"
              className="rounded-full px-5 h-9 text-sm font-medium transition-all flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            >
              Discover
            </Link>
            <Link
              href="/"
              className="rounded-full px-5 h-9 text-sm font-medium transition-all flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5"
            >
              Articles
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

// Featured Topic Card (Large, horizontal layout like homepage)
function FeaturedTopicCard({ topic }: { topic: Topic }) {
  const sourceNames = [...new Set(topic.sources.map(s => s.source))].slice(0, 5);
  const moreCount = topic.sourceCount - sourceNames.length;

  return (
    <Link href={`/topics/${topic.id}`}>
      <div className="group relative overflow-hidden rounded-xl bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border border-white/5 cursor-pointer">
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          {topic.image && (
            <div className="relative w-full md:w-[45%] h-48 md:h-72 overflow-hidden bg-[#222]">
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
            {/* Meta */}
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
            <h2 className="text-xl md:text-2xl font-serif leading-tight mb-3 group-hover:text-teal-400 transition-colors line-clamp-2">
              {topic.title}
            </h2>

            {/* Summary */}
            <p className="text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
              {topic.summary}
            </p>

            {/* Source Pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
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

            {/* CTA */}
            <Button
              variant="ghost"
              size="sm"
              className="w-fit h-8 px-4 rounded-full text-xs transition-all text-gray-400 hover:text-white hover:bg-white/10"
            >
              Read Full Brief →
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Topic Grid Card (Smaller, vertical layout like homepage compact cards)
function TopicGridCard({ topic }: { topic: Topic }) {
  const sourceNames = [...new Set(topic.sources.map(s => s.source))].slice(0, 3);
  const moreCount = topic.sourceCount - sourceNames.length;

  return (
    <Link href={`/topics/${topic.id}`}>
      <div className="group relative overflow-hidden rounded-lg bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border border-white/5 flex flex-col h-full cursor-pointer">
        {/* Image */}
        {topic.image && (
          <div className="relative w-full h-40 overflow-hidden bg-[#222]">
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
        <div className="flex-1 p-4 flex flex-col">
          {/* Meta */}
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-600/20 text-teal-400 text-[10px] font-semibold">
              <Newspaper className="h-3 w-3" />
              {topic.sourceCount} sources
            </span>
            <span className="text-[10px] text-gray-500">
              {formatDistanceToNow(new Date(topic.publishedAt), { addSuffix: true })}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold leading-snug mb-2 group-hover:text-teal-400 transition-colors line-clamp-2 flex-1">
            {topic.title}
          </h3>

          {/* Summary */}
          <p className="text-xs text-gray-400 line-clamp-2 mb-3">
            {topic.summary}
          </p>

          {/* Source Pills */}
          <div className="flex flex-wrap gap-1 mt-auto">
            {sourceNames.map((name) => (
              <span
                key={name}
                className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500 font-medium"
              >
                {name}
              </span>
            ))}
            {moreCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-600/20 text-teal-400 font-medium">
                +{moreCount} more
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
