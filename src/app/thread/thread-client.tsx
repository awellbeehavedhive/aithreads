'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { Article } from '@/components/article-card';
import { Button } from '@/components/ui/button';
import { Sparkles, ChevronDown, Loader2, ArrowLeft } from 'lucide-react';
import { cn, decodeHtmlEntities } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { SourcesSection } from '@/components/source-card';
import { useMode } from '@/lib/mode-context';
import { KIDS_LOADING_STEPS, KIDS_ANALYSIS_LOADING_STEPS } from '@/lib/kids-prompts';

const LOADING_STEPS = [
  { title: 'Reading article...', subtitle: 'Extracting key information' },
  { title: 'Searching web...', subtitle: 'Verifying facts with Google Search' },
  { title: 'Generating briefing...', subtitle: 'Crafting your smart summary' },
];

/**
 * Strip ALL Sources sections from markdown content
 * Sources will be rendered separately as cards
 * Uses global flag to remove ALL occurrences (AI may generate duplicates)
 */
function stripSourcesSection(content: string): string {
  // Remove all Sources sections (there may be multiple from multi-phase generation)
  return content.replace(/## Sources[\s\S]*?(?=\n## |$)/gi, '').trim();
}

/**
 * Deduplicate sections in markdown content
 * AI may generate duplicate sections (e.g., two "## Key Facts" sections)
 * This merges content from duplicate sections into the first occurrence
 */
function deduplicateSections(content: string): string {
  // Split content into sections by ## headings
  const sectionRegex = /^## (.+)$/gm;
  const sections: { heading: string; content: string }[] = [];
  const matches: { heading: string; index: number }[] = [];

  // Find all section headings
  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    matches.push({ heading: match[1].trim(), index: match.index });
  }

  // Extract sections with their content
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
    sections.push({
      heading: current.heading,
      content: content.slice(current.index, nextIndex),
    });
  }

  // Get content before first section
  const beforeSections = matches.length > 0 ? content.slice(0, matches[0].index) : content;

  // Deduplicate: keep first occurrence, merge bullet points from duplicates
  const seenHeadings = new Map<string, string>();

  for (const section of sections) {
    const normalizedHeading = section.heading.toLowerCase();

    if (!seenHeadings.has(normalizedHeading)) {
      seenHeadings.set(normalizedHeading, section.content);
    } else {
      // Merge duplicate: extract bullet points from duplicate and append to original
      const existingContent = seenHeadings.get(normalizedHeading)!;

      // Extract bullet points from duplicate section (lines starting with -)
      const duplicateBullets = section.content
        .split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('**'))
        .filter(line => !existingContent.includes(line.trim()));

      if (duplicateBullets.length > 0) {
        // Append unique bullets to existing section
        const mergedContent = existingContent.trimEnd() + '\n' + duplicateBullets.join('\n');
        seenHeadings.set(normalizedHeading, mergedContent);
      }
    }
  }

  // Reconstruct content with deduplicated sections
  const result = beforeSections + Array.from(seenHeadings.values()).join('\n\n');
  return result.trim();
}

const ANALYSIS_LOADING_STEPS = [
  { title: 'Researching context...', subtitle: 'Finding historical patterns' },
  { title: 'Consulting experts...', subtitle: 'Gathering analyst perspectives' },
  { title: 'Connecting dots...', subtitle: 'Analyzing broader implications' },
  { title: 'Finalizing analysis...', subtitle: 'Crafting deep insights' },
];

function LoadingSteps({ steps = LOADING_STEPS }: { steps?: readonly { readonly title: string; readonly subtitle: string }[] }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => {
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [steps.length]);

  const currentStep = steps[stepIndex];

  return (
    <div className="space-y-2">
      <p className="text-base font-semibold text-white transition-all duration-300">
        {currentStep.title}
      </p>
      <p className="text-sm text-gray-400 transition-all duration-300">
        {currentStep.subtitle}
      </p>
    </div>
  );
}

function ThreadPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const articleUrl = searchParams.get('article');
  const { mode, isKidsMode } = useMode();

  const [article, setArticle] = useState<Article | null>(null);
  const [threadContent, setThreadContent] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(true);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Select loading steps based on mode
  const loadingSteps = isKidsMode ? KIDS_LOADING_STEPS : LOADING_STEPS;
  const analysisLoadingSteps = isKidsMode ? KIDS_ANALYSIS_LOADING_STEPS : ANALYSIS_LOADING_STEPS;

  // Note: Body scroll is NOT disabled on thread pages - they need to scroll normally

  // Fetch article data and thread
  useEffect(() => {
    const fetchThread = async () => {
      if (!articleUrl) {
        setError('No article URL provided');
        setLoadingThread(false);
        return;
      }

      try {
        setLoadingThread(true);

        // DIRECT LOOKUP: Get article from permanent store by URL
        // This replaces the old approach of searching all category caches
        const articleResponse = await axios.get('/api/article', {
          params: { url: articleUrl }
        });

        if (!articleResponse.data.found) {
          setError('Article not found');
          setLoadingThread(false);
          return;
        }

        const foundArticle = articleResponse.data.article as Article;

        // Check if article has an image - if not, show error
        if (!foundArticle.urlToImage) {
          setError('Article does not have an image');
          setLoadingThread(false);
          return;
        }

        setArticle(foundArticle);

        // Fetch thread content (stored permanently, mode-specific)
        const threadResponse = await axios.post('/api/generate', {
          title: foundArticle.title,
          description: foundArticle.description,
          content: foundArticle.content,
          url: foundArticle.url,
          mode, // Pass mode for kids vs default content
        });

        setThreadContent(threadResponse.data.thread);
      } catch (err: any) {
        console.error('Error fetching thread:', err);
        const errorMsg = err?.response?.data?.error || err?.message || 'Failed to load thread';
        setError(`Error: ${errorMsg}`);
      } finally {
        setLoadingThread(false);
      }
    };

    fetchThread();
  }, [articleUrl, mode]);

  const handleExpandAnalysis = async () => {
    if (!article) return;

    if (expandedAnalysis) {
      setShowExpanded(!showExpanded);
      return;
    }

    setLoadingAnalysis(true);
    setShowExpanded(true);

    try {
      const response = await axios.post('/api/generate-analysis', {
        title: article.title,
        description: article.description,
        content: article.content,
        existingBrief: threadContent,
        url: article.url,
        mode, // Pass mode for kids vs default content
      });

      setExpandedAnalysis(response.data.analysis);
    } catch (error) {
      console.error('Failed to generate analysis:', error);
      setExpandedAnalysis('Failed to generate analysis. Please try again.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Thread Not Found</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <Button
            onClick={() => router.back()}
            className="bg-teal-600 hover:bg-teal-700"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Fixed Header */}
      <header className="border-b border-white/10 sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-sm z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="text-xl font-serif tracking-tight hover:text-teal-400 transition-colors">
              {isKidsMode ? 'ThreadBot Kids' : 'ThreadBot'}
            </Link>

            <div className="flex items-center gap-3">
              {article?.category && (
                <span className="text-xs font-medium text-teal-500 uppercase tracking-wider">
                  {article.category}
                </span>
              )}
              {/* Hide AI score in kids mode */}
              {!isKidsMode && article?.aiScore && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-600/20 text-teal-400 text-xs font-medium">
                  {article.aiScore}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loadingThread && (
          <div className="max-w-3xl mx-auto">
            {/* Loading Header with Dynamic Steps */}
            <div className="flex items-center gap-4 p-6 bg-teal-600/10 rounded-xl border border-teal-600/20 mb-8">
              <div className="relative shrink-0">
                <Sparkles className="h-8 w-8 text-teal-500 animate-pulse" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-teal-500 rounded-full animate-ping" />
              </div>
              <div className="flex-1">
                <LoadingSteps steps={loadingSteps} />
              </div>
            </div>

            {/* Animated skeleton content */}
            <div className="space-y-6 animate-pulse">
              <div className="space-y-3">
                <div className="h-5 w-48 bg-white/10 rounded" />
                <div className="h-4 w-full bg-white/5 rounded" />
                <div className="h-4 w-full bg-white/5 rounded" />
                <div className="h-4 w-4/5 bg-white/5 rounded" />
              </div>

              <div className="space-y-3">
                <div className="h-5 w-40 bg-white/10 rounded" />
                <div className="space-y-3 pl-4 border-l-2 border-teal-600/20">
                  <div className="h-4 w-full bg-white/5 rounded" />
                  <div className="h-4 w-5/6 bg-white/5 rounded" />
                  <div className="h-4 w-full bg-white/5 rounded" />
                  <div className="h-4 w-3/4 bg-white/5 rounded" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="h-5 w-44 bg-white/10 rounded" />
                <div className="h-4 w-full bg-white/5 rounded" />
                <div className="h-4 w-11/12 bg-white/5 rounded" />
              </div>
            </div>

            {/* Loading tip */}
            <div className="mt-8 p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 italic">
                Tip: Our AI analyzes the article using Google Search for accuracy
              </p>
            </div>
          </div>
        )}

        {!loadingThread && article && threadContent && (
          <div className="max-w-3xl mx-auto">
            {/* Article Banner Image */}
            {article.urlToImage && (
              <div className="relative w-full h-32 overflow-hidden rounded-lg mb-6">
                <img
                  src={article.urlToImage}
                  alt={article.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/80 to-transparent" />
              </div>
            )}

            {/* Article Title */}
            <h1 className="text-3xl font-serif leading-tight mb-2 text-white">
              {decodeHtmlEntities(article.title.replace(/ - [^-]+$/, ''))}
            </h1>
            {article.source.name && (
              <p className="text-sm text-gray-500 mb-8">
                {article.source.name} • {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
              </p>
            )}

            <div className="prose prose-invert prose-base max-w-none
              prose-headings:text-white prose-headings:font-semibold
              prose-h1:text-2xl prose-h1:leading-tight prose-h1:mb-6 prose-h1:mt-0
              prose-h2:text-xl prose-h2:leading-tight prose-h2:mt-8 prose-h2:mb-6 first:prose-h2:mt-0
              prose-h3:text-lg prose-h3:leading-snug prose-h3:mt-6 prose-h3:mb-4
              prose-p:text-gray-300 prose-p:leading-[1.8] prose-p:mb-6 prose-p:text-[15px]
              prose-ul:text-gray-300 prose-ul:my-6 prose-ul:space-y-4 prose-ul:pl-0 prose-ul:list-none
              prose-ol:text-gray-300 prose-ol:my-6 prose-ol:space-y-4 prose-ol:pl-0 prose-ol:list-none
              prose-li:text-gray-300 prose-li:leading-[1.8] prose-li:text-[15px] prose-li:mb-4 prose-li:pl-0
              prose-strong:text-white prose-strong:font-semibold
              prose-a:text-teal-400 prose-a:no-underline hover:prose-a:underline
              prose-code:text-teal-400 prose-code:bg-white/5 prose-code:px-2 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal
              prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg prose-pre:p-4 prose-pre:my-6
              prose-blockquote:border-l-4 prose-blockquote:border-l-teal-600 prose-blockquote:text-gray-400 prose-blockquote:italic prose-blockquote:pl-4 prose-blockquote:my-6 prose-blockquote:py-2
              prose-hr:border-white/10 prose-hr:my-8
            ">
              <ReactMarkdown
                components={{
                  h2: ({ node, ...props }) => (
                    <h2 className="text-xl font-semibold text-white leading-tight mt-8 mb-6 first:mt-0" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-lg font-semibold text-white leading-snug mt-6 mb-4" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="text-gray-300 leading-[1.8] mb-6 text-[15px]" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="text-gray-300 my-6 space-y-4 pl-0 list-none" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="text-gray-300 my-6 space-y-4 pl-0 list-none counter-reset-item" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="text-gray-300 leading-[1.8] text-[15px] mb-4 pl-0" {...props} />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong className="text-white font-semibold" {...props} />
                  ),
                  a: ({ node, href, ...props }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-400 hover:text-teal-300 underline"
                      {...props}
                    />
                  ),
                }}
              >
                {deduplicateSections(stripSourcesSection(threadContent))}
              </ReactMarkdown>
            </div>

            {/* Sources Section with OG Cards */}
            <SourcesSection content={threadContent} />

            {/* Action Buttons Row */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                <Button
                  onClick={() => router.back()}
                  className="w-full sm:w-auto px-6 py-3 h-12 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
                </Button>

                <Button
                  onClick={handleExpandAnalysis}
                  className="w-full sm:w-auto px-6 py-3 h-12 rounded-lg font-medium transition-all bg-teal-600 hover:bg-teal-700 text-white"
                  disabled={loadingAnalysis}
                >
                  {loadingAnalysis ? (
                    <>
                      <Sparkles className="mr-2 h-5 w-5 animate-pulse" />
                      Generating Analysis...
                    </>
                  ) : showExpanded ? (
                    <>
                      <ChevronDown className={`mr-2 h-5 w-5 transition-transform ${showExpanded && !loadingAnalysis ? 'rotate-180' : ''}`} />
                      {expandedAnalysis ? 'Hide Analysis' : 'Show Analysis'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      Explore Further
                    </>
                  )}
                </Button>

                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-3 h-12 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors flex items-center justify-center"
                >
                  Read Full Article →
                </a>
              </div>
            </div>

            {/* Expanded Analysis */}
            {showExpanded && (
              <div className="mt-8 pt-6 border-t border-teal-600/20">
                {loadingAnalysis ? (
                  <div className="space-y-6">
                    {/* Loading Header with Dynamic Steps */}
                    <div className="flex items-center gap-4 p-6 bg-teal-600/10 rounded-xl border border-teal-600/20">
                      <div className="relative shrink-0">
                        <Sparkles className="h-8 w-8 text-teal-500 animate-pulse" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-teal-500 rounded-full animate-ping" />
                      </div>
                      <div className="flex-1">
                        <LoadingSteps steps={analysisLoadingSteps} />
                      </div>
                    </div>

                    {/* Animated skeleton content */}
                    <div className="space-y-6 animate-pulse">
                      <div className="space-y-3">
                        <div className="h-5 w-48 bg-white/10 rounded" />
                        <div className="h-4 w-full bg-white/5 rounded" />
                        <div className="h-4 w-full bg-white/5 rounded" />
                        <div className="h-4 w-4/5 bg-white/5 rounded" />
                      </div>

                      <div className="space-y-3">
                        <div className="h-5 w-40 bg-white/10 rounded" />
                        <div className="h-4 w-full bg-white/5 rounded" />
                        <div className="h-4 w-5/6 bg-white/5 rounded" />
                      </div>

                      <div className="space-y-3">
                        <div className="h-5 w-44 bg-white/10 rounded" />
                        <div className="h-4 w-full bg-white/5 rounded" />
                        <div className="h-4 w-11/12 bg-white/5 rounded" />
                      </div>
                    </div>
                  </div>
                ) : expandedAnalysis ? (
                  <div className="prose prose-invert prose-base max-w-none
                    prose-headings:text-white prose-headings:font-semibold
                    prose-h1:text-2xl prose-h1:leading-tight prose-h1:mb-6 prose-h1:mt-0
                    prose-h2:text-xl prose-h2:leading-tight prose-h2:mt-8 prose-h2:mb-6 first:prose-h2:mt-0
                    prose-h3:text-lg prose-h3:leading-snug prose-h3:mt-6 prose-h3:mb-4
                    prose-p:text-gray-300 prose-p:leading-[1.8] prose-p:mb-6 prose-p:text-[15px]
                    prose-ul:text-gray-300 prose-ul:my-6 prose-ul:space-y-4 prose-ul:pl-0 prose-ul:list-none
                    prose-ol:text-gray-300 prose-ol:my-6 prose-ol:space-y-4 prose-ol:pl-0 prose-ol:list-none
                    prose-li:text-gray-300 prose-li:leading-[1.8] prose-li:text-[15px] prose-li:mb-4 prose-li:pl-0
                    prose-strong:text-white prose-strong:font-semibold
                    prose-a:text-teal-400 prose-a:no-underline hover:prose-a:underline
                    prose-code:text-teal-400 prose-code:bg-white/5 prose-code:px-2 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal
                    prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg prose-pre:p-4 prose-pre:my-6
                    prose-blockquote:border-l-4 prose-blockquote:border-l-teal-600 prose-blockquote:text-gray-400 prose-blockquote:italic prose-blockquote:pl-4 prose-blockquote:my-6 prose-blockquote:py-2
                    prose-hr:border-white/10 prose-hr:my-8
                  ">
                    <ReactMarkdown
                      components={{
                        h2: ({ node, ...props }) => (
                          <h2 className="text-xl font-semibold text-white leading-tight mt-8 mb-6 first:mt-0" {...props} />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3 className="text-lg font-semibold text-white leading-snug mt-6 mb-4" {...props} />
                        ),
                        p: ({ node, ...props }) => (
                          <p className="text-gray-300 leading-[1.8] mb-6 text-[15px]" {...props} />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul className="text-gray-300 my-6 space-y-4 pl-0 list-none" {...props} />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol className="text-gray-300 my-6 space-y-4 pl-0 list-none counter-reset-item" {...props} />
                        ),
                        li: ({ node, ...props }) => (
                          <li className="text-gray-300 leading-[1.8] text-[15px] mb-4 pl-0" {...props} />
                        ),
                        strong: ({ node, ...props }) => (
                          <strong className="text-white font-semibold" {...props} />
                        ),
                        a: ({ node, href, ...props }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-400 hover:text-teal-300 underline"
                            {...props}
                          />
                        ),
                      }}
                    >
                      {expandedAnalysis}
                    </ReactMarkdown>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ThreadClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    }>
      <ThreadPageContent />
    </Suspense>
  );
}
