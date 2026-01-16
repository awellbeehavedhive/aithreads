'use client';

import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Newspaper, Clock } from 'lucide-react';
import { Topic } from '@/types';
import Link from 'next/link';

interface TopicCardProps {
  topic: Topic;
  className?: string;
}

export function TopicCard({ topic, className }: TopicCardProps) {
  // Get unique source names for display
  const sourceNames = [...new Set(topic.sources.map(s => s.source))].slice(0, 3);
  const moreCount = topic.sourceCount - sourceNames.length;

  return (
    <Link href={`/topics/${topic.id}`}>
      <div
        className={cn(
          'group flex flex-col rounded-lg border border-border/40 bg-card overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/30 cursor-pointer h-full',
          className
        )}
      >
        {/* Image */}
        {topic.image && (
          <div className="relative w-full aspect-video overflow-hidden bg-muted">
            <img
              src={topic.image}
              alt={topic.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex flex-col p-4 flex-1">
          {/* Meta: Time + Source Count */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span suppressHydrationWarning>
                {formatDistanceToNow(new Date(topic.publishedAt), { addSuffix: true })}
              </span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1 text-primary font-semibold">
              <Newspaper className="h-3 w-3" />
              <span>{topic.sourceCount} sources</span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-bold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-2">
            {topic.title}
          </h3>

          {/* Summary */}
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3 flex-1">
            {topic.summary}
          </p>

          {/* Source Pills */}
          <div className="flex flex-wrap gap-1 mt-auto">
            {sourceNames.map((name) => (
              <span
                key={name}
                className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium"
              >
                {name}
              </span>
            ))}
            {moreCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                +{moreCount} more
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
