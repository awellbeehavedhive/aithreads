import { Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export interface FeaturedArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
  aiScore?: number;
  aiReason?: string;
  threadCached?: boolean;
}

interface FeaturedArticleCardProps {
  article: FeaturedArticle;
  onThreadSelect: () => void;
  isActive?: boolean;
}

export function FeaturedArticleCard({ article, onThreadSelect, isActive }: FeaturedArticleCardProps) {
  // Remove source name from title if it appears at the end
  const cleanTitle = article.title.replace(/\s*[-–—]\s*[^-–—]+$/, '').trim();
  
  return (
    <div 
      className={cn(
        "group relative transition-all cursor-pointer",
        isActive ? "bg-primary/5" : "hover:bg-muted/20"
      )}
      onClick={onThreadSelect}
    >
      {/* AI Score Badge */}
      {article.aiScore && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-primary/10 border border-primary/30 px-2 py-0.5 rounded text-[10px] font-bold text-primary backdrop-blur-sm">
          <Sparkles className="h-2.5 w-2.5" />
          {article.aiScore}
        </div>
      )}
      
      {/* Thread Cached Badge */}
      {article.threadCached && (
        <div className="absolute top-2 right-16 z-10 flex items-center gap-0.5 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-bold text-green-600 dark:text-green-400 backdrop-blur-sm">
          <Zap className="h-2.5 w-2.5" />
          Ready
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 p-2.5">
        {/* Image Side - Balanced Size */}
        {article.urlToImage && (
          <div className="w-full md:w-[160px] h-[180px] md:h-[120px] shrink-0 rounded overflow-hidden bg-muted relative">
             <img
                src={article.urlToImage}
                alt={article.title}
                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = 'none')}
             />
          </div>
        )}

        {/* Content Side */}
        <div className="flex-1 flex flex-col min-w-0">
          <div>
            {/* Header: Source & Meta */}
            <div className="flex items-center gap-1.5 text-[10px] leading-none mb-1">
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

            {/* Title - Consistent with regular cards */}
            <h3 className="text-[13px] font-bold leading-[1.3] text-foreground group-hover:text-primary transition-colors line-clamp-3">
              {cleanTitle}
            </h3>

          </div>

        </div>
      </div>
    </div>
  );
}

