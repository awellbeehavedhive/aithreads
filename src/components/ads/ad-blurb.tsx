'use client';

import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    adsbygoogle: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

interface AdBlurbProps {
  className?: string;
}

// House ad blurbs for testing
const HOUSE_BLURBS = [
  {
    id: 'blurb-explore',
    text: 'Want deeper analysis? Click "Explore Further" below for AI-powered insights, expert perspectives, and related stories.',
    cta: 'Try it now',
  },
  {
    id: 'blurb-share',
    text: 'Found this summary helpful? ThreadBot turns complex news into clear briefings. Share it with friends who want to stay informed.',
    cta: 'Share ThreadBot',
  },
  {
    id: 'blurb-bookmark',
    text: 'Never miss important news. Bookmark ThreadBot for daily AI-curated briefings from top sources across tech, science, and business.',
    cta: 'Bookmark now',
  },
];

/**
 * In-article text ad that appears after thread content.
 * Uses house ads for testing CTR, switches to AdSense when configured.
 */
export default function AdBlurb({ className = '' }: AdBlurbProps) {
  const adRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);
  const adIndex = useRef(Math.floor(Math.random() * HOUSE_BLURBS.length));

  const houseAd = HOUSE_BLURBS[adIndex.current];
  const useRealAds = !!process.env.NEXT_PUBLIC_ADSENSE_PUB_ID && !!process.env.NEXT_PUBLIC_AD_BLURB_SLOT;

  // Track impression when ad becomes visible
  const trackImpression = useCallback(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;

    if (window.gtag) {
      window.gtag('event', 'ad_impression', {
        ad_type: 'blurb',
        ad_id: useRealAds ? 'adsense' : houseAd.id,
        ad_position: 'in_article',
      });
    }
    console.log('[Ad Analytics] Blurb impression:', houseAd.id);
  }, [houseAd.id, useRealAds]);

  // Track click
  const trackClick = useCallback(() => {
    if (window.gtag) {
      window.gtag('event', 'ad_click', {
        ad_type: 'blurb',
        ad_id: useRealAds ? 'adsense' : houseAd.id,
        ad_position: 'in_article',
      });
    }
    console.log('[Ad Analytics] Blurb click:', houseAd.id);
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
      console.error('AdSense ad-blurb error:', error);
    }
  }, [useRealAds]);

  // Real AdSense ad
  if (useRealAds) {
    return (
      <div ref={adRef} className={`my-6 p-4 bg-primary/5 border border-primary/10 rounded-lg ${className}`}>
        <div className="mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            💡 Sponsored
          </span>
        </div>
        <ins
          className="adsbygoogle"
          style={{ display: 'block', textAlign: 'center' }}
          data-ad-layout="in-article"
          data-ad-format="fluid"
          data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_PUB_ID}
          data-ad-slot={process.env.NEXT_PUBLIC_AD_BLURB_SLOT}
        />
      </div>
    );
  }

  // House ad for testing
  return (
    <div
      ref={adRef}
      onClick={trackClick}
      className={`my-6 p-4 bg-teal-500/5 border border-teal-500/10 rounded-lg cursor-pointer hover:bg-teal-500/10 transition-colors group ${className}`}
    >
      {/* Label */}
      <div className="mb-2">
        <span className="text-xs font-medium text-teal-400/80">
          💡 Pro tip
        </span>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground/80 leading-relaxed mb-2">
        {houseAd.text}
      </p>

      {/* CTA */}
      <span className="text-xs font-medium text-teal-400 group-hover:text-teal-300 transition-colors">
        {houseAd.cta} →
      </span>
    </div>
  );
}
