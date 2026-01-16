'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import axios from 'axios';
import { ArticleCard, Article } from '@/components/article-card';
import { FeaturedArticleCard } from '@/components/featured-article-card';
import { ThreadView } from '@/components/thread-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame, RefreshCcw, ChevronRight, Cpu, FlaskConical, Briefcase, Heart, Clapperboard, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { CATEGORIES as BASE_CATEGORIES } from '@/lib/constants';

// Classic view uses "Home" instead of "All"
const CATEGORIES = ['Home', ...BASE_CATEGORIES.slice(1)];

export default function Home() {
  // Feed state
  const [articles, setArticles] = useState<Article[]>([]);
  const [category, setCategory] = useState('Home');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dashboard State (For Home Tab)
  // We'll store a map of category -> articles
  const [groupedArticles, setGroupedArticles] = useState<Record<string, Article[]>>({});
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Thread Sidebar State
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [threadContent, setThreadContent] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const isLoadingRef = useRef(false);
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '400px',
  });

  // Helper to check thread cache status for articles
  const checkThreadCacheStatus = async (articles: Article[]): Promise<Article[]> => {
    try {
      // Prepare article list for bulk check
      const articleList = articles.map(a => ({ title: a.title, url: a.url }));
      
      // Check cache status in bulk
      const response = await axios.post('/api/check-thread-cache', { articles: articleList });
      const cacheMap = response.data.cacheMap || {};
      
      // Merge cache status into articles
      return articles.map(article => ({
        ...article,
        threadCached: cacheMap[article.url] || false,
      }));
    } catch (err) {
      console.error('Failed to check thread cache:', err);
      return articles;
    }
  };

  // Helper to fetch executive summaries for articles
  const fetchExecSummaries = async (articles: Article[]): Promise<Article[]> => {
    try {
      // Prepare article list for bulk fetch
      const articleList = articles.map(a => ({ title: a.title, url: a.url }));
      
      // Fetch exec summaries in bulk
      const response = await axios.post('/api/exec-summaries', { articles: articleList });
      const summaryMap = response.data.summaryMap || {};
      
      // Merge exec summaries into articles
      return articles.map(article => ({
        ...article,
        execSummary: summaryMap[article.url] || undefined,
      }));
    } catch (err) {
      console.error('Failed to fetch exec summaries:', err);
      return articles;
    }
  };

  // --- Dashboard Logic (Home Tab) ---
  const fetchDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setError(null);
    try {
      // Categories to fetch for the dashboard (excluding Home)
      const categoriesToFetch = CATEGORIES.filter(c => c !== 'Home');
      
      // Parallel fetch for all categories, 4 items each (1 featured + 3 side)
      const responses = await Promise.all(
        categoriesToFetch.map(cat => 
          axios.get('/api/news', { params: { category: cat.toLowerCase(), pageSize: 4 } })
            .then(res => ({ cat, articles: res.data.articles || [] }))
            .catch(err => {
              console.error(`Error fetching ${cat}:`, err);
              return { cat, articles: [] };
            })
        )
      );

      const newGrouped: Record<string, Article[]> = {};
      for (const { cat, articles } of responses) {
        // Filter out articles without images
        const articlesWithImages = articles.filter((a: Article) => a.urlToImage);
        if (articlesWithImages.length > 0) {
          // Check thread cache status (only for first 4 articles to avoid too many requests)
          const articlesWithCacheStatus = await checkThreadCacheStatus(articlesWithImages.slice(0, 4));
          
          // Fetch exec summaries for featured articles (first article in each category)
          const articlesWithSummaries = await fetchExecSummaries(articlesWithCacheStatus);
          newGrouped[cat] = articlesWithSummaries;
        }
      }

      setGroupedArticles(newGrouped);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard.');
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  // --- Feed Logic (Category Tabs) ---
  const fetchPage = useCallback(async (pageToFetch: number, isReset: boolean) => {
     if (isLoadingRef.current || category === 'Home') return;
     isLoadingRef.current = true;
     setLoading(true);
     setError(null);

     try {
      const response = await axios.get('/api/news', {
        params: {
          category: category.toLowerCase(),
          page: pageToFetch,
          pageSize: 10,
        },
      });

      const newArticles = response.data.articles || [];
      
      // Filter out articles without images
      const articlesWithImages = newArticles.filter((a: Article) => a.urlToImage);
      
      if (articlesWithImages.length === 0) {
        setHasMore(false);
      } else {
        setArticles(prev => {
          const currentUrls = new Set(isReset ? [] : prev.map(a => a.url));
          const uniqueNew = articlesWithImages.filter((a: Article) => !currentUrls.has(a.url));
          return isReset ? articlesWithImages : [...prev, ...uniqueNew];
        });
        setPage(prev => isReset ? 2 : prev + 1);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load news.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [category]);

  // Handle Category Change
  useEffect(() => {
    window.scrollTo(0, 0);
    setError(null);
    // Reset sidebar when changing main tabs? Optional. 
    // Let's keep it to allow reading while browsing.
    
    if (category === 'Home') {
      fetchDashboard();
    } else {
      setArticles([]);
      setPage(1);
      setHasMore(true);
      isLoadingRef.current = false;
      fetchPage(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Auto-refresh content every 2 hours
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log('Auto-refreshing news content...');
      if (category === 'Home') {
        fetchDashboard();
      } else {
        setArticles([]);
        setPage(1);
        setHasMore(true);
        isLoadingRef.current = false;
        fetchPage(1, true);
      }
    }, 2 * 60 * 60 * 1000); // 2 hours in milliseconds

    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Infinite Scroll Trigger (Only for non-Home tabs)
  useEffect(() => {
    if (category !== 'Home' && inView && hasMore && !loading && !isLoadingRef.current && articles.length > 0) {
      fetchPage(page, false);
    }
  }, [inView, hasMore, loading, articles.length, page, fetchPage, category]);

  // --- Thread Generation Logic ---
  const handleThreadSelect = async (article: Article) => {
    // If clicking same article, do nothing (or toggle? let's just keep open)
    if (activeArticle?.url === article.url) return;

    setActiveArticle(article);
    
    // Prevent body scroll on mobile when drawer is open
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
    }

    // Start with loading state - will be skipped if cached
    setLoadingThread(true);
    setThreadContent(null);

    try {
      console.log('Fetching thread for:', article.title);
      const response = await axios.post('/api/generate', {
        title: article.title,
        description: article.description || '',
        content: article.content || '',
        url: article.url, // Pass URL for caching
      });
      
      // If cached, skip loading screen entirely
      if (response.data.cached) {
        console.log('✅ Cached thread - instant load');
      } else {
        console.log('⏳ Generated new thread');
      }
      
      if (response.data.thread) {
        setThreadContent(response.data.thread);
        setLoadingThread(false); // Hide loading immediately when content is ready
      } else {
        setThreadContent('No content generated.');
        setLoadingThread(false);
      }
    } catch (error) {
      console.error('Failed to generate thread', error);
      setThreadContent('Failed to generate AI thread. Please try again.');
      setLoadingThread(false);
    }
  };

  const closeSidebar = () => {
    setActiveArticle(null);
    setThreadContent(null);
    
    // Re-enable body scroll when drawer is closed
    if (typeof window !== 'undefined') {
      document.body.style.overflow = '';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded-lg">
              <Flame className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">ThreadBot <span className="text-xs text-muted-foreground">(Classic)</span></h1>
          </div>
          <a href="/" className="text-xs text-teal-500 hover:text-teal-400 transition-colors">
            New Discover UI →
          </a>
        </div>
        
        {/* Categories */}
        <div className="container mx-auto px-3 sm:px-4 pb-0 overflow-x-auto no-scrollbar" suppressHydrationWarning>
          <div className="flex gap-4 sm:gap-6 border-b border-border">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  "pb-1.5 text-xs sm:text-sm font-medium transition-all relative whitespace-nowrap",
                  category === cat 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {cat}
                {category === cat && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 container mx-auto px-3 sm:px-4 pt-2 pb-4 grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-10 gap-3 lg:gap-4 items-start">
        
        {/* Left Column: Content (Feed or Dashboard) */}
        <div className={cn("flex flex-col gap-3", activeArticle ? "lg:col-span-7 xl:col-span-6" : "lg:col-span-12 xl:col-span-10 transition-all")}>
          {error && !loading && !loadingDashboard && (
            <div className="text-center py-10">
              <p className="text-destructive mb-4">{error}</p>
              <Button 
                onClick={() => {
                  setError(null);
                  if (category === 'Home') {
                    fetchDashboard();
                  } else {
                    setArticles([]);
                    setPage(1);
                    setHasMore(true);
                    isLoadingRef.current = false;
                    fetchPage(1, true);
                  }
                }} 
                variant="outline"
              >
                <RefreshCcw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          )}

          {category === 'Home' ? (
            // --- Dashboard Layout (Google News Style) ---
            <div className="space-y-2">
              {loadingDashboard ? <DashboardSkeleton /> : (
                <>
                  {Object.keys(groupedArticles).length === 0 && !error ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-3 text-sm">No articles available at the moment.</p>
                      <Button onClick={() => fetchDashboard()} variant="outline" size="sm">
                        <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Refresh
                      </Button>
                    </div>
                  ) : (
                    Object.entries(groupedArticles).map(([cat, catArticles]) => {
                      const featuredArticle = catArticles[0];
                      const sideArticles = catArticles.slice(1, 4); // Get exactly 3 side articles
                      
                      return (
                        <div key={cat} className="border border-border/40 rounded-lg overflow-hidden bg-card">
                          {/* Category Header - More compact */}
                          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/40 bg-muted/20">
                            <h2 className="text-xs font-bold text-primary flex items-center gap-1.5">
                              {cat === 'Technology' && <Cpu className="h-3.5 w-3.5" />}
                              {cat === 'Science' && <FlaskConical className="h-3.5 w-3.5" />}
                              {cat === 'Business' && <Briefcase className="h-3.5 w-3.5" />}
                              {cat === 'Health' && <Heart className="h-3.5 w-3.5" />}
                              {cat === 'Entertainment' && <Clapperboard className="h-3.5 w-3.5" />}
                              {cat === 'Sports' && <Trophy className="h-3.5 w-3.5" />}
                              {cat}
                            </h2>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-5 px-1.5 text-[9px] text-muted-foreground hover:text-primary"
                              onClick={() => setCategory(cat)}
                            >
                              More <ChevronRight className="ml-0.5 h-2 w-2" />
                            </Button>
                          </div>
                          
                          {/* Content Grid: Featured Left, 3 Articles Right */}
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                            {/* Left: Featured Article (takes 2 columns on desktop) */}
                            {featuredArticle && (
                              <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-border/40">
                                <CompactFeaturedArticle
                                  article={featuredArticle}
                                  onThreadSelect={() => handleThreadSelect(featuredArticle)}
                                  isActive={activeArticle?.url === featuredArticle.url}
                                />
                              </div>
                            )}
                            
                            {/* Right: 3 Smaller Articles Stacked */}
                            {sideArticles.length > 0 && (
                              <div className="lg:col-span-1 flex flex-col">
                                {sideArticles.map((article, i) => (
                                  <div 
                                    key={`${cat}-side-${i}`} 
                                    className={cn(
                                      "border-border/40",
                                      i < sideArticles.length - 1 && "border-b"
                                    )}
                                  >
                                    <CompactArticle
                                      article={article}
                                      onThreadSelect={() => handleThreadSelect(article)}
                                      isActive={activeArticle?.url === article.url}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          ) : (
            // --- Standard Feed Layout (Infinite Scroll) ---
            <div className="max-w-4xl mx-auto w-full">
               {/* Featured Article - First in category (AI-ranked as most interesting) */}
               {articles.length > 0 && articles[0] && (
                 <div className="mb-2 border border-border/40 rounded-lg overflow-hidden bg-card">
                   <FeaturedArticleCard 
                     article={articles[0]}
                     onThreadSelect={() => handleThreadSelect(articles[0])}
                     isActive={activeArticle?.url === articles[0].url}
                   />
                 </div>
               )}
               
               {/* Remaining Articles - AI-Ranked */}
               <div className="space-y-0 border border-border/40 rounded-lg overflow-hidden bg-card">
                {articles.slice(1).map((article, index) => (
                  <ArticleCard 
                    key={`${article.url}-${index}`} 
                    article={article} 
                    onThreadSelect={() => handleThreadSelect(article)}
                    isActive={activeArticle?.url === article.url}
                  />
                ))}
              </div>

              {/* Loading / Infinite Scroll Sentinel */}
              <div ref={ref} className="py-8 flex justify-center w-full">
                {loading && <FeedSkeleton />}
                {!hasMore && articles.length > 0 && (
                  <p className="text-muted-foreground text-sm">No more articles.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Sticky Sidebar (Desktop) */}
        <AnimatePresence>
          {activeArticle && (
            <>
              {/* Desktop Sidebar */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-20 h-[calc(100vh-6rem)] rounded-xl border border-border bg-card shadow-xl"
              >
                <ThreadView 
                  article={activeArticle} 
                  content={threadContent} 
                  loading={loadingThread} 
                  onClose={closeSidebar} 
                />
              </motion.div>

              {/* Mobile Drawer (Overlay) */}
              <div className="lg:hidden fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none">
                {/* Backdrop */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                  onClick={closeSidebar}
                />
                
                {/* Drawer Content */}
                <motion.div 
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="relative w-full h-[85vh] sm:h-[80vh] sm:max-w-2xl md:max-w-3xl bg-card border-t sm:border border-border rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted rounded-full sm:hidden" />
                  <ThreadView 
                    article={activeArticle} 
                    content={threadContent} 
                    loading={loadingThread} 
                    onClose={closeSidebar} 
                  />
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Compact Featured Article (for left side of tile)
function CompactFeaturedArticle({ article, onThreadSelect, isActive }: { 
  article: Article; 
  onThreadSelect: () => void; 
  isActive?: boolean;
}) {
  const cleanedTitle = article.title.replace(/ - [^-]+$/, '');
  
  return (
    <div
      className={cn(
        "group cursor-pointer hover:bg-muted/20 transition-colors h-full flex overflow-hidden",
        isActive && "bg-primary/5"
      )}
      onClick={onThreadSelect}
    >
      {/* Image - Left side, narrower to allow more text space and better aspect ratio */}
      {article.urlToImage && (
        <div className="w-[35%] shrink-0 bg-muted relative border-r border-border/40">
          <img
            src={article.urlToImage}
            alt={article.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}
      
      {/* Content - Right side */}
      <div className="flex-1 flex flex-col min-w-0 p-3 justify-center">
        {/* Source & Time */}
        <div className="flex items-center gap-1.5 text-[10px] leading-none mb-1.5">
          {article.source.name && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-foreground/70 truncate hover:text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {article.source.name}
            </a>
          )}
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
            {new Date(article.publishedAt).toLocaleDateString()}
          </span>
        </div>
        
        {/* Title */}
        <h3 className="text-[15px] font-bold leading-[1.3] text-foreground group-hover:text-primary transition-colors line-clamp-3 mb-2">
          {cleanedTitle}
        </h3>
        
        {/* Executive Summary from AI (preferred) or Description fallback */}
        {(article.execSummary || article.description) && (
          <p className="text-[12px] text-muted-foreground leading-[1.5] line-clamp-5">
            {article.execSummary || article.description}
          </p>
        )}
      </div>
    </div>
  );
}

// Compact Article (for right side stack)
function CompactArticle({ article, onThreadSelect, isActive }: { 
  article: Article; 
  onThreadSelect: () => void; 
  isActive?: boolean;
}) {
  const cleanedTitle = article.title.replace(/ - [^-]+$/, '');
  
  return (
    <div
      className={cn(
        "group cursor-pointer p-2.5 hover:bg-muted/20 transition-colors flex gap-2.5 h-full items-center",
        isActive && "bg-primary/5"
      )}
      onClick={onThreadSelect}
    >
      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        {/* Source */}
        <div className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
          {article.source.name && (
            <span className="font-semibold text-foreground/70 truncate">
              {article.source.name}
            </span>
          )}
        </div>
        
        {/* Title */}
        <h4 className="text-[13px] font-semibold leading-[1.35] text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {cleanedTitle}
        </h4>
      </div>
      
      {/* Thumbnail */}
      {article.urlToImage && (
        <div className="w-[72px] h-[72px] shrink-0 rounded overflow-hidden bg-muted relative">
          <img
            src={article.urlToImage}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-border/40 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border/40 bg-muted/30">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2 p-3">
              <Skeleton className="h-[180px] w-full rounded-md mb-2.5" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="lg:col-span-1 flex flex-col">
              {[1, 2, 3].map((j) => (
                <div key={j} className="p-2.5 border-t lg:border-t-0 lg:border-l border-border/40 first:border-t-0">
                  <Skeleton className="h-[80px] w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4 w-full">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}
