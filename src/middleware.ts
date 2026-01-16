import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Social media and search engine crawlers that need access for OpenGraph/meta tags
const ALLOWED_BOTS = [
  'facebookexternalhit',  // Facebook
  'Facebot',              // Facebook
  'Twitterbot',           // Twitter/X
  'LinkedInBot',          // LinkedIn
  'Slackbot',             // Slack
  'Discordbot',           // Discord
  'WhatsApp',             // WhatsApp
  'TelegramBot',          // Telegram
  'Googlebot',            // Google
  'bingbot',              // Bing
  'Applebot',             // Apple
  'PinterestBot',         // Pinterest
  'redditbot',            // Reddit
  'Embedly',              // Embedly
  'Quora Link Preview',   // Quora
  'outbrain',             // Outbrain
  'vkShare',              // VK
  'W3C_Validator',        // W3C Validator
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return ALLOWED_BOTS.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));
}

// Check if the path requires admin authentication
function isAdminRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname === '/api/admin-stats'
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // Detect kids mode from subdomain or query parameter (for dev testing)
  const isKidsMode =
    hostname.startsWith('kids.') ||
    hostname.includes('kids.localhost') ||
    request.nextUrl.searchParams.get('mode') === 'kids';

  // Allow social media crawlers to access pages for OpenGraph metadata
  const userAgent = request.headers.get('user-agent');
  if (isBot(userAgent)) {
    const response = NextResponse.next();
    response.headers.set('x-threadbot-mode', isKidsMode ? 'kids' : 'default');
    return response;
  }

  // Check if this is an admin route
  if (isAdminRoute(pathname)) {
    // Allow access to admin login page and admin auth API
    if (pathname === '/admin/login' || pathname === '/api/admin/auth-check') {
      const response = NextResponse.next();
      response.headers.set('x-threadbot-mode', isKidsMode ? 'kids' : 'default');
      return response;
    }

    // Check for admin auth cookie
    const adminAuthCookie = request.cookies.get('admin-auth');
    if (adminAuthCookie?.value === 'authenticated') {
      const response = NextResponse.next();
      response.headers.set('x-threadbot-mode', isKidsMode ? 'kids' : 'default');
      return response;
    }

    // Redirect to admin login if not authenticated
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Admin authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // All other routes are public - no authentication required
  const response = NextResponse.next();
  response.headers.set('x-threadbot-mode', isKidsMode ? 'kids' : 'default');
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg).*)',
  ],
};
