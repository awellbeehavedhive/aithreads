import { Metadata } from 'next';
import { getArticleByUrl } from '@/lib/article-store';
import { decodeHtmlEntities } from '@/lib/utils';
import ThreadClient from './thread-client';

// Force dynamic rendering for metadata
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ article?: string }>;
}

// Dynamic metadata based on article URL
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const articleUrl = params?.article;

  // Default metadata
  const defaultMetadata: Metadata = {
    title: 'ThreadBot | AI News Analysis',
    description: 'AI-powered news analysis and summaries with Google Search verification',
    openGraph: {
      title: 'ThreadBot | AI News Analysis',
      description: 'AI-powered news analysis and summaries with Google Search verification',
      type: 'website',
      siteName: 'ThreadBot',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'ThreadBot | AI News Analysis',
      description: 'AI-powered news analysis and summaries with Google Search verification',
    },
  };

  if (!articleUrl) {
    return defaultMetadata;
  }

  try {
    // Decode URL in case it's encoded
    const decodedUrl = decodeURIComponent(articleUrl);

    // Look up article directly from permanent store by URL
    const article = await getArticleByUrl(decodedUrl);

    if (article) {
      const cleanTitle = decodeHtmlEntities(article.title?.replace(/ - [^-]+$/, '') || 'ThreadBot');
      const description = decodeHtmlEntities(article.description || 'AI-powered news analysis with Google Search verification');

      return {
        title: `${cleanTitle} | ThreadBot`,
        description: description,
        openGraph: {
          title: cleanTitle,
          description: description,
          type: 'article',
          siteName: 'ThreadBot',
          images: article.urlToImage ? [
            {
              url: article.urlToImage,
              width: 1200,
              height: 630,
              alt: cleanTitle,
            }
          ] : [],
          publishedTime: article.publishedAt,
        },
        twitter: {
          card: 'summary_large_image',
          title: cleanTitle,
          description: description,
          images: article.urlToImage ? [article.urlToImage] : [],
        },
      };
    }

    return defaultMetadata;
  } catch (error) {
    console.error('[OG Metadata] Error:', error);
    return defaultMetadata;
  }
}

export default function ThreadPage() {
  return <ThreadClient />;
}
