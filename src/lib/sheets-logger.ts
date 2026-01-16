/**
 * Google Sheets Logger
 *
 * Logs article lifecycle to Google Sheets for inspection:
 * - Articles fetched per cycle
 * - Deduplication events
 * - AI ratings
 * - Display status
 * - Cache purges
 */

import { google } from 'googleapis';
import { Article } from '@/types';

// Note: These are read dynamically in getGoogleSheetsClient() to ensure
// they are available in serverless environments where module caching may occur

interface LogEntry {
  timestamp: string;
  cycle_id: string;
  category: string;
  event_type: 'FETCH' | 'DEDUPE' | 'RANK' | 'DISPLAY' | 'PURGE';
  article_url: string;
  article_title: string;
  source_provider: string;
  source_name: string;
  ai_score?: number;
  reason?: string;
  metadata?: string;
}

/**
 * Get the spreadsheet ID from environment
 */
export function getSpreadsheetId(): string | undefined {
  return process.env.GOOGLE_SHEETS_ARTICLE_LOG_ID;
}

/**
 * Get authenticated Google Sheets client
 */
export async function getGoogleSheetsClient() {
  const GOOGLE_CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ARTICLE_LOG_ID;

  if (!GOOGLE_CREDENTIALS || !SPREADSHEET_ID) {
    console.log('[SheetsLogger] Google Sheets credentials not configured, skipping logging');
    console.log(`[SheetsLogger] SPREADSHEET_ID: ${SPREADSHEET_ID ? 'set' : 'missing'}, CREDENTIALS: ${GOOGLE_CREDENTIALS ? 'set' : 'missing'}`);
    return null;
  }

  try {
    const credentials = JSON.parse(GOOGLE_CREDENTIALS);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient as any });

    return sheets;
  } catch (error: any) {
    console.error('[SheetsLogger] Failed to initialize Google Sheets:', error.message);
    return null;
  }
}

/**
 * Log a batch of entries to Google Sheets
 */
async function logToSheet(entries: LogEntry[]) {
  if (entries.length === 0) return;

  const sheets = await getGoogleSheetsClient();
  if (!sheets) return;

  const SPREADSHEET_ID = getSpreadsheetId();
  if (!SPREADSHEET_ID) return;

  try {
    const rows = entries.map(entry => [
      entry.timestamp,
      entry.cycle_id,
      entry.category,
      entry.event_type,
      entry.article_url,
      entry.article_title,
      entry.source_provider,
      entry.source_name,
      entry.ai_score ?? '',
      entry.reason ?? '',
      entry.metadata ?? '',
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ArticleLog!A:K',
      valueInputOption: 'RAW',
      requestBody: {
        values: rows,
      },
    });

    console.log(`[SheetsLogger] Logged ${entries.length} entries to Google Sheets`);
  } catch (error: any) {
    console.error('[SheetsLogger] Failed to log to Google Sheets:', error.message);
  }
}

/**
 * Initialize the Google Sheet with headers if needed
 */
export async function initializeSheet() {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) return;

  const SPREADSHEET_ID = getSpreadsheetId();
  if (!SPREADSHEET_ID) return;

  try {
    // Check if headers exist
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ArticleLog!A1:K1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'ArticleLog!A1:K1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'Timestamp',
            'Cycle ID',
            'Category',
            'Event Type',
            'Article URL',
            'Article Title',
            'Source Provider',
            'Source Name',
            'AI Score',
            'Reason',
            'Metadata',
          ]],
        },
      });

      console.log('[SheetsLogger] Initialized Google Sheets with headers');
    }
  } catch (error: any) {
    console.error('[SheetsLogger] Failed to initialize sheet:', error.message);
  }
}

/**
 * Article Lifecycle Logger
 */
export class ArticleLifecycleLogger {
  private cycleId: string;
  private category: string;
  private entries: LogEntry[];

  constructor(category: string) {
    this.cycleId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.category = category;
    this.entries = [];
  }

  /**
   * Log articles fetched from source
   */
  logFetch(articles: Article[], sourceProvider: string) {
    const timestamp = new Date().toISOString();

    for (const article of articles) {
      this.entries.push({
        timestamp,
        cycle_id: this.cycleId,
        category: this.category,
        event_type: 'FETCH',
        article_url: article.url,
        article_title: article.title,
        source_provider: article.sourceProvider || sourceProvider,
        source_name: article.source?.name || sourceProvider,
        metadata: `publishedAt: ${article.publishedAt}`,
      });
    }
  }

  /**
   * Log article deduplication
   */
  logDedupe(article: Article, reason: string, keptVersion?: Article) {
    const timestamp = new Date().toISOString();

    this.entries.push({
      timestamp,
      cycle_id: this.cycleId,
      category: this.category,
      event_type: 'DEDUPE',
      article_url: article.url,
      article_title: article.title,
      source_provider: article.sourceProvider || 'unknown',
      source_name: article.source?.name || 'unknown',
      reason,
      metadata: keptVersion ? `kept: ${keptVersion.url}` : '',
    });
  }

  /**
   * Log article ranking
   */
  logRank(article: Article, aiScore: number, aiReason: string) {
    const timestamp = new Date().toISOString();

    this.entries.push({
      timestamp,
      cycle_id: this.cycleId,
      category: this.category,
      event_type: 'RANK',
      article_url: article.url,
      article_title: article.title,
      source_provider: article.sourceProvider || 'unknown',
      source_name: article.source?.name || 'unknown',
      ai_score: aiScore,
      reason: aiReason,
    });
  }

  /**
   * Log articles displayed on site
   */
  logDisplay(articles: Article[], sortOrder: string) {
    const timestamp = new Date().toISOString();

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      this.entries.push({
        timestamp,
        cycle_id: this.cycleId,
        category: this.category,
        event_type: 'DISPLAY',
        article_url: article.url,
        article_title: article.title,
        source_provider: article.sourceProvider || 'unknown',
        source_name: article.source?.name || 'unknown',
        ai_score: (article as any).aiScore,
        metadata: `position: ${i + 1}, sort: ${sortOrder}`,
      });
    }
  }

  /**
   * Log articles purged from cache
   */
  logPurge(articles: Article[], reason: string) {
    const timestamp = new Date().toISOString();

    for (const article of articles) {
      this.entries.push({
        timestamp,
        cycle_id: this.cycleId,
        category: this.category,
        event_type: 'PURGE',
        article_url: article.url,
        article_title: article.title,
        source_provider: article.sourceProvider || 'unknown',
        source_name: article.source?.name || 'unknown',
        ai_score: (article as any).aiScore,
        reason,
      });
    }
  }

  /**
   * Flush all logged entries to Google Sheets
   */
  async flush() {
    if (this.entries.length === 0) {
      console.log(`[SheetsLogger] No entries to flush for ${this.category}`);
      return;
    }

    console.log(`[SheetsLogger] Flushing ${this.entries.length} entries for ${this.category}`);
    await logToSheet(this.entries);
    this.entries = [];
  }

  /**
   * Get summary of logged events
   */
  getSummary() {
    const summary = {
      cycleId: this.cycleId,
      category: this.category,
      totalEvents: this.entries.length,
      byType: {} as Record<string, number>,
    };

    for (const entry of this.entries) {
      summary.byType[entry.event_type] = (summary.byType[entry.event_type] || 0) + 1;
    }

    return summary;
  }
}

/**
 * Create a logger for a refresh cycle
 */
export function createCycleLogger(category: string): ArticleLifecycleLogger {
  return new ArticleLifecycleLogger(category);
}

/**
 * Source Performance Entry for tracking source-level metrics
 */
interface SourcePerformanceEntry {
  timestamp: string;
  cycle_id: string;
  category: string;
  source_provider: string;
  source_name: string;
  articles_fetched: number;
  articles_after_image_filter: number;
  articles_after_dedupe: number;
  articles_displayed: number;
  display_rate: number; // percentage
  avg_ai_score: number;
  success: boolean;
  failure_reason?: string;
}

/**
 * Log source performance metrics to Google Sheets
 */
export async function logSourcePerformance(entry: SourcePerformanceEntry) {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) return;

  const SPREADSHEET_ID = getSpreadsheetId();
  if (!SPREADSHEET_ID) return;

  try {
    const row = [
      entry.timestamp,
      entry.cycle_id,
      entry.category,
      entry.source_provider,
      entry.source_name,
      entry.articles_fetched,
      entry.articles_after_image_filter,
      entry.articles_after_dedupe,
      entry.articles_displayed,
      entry.display_rate.toFixed(2) + '%',
      entry.avg_ai_score.toFixed(1),
      entry.success ? 'SUCCESS' : 'FAILED',
      entry.failure_reason || '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'SourcePerformance!A:M',
      valueInputOption: 'RAW',
      requestBody: {
        values: [row],
      },
    });

    console.log(`[SheetsLogger] Logged source performance for ${entry.source_provider}`);
  } catch (error: any) {
    console.error('[SheetsLogger] Failed to log source performance:', error.message);
  }
}

/**
 * Initialize the Source Performance sheet with headers if needed
 */
export async function initializeSourcePerformanceSheet() {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) return;

  const SPREADSHEET_ID = getSpreadsheetId();
  if (!SPREADSHEET_ID) return;

  try {
    // Try to read the sheet to see if it exists
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'SourcePerformance!A1:M1',
      });
      // Sheet exists, headers already there
      console.log('[SheetsLogger] SourcePerformance sheet already exists');
      return;
    } catch (e) {
      // Sheet doesn't exist or has no data, create headers
      console.log('[SheetsLogger] Initializing SourcePerformance sheet...');
    }

    // Create headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'SourcePerformance!A1:M1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Timestamp',
          'Cycle ID',
          'Category',
          'Source Provider',
          'Source Name',
          'Articles Fetched',
          'After Image Filter',
          'After Dedupe',
          'Articles Displayed',
          'Display Rate',
          'Avg AI Score',
          'Status',
          'Failure Reason',
        ]],
      },
    });

    console.log('[SheetsLogger] Initialized SourcePerformance sheet with headers');
  } catch (error: any) {
    console.error('[SheetsLogger] Failed to initialize SourcePerformance sheet:', error.message);
  }
}
