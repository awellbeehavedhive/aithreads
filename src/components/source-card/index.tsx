'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';

interface OGMetadata {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
}

interface SourceCardProps {
  url: string;
  name: string;
  description?: string;
}

export function SourceCard({ url, name, description }: SourceCardProps) {
  const [metadata, setMetadata] = useState<OGMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch(`/api/og-metadata?url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          setMetadata(data);
        }
      } catch (error) {
        console.error('Failed to fetch OG metadata:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [url]);

  const displayTitle = metadata?.title || name;
  const displayDescription = description || metadata?.description;
  const displayImage = !imageError && metadata?.image;

  // Extract domain for display
  // For vertex redirect URLs, use the provided name instead of the URL domain
  let domain = '';
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');

    // If it's a Google redirect URL, use the provided name or a cleaner fallback
    if (hostname.includes('vertexaisearch') || hostname.includes('googleapis')) {
      // Use the name but clean it if it also contains vertex
      if (name.includes('vertexaisearch') || name.includes('googleapis')) {
        domain = 'Source';
      } else {
        domain = name;
      }
    } else {
      domain = hostname;
    }
  } catch {
    domain = name;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-[#1A1A1A] border border-white/10 rounded-lg overflow-hidden hover:border-teal-600/50 transition-all duration-200 hover:bg-[#1E1E1E]"
    >
      <div className="flex">
        {/* Image or Placeholder */}
        <div className="w-24 h-24 flex-shrink-0 bg-white/5">
          {displayImage ? (
            <img
              src={displayImage}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-900/30 to-teal-800/10">
              <Newspaper className="w-8 h-8 text-teal-600/50" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-3 min-w-0">
          {/* Domain */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-gray-500 truncate">{domain}</span>
            <ExternalLink className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Title */}
          <h4 className="text-sm font-medium text-white line-clamp-1 mb-1 group-hover:text-teal-400 transition-colors">
            {loading ? (
              <span className="inline-block w-32 h-4 bg-white/10 rounded animate-pulse" />
            ) : (
              displayTitle
            )}
          </h4>

          {/* Description */}
          {displayDescription && (
            <p className="text-xs text-gray-400 line-clamp-2">
              {displayDescription}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

interface SourcesSectionProps {
  content: string;
}

/**
 * Parses ALL Sources sections from markdown content and renders as cards
 * Handles multiple Sources sections (from multi-phase AI generation) and deduplicates by URL
 */
export function SourcesSection({ content }: SourcesSectionProps) {
  // Find ALL Sources sections (there may be multiple from multi-phase generation)
  const sourcesMatches = content.matchAll(/## Sources\s*([\s\S]*?)(?=\n## |$)/gi);
  const allSourcesText: string[] = [];

  for (const match of sourcesMatches) {
    if (match[1]) {
      allSourcesText.push(match[1].trim());
    }
  }

  if (allSourcesText.length === 0) return null;

  // Parse source links with descriptions from all sections
  // Format: [Source Name](URL) - Description
  // or just: [Source Name](URL)
  const sourceRegex = /\[([^\]]+)\]\(([^)]+)\)(?:\s*[-–—]\s*(.+?))?(?=\n|$)/g;
  const sourcesMap = new Map<string, { name: string; url: string; description?: string }>();

  for (const sourcesText of allSourcesText) {
    let match;
    // Reset regex lastIndex for each text block
    sourceRegex.lastIndex = 0;
    while ((match = sourceRegex.exec(sourcesText)) !== null) {
      const url = match[2].trim();
      const name = match[1].trim();

      // Only add if not already seen (deduplicate by URL)
      if (!sourcesMap.has(url)) {
        sourcesMap.set(url, {
          name: name,
          url: url,
          description: match[3]?.trim(),
        });
      }
    }
  }

  const sources = Array.from(sourcesMap.values());
  if (sources.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-white/10">
      <h2 className="text-xl font-semibold text-white mb-4">Sources</h2>
      <div className="space-y-3">
        {sources.map((source, index) => (
          <SourceCard
            key={`${source.url}-${index}`}
            url={source.url}
            name={source.name}
            description={source.description}
          />
        ))}
      </div>
    </div>
  );
}
