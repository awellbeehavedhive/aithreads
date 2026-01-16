import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCachedAnalysis, cacheAnalysis } from '@/lib/thread-cache';
import { buildKidsAnalysisPrompt } from '@/lib/kids-prompts';
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
    const { title, content, description, existingBrief, url, mode = 'default' } = await request.json();
    const siteMode: SiteMode = mode === 'kids' ? 'kids' : 'default';

    // Check cache first (mode-specific)
    const cachedAnalysis = await getCachedAnalysis(title, url, siteMode);
    if (cachedAnalysis) {
      console.log(`[API] Returning cached analysis (${siteMode}) for: ${title.substring(0, 50)}...`);
      return NextResponse.json({ analysis: cachedAnalysis, cached: true });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    // Using Google Search grounding for real citations
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      // @ts-expect-error - googleSearch is a valid tool but not in SDK types yet
      tools: [{ googleSearch: {} }],
    });

    // Build prompt based on mode - kids mode uses age-appropriate analysis prompts
    const prompt = siteMode === 'kids'
      ? buildKidsAnalysisPrompt({ title, description, content, existingBrief })
      : buildDefaultAnalysisPrompt({ title, description, content, existingBrief });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Strip any preamble before the first heading
    const headingMatch = text.match(/##\s+/);
    if (headingMatch && headingMatch.index && headingMatch.index > 0) {
      text = text.substring(headingMatch.index);
    }

    // Extract citations from grounding metadata
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
      const citations: string[] = [];
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
              citations.push(`- [${sourceTitle}](${chunk.web.uri})`);
            }
          } catch {
            // Skip invalid URLs
          }
        }
      }

      if (citations.length > 0 && !text.includes('## Sources') && !text.includes('## Citations')) {
        text += `\n\n## Sources\n${citations.slice(0, 5).join('\n')}`;
      }
    }

    // Cache the generated analysis (mode-specific)
    await cacheAnalysis(title, text, url, siteMode);

    return NextResponse.json({ analysis: text, cached: false, mode: siteMode });
  } catch (error: unknown) {
    console.error('Error generating analysis:', error);
    return NextResponse.json(
      { error: 'Failed to generate analysis' },
      { status: 500 }
    );
  }
}

/**
 * Build the default (adult) analysis prompt
 */
function buildDefaultAnalysisPrompt(article: {
  title: string;
  description?: string;
  content?: string;
  existingBrief?: string;
}): string {
  return `You are an expert news analyst providing deep contextual analysis.

CRITICAL: Start your response DIRECTLY with "## Context & Analysis" - no preamble, no introduction, no conversational text like "Okay" or "I'm ready to provide" or "Here is the analysis". Just begin with the heading immediately.

The user has already read a brief summary of this article. Now they want deeper context and analysis.

EXISTING BRIEF (for reference):
${article.existingBrief}

YOUR TASK:
Provide a comprehensive "Context & Analysis" section that goes beyond the basic facts.

CRITICAL REQUIREMENTS:
1. Use Google Search extensively to find historical context, expert opinions, and related developments
2. Include specific citations (e.g., "according to industry analyst John Smith at Gartner")
3. Aim for 250-350 words of deep analysis
4. Connect dots between this story and broader trends

DO NOT repeat the facts already covered in the brief above.
DO NOT use emojis or sensationalist language.

STRUCTURE (follow exactly):

## Context & Analysis

**Historical Context**
Write 1-2 paragraphs explaining:
- How does this relate to past events or trends?
- What's the historical pattern or trajectory?
- Has something like this happened before? What was the outcome?

**Broader Implications**
Write 1-2 paragraphs analyzing implications by reasoning from fundamentals:
- Break down the situation to its fundamental truths and build up from there
- What are the underlying forces, incentives, and constraints at play?
- Reason from the ground up: what must logically follow from these fundamentals?
- Consider second and third-order effects that may not be immediately obvious
- Impact on the industry, sector, market, and related stakeholders
- Policy, regulatory, legal, and societal implications

Do NOT mention "first principles" in your output - just apply the reasoning approach.

**Expert Perspectives & Future Outlook**
Write 1-2 paragraphs addressing:
- What are experts and analysts saying about this?
- What are the competing viewpoints or controversies?
- What are the potential risks and opportunities ahead?
- What should readers watch for next?

**Related Developments**
Write 1 paragraph connecting to:
- Other relevant news or concurrent events
- Broader trends this fits into
- Additional context readers should know

TONE: Deeply analytical, thoroughly researched, and insightful. Write as if for The Economist's analysis section or Bloomberg's deep dives.

Original Article:
Title: ${article.title}
Description: ${article.description}
Content Snippet: ${article.content}

Now search for expert opinions, historical context, and related developments to provide comprehensive analysis.`;
}

