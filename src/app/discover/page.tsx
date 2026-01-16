'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import axios from 'axios';
import { Article } from '@/components/article-card';
import { Button } from '@/components/ui/button';
import { ChevronDown, Clock, X, Sparkles, Loader2 } from 'lucide-react';
import { cn, decodeHtmlEntities } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  CATEGORIES,
  ARTICLES_PER_PAGE,
  PATTERN_SIZE,
  LOADING_STEPS,
  ANALYSIS_LOADING_STEPS,
  LoadingStep,
} from '@/lib/constants';
import { useMode } from '@/lib/mode-context';
import { KIDS_LOADING_STEPS, KIDS_ANALYSIS_LOADING_STEPS } from '@/lib/kids-prompts';

function LoadingSteps({ steps = LOADING_STEPS }: { steps?: readonly LoadingStep[] }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => {
        // Stop at the last step instead of cycling
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        return prev; // Stay on last step
      });
    }, 1500); // Change step every 1.5 seconds

    return () => clearInterval(interval);
  }, []);

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

export default function DiscoverPage() {
  const { mode, isKidsMode } = useMode();
  const [articles, setArticles] = useState<Article[]>([]);
  const [displayedArticles, setDisplayedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Thread sidebar state
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [threadContent, setThreadContent] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);

  // Select loading steps based on mode
  const loadingSteps = isKidsMode ? KIDS_LOADING_STEPS : LOADING_STEPS;
  const analysisLoadingSteps = isKidsMode ? KIDS_ANALYSIS_LOADING_STEPS : ANALYSIS_LOADING_STEPS;

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  // Fetch all top-ranked articles across categories
  useEffect(() => {
    const fetchTopArticles = async () => {
      setLoading(true);
      try {
        const categories = ['technology', 'science', 'business', 'health', 'entertainment', 'sports'];
        const requests = categories.map(cat =>
          axios.get('/api/news', { params: { category: cat, pageSize: 30 } })
        );
        
        const responses = await Promise.all(requests);
        
        const allArticles: Article[] = [];
        responses.forEach((response, index) => {
          const categoryArticles = response.data.articles || [];
          categoryArticles.forEach((article: Article) => {
            allArticles.push({
              ...article,
              category: categories[index],
            });
          });
        });

        // Sort by AI score (descending) and filter out articles without images
        // Allow unscored articles through (they haven't been rated yet)
        // In kids mode, filter by kidsScore >= 60 (appropriate for kids)
        const topArticles = allArticles
          .filter(a => {
            if (!a.urlToImage) return false;
            if (a.aiScore !== undefined && a.aiScore !== null && a.aiScore <= 0) return false;
            // In kids mode, require kidsScore and filter for appropriate content (>= 60)
            if (isKidsMode) {
              if (a.kidsScore === undefined || a.kidsScore === null) return false; // Must have a score
              if (a.kidsScore < 60) return false; // Must be kid-appropriate
            }
            return true;
          })
          .sort((a, b) => {
            // In kids mode, sort by kidsScore first, then aiScore
            if (isKidsMode) {
              const kidsScoreA = a.kidsScore || 0;
              const kidsScoreB = b.kidsScore || 0;
              if (kidsScoreB !== kidsScoreA) return kidsScoreB - kidsScoreA;
            }
            return (b.aiScore || 0) - (a.aiScore || 0);
          });

        setArticles(topArticles);
        setDisplayedArticles(topArticles.slice(0, ARTICLES_PER_PAGE));
        setHasMore(topArticles.length > ARTICLES_PER_PAGE);

        // Check thread cache status for displayed articles
        const initialArticles = topArticles.slice(0, ARTICLES_PER_PAGE);
        if (initialArticles.length > 0) {
          try {
            const cacheCheckResponse = await axios.post('/api/check-thread-cache', {
              articles: initialArticles,
            });
            
            // Update articles with cache status
            const cacheMap = cacheCheckResponse.data.cacheMap || {};
            const articlesWithCache = topArticles.map(article => ({
              ...article,
              threadCached: cacheMap[article.url] || false,
            }));
            
            setArticles(articlesWithCache);
            setDisplayedArticles(articlesWithCache.slice(0, ARTICLES_PER_PAGE));
          } catch (error) {
            console.error('Error checking thread cache:', error);
          }
        }
      } catch (error) {
        console.error('Error fetching articles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTopArticles();
  }, [isKidsMode]);

  // Load more articles on scroll
  useEffect(() => {
    if (inView && hasMore && !loadingMore && !loading) {
      loadMore();
    }
  }, [inView, hasMore, loadingMore, loading]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPage = page + 1;
    const startIndex = nextPage * ARTICLES_PER_PAGE;
    const endIndex = startIndex + ARTICLES_PER_PAGE;
    
    const filteredArticles = selectedCategory === 'All'
      ? articles
      : articles.filter(a => a.category?.toLowerCase() === selectedCategory.toLowerCase());

    const newArticles = filteredArticles.slice(startIndex, endIndex);
    
    if (newArticles.length > 0) {
      setDisplayedArticles(prev => [...prev, ...newArticles]);
      setPage(nextPage);
      setHasMore(endIndex < filteredArticles.length);
    } else {
      setHasMore(false);
    }
    
    setLoadingMore(false);
  }, [articles, page, selectedCategory, hasMore, loadingMore]);

  // Handle category change
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setPage(1);
    
    const filteredArticles = category === 'All'
      ? articles
      : articles.filter(a => a.category?.toLowerCase() === category.toLowerCase());
    
    setDisplayedArticles(filteredArticles.slice(0, ARTICLES_PER_PAGE));
    setHasMore(filteredArticles.length > ARTICLES_PER_PAGE);
    setTopicsOpen(false);
  };

  // Generate or fetch cached thread
  const generateThread = async (article: Article) => {
    setActiveArticle(article);
    setLoadingThread(true);
    setThreadContent(null);
    setExpandedAnalysis(null);
    setShowExpanded(false);

    try {
      // Try to get cached thread first
      const cacheResponse = await axios.post('/api/generate', {
        title: article.title,
        description: article.description,
        content: article.content,
        url: article.url, // Include URL for cache lookup
        mode, // Pass mode for kids vs default content
      });
      
      setThreadContent(cacheResponse.data.thread);
    } catch (error) {
      console.error('Error fetching thread:', error);
      setThreadContent('Failed to load thread. Please try again.');
    } finally {
      setLoadingThread(false);
    }
  };

  // Handle expanded analysis
  const handleExpandAnalysis = async () => {
    if (!activeArticle) return;

    if (expandedAnalysis) {
      // Already loaded, just toggle
      setShowExpanded(!showExpanded);
      return;
    }

    // Load analysis
    setLoadingAnalysis(true);
    setShowExpanded(true);

    try {
      const response = await axios.post('/api/generate-analysis', {
        title: activeArticle.title,
        description: activeArticle.description,
        content: activeArticle.content,
        existingBrief: threadContent,
        url: activeArticle.url, // Pass URL for caching
        mode, // Pass mode for kids vs default content
      });

      if (response.data.cached) {
        console.log('Using cached analysis content');
      }

      setExpandedAnalysis(response.data.analysis);
    } catch (error) {
      console.error('Failed to generate analysis:', error);
      setExpandedAnalysis('Failed to generate analysis. Please try again.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Group articles into patterns: 1 featured + 3 small tiles
  const articlePatterns: Array<{ featured: Article; small: Article[] }> = [];
  for (let i = 0; i < displayedArticles.length; i += PATTERN_SIZE) {
    const featured = displayedArticles[i];
    const small = displayedArticles.slice(i + 1, i + PATTERN_SIZE);
    if (featured) {
      articlePatterns.push({ featured, small });
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <header className="border-b border-white/10 sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-sm z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="text-xl font-serif tracking-tight">
              {isKidsMode ? 'ThreadBot Kids' : 'ThreadBot'}
            </Link>
            
            {/* Navigation Buttons */}
            <div className="flex items-center gap-3">
              <Button
                variant={selectedCategory === 'All' ? 'default' : 'ghost'}
                onClick={() => handleCategoryChange('All')}
                className={cn(
                  'rounded-full px-5 h-9 text-sm font-medium transition-all',
                  selectedCategory === 'All'
                    ? 'bg-teal-600 hover:bg-teal-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                Top
              </Button>

              <div className="relative">
                <Button
                  variant="ghost"
                  onClick={() => setTopicsOpen(!topicsOpen)}
                  className={cn(
                    'rounded-full px-5 h-9 text-sm font-medium transition-all flex items-center gap-2',
                    selectedCategory !== 'All'
                      ? 'bg-teal-600 hover:bg-teal-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  Topics
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', topicsOpen && 'rotate-180')} />
                </Button>

                {topicsOpen && (
                  <div className="absolute top-full mt-2 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-xl py-2 min-w-[180px] z-50">
                    {CATEGORIES.slice(1).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => handleCategoryChange(cat)}
                        className={cn(
                          'w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors',
                          selectedCategory === cat ? 'text-teal-500' : 'text-gray-300'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Articles */}
        <div>

          {/* Loading State */}
          {loading && (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {/* Articles Grid - Pattern: 1 Featured + 3 Small */}
          {!loading && articlePatterns.length > 0 && (
            <div className="space-y-6">
              {articlePatterns.map((pattern, patternIndex) => (
                <div key={`pattern-${patternIndex}`} className="space-y-4">
                  {/* Featured Article (Large) */}
                  <FeaturedCard
                    article={pattern.featured}
                    onThreadClick={() => generateThread(pattern.featured)}
                    isActive={activeArticle?.url === pattern.featured.url}
                    hideAiScore={isKidsMode}
                    isKidsMode={isKidsMode}
                  />

                  {/* 3 Small Articles Grid */}
                  {pattern.small.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pattern.small.map((article, smallIndex) => (
                        <CompactArticleCard
                          key={`${article.url}-${patternIndex}-${smallIndex}`}
                          article={article}
                          onThreadClick={() => generateThread(article)}
                          isActive={activeArticle?.url === article.url}
                          hideAiScore={isKidsMode}
                          isKidsMode={isKidsMode}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Load More Trigger */}
              {hasMore && (
                <div ref={loadMoreRef} className="py-8 flex justify-center">
                  {loadingMore && (
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!loading && articlePatterns.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg">No articles found for this category.</p>
            </div>
          )}
        </div>

        {/* Thread Overlay Modal */}
        <AnimatePresence>
          {activeArticle && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveArticle(null)}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
              />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-4 md:inset-6 z-50 flex items-center justify-center"
              >
                <div className="w-full h-full max-w-6xl bg-[#1A1A1A] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                  {/* Fixed Header Bar */}
                  <div className="shrink-0 p-4 border-b border-white/10 flex items-center justify-between gap-4 bg-[#1A1A1A]">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {activeArticle.category && (
                        <span className="text-xs font-medium text-teal-500 uppercase tracking-wider shrink-0">
                          {activeArticle.category}
                        </span>
                      )}
                      {!isKidsMode && activeArticle.aiScore && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-600/20 text-teal-400 text-xs font-medium shrink-0">
                          {activeArticle.aiScore}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActiveArticle(null)}
                      className="h-9 w-9 rounded-full hover:bg-white/10 shrink-0"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto">
                    {loadingThread && (
                      <div className="px-6 py-8 max-w-3xl mx-auto">
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
                            💡 Tip: Our AI analyzes the article using Google Search for accuracy
                          </p>
                        </div>
                      </div>
                    )}

                    {!loadingThread && threadContent && (
                      <div className="px-6 py-6 max-w-5xl mx-auto">
                        {/* Article Banner Image */}
                        {activeArticle.urlToImage && (
                          <div className="relative w-full h-32 overflow-hidden rounded-lg mb-6 -mx-6 sm:mx-0">
                            <img
                              src={activeArticle.urlToImage}
                              alt={activeArticle.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/80 to-transparent" />
                          </div>
                        )}
                        
                        {/* Article Title */}
                        <h1 className="text-3xl font-serif leading-tight mb-2 text-white">
                          {decodeHtmlEntities((isKidsMode && activeArticle.kidsTitle ? activeArticle.kidsTitle : activeArticle.title).replace(/ - [^-]+$/, ''))}
                        </h1>
                        {activeArticle.source.name && (
                          <p className="text-sm text-gray-500 mb-8">
                            {activeArticle.source.name} • {formatDistanceToNow(new Date(activeArticle.publishedAt), { addSuffix: true })}
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
                            }}
                          >
                            {threadContent}
                          </ReactMarkdown>
                        </div>

                        {/* Explore Further Button */}
                        {!loadingThread && threadContent && (
                          <div className="mt-8 pt-6 border-t border-white/10">
                            <Button
                              onClick={handleExpandAnalysis}
                              variant={showExpanded ? "outline" : "default"}
                              className={cn(
                                "w-full h-12 rounded-lg font-medium transition-all",
                                showExpanded
                                  ? "border-white/20 hover:bg-white/5 text-white"
                                  : "bg-teal-600 hover:bg-teal-700 text-white"
                              )}
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
                          </div>
                        )}

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
                              <div className="prose prose-invert max-w-none
                                prose-h1:text-2xl prose-h1:leading-tight prose-h1:mb-6 prose-h1:mt-0
                                prose-h2:text-xl prose-h2:leading-tight prose-h2:mt-8 prose-h2:mb-6 first:prose-h2:mt-0
                                prose-h3:text-lg prose-h3:leading-snug prose-h3:mt-6 prose-h3:mb-4
                                prose-p:text-gray-300 prose-p:leading-[1.8] prose-p:mb-6 prose-p:text-[15px]
                                prose-ul:text-gray-300 prose-ul:my-6 prose-ul:space-y-4
                                prose-li:text-gray-300 prose-li:leading-[1.8] prose-li:text-[15px] prose-li:mb-3
                                prose-strong:text-white prose-strong:font-semibold
                                prose-a:text-teal-400 prose-a:no-underline hover:prose-a:underline
                                prose-code:text-teal-400 prose-code:bg-white/5 prose-code:px-2 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                                prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg prose-pre:p-4 prose-pre:my-6
                                prose-blockquote:border-l-4 prose-blockquote:border-l-teal-600 prose-blockquote:text-gray-400 prose-blockquote:italic prose-blockquote:pl-4 prose-blockquote:my-6
                                prose-hr:border-white/10 prose-hr:my-8
                              ">
                                <ReactMarkdown>
                                  {expandedAnalysis}
                                </ReactMarkdown>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}

                    {!loadingThread && !threadContent && (
                      <div className="flex items-center justify-center h-full text-center text-gray-400 px-4">
                        <div>
                          <Sparkles className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                          <p className="text-lg">Click the Thread button to generate AI analysis</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer - Action Buttons */}
                  {activeArticle && !loadingThread && threadContent && (
                    <div className="shrink-0 p-4 border-t border-white/10 bg-[#0A0A0A]/50">
                      <div className="flex items-center justify-center gap-4">
                        <a
                          href={activeArticle.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-6 py-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors"
                        >
                          Read Full Article →
                        </a>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setActiveArticle(null);
                            setThreadContent(null);
                            setExpandedAnalysis(null);
                            setShowExpanded(false);
                          }}
                          className="px-6 py-3 rounded-lg border-white/10 hover:bg-white/5 text-gray-300"
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// Featured Article Card (Large, horizontal)
function FeaturedCard({
  article,
  onThreadClick,
  isActive,
  hideAiScore,
  isKidsMode
}: {
  article: Article;
  onThreadClick: () => void;
  isActive: boolean;
  hideAiScore?: boolean;
  isKidsMode?: boolean;
}) {
  // Use kidsTitle in kids mode if available, otherwise fall back to regular title
  const displayTitle = isKidsMode && article.kidsTitle ? article.kidsTitle : article.title;
  const cleanTitle = decodeHtmlEntities(displayTitle.replace(/ - [^-]+$/, ''));

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border cursor-pointer",
        isActive ? "border-teal-600" : "border-white/5"
      )}
      onClick={onThreadClick}
    >
      <div className="flex flex-col md:flex-row">
        {/* Image */}
        {article.urlToImage && (
          <div className="relative w-full md:w-[45%] h-48 md:h-64 overflow-hidden">
            <img
              src={article.urlToImage}
              alt={cleanTitle}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col justify-between">
          {/* Category & Score */}
          <div className="flex items-center gap-2 mb-3">
            {article.category && (
              <span className="text-xs font-medium text-teal-500 uppercase tracking-wider">
                {article.category}
              </span>
            )}
            {!hideAiScore && article.aiScore && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-600/20 text-teal-400 text-xs font-medium">
                {article.aiScore}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-serif leading-tight mb-3 group-hover:text-teal-400 transition-colors line-clamp-2">
            {cleanTitle}
          </h2>

          {/* Description */}
          {article.description && (
            <p className="text-gray-400 text-sm leading-relaxed mb-4 line-clamp-2">
              {article.description}
            </p>
          )}

          {/* Meta & Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {article.source.name && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium hover:text-teal-400 transition-colors"
                >
                  {article.source.name}
                </a>
              )}
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onThreadClick(); }}
              className={cn(
                "h-7 px-3 rounded-full text-xs transition-all",
                isActive 
                  ? "bg-teal-600 text-white hover:bg-teal-700" 
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              )}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Thread
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact Article Card (Grid tile, vertical)
function CompactArticleCard({
  article,
  onThreadClick,
  isActive,
  hideAiScore,
  isKidsMode
}: {
  article: Article;
  onThreadClick: () => void;
  isActive: boolean;
  hideAiScore?: boolean;
  isKidsMode?: boolean;
}) {
  // Use kidsTitle in kids mode if available, otherwise fall back to regular title
  const displayTitle = isKidsMode && article.kidsTitle ? article.kidsTitle : article.title;
  const cleanTitle = decodeHtmlEntities(displayTitle.replace(/ - [^-]+$/, ''));

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg bg-[#1A1A1A] hover:bg-[#222] transition-all duration-300 border flex flex-col h-full cursor-pointer",
        isActive ? "border-teal-600" : "border-white/5"
      )}
      onClick={onThreadClick}
    >
      {/* Image */}
      {article.urlToImage && (
        <div className="relative w-full h-40 overflow-hidden">
          <img
            src={article.urlToImage}
            alt={cleanTitle}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col">
        {/* Category & Score */}
        <div className="flex items-center gap-2 mb-2">
          {article.category && (
            <span className="text-[10px] font-medium text-teal-500 uppercase tracking-wider">
              {article.category}
            </span>
          )}
          {!hideAiScore && article.aiScore && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-teal-600/20 text-teal-400 text-[10px] font-medium">
              {article.aiScore}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold leading-snug mb-2 group-hover:text-teal-400 transition-colors line-clamp-3 flex-1">
          {cleanTitle}
        </h3>

        {/* Meta & Actions */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="flex items-center gap-2 text-[10px] text-gray-500 min-w-0 flex-1">
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

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onThreadClick(); }}
            className={cn(
              "h-6 px-2 rounded-full text-[10px] transition-all shrink-0 ml-2",
              isActive 
                ? "bg-teal-600 text-white hover:bg-teal-700" 
                : "text-gray-400 hover:text-white hover:bg-white/10"
            )}
          >
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
            Thread
          </Button>
        </div>
      </div>
    </div>
  );
}
