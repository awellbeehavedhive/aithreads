/**
 * Topic Summary Generator
 *
 * Uses Gemini 2.0 Flash with Google Search grounding to generate
 * unified topic summaries from multiple source articles.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Topic, ArticleCluster, TopicSource } from '@/types';
import { selectBestImage, calculateTopicImportance } from './topic-clustering';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the prompt for topic synthesis
 */
function buildTopicPrompt(cluster: ArticleCluster): string {
  // Number each source for citation references
  const sourceList = cluster.articles
    .map((a, i) => `[${i + 1}] "${a.title}" (${a.source.name})`)
    .join('\n');

  const sourceDescriptions = cluster.articles
    .filter(a => a.description)
    .slice(0, 10) // Limit to avoid token overflow
    .map((a, i) => `[${cluster.articles.indexOf(a) + 1}] ${a.source.name}: ${a.description}`)
    .join('\n\n');

  return `You are synthesizing ${cluster.articles.length} news sources covering the same story into a unified topic briefing.

## SOURCE ARTICLES (with citation numbers)
${sourceList}

## SOURCE DESCRIPTIONS
${sourceDescriptions}

## YOUR TASK
Create a unified topic briefing that synthesizes all perspectives. Use numbered citations [1], [2], etc. to reference specific sources when mentioning facts or quotes.

## OUTPUT FORMAT (follow exactly):

## HEADLINE: [Your headline here]
Write a clear, neutral headline (8-15 words) that captures the core story. Do NOT copy any single source's headline - create an original synthesis. Replace "[Your headline here]" with the actual headline.

## Executive Summary
Write 2-3 sentences that tell the complete story arc. Include the key who/what/when/where and why it matters.

## Key Developments
Write exactly 5 narrative bullet points that synthesize the story from ALL sources:

Each bullet should:
1. Open with a **bold narrative hook** (not just a label)
2. Synthesize information from multiple sources with citations like [1], [2], [3]
3. Include specific details (numbers, names, quotes where available)
4. Note any significant differences in how sources report the story

Cover these angles:
- The core news event and its significance
- Key players and their statements/actions
- Context and background
- Reactions and immediate impact
- What happens next / broader implications

## Source Perspectives
Note any meaningful differences in how sources covered this story. Did different outlets emphasize different aspects? Any conflicting information? (2-3 sentences)

IMPORTANT: Do NOT include a "Sources" or "References" section at the end. The sources will be displayed separately with rich formatting. Just use [1], [2], etc. inline citations throughout the text.

## TONE & STYLE
- Professional, neutral, factual
- NO editorializing or opinion
- Be specific: use numbers, names, dates
- Use inline citations like [1], [2] to attribute facts to specific sources
- If sources disagree, note the disagreement without taking sides
- Aim for 400-500 words total`;
}

// ============================================================================
// MAIN GENERATION
// ============================================================================

/**
 * Generate a Topic from an ArticleCluster using Gemini
 */
export async function generateTopic(cluster: ArticleCluster): Promise<Topic> {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    // @ts-expect-error - googleSearch is a valid tool but not in SDK types yet
    tools: [{ googleSearch: {} }],
  });

  const prompt = buildTopicPrompt(cluster);

  console.log(`[TopicGen] Generating summary for cluster with ${cluster.articles.length} sources...`);

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();

  // Extract title from the generated content
  // Try new format first: "## HEADLINE: ..."
  let titleMatch = text.match(/^##\s+HEADLINE:\s*(.+)$/m);
  if (!titleMatch) {
    // Fallback to old format: first ## heading
    titleMatch = text.match(/^##\s+(.+)$/m);
  }

  let title = titleMatch ? titleMatch[1].trim() : '';

  // Check if title is a placeholder or empty - use best article title as fallback
  const isPlaceholder = !title ||
    title.toLowerCase().includes('[unified headline]') ||
    title.toLowerCase().includes('[your headline') ||
    title.toLowerCase().includes('headline:') ||
    title.startsWith('[') ||
    title.length < 10;

  if (isPlaceholder) {
    // Use the highest-scored article's title as fallback
    const bestArticle = cluster.articles.reduce((best, article) =>
      (article.aiScore || 0) > (best.aiScore || 0) ? article : best
    );
    title = bestArticle.title;
    console.log(`[TopicGen] Using fallback title: "${title.substring(0, 50)}..."`);
  }

  // Extract executive summary (text after "## Executive Summary" until next ##)
  const summaryMatch = text.match(/## Executive Summary\s*\n([\s\S]*?)(?=\n## |$)/i);
  const summary = summaryMatch
    ? summaryMatch[1].trim().split('\n')[0] // First paragraph only
    : `Coverage from ${cluster.articles.length} sources on this developing story.`;

  // Build TopicSource array with images
  const sources: TopicSource[] = cluster.articles.map(a => ({
    title: a.title,
    url: a.url,
    source: a.source.name,
    publishedAt: a.publishedAt,
    aiScore: a.aiScore,
    urlToImage: a.urlToImage || undefined,
  }));

  // Calculate importance score
  const importance = calculateTopicImportance(cluster);

  // Select best image
  const image = selectBestImage(cluster.articles);

  // Clean up fullBrief - replace placeholder headline with actual title
  let fullBrief = text
    .replace(/^##\s+HEADLINE:\s*.+$/m, `## ${title}`)
    .replace(/^##\s+\[Unified Headline\].*$/gim, `## ${title}`)
    .replace(/^##\s+\[Your headline.*$/gim, `## ${title}`);

  const topic: Topic = {
    id: cluster.id,
    title,
    summary,
    fullBrief,
    image,
    sourceCount: cluster.articles.length,
    sources,
    categories: cluster.categories,
    importance,
    publishedAt: cluster.newestPublishedAt,
    createdAt: Date.now(),
  };

  console.log(`[TopicGen] Generated: "${title.substring(0, 50)}..." (${importance} importance)`);

  return topic;
}

/**
 * Generate topics for multiple clusters with rate limiting
 */
export async function generateTopics(
  clusters: ArticleCluster[],
  options: { delayMs?: number; maxTopics?: number } = {}
): Promise<{ topics: Topic[]; failed: number }> {
  const { delayMs = 1000, maxTopics = 15 } = options;

  const topics: Topic[] = [];
  let failed = 0;

  const clustersToProcess = clusters.slice(0, maxTopics);
  console.log(`[TopicGen] Generating ${clustersToProcess.length} topic summaries...`);

  for (let i = 0; i < clustersToProcess.length; i++) {
    const cluster = clustersToProcess[i];

    try {
      const topic = await generateTopic(cluster);
      topics.push(topic);

      // Rate limiting delay between requests
      if (i < clustersToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`[TopicGen] Failed to generate topic for cluster ${cluster.id}:`, error);
      failed++;
    }
  }

  console.log(`[TopicGen] Complete: ${topics.length} generated, ${failed} failed`);

  return { topics, failed };
}

// ============================================================================
// FALLBACK TOPIC (NO AI)
// ============================================================================

/**
 * Create a basic topic without AI generation (fallback)
 */
export function createFallbackTopic(cluster: ArticleCluster): Topic {
  // Use the best-scoring article's title as the topic title
  const bestArticle = cluster.articles.reduce((best, article) =>
    (article.aiScore || 0) > (best.aiScore || 0) ? article : best
  );

  const sources: TopicSource[] = cluster.articles.map(a => ({
    title: a.title,
    url: a.url,
    source: a.source.name,
    publishedAt: a.publishedAt,
    aiScore: a.aiScore,
    urlToImage: a.urlToImage || undefined,
  }));

  const sourceNames = [...new Set(cluster.articles.map(a => a.source.name))].join(', ');

  return {
    id: cluster.id,
    title: bestArticle.title,
    summary: `This story is being covered by ${cluster.articles.length} sources including ${sourceNames}.`,
    fullBrief: `## ${bestArticle.title}\n\nThis story is being reported by ${cluster.articles.length} sources including ${sourceNames}. See the sources below for full coverage.`,
    image: selectBestImage(cluster.articles),
    sourceCount: cluster.articles.length,
    sources,
    categories: cluster.categories,
    importance: calculateTopicImportance(cluster),
    publishedAt: cluster.newestPublishedAt,
    createdAt: Date.now(),
  };
}
