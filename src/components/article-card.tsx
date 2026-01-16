import { Button } from '@/components/ui/button';
import { Sparkles, Bot, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Article } from '@/types';

export type { Article };

interface ArticleCardProps {
  article: Article;
  onThreadSelect: () => void;
  isActive?: boolean;
  hideAiScore?: boolean;
}

export function ArticleCard({ article, onThreadSelect, isActive, hideAiScore }: ArticleCardProps) {
  // Remove source name from title if it appears at the end (e.g., "Title - Source")
  const cleanTitle = article.title.replace(/\s*[-–—]\s*[^-–—]+$/, '').trim();
  
  return (
    <div 
      className={cn(
        "group flex flex-col border-b border-border/40 last:border-0 transition-colors -mx-1 px-1 rounded-lg cursor-pointer relative",
        isActive ? "bg-primary/5 border-primary/20" : "hover:bg-muted/20"
      )}
      onClick={onThreadSelect}
    >
      <div className="flex h-[92px] py-2 gap-3 items-start relative">
        {/* Content Side */}
        <div className="flex-1 flex flex-col min-w-0 h-full justify-between">
          <div>
            {/* Header: Source & Meta */}
            <div className="flex items-center gap-1.5 text-[10px] leading-none mb-1.5">
              {article.source.name && (
                <a 
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-foreground/70 tracking-tight truncate hover:text-primary hover:underline relative z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  {article.source.name}
                </a>
              )}
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
              </span>
            </div>

            {/* Title - Larger */}
            <h3 className="text-[13px] font-bold leading-[1.3] text-foreground group-hover:text-primary transition-colors line-clamp-3">
              {cleanTitle}
            </h3>
          </div>

          {/* Footer: AI Trigger Icon + Badges */}
          <div className="flex items-center justify-between relative z-10">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-5 w-5 rounded-full transition-all duration-200 -ml-1",
                isActive 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                  : "text-muted-foreground/50 hover:text-primary hover:bg-primary/5"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onThreadSelect();
              }}
              title="Generate AI Thread"
            >
              {isActive ? <Bot className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            </Button>
            
            {/* Badges moved to bottom */}
            <div className="flex items-center gap-1">
              {article.threadCached && (
                <div className="flex items-center gap-0.5 bg-green-500/10 border border-green-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold text-green-600 dark:text-green-400">
                  <Zap className="h-2.5 w-2.5" />
                  Ready
                </div>
              )}
              {!hideAiScore && article.aiScore && (
                <div className="flex items-center gap-0.5 bg-primary/10 border border-primary/30 px-1.5 py-0.5 rounded text-[9px] font-bold text-primary">
                  <Sparkles className="h-2.5 w-2.5" />
                  {article.aiScore}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Image Side - Larger */}
        {article.urlToImage && (
          <div className="w-[80px] h-[80px] shrink-0 rounded overflow-hidden bg-muted relative self-center">
             <img
                src={article.urlToImage}
                alt={article.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                style={{ width: '100%', height: '100%' }}
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = 'none')}
             />
          </div>
        )}
      </div>
    </div>
  );
}
