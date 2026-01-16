/**
 * AI-Powered Article Ranking System
 *
 * Uses Gemini to analyze and rank articles by interest, importance, and quality.
 * Filters out clickbait and prioritizes substantive, newsworthy content.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Article } from '@/types';
import { getSourceAuthorityBoost } from './constants';

const API_KEY = process.env.GEMINI_API_KEY;

interface RankedArticle extends Article {
  aiScore: number;
  aiReason: string;
  isFeatured?: boolean;
  kidsScore?: number;    // Kid-friendliness score (0-100)
  kidsTitle?: string;    // Simplified, engaging title for kids
}

interface RankingResult {
  rankedArticles: RankedArticle[];
  featuredArticle: RankedArticle | null;
}

/**
 * Rank articles using AI analysis
 *
 * For large article sets, processes in chunks to avoid token limits
 */
export async function rankArticles(
  articles: Article[],
  category: string
): Promise<RankingResult> {
  if (!API_KEY) {
    console.error('[Ranker] Gemini API key not configured');
    // Return unranked articles as fallback
    return {
      rankedArticles: articles.map((a, i) => ({
        ...a,
        aiScore: 100 - i,
        aiReason: 'Not ranked (API key missing)',
        kidsScore: 50, // Default middle score
        kidsTitle: '',
      })),
      featuredArticle: articles[0] as RankedArticle || null,
    };
  }

  if (articles.length === 0) {
    return { rankedArticles: [], featuredArticle: null };
  }

  // If we have more than 100 articles, process in chunks to avoid token limits
  const CHUNK_SIZE = 100;
  if (articles.length > CHUNK_SIZE) {
    console.log(`[Ranker] Processing ${articles.length} ${category} articles in chunks of ${CHUNK_SIZE}`);
    const allRanked: RankedArticle[] = [];

    for (let i = 0; i < articles.length; i += CHUNK_SIZE) {
      const chunk = articles.slice(i, i + CHUNK_SIZE);
      console.log(`[Ranker] Ranking chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(articles.length/CHUNK_SIZE)} (${chunk.length} articles)`);

      const chunkResult = await rankArticlesChunk(chunk, category);
      allRanked.push(...chunkResult.rankedArticles);

      // Small delay between chunks to avoid rate limits
      if (i + CHUNK_SIZE < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Re-sort all articles by score
    allRanked.sort((a, b) => b.aiScore - a.aiScore);

    return {
      rankedArticles: allRanked,
      featuredArticle: allRanked[0] || null,
    };
  }

  // For smaller sets, rank all at once
  return rankArticlesChunk(articles, category);
}

/**
 * Rank a single chunk of articles (internal helper)
 */
async function rankArticlesChunk(
  articles: Article[],
  category: string
): Promise<RankingResult> {

  try {
    console.log(`[Ranker] Analyzing ${articles.length} articles in ${category}...`);

    if (!API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Prepare article summaries for analysis
    const articleSummaries = articles.map((article, index) => ({
      id: index,
      title: article.title,
      description: article.description || 'No description',
      source: article.source.name,
    }));

    const prompt = `You are an expert news curator ranking articles for a general audience news aggregator.

TASK: Score these ${category} news articles on quality/importance AND kid-friendliness.

## SCORING PHILOSOPHY

Think like an editor at a major news outlet deciding what goes on the front page vs. buried inside.
Ask yourself: "Would a thoughtful, curious person want to know about this?"

**USE THE FULL 0-100 RANGE.** Differentiate clearly between articles:
- 85-100: Exceptional - Would lead a major newspaper. Significant developments affecting many people, groundbreaking discoveries, major policy changes, important investigative reporting.
- 70-84: Strong - Front page worthy. Notable news with clear significance, quality reporting from reputable sources, stories with real-world implications.
- 50-69: Average - Solid news but routine. Standard coverage, niche interest, or incremental updates on ongoing stories.
- 30-49: Below average - Minor significance. Listicles, promotional content disguised as news, very narrow appeal, or clickbait-adjacent headlines.
- 0-29: Low quality - Fluff, pure entertainment, press releases, or content with little informational value.

**SCORING PRINCIPLES:**
- Compare articles RELATIVE to each other in this batch
- A story affecting millions of people > a story affecting thousands > a story affecting dozens
- Original reporting > aggregated content > opinion
- Actionable information > passive consumption
- Don't cluster scores - if you have 20 articles, spread them across at least 40 points of range
- The best article in this batch should be notably higher than the median

## QUALITY SIGNALS (weighted by importance):

**High impact indicators (+15-25 points):**
- Affects public health, safety, or policy
- Represents a significant change or development
- Has lasting implications beyond the news cycle
- Comes from primary reporting or expert sources

**Medium impact indicators (+5-15 points):**
- Timely and relevant to current events
- Provides useful context or analysis
- From established, reputable sources
- Offers a unique perspective or angle

**Low/negative indicators (-5-20 points):**
- Listicle or "best of" format without substance
- Primarily promotional or sponsored-feeling
- Clickbait headline that overpromises
- Very narrow geographic or demographic appeal
- Rehashed or aggregated without new insight

## KIDS MODE SCORING (kidsScore 0-100):

For ages 8-12. High scores = safe, engaging, educational.
- 80-100: Great for kids - discoveries, achievements, animals, space, sports, inventions
- 60-79: OK with context - business, environment, mild current events
- 40-59: Borderline - mature themes but potentially educational
- 0-39: Not appropriate - violence, crime, war, adult content

## ARTICLES TO RANK:

${articleSummaries.map(a => `[${a.id}] "${a.title}" - ${a.source}`).join('\n')}

## OUTPUT FORMAT:

Return ONLY a JSON array. For each article:
- id: article index (0-${articles.length - 1})
- score: integer 0-100 (use full range, differentiate clearly)
- reason: 10-15 word explanation
- kidsScore: integer 0-100
- kidsTitle: If kidsScore >= 50, a fun simple title (<60 chars). Otherwise ""

Example: [{"id": 0, "score": 82, "reason": "Major policy change affecting millions, quality reporting", "kidsScore": 45, "kidsTitle": ""}]

Return ONLY valid JSON, no markdown or extra text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Log raw response for debugging
    console.log(`[Ranker] Raw Gemini response for ${category} (first 500 chars):`, text.substring(0, 500));

    // Parse JSON response with multiple fallback strategies
    let rankings: Array<{ id: number; score: number; reason: string; kidsScore?: number; kidsTitle?: string }>;
    
    try {
      // Strategy 1: Extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      // Strategy 2: Clean up common JSON issues before parsing
      let jsonText = jsonMatch[0];
      
      // Fix unescaped quotes in strings
      jsonText = jsonText.replace(/"reason":\s*"([^"]*)"([^"]*)"([^"]*)"/g, (match, p1, p2, p3) => {
        // If there's an unescaped quote in the middle, escape it
        return `"reason": "${p1}\\"${p2}\\"${p3}"`;
      });
      
      // Fix trailing commas
      jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');
      
      // Fix single quotes (should be double quotes)
      jsonText = jsonText.replace(/'/g, '"');

      rankings = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[Ranker] JSON parse error:', parseError);
      console.error('[Ranker] Raw response:', text.substring(0, 500));
      
      // Strategy 3: Retry with a simpler prompt
      console.log('[Ranker] Retrying with simplified prompt...');
      const retryPrompt = `Score these ${category} articles 0-100 on news quality (use full range, spread scores widely).
Also score kid-friendliness 0-100. Return ONLY valid JSON array.

Articles:
${articleSummaries.map(a => `[${a.id}] ${a.title}`).join('\n')}

Format: [{"id":0,"score":85,"reason":"significant news","kidsScore":70,"kidsTitle":"Fun Title"},{"id":1,"score":42,"reason":"minor listicle","kidsScore":30,"kidsTitle":""}]`;

      const retryResult = await model.generateContent(retryPrompt);
      const retryResponse = await retryResult.response;
      const retryText = retryResponse.text();
      
      const retryMatch = retryText.match(/\[[\s\S]*\]/);
      if (!retryMatch) {
        throw new Error('Retry failed: No JSON array found');
      }
      
      rankings = JSON.parse(retryMatch[0]);
    }

    // Log score distribution before validation
    const scoreStats = {
      min: Math.min(...rankings.map(r => r.score)),
      max: Math.max(...rankings.map(r => r.score)),
      avg: rankings.reduce((sum, r) => sum + r.score, 0) / rankings.length,
      negative: rankings.filter(r => r.score < 0).length,
    };
    console.log(`[Ranker] ${category} score stats BEFORE validation:`, scoreStats);

    // Apply rankings to articles with source authority boost
    const rankedArticles: RankedArticle[] = rankings
      .map(ranking => {
        const article = articles[ranking.id];
        // Validate and clamp scores to 0-100 range
        let validatedScore = ranking.score;
        if (typeof validatedScore !== 'number' || isNaN(validatedScore)) {
          console.warn(`[Ranker] Invalid score for article ${ranking.id}: ${validatedScore}, using 50`);
          validatedScore = 50;
        } else if (validatedScore < 0 || validatedScore > 100) {
          console.warn(`[Ranker] ${category} - Score out of range for article ${ranking.id} "${article.title.substring(0, 50)}": ${validatedScore}, clamping to ${Math.max(0, Math.min(100, validatedScore))}`);
          validatedScore = Math.max(0, Math.min(100, validatedScore));
        }

        // Apply source authority boost (up to +20 for premium sources)
        const authorityBoost = getSourceAuthorityBoost(article.source.name);
        const boostedScore = Math.min(100, validatedScore + authorityBoost);

        if (authorityBoost > 0) {
          console.log(`[Ranker] ${article.source.name}: +${authorityBoost} authority boost (${validatedScore} → ${boostedScore})`);
        }

        // Validate and clamp kidsScore
        let validatedKidsScore = ranking.kidsScore;
        if (typeof validatedKidsScore !== 'number' || isNaN(validatedKidsScore)) {
          validatedKidsScore = 0; // Default to not kid-friendly if missing
        } else {
          validatedKidsScore = Math.max(0, Math.min(100, validatedKidsScore));
        }

        return {
          ...article,
          aiScore: boostedScore,
          aiReason: authorityBoost > 0
            ? `${ranking.reason} (+${authorityBoost} authority)`
            : ranking.reason,
          kidsScore: validatedKidsScore,
          kidsTitle: ranking.kidsTitle || '',
        };
      })
      .sort((a, b) => b.aiScore - a.aiScore); // Sort by boosted score descending

    // Mark the top article as featured
    const featuredArticle: RankedArticle | null = rankedArticles.length > 0
      ? { ...rankedArticles[0], isFeatured: true }
      : null;

    if (featuredArticle) {
      console.log(`[Ranker] Ranked ${rankedArticles.length} articles. Featured: "${featuredArticle.title.substring(0, 50)}..."`);
    }
    console.log(`[Ranker] Top 3 scores: ${rankedArticles.slice(0, 3).map(a => a.aiScore).join(', ')}`);

    return {
      rankedArticles,
      featuredArticle,
    };
  } catch (error) {
    console.error('[Ranker] Error ranking articles:', error);
    
    // Fallback: return articles in original order with default scores
    const rankedArticles = articles.map((article, index) => ({
      ...article,
      aiScore: 100 - (index * 5),
      aiReason: 'Ranking failed, using default order',
      kidsScore: 50, // Default middle score
      kidsTitle: '',
    }));

    return {
      rankedArticles,
      featuredArticle: rankedArticles[0] || null,
    };
  }
}

/**
 * Rank articles for multiple categories
 */
export async function rankArticlesByCategory(
  categorizedArticles: Record<string, Article[]>
): Promise<Record<string, RankingResult>> {
  const results: Record<string, RankingResult> = {};

  for (const [category, articles] of Object.entries(categorizedArticles)) {
    try {
      results[category] = await rankArticles(articles, category);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[Ranker] Failed to rank ${category}:`, error);
      
      // Fallback
      results[category] = {
        rankedArticles: articles.map((a, i) => ({
          ...a,
          aiScore: 100 - i,
          aiReason: 'Ranking error',
          kidsScore: 50,
          kidsTitle: '',
        })),
        featuredArticle: articles[0] as RankedArticle || null,
      };
    }
  }

  return results;
}

