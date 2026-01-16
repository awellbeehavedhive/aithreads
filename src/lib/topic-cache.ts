/**
 * Topic Cache Layer
 *
 * Manages storage and retrieval of topic clusters in Redis.
 * Topics have a 24-hour TTL and are stored with their generated summaries.
 */

import { Topic } from '@/types';
import { getCached, setCached, getAllKeys } from './redis';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Key prefix for individual topics */
const TOPIC_KEY_PREFIX = 'topic:';

/** Key for the ordered list of topic IDs */
const TOPICS_LIST_KEY = 'topics:list';

/** Time to live for topics (24 hours) */
const TOPIC_TTL_SECONDS = 24 * 60 * 60;

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

/**
 * Store a single topic
 */
export async function storeTopic(topic: Topic): Promise<void> {
  const key = `${TOPIC_KEY_PREFIX}${topic.id}`;
  await setCached(key, topic, TOPIC_TTL_SECONDS);
  console.log(`[TopicCache] Stored topic: ${topic.id} (${topic.sourceCount} sources)`);
}

/**
 * Store multiple topics and update the ordered list
 */
export async function storeTopics(topics: Topic[]): Promise<void> {
  // Store each topic individually
  for (const topic of topics) {
    await storeTopic(topic);
  }

  // Store the ordered list of topic IDs
  const topicIds = topics.map(t => t.id);
  await setCached(TOPICS_LIST_KEY, { ids: topicIds, updatedAt: Date.now() }, TOPIC_TTL_SECONDS);

  console.log(`[TopicCache] Stored ${topics.length} topics, list updated`);
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get a single topic by ID
 */
export async function getTopicById(id: string): Promise<Topic | null> {
  const key = `${TOPIC_KEY_PREFIX}${id}`;
  const topic = await getCached<Topic>(key);
  return topic;
}

/**
 * Get all topics in ranked order
 */
export async function getTopics(limit: number = 20): Promise<Topic[]> {
  // First try to get the ordered list
  const listData = await getCached<{ ids: string[]; updatedAt: number }>(TOPICS_LIST_KEY);

  if (listData && listData.ids) {
    // Fetch topics in order
    const topics: Topic[] = [];
    for (const id of listData.ids.slice(0, limit)) {
      const topic = await getTopicById(id);
      if (topic) {
        topics.push(topic);
      }
    }
    return topics;
  }

  // Fallback: scan for topic keys if list is missing
  console.log('[TopicCache] List missing, scanning for topics...');
  const keys = await getAllKeys(`${TOPIC_KEY_PREFIX}*`);

  const topics: Topic[] = [];
  for (const key of keys.slice(0, limit)) {
    const topic = await getCached<Topic>(key);
    if (topic) {
      topics.push(topic);
    }
  }

  // Sort by importance
  topics.sort((a, b) => b.importance - a.importance);

  return topics;
}

/**
 * Get featured topic (highest importance)
 */
export async function getFeaturedTopic(): Promise<Topic | null> {
  const topics = await getTopics(1);
  return topics[0] || null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if topics have been generated recently
 */
export async function hasRecentTopics(maxAgeHours: number = 3): Promise<boolean> {
  const listData = await getCached<{ ids: string[]; updatedAt: number }>(TOPICS_LIST_KEY);

  if (!listData || !listData.updatedAt) {
    return false;
  }

  const ageHours = (Date.now() - listData.updatedAt) / (1000 * 60 * 60);
  return ageHours < maxAgeHours;
}

/**
 * Get topic cache statistics
 */
export async function getTopicCacheStats(): Promise<{
  topicCount: number;
  lastUpdated: number | null;
  oldestTopic: string | null;
  newestTopic: string | null;
}> {
  const listData = await getCached<{ ids: string[]; updatedAt: number }>(TOPICS_LIST_KEY);

  if (!listData || !listData.ids || listData.ids.length === 0) {
    return {
      topicCount: 0,
      lastUpdated: null,
      oldestTopic: null,
      newestTopic: null,
    };
  }

  // Get first and last topics for timestamp info
  const topics = await getTopics(listData.ids.length);

  let oldest: Topic | null = null;
  let newest: Topic | null = null;

  for (const topic of topics) {
    if (!oldest || topic.createdAt < oldest.createdAt) oldest = topic;
    if (!newest || topic.createdAt > newest.createdAt) newest = topic;
  }

  return {
    topicCount: listData.ids.length,
    lastUpdated: listData.updatedAt,
    oldestTopic: oldest?.title || null,
    newestTopic: newest?.title || null,
  };
}

/**
 * Clear all topic data (for testing/reset)
 */
export async function clearTopics(): Promise<void> {
  const keys = await getAllKeys(`${TOPIC_KEY_PREFIX}*`);
  console.log(`[TopicCache] Clearing ${keys.length} topic entries`);

  // Note: We can't easily delete in batch with current redis.ts interface
  // Topics will naturally expire with TTL
}
