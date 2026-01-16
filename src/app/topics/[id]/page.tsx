import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTopicById } from '@/lib/topic-cache';
import Link from 'next/link';
import { ArrowLeft, Clock, Newspaper, ExternalLink, Bot } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { TopicSource } from '@/types';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Strip redundant sections from AI-generated content
function stripRedundantSections(content: string): string {
  if (!content) return '';
  let cleaned = content;
  cleaned = cleaned.replace(/\n## Sources[\s\S]*$/i, '');
  cleaned = cleaned.replace(/## Executive Summary\s*\n[\s\S]*?(?=\n##\s|$)/i, '');
  cleaned = cleaned.replace(/^## HEADLINE:\s*/i, '## ');
  cleaned = cleaned.replace(/^## [^\n]+\n+/, '');
  return cleaned.trim();
}

interface TopicPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { id } = await params;
  const topic = await getTopicById(id);

  if (!topic) {
    return { title: 'Topic Not Found | ThreadBot' };
  }

  return {
    title: `${topic.title} | ThreadBot`,
    description: topic.summary || '',
    openGraph: {
      title: topic.title,
      description: topic.summary || '',
      images: topic.image ? [topic.image] : undefined,
    },
  };
}

// Safe date formatting
function safeFormatDate(dateString: string | undefined | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
}

// Get clean source name
function getCleanSourceName(source: TopicSource): string {
  if (!source) return 'Source';
  const name = source.source || '';
  if (name.includes('vertexaisearch') || name.includes('googleapis')) {
    return source.title ? 'Related Article' : 'Source';
  }
  return name || 'Source';
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { id } = await params;
  const topic = await getTopicById(id);

  if (!topic) {
    notFound();
  }

  const sources = topic.sources || [];
  const categories = topic.categories || [];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-sm z-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="bg-teal-600 text-white p-1.5 rounded-lg">
                <Bot className="w-4 h-4" />
              </div>
              <span className="text-lg font-serif tracking-tight">ThreadBot</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Topic Header */}
      <div className="border-b border-white/5 bg-[#111]">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span suppressHydrationWarning>{safeFormatDate(topic.publishedAt)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-600/20 text-teal-400 text-xs font-semibold">
              <Newspaper className="h-3.5 w-3.5" />
              {topic.sourceCount || sources.length || 0} sources
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight mb-3">{topic.title}</h1>
          <p className="text-gray-400">{topic.summary}</p>
        </div>
      </div>

      {/* Hero Image */}
      {topic.image && (
        <div className="max-w-4xl mx-auto px-4 pt-6">
          <div className="rounded-xl overflow-hidden bg-[#1A1A1A] aspect-video">
            <img src={topic.image} alt={topic.title} className="w-full h-full object-cover" loading="eager" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <article className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown
            components={{
              h2: ({ children }) => <h2 className="text-xl font-bold mt-8 mb-4 first:mt-0 text-white">{children}</h2>,
              h3: ({ children }) => <h3 className="text-lg font-semibold mt-6 mb-3 text-white">{children}</h3>,
              p: ({ children }) => <p className="text-gray-300 leading-relaxed mb-4">{children}</p>,
              ul: ({ children }) => <ul className="space-y-3 my-4">{children}</ul>,
              li: ({ children }) => <li className="text-gray-300 leading-relaxed pl-1">{children}</li>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">
                  {children}
                </a>
              ),
              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
            }}
          >
            {stripRedundantSections(topic.fullBrief || '')}
          </ReactMarkdown>
        </article>

        {/* Sources Section */}
        {sources.length > 0 && (
          <div className="mt-12 pt-8 border-t border-white/10">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-teal-400" />
              Sources ({sources.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sources.map((source, idx) => (
                <a
                  key={idx}
                  id={`source-${idx + 1}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-[#1A1A1A] hover:bg-[#222] hover:border-white/10 transition-all scroll-mt-20"
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded bg-teal-600/20 text-teal-400 text-[10px] font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  {source.urlToImage && (
                    <div className="w-16 h-16 rounded overflow-hidden bg-[#222] shrink-0">
                      <img src={source.urlToImage} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-medium text-teal-400">{getCleanSourceName(source)}</span>
                    </div>
                    <h3 className="text-xs font-medium text-white group-hover:text-teal-400 transition-colors line-clamp-2 leading-snug">
                      {source.title}
                    </h3>
                    <span className="text-[9px] text-gray-500 mt-1 block">{safeFormatDate(source.publishedAt)}</span>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-teal-400 shrink-0 mt-0.5 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {categories.map((category) => (
              <span key={category} className="text-xs px-3 py-1 rounded-full bg-white/5 text-gray-400 font-medium capitalize">
                {category}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
