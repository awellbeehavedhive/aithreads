/**
 * Thread Pre-Generation System
 *
 * Pre-generates AI content for the most visible articles using SOTA sorting
 * to ensure instant load times for articles at the top of the page.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { cacheBrief, hasThreadCache } from './thread-cache';
import { ONE_HOUR, getQualityThreshold, MAX_BIN_AGE, MAX_PER_BIN } from './constants';
import { Article } from '@/types';

/**
 * Apply SOTA (State-Of-The-Art) sorting algorithm
 * Same logic as frontend: fetch-time binning with quality thresholds
 */
function applySotaSorting(articles: Article[]): Article[] {
  const now = Date.now();

  // Step 1: Assign each article to a fetch bin (hourly bins)
  const articlesWithBin = articles.map(article => {
    const publishedTime = new Date(article.publishedAt).getTime();
    const ageInHours = Math.floor((now - publishedTime) / ONE_HOUR);

    // Bin articles by hour (0 = current hour, 1 = last hour, etc.)
    const fetchBin = ageInHours;

    return {
      ...article,
      fetchBin,
      ageInHours,
    };
  });

  // Step 2: Group articles by fetch bin
  const articlesByBin = new Map<number, typeof articlesWithBin>();
  articlesWithBin.forEach(article => {
    const bin = article.fetchBin;
    if (!articlesByBin.has(bin)) {
      articlesByBin.set(bin, []);
    }
    articlesByBin.get(bin)!.push(article);
  });

  // Step 3: Sort articles within each bin by AI score
  articlesByBin.forEach(articles => {
    articles.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
  });

  // Step 4: Advanced SOTA sorting matching frontend logic
  const sortedBins = Array.from(articlesByBin.keys()).sort((a, b) => a - b);
  const topArticles: typeof articlesWithBin = [];

  // Take top articles from each bin, matching frontend prioritization
  for (const bin of sortedBins) {
    // Skip bins older than 24 hours to focus on recent content
    if (bin > MAX_BIN_AGE) continue;

    const binArticles = articlesByBin.get(bin)!;
    const threshold = getQualityThreshold(bin);

    // Filter by quality threshold and take top N from each bin
    const qualityArticles = binArticles
      .filter(a => (a.aiScore || 0) >= threshold)
      .slice(0, MAX_PER_BIN);

    topArticles.push(...qualityArticles);
  }

  // Remove duplicates
  const uniqueTopArticles = Array.from(
    new Map(topArticles.map(a => [a.url, a])).values()
  );

  return uniqueTopArticles;
}

/**
 * Generate brief for a single article with Google grounding for primary sources
 */
async function generateBriefForArticle(article: Article): Promise<string> {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  // Enable Google Search grounding to find primary sources
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    // @ts-expect-error - googleSearch is a valid tool but not in SDK types yet
    tools: [{ googleSearch: {} }],
  });

  const prompt = buildBriefingPrompt(article);

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();

  // Strip any preamble before the first heading
  const headingMatch = text.match(/##\s+/);
  if (headingMatch && headingMatch.index && headingMatch.index > 0) {
    text = text.substring(headingMatch.index);
  }

  // If AI didn't include sources, try to add from grounding metadata as fallback
  if (!text.includes('## Sources')) {
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
      const sources: string[] = [];
      const seenDomains = new Set<string>();

      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          try {
            const url = new URL(chunk.web.uri);
            const domain = url.hostname.replace('www.', '');

            // Skip Google's internal search URLs
            if (domain.includes('vertexaisearch') || domain.includes('googleapis')) {
              continue;
            }

            if (!seenDomains.has(domain)) {
              seenDomains.add(domain);
              // Use a clean domain name as the source title, capitalize first letter
              const cleanDomain = domain.split('.')[0];
              const sourceTitle = cleanDomain.charAt(0).toUpperCase() + cleanDomain.slice(1);
              sources.push(`- [${sourceTitle}](${chunk.web.uri})`);
            }
          } catch {
            // Skip invalid URLs
          }
        }
      }

      if (sources.length > 0) {
        const selectedSources = sources.slice(0, 4);
        text += `\n\n## Sources\n${selectedSources.join('\n')}`;
      }
    }
  }

  return text;
}

/**
 * Build briefing prompt optimized for Google grounding to find primary sources
 * Creates narrative-style key facts that tell the story while remaining factual
 */
function buildBriefingPrompt(article: Article): string {
  const originalDomain = article.url ? new URL(article.url).hostname.replace('www.', '') : 'Original Source';

  return `You are a senior news editor creating an engaging yet factual briefing. Your goal is to tell the complete story so readers don't need to click through to the original article.

CRITICAL: Use Google Search to find and verify facts from PRIMARY SOURCES (official statements, government data, company announcements, research papers, regulatory filings).

## YOUR MISSION
Create a briefing that FULLY covers the story. Readers should walk away informed without needing to read the original. Extract ALL key information: who, what, when, where, why, and what happens next.

## STRUCTURE (follow exactly):

## Executive Summary
Write 3-4 sentences that tell the complete story arc. Start with the news, add essential context, and end with why it matters or what comes next. Be specific with names, numbers, and implications.

## Key Facts
Write exactly 5 narrative bullet points. Each should be a mini-paragraph (2-3 sentences) that flows naturally while delivering verified facts.

DO NOT write dry, telegraphic bullets like:
- **Revenue**: $50M in Q4

INSTEAD, write engaging narrative facts like:
- **The numbers tell the story**: The company reported $50 million in Q4 revenue, marking a 40% jump from the same period last year. This surge comes after their new product line launched in September, which CEO Jane Smith called "our most successful release ever."

Each bullet should:
1. Open with a **bold narrative hook** (not just a label)
2. Include specific verified details (numbers, dates, names, quotes)
3. Add context that explains why this detail matters
4. Flow naturally as a complete thought

Cover these angles across your 5 bullets:
- The core news/development and its scale
- Key players involved and what they said
- Background context (how we got here)
- Immediate impact or reaction
- What happens next / broader implications

## Sources
Include 3-5 primary sources. Format as:
- [Descriptive Title](https://url.com) - What this source provides

Prioritize: Official press releases, government data, company filings, research papers, [${originalDomain}](${article.url || '#'}) for original reporting.

## TONE & STYLE
- Professional but accessible - like The Economist or NPR
- NO emojis, NO sensationalism, NO clickbait phrases
- Use active voice and varied sentence structure
- Be specific: "42%" not "significant increase"
- Include direct quotes when available
- Aim for 350-450 words total

Input Article:
Title: ${article.title}
Description: ${article.description || 'N/A'}
Content Snippet: ${article.content || 'N/A'}
Original URL: ${article.url || 'N/A'}

Search for primary sources, verify the facts, then create an engaging briefing that fully informs the reader.`;
}

/**
 * Pre-generate briefs for an array of articles
 */
export async function pregenerateArticles(
  articles: Article[],
  categoryName: string
): Promise<{ success: number; failed: number; skipped: number }> {
  console.log(`[PreGen] Starting pre-generation for ${articles.length} articles in ${categoryName}`);
  
  let success = 0;
  let failed = 0;
  let skipped = 0;

  // Process articles sequentially to avoid rate limits
  for (const article of articles) {
    try {
      // Skip if already cached
      if (await hasThreadCache(article.title, article.url)) {
        console.log(`[PreGen] Skipping (cached): ${article.title.substring(0, 50)}...`);
        skipped++;
        continue;
      }

      // Generate brief
      console.log(`[PreGen] Generating: ${article.title.substring(0, 50)}...`);
      const brief = await generateBriefForArticle(article);
      
      // Cache the result
      await cacheBrief(article.title, brief, article.url);
      success++;
      
      // Small delay to avoid rate limits (500ms between requests)
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`[PreGen] Failed for: ${article.title.substring(0, 50)}...`, error);
      failed++;
    }
  }

  console.log(`[PreGen] Completed ${categoryName}: ${success} success, ${failed} failed, ${skipped} skipped`);
  
  return { success, failed, skipped };
}

/**
 * Pre-generate briefs for top articles using SOTA sorting
 */
export async function pregenerateTopArticles(
  categorizedArticles: Record<string, Article[]>
): Promise<Record<string, { success: number; failed: number; skipped: number }>> {
  console.log('[PreGen] Starting pre-generation for all categories using SOTA sorting');

  const results: Record<string, { success: number; failed: number; skipped: number }> = {};

  // Process each category
  for (const [category, articles] of Object.entries(categorizedArticles)) {
    if (articles.length === 0) {
      console.log(`[PreGen] No articles for ${category}, skipping`);
      continue;
    }

    try {
      // Use SOTA sorting to determine which articles are most visible
      const sotaSorted = applySotaSorting(articles);
      // Take top 6 articles per category (should cover most visible ones)
      const topArticles = sotaSorted.slice(0, 6);

      console.log(`[PreGen] ${category}: ${articles.length} total → ${topArticles.length} top articles selected for pre-generation`);

      const result = await pregenerateArticles(topArticles, category);
      results[category] = result;
    } catch (error) {
      console.error(`[PreGen] Error processing ${category}:`, error);
      results[category] = { success: 0, failed: 6, skipped: 0 };
    }
  }

  const totalSuccess = Object.values(results).reduce((sum, r) => sum + r.success, 0);
  const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failed, 0);
  const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);

  console.log(`[PreGen] All categories complete: ${totalSuccess} success, ${totalFailed} failed, ${totalSkipped} skipped`);

  return results;
}

/**
 * Pre-generate from cached news data
 */
export async function pregenerateFromCache(
  cache: Record<string, { articles: unknown[] }>
): Promise<Record<string, { success: number; failed: number; skipped: number }>> {
  console.log('[PreGen] Pre-generating from news cache using global SOTA sorting');

  // Convert cache to categorized articles
  const categorizedArticles: Record<string, Article[]> = {};

  for (const [category, data] of Object.entries(cache)) {
    if (data.articles && data.articles.length > 0) {
      // Keep all articles for SOTA sorting (not just first 4)
      categorizedArticles[category] = (data.articles as Article[]);
    }
  }

  return pregenerateTopArticles(categorizedArticles);
}

