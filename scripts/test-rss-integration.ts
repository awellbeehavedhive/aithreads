#!/usr/bin/env tsx

/**
 * Test RSS Integration in the App
 * Tests if the new RSS feeds are being included in actual app responses
 */

import { fetchRSSByCategory } from '../src/lib/rss-parser';

async function testRSSIntegration() {
  console.log('🧪 Testing RSS Integration in App...\n');

  const categories = ['technology', 'business', 'science'];

  for (const category of categories) {
    console.log(`📂 Testing ${category} category...`);

    try {
      const articles = await fetchRSSByCategory(category);
      console.log(`  ✅ Fetched ${articles.length} articles`);

      // Check for new RSS feeds
      const sourceProviders = articles.map(a => a.sourceProvider);
      const uniqueProviders = [...new Set(sourceProviders)];

      console.log(`  📊 Source providers: ${uniqueProviders.join(', ')}`);

      // Check for our new feeds
      const newFeeds = {
        technology: ['rss-tech'],
        business: ['rss-business'],
        science: ['rss-science']
      };

      const expectedProviders = newFeeds[category as keyof typeof newFeeds] || [];
      const foundNewFeeds = expectedProviders.some(provider =>
        uniqueProviders.includes(provider as any)
      );

      if (foundNewFeeds) {
        console.log(`  ✅ New RSS feeds found in ${category}`);
      } else {
        console.log(`  ⚠️ No new RSS feeds found in ${category} (only: ${uniqueProviders.join(', ')})`);
      }

      // Check image coverage
      const withImages = articles.filter(a => a.urlToImage).length;
      const imageCoverage = (withImages / articles.length) * 100;
      console.log(`  🖼️ Image coverage: ${withImages}/${articles.length} (${imageCoverage.toFixed(0)}%)`);

    } catch (error: any) {
      console.log(`  ❌ Error testing ${category}: ${error.message}`);
    }

    console.log('');
  }

  console.log('🎯 RSS Integration Test Complete!');
}

testRSSIntegration().catch(console.error);
