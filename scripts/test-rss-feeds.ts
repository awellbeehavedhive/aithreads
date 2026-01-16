#!/usr/bin/env tsx

/**
 * RSS Feed Validation Script
 * Tests new RSS feeds for availability, image content, and parsing capability
 */

import Parser from 'rss-parser';

interface FeedTest {
  name: string;
  url: string;
  category: string;
  expectedProvider: string;
}

const FEEDS_TO_TEST: FeedTest[] = [
  // Technology - Best performers
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'technology', expectedProvider: 'rss-tech' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/feed/', category: 'technology', expectedProvider: 'rss-tech' },

  // Business - Best performers
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'business', expectedProvider: 'rss-business' },
  { name: 'Fortune', url: 'https://fortune.com/feed/', category: 'business', expectedProvider: 'rss-business' },

  // Health - Working feeds
  { name: 'CDC News', url: 'https://tools.cdc.gov/api/v2/resources/media/rss.aspx', category: 'health', expectedProvider: 'rss-health' },
  { name: 'WHO News', url: 'https://www.who.int/rss-feeds/news-english.xml', category: 'health', expectedProvider: 'rss-health' },
  // NIH News - already exists in current feeds

  // Science
  { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'science', expectedProvider: 'rss-science' },
  { name: 'Phys.org', url: 'https://phys.org/rss-feed/', category: 'science', expectedProvider: 'rss-science' },
  { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', category: 'science', expectedProvider: 'rss-science' },
];

async function testFeed(feed: FeedTest): Promise<void> {
  console.log(`\n🔍 Testing ${feed.name} (${feed.category})...`);

  try {
    const parser = new Parser({
      customFields: {
        item: [
          ['media:content', 'media:content'],
          ['media:thumbnail', 'media:thumbnail'],
          ['enclosure', 'enclosure'],
          ['content:encoded', 'contentEncoded'],
        ]
      }
    });

    const feedData = await parser.parseURL(feed.url);
    console.log(`  ✅ Feed accessible: ${feedData.items?.length || 0} items found`);

    if (!feedData.items || feedData.items.length === 0) {
      console.log(`  ❌ No items in feed`);
      return;
    }

    // Check first 3 items for images
    let itemsWithImages = 0;
    const sampleItems = feedData.items.slice(0, 3);

    for (let i = 0; i < sampleItems.length; i++) {
      const item = sampleItems[i];

      // Check for images in various RSS formats
      let imageUrl = null;

      // Check media:content
      if (item['media:content'] && item['media:content'].$.url) {
        imageUrl = item['media:content'].$.url;
      }

      // Check media:thumbnail
      if (!imageUrl && item['media:thumbnail'] && item['media:thumbnail'].$.url) {
        imageUrl = item['media:thumbnail'].$.url;
      }

      // Check enclosure
      if (!imageUrl && item.enclosure && item.enclosure.url) {
        imageUrl = item.enclosure.url;
      }

      // Check content:encoded for img tags
      if (!imageUrl && item.contentEncoded) {
        const imgMatch = item.contentEncoded.match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }

      if (imageUrl) {
        itemsWithImages++;
        console.log(`  ✅ Item ${i + 1}: Has image - ${imageUrl.substring(0, 60)}...`);
      } else {
        console.log(`  ❌ Item ${i + 1}: No image found`);
      }
    }

    const imageCoverage = (itemsWithImages / sampleItems.length) * 100;
    console.log(`  📊 Image coverage: ${imageCoverage.toFixed(0)}% (${itemsWithImages}/${sampleItems.length})`);

    if (imageCoverage >= 50) {
      console.log(`  ✅ ${feed.name}: GOOD - Suitable for production`);
    } else if (imageCoverage >= 25) {
      console.log(`  ⚠️ ${feed.name}: FAIR - May need image enhancement`);
    } else {
      console.log(`  ❌ ${feed.name}: POOR - Consider alternative feed`);
    }

  } catch (error: any) {
    console.log(`  ❌ Error testing ${feed.name}: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 RSS Feed Validation Test');
  console.log('Testing new RSS feeds for image availability and parsing capability...\n');

  for (const feed of FEEDS_TO_TEST) {
    await testFeed(feed);
    // Small delay to be respectful to servers
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎯 Validation Complete!');
  console.log('\nNext steps:');
  console.log('1. Review results above');
  console.log('2. Add passing feeds to rss-parser.ts');
  console.log('3. Update category mappings');
  console.log('4. Test locally');
  console.log('5. Deploy to production');
}

main().catch(console.error);
