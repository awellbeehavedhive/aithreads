'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Sparkles, Zap, TrendingUp } from 'lucide-react';

declare global {
  interface Window {
    adsbygoogle: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

interface AdCardProps {
  className?: string;
}

// House ads to rotate through for testing
const HOUSE_ADS = [
  {
    id: 'threadbot-ai',
    badge: 'Try It',
    headline: 'AI-Powered News Analysis',
    description: 'Click any article to get instant AI summaries with verified facts and source citations.',
    cta: 'Generate Thread',
    icon: Sparkles,
    color: 'teal',
  },
  {
    id: 'threadbot-speed',
    badge: 'Fast',
    headline: 'News at a Glance',
    description: 'Stop scrolling through endless articles. Get the key points in seconds.',
    cta: 'Try Now',
    icon: Zap,
    color: 'amber',
  },
  {
    id: 'threadbot-trending',
    badge: 'Trending',
    headline: 'Top Stories Ranked by AI',
    description: 'Our AI scores articles by relevance, credibility, and impact. See what matters.',
    cta: 'Explore',
    icon: TrendingUp,
    color: 'emerald',
  },
];

/**
 * Native in-feed ad card.
 * Uses house ads for testing CTR, switches to AdSense when configured.
 */
export default function AdCard({ className = '' }: AdCardProps) {
  const adRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);
  const adIndex = useRef(Math.floor(Math.random() * HOUSE_ADS.length));

  const houseAd = HOUSE_ADS[adIndex.current];
  const useRealAds = !!process.env.NEXT_PUBLIC_ADSENSE_PUB_ID && !!process.env.NEXT_PUBLIC_AD_CARD_SLOT;

  // Track impression when ad becomes visible
  const trackImpression = useCallback(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;

    if (window.gtag) {
      window.gtag('event', 'ad_impression', {
        ad_type: 'card',
        ad_id: useRealAds ? 'adsense' : houseAd.id,
        ad_position: 'in_feed',
      });
    }
    console.log('[Ad Analytics] Card impression:', houseAd.id);
  }, [houseAd.id, useRealAds]);

  // Track click
  const trackClick = useCallback(() => {
    if (window.gtag) {
      window.gtag('event', 'ad_click', {
        ad_type: 'card',
        ad_id: useRealAds ? 'adsense' : houseAd.id,
        ad_position: 'in_feed',
      });
    }
    console.log('[Ad Analytics] Card click:', houseAd.id);
  }, [houseAd.id, useRealAds]);

  // Intersection observer for impression tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            trackImpression();
          }
        });
      },
      { threshold: 0.5 }
    );

    if (adRef.current) {
      observer.observe(adRef.current);
    }

    return () => observer.disconnect();
  }, [trackImpression]);

  // Load real AdSense if configured
  useEffect(() => {
    if (!useRealAds) return;

    try {
      if (window.adsbygoogle) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (error) {
      console.error('AdSense ad-card error:', error);
    }
  }, [useRealAds]);

  // Real AdSense ad
  if (useRealAds) {
    return (
      <div ref={adRef} className={`relative bg-[#1A1A1A] rounded-lg border border-white/5 overflow-hidden ${className}`}>
        <div className="absolute top-2 left-2 z-10">
          <span className="text-[10px] font-medium text-teal-400/80 bg-teal-400/10 px-1.5 py-0.5 rounded">
            Sponsored
          </span>
        </div>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-format="fluid"
          data-ad-layout-key={process.env.NEXT_PUBLIC_AD_CARD_LAYOUT_KEY || '-6t+ed+2i-1n-4w'}
          data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_PUB_ID}
          data-ad-slot={process.env.NEXT_PUBLIC_AD_CARD_SLOT}
        />
      </div>
    );
  }

  // House ad for testing
  const IconComponent = houseAd.icon;
  const colorClasses = {
    teal: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  };
  const colors = colorClasses[houseAd.color as keyof typeof colorClasses];

  return (
    <div
      ref={adRef}
      onClick={trackClick}
      className={`relative bg-[#1A1A1A] rounded-lg border border-white/5 overflow-hidden hover:bg-[#222] transition-all duration-300 cursor-pointer group ${className}`}
    >
      {/* Badge */}
      <div className="absolute top-2 left-2 z-10">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors}`}>
          {houseAd.badge}
        </span>
      </div>

      <div className="p-4 pt-8">
        {/* Icon + Headline */}
        <div className="flex items-start gap-3 mb-2">
          <div className={`p-2 rounded-lg ${colors}`}>
            <IconComponent className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold leading-snug group-hover:text-teal-400 transition-colors">
              {houseAd.headline}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-400 mb-3 leading-relaxed">
          {houseAd.description}
        </p>

        {/* CTA */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-600">ThreadBot</span>
          <span className="text-xs font-medium text-teal-400 group-hover:text-teal-300 transition-colors">
            {houseAd.cta} →
          </span>
        </div>
      </div>
    </div>
  );
}
