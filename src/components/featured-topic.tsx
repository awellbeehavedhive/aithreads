'use client';

import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Newspaper, Clock, ArrowRight } from 'lucide-react';
import { Topic } from '@/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface FeaturedTopicProps {
  topic: Topic;
  className?: string;
}

export function FeaturedTopic({ topic, className }: FeaturedTopicProps) {
  // Get unique source names for display
  const sourceNames = [...new Set(topic.sources.map(s => s.source))].slice(0, 5);
  const moreCount = topic.sourceCount - sourceNames.length;

  return (
    <Link href={`/topics/${topic.id}`}>
      <div
        className={cn(
          'group relative rounded-xl border border-border/40 bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/30 cursor-pointer',
          className
        )}
      >
        {/* Layout: Side by side on larger screens, stacked on mobile */}
        <div className="flex flex-col md:flex-row">
          {/* Image - Large */}
          {topic.image && (
            <div className="relative w-full md:w-1/2 aspect-video md:aspect-auto md:min-h-[280px] overflow-hidden bg-muted">
              <img
                src={topic.image}
                alt={topic.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              {/* Gradient overlay on mobile */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent md:hidden" />
            </div>
          )}

          {/* Content */}
          <div className="flex flex-col p-5 md:p-6 flex-1 justify-center">
            {/* Meta: Time + Source Count */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span suppressHydrationWarning>
                  {formatDistanceToNow(new Date(topic.publishedAt), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-primary font-semibold">
                <Newspaper className="h-3.5 w-3.5" />
                <span>{topic.sourceCount} sources</span>
              </div>
            </div>

            {/* Title - Large */}
            <h2 className="text-xl md:text-2xl font-bold leading-tight text-foreground group-hover:text-primary transition-colors mb-3">
              {topic.title}
            </h2>

            {/* Summary */}
            <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
              {topic.summary}
            </p>

            {/* Source Pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {sourceNames.map((name) => (
                <span
                  key={name}
                  className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium"
                >
                  {name}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                  +{moreCount} more
                </span>
              )}
            </div>

            {/* CTA */}
            <Button
              variant="outline"
              size="sm"
              className="w-fit group/btn"
            >
              Read Full Brief
              <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover/btn:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}
