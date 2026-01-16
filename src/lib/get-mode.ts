import { headers } from 'next/headers';

export type SiteMode = 'default' | 'kids';

/**
 * Server-side function to get the current site mode
 * Reads from x-threadbot-mode header set by middleware
 */
export async function getMode(): Promise<SiteMode> {
  const headersList = await headers();
  const mode = headersList.get('x-threadbot-mode');
  return mode === 'kids' ? 'kids' : 'default';
}
