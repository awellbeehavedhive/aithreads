/**
 * Image Extractor
 *
 * Extracts featured images from article URLs by fetching the page
 * and extracting og:image or twitter:image meta tags.
 *
 * Used primarily for sources like Google News RSS that don't include images.
 */

import { Article } from '@/types';
import { isPlaceholderImage } from './constants';

// Use a more realistic browser User-Agent
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Try to decode the article URL from Google News article ID
 * Google News encodes URLs in a modified base64 format in the article path
 */
function tryDecodeGoogleNewsArticleId(url: string): string | null {
  try {
    // Extract the article ID from URL like /articles/CBMi2wFBVV95cUxO...
    const match = url.match(/\/articles\/([A-Za-z0-9_-]+)/);
    if (!match) return null;

    const articleId = match[1];
    // Google uses URL-safe base64, convert to standard base64
    const base64 = articleId.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    // Decode and look for URLs in the decoded content
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');

    // Look for http/https URLs in decoded content
    const urlMatch = decoded.match(/(https?:\/\/[^\s"<>]+)/);
    if (urlMatch && !urlMatch[1].includes('google.com')) {
      // Clean up the URL (remove trailing garbage)
      let extractedUrl = urlMatch[1];
      // Remove any non-URL characters at the end
      extractedUrl = extractedUrl.replace(/[^\w\-._~:/?#[\]@!$&'()*+,;=%]+$/, '');
      if (extractedUrl.length > 20) {
        return extractedUrl;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * For Google News URLs, extract the actual article URL from the redirect page
 */
async function resolveGoogleNewsUrl(url: string): Promise<string | null> {
  // First, try to decode from the article ID (fastest method)
  const decodedUrl = tryDecodeGoogleNewsArticleId(url);
  if (decodedUrl) {
    return decodedUrl;
  }

  // Fall back to fetching the page and parsing HTML
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // Increased timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    // Check if we were redirected to the actual article
    if (response.url && !response.url.includes('news.google.com') && !response.url.includes('google.com/')) {
      return response.url;
    }

    if (!response.ok) return null;

    const html = await response.text();

    // Google News embeds the real URL in various ways:
    // 1. Look for data-n-au attribute (article URL)
    let match = html.match(/data-n-au="([^"]+)"/);
    if (match) return decodeURIComponent(match[1]);

    // 2. Look for jsdata attribute which sometimes contains the URL
    match = html.match(/jsdata="[^"]*?(https?:\/\/(?!news\.google\.com)[^"&\s]+)/);
    if (match) return decodeURIComponent(match[1]);

    // 3. Look for the article URL in a script tag
    match = html.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
    if (match && !match[1].includes('news.google.com') && !match[1].includes('google.com/')) {
      return match[1];
    }

    // 4. Look for article link in JSON-LD
    match = html.match(/"mainEntityOfPage"\s*:\s*{\s*"@id"\s*:\s*"(https?:\/\/[^"]+)"/);
    if (match && !match[1].includes('google.com')) {
      return match[1];
    }

    // 5. Look for canonical link that's not Google News
    match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    if (match && !match[1].includes('news.google.com') && !match[1].includes('google.com/')) {
      return match[1];
    }

    // 6. Look for og:url that's not Google News
    match = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
    if (match && !match[1].includes('news.google.com') && !match[1].includes('google.com/')) {
      return match[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the featured image URL from an article page
 */
export async function extractImageFromUrl(url: string): Promise<string | null> {
  try {
    let targetUrl = url;

    // For Google News URLs, first resolve to the actual article URL
    if (url.includes('news.google.com')) {
      const resolvedUrl = await resolveGoogleNewsUrl(url);
      if (resolvedUrl) {
        targetUrl = resolvedUrl;
      } else {
        // Couldn't resolve Google News URL, skip
        return null;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Try og:image first (most reliable)
    let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!match) {
      match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    }

    // Try twitter:image
    if (!match) {
      match = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      if (!match) {
        match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
      }
    }

    if (match && match[1]) {
      let imageUrl = match[1];

      // Make relative URLs absolute (use targetUrl which is the actual article URL)
      if (imageUrl.startsWith('/')) {
        const urlObj = new URL(targetUrl);
        imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
      }

      // Validate it looks like an image URL
      if (isValidImageUrl(imageUrl)) {
        return imageUrl;
      }
    }

    return null;
  } catch (error) {
    // Silently fail - image extraction is best-effort
    return null;
  }
}

/**
 * Check if URL looks like a valid image
 */
function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 10) return false;

  // Must be http/https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // Filter out tracking pixels and tiny images
  if (url.match(/1x1|tracking|pixel|spacer|blank/i)) {
    return false;
  }

  // Filter out Google News logo/generic images
  if (url.includes('news.google.com') || url.includes('google.com/logos')) {
    return false;
  }

  // Filter out placeholder/brand logo images
  if (isPlaceholderImage(url)) {
    return false;
  }

  // Should have image extension or be from known image CDNs
  const hasImageExtension = /\.(jpg|jpeg|png|gif|webp)/i.test(url);
  const isImageCdn = /(cloudinary|imgix|akamai|cloudfront|googleusercontent|wp\.com|medium\.com|s3\.amazonaws)/i.test(url);

  return hasImageExtension || isImageCdn || url.includes('/image') || url.includes('/photo');
}

/**
 * Enrich articles that are missing images by fetching from their URLs
 * Processes articles in parallel with concurrency limit
 */
export async function enrichArticlesWithImages(
  articles: Article[],
  options: { concurrency?: number; onlyProviders?: string[] } = {}
): Promise<Article[]> {
  const { concurrency = 5, onlyProviders } = options;

  // Filter articles that need image enrichment
  const needsImage = articles.filter(a => {
    if (a.urlToImage && a.urlToImage.trim() !== '') return false;
    if (onlyProviders && !onlyProviders.includes(a.sourceProvider || '')) return false;
    return true;
  });

  if (needsImage.length === 0) {
    return articles;
  }

  console.log(`[ImageExtractor] Enriching ${needsImage.length} articles with images...`);

  // Process in batches for concurrency control
  const enriched = new Map<string, string>();
  let successCount = 0;

  for (let i = 0; i < needsImage.length; i += concurrency) {
    const batch = needsImage.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (article) => {
        const imageUrl = await extractImageFromUrl(article.url);
        return { url: article.url, imageUrl };
      })
    );

    for (const result of results) {
      if (result.imageUrl) {
        enriched.set(result.url, result.imageUrl);
        successCount++;
      }
    }
  }

  console.log(`[ImageExtractor] Successfully extracted ${successCount}/${needsImage.length} images`);

  // Apply enriched images to articles
  return articles.map(article => {
    const extractedImage = enriched.get(article.url);
    if (extractedImage && !article.urlToImage) {
      return { ...article, urlToImage: extractedImage };
    }
    return article;
  });
}
