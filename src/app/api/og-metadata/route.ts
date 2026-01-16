import { NextResponse } from 'next/server';

/**
 * API endpoint to fetch Open Graph metadata from any URL
 * Used for rendering source link previews
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const decodedUrl = decodeURIComponent(targetUrl);

    // Fetch the page with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ThreadBot/1.0; +https://aithreadbot.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({
        url: decodedUrl,
        title: new URL(decodedUrl).hostname,
        description: null,
        image: null,
      });
    }

    const html = await response.text();

    // Parse OG tags
    const ogTitle = extractMetaContent(html, 'og:title') ||
                    extractMetaContent(html, 'twitter:title') ||
                    extractTitle(html);
    const ogDescription = extractMetaContent(html, 'og:description') ||
                          extractMetaContent(html, 'twitter:description') ||
                          extractMetaContent(html, 'description');
    const ogImage = extractMetaContent(html, 'og:image') ||
                    extractMetaContent(html, 'twitter:image');

    // Resolve relative image URLs
    let resolvedImage = ogImage;
    if (ogImage && !ogImage.startsWith('http')) {
      const urlObj = new URL(decodedUrl);
      resolvedImage = ogImage.startsWith('/')
        ? `${urlObj.origin}${ogImage}`
        : `${urlObj.origin}/${ogImage}`;
    }

    return NextResponse.json({
      url: decodedUrl,
      title: ogTitle || new URL(decodedUrl).hostname,
      description: ogDescription,
      image: resolvedImage,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (error) {
    console.error('[OGMetadata] Error fetching:', targetUrl, error);

    // Return basic fallback
    try {
      const urlObj = new URL(decodeURIComponent(targetUrl));
      return NextResponse.json({
        url: targetUrl,
        title: urlObj.hostname.replace('www.', ''),
        description: null,
        image: null,
      });
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
  }
}

function extractMetaContent(html: string, property: string): string | null {
  // Try property attribute (og:*, twitter:*)
  const propertyRegex = new RegExp(
    `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  let match = html.match(propertyRegex);
  if (match) return match[1];

  // Try content before property
  const reverseRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`,
    'i'
  );
  match = html.match(reverseRegex);
  if (match) return match[1];

  // Try name attribute (description, twitter:*)
  const nameRegex = new RegExp(
    `<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  match = html.match(nameRegex);
  if (match) return match[1];

  // Try content before name
  const reverseNameRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`,
    'i'
  );
  match = html.match(reverseNameRegex);
  if (match) return match[1];

  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}
