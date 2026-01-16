import { NextResponse } from 'next/server';
import { getThreadCacheStats, clearExpiredThreads } from '@/lib/thread-cache';

/**
 * API route to view thread cache statistics
 * Useful for monitoring and debugging
 */
export async function GET() {
  try {
    // Clear expired entries first
    const cleared = await clearExpiredThreads();
    
    // Get current stats
    const stats = await getThreadCacheStats();
    
    return NextResponse.json({
      success: true,
      stats,
      clearedExpired: cleared,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[ThreadCacheStats] Error:', err.message);
    return NextResponse.json(
      { error: 'Failed to get cache stats', details: err.message },
      { status: 500 }
    );
  }
}

