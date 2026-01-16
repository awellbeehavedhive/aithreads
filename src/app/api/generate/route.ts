import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCachedBrief, cacheBrief } from '@/lib/thread-cache';
import { buildKidsBriefingPrompt } from '@/lib/kids-prompts';
import type { SiteMode } from '@/lib/mode-context';

const API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'Gemini API key is not configured' },
      { status: 500 }
    );
  }

  try {
    const { title, content, description, url, mode = 'default' } = await request.json();
    const siteMode: SiteMode = mode === 'kids' ? 'kids' : 'default';

    // Check cache first (mode-specific)
    const cachedBrief = await getCachedBrief(title, url, siteMode);
    if (cachedBrief) {
      console.log(`[API] Returning cached brief (${siteMode}) for: ${title.substring(0, 50)}...`);
      return NextResponse.json({ thread: cachedBrief, cached: true });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    // Enable Google Search grounding to find primary sources
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      // @ts-expect-error - googleSearch is a valid tool but not in SDK types yet
      tools: [{ googleSearch: {} }],
    });

    // Build prompt based on mode - kids mode uses age-appropriate prompts
    const prompt = siteMode === 'kids'
      ? buildKidsBriefingPrompt({ title, description, content, url })
      : buildBriefingPrompt({ title, description, content, url });

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
              const chunkUrl = new URL(chunk.web.uri);
              const domain = chunkUrl.hostname.replace('www.', '');

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

    // Cache the generated brief (mode-specific)
    await cacheBrief(title, text, url, siteMode);

    return NextResponse.json({ thread: text, cached: false, mode: siteMode });
  } catch (error: unknown) {
    console.error('Error generating AI thread:', error);
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}

/**
 * Build briefing prompt optimized for Google grounding to find primary sources
 * Creates narrative-style key facts that tell the story while remaining factual
 */
function buildBriefingPrompt(article: { title: string; description?: string; content?: string; url?: string }): string {
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
