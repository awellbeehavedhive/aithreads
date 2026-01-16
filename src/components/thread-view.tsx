import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { X, Bot, ChevronDown, Sparkles } from 'lucide-react';
import { Article } from '@/components/article-card';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { LOADING_STEPS, ANALYSIS_LOADING_STEPS, LoadingStep } from '@/lib/constants';

interface ThreadViewProps {
  article: Article;
  content: string | null;
  loading: boolean;
  onClose: () => void;
}

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
  }, [steps.length]);

  const currentStep = steps[stepIndex];

  return (
    <>
      <p className="text-sm font-semibold text-primary transition-all duration-300">
        {currentStep.title}
      </p>
      <p className="text-xs text-muted-foreground transition-all duration-300">
        {currentStep.subtitle}
      </p>
    </>
  );
}

export function ThreadView({ article, content, loading, onClose }: ThreadViewProps) {
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);

  const handleExpandAnalysis = async () => {
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
        title: article.title,
        description: article.description,
        content: article.content,
        existingBrief: content,
        url: article.url, // Pass URL for caching
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

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Bot className="h-4 w-4" />
          <span>Thread</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Sidebar Content (Scrollable) */}
      <div className="overflow-y-auto p-5 custom-scrollbar flex-1">
        {/* Article Context */}
        <div className="mb-6">
          <h3 className="font-bold text-lg leading-snug mb-2">{article.title}</h3>
          {article.urlToImage && (
            <div className="w-full aspect-video rounded-lg overflow-hidden mb-3 bg-muted">
              <img src={article.urlToImage} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex gap-2 text-xs text-muted-foreground mb-4">
            <a 
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary hover:underline"
            >
              {article.source.name}
            </a>
            <span>•</span>
            <span suppressHydrationWarning>{formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}</span>
          </div>
        </div>

        {/* AI Content */}
        {loading ? (
          <div className="space-y-6">
            {/* Loading Header with Dynamic Steps */}
            <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
              <div className="relative">
                <Bot className="h-6 w-6 text-primary animate-pulse" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-ping" />
              </div>
              <div className="flex-1">
                <LoadingSteps key={article.url} />
              </div>
            </div>

            {/* Animated skeleton content */}
            <div className="space-y-4 animate-pulse">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <div className="space-y-2 pl-3 border-l-2 border-primary/20">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>

              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
              </div>
            </div>

            {/* Loading tips */}
            <div className="mt-6 p-3 bg-muted/30 rounded-lg border border-border/50">
              <p className="text-xs text-muted-foreground italic">
                💡 Tip: Our AI analyzes the article using Google Search for accuracy
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Main Brief */}
            <div className="prose prose-sm dark:prose-invert leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({node: _node, ...props}) => <h1 className="text-base font-bold mt-4 mb-2 text-primary" {...props} />,
                  h2: ({node: _node, ...props}) => <h2 className="text-sm font-bold mt-4 mb-2 text-foreground" {...props} />,
                  p: ({node: _node, ...props}) => <p className="mb-3 text-sm text-foreground/90" {...props} />,
                  ul: ({node: _node, ...props}) => <ul className="list-none pl-0 mb-4 space-y-2" {...props} />,
                  li: ({node: _node, ...props}) => (
                    <li className="pl-3 border-l-2 border-primary/30 text-sm" {...props} />
                  ),
                  strong: ({node: _node, ...props}) => <strong className="font-semibold text-primary" {...props} />,
                }}
              >
                {content || ''}
              </ReactMarkdown>
            </div>

            {/* Explore Further Button */}
            <div className="mt-6 pt-4 border-t border-border">
              <Button
                onClick={handleExpandAnalysis}
                variant={showExpanded ? "outline" : "default"}
                className="w-full"
                disabled={loadingAnalysis}
              >
                {loadingAnalysis ? (
                  <>
                    <Bot className="mr-2 h-4 w-4 animate-pulse" />
                    Generating Analysis...
                  </>
                ) : showExpanded ? (
                  <>
                    <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${showExpanded ? 'rotate-180' : ''}`} />
                    {expandedAnalysis ? 'Hide Analysis' : 'Show Analysis'}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Explore Further
                  </>
                )}
              </Button>
            </div>

            {/* Expanded Analysis */}
            {showExpanded && (
              <div className="mt-6">
                {loadingAnalysis ? (
                  <div className="space-y-6">
                    {/* Loading Header */}
                    <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
                      <div className="relative">
                        <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-ping" />
                      </div>
                      <div className="flex-1">
                        <LoadingSteps steps={ANALYSIS_LOADING_STEPS} key={`${article.url}-analysis`} />
                      </div>
                    </div>

                    {/* Animated skeleton */}
                    <div className="space-y-4 animate-pulse">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-5/6" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-11/12" />
                      </div>
                    </div>
                  </div>
                ) : expandedAnalysis ? (
                  <div className="prose prose-sm dark:prose-invert leading-relaxed border-t border-border pt-6">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({node: _node, ...props}) => <h1 className="text-base font-bold mt-4 mb-2 text-primary" {...props} />,
                        h2: ({node: _node, ...props}) => <h2 className="text-sm font-bold mt-4 mb-2 text-foreground" {...props} />,
                        p: ({node: _node, ...props}) => <p className="mb-3 text-sm text-foreground/90" {...props} />,
                        ul: ({node: _node, ...props}) => <ul className="list-none pl-0 mb-4 space-y-2" {...props} />,
                        li: ({node: _node, ...props}) => (
                          <li className="pl-3 border-l-2 border-primary/30 text-sm" {...props} />
                        ),
                        strong: ({node: _node, ...props}) => <strong className="font-semibold text-primary" {...props} />,
                      }}
                    >
                      {expandedAnalysis}
                    </ReactMarkdown>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
