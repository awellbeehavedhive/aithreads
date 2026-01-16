/**
 * Test script to verify new RSS feeds have good image coverage
 */

import { fetchRSSByCategory } from '../src/lib/rss-parser';

async function testRSSFeeds() {
  console.log('🧪 Testing New RSS Feeds for Image Coverage\n');
  console.log('='.repeat(60));
  
  const categories = ['technology', 'science', 'business', 'health'];
  
  for (const category of categories) {
    console.log(`\n📂 Category: ${category.toUpperCase()}`);
    console.log('-'.repeat(60));
    
    try {
      const articles = await fetchRSSByCategory(category);
      
      const withImages = articles.filter(a => a.urlToImage);
      const withoutImages = articles.filter(a => !a.urlToImage);
      
      console.log(`✓ Total articles: ${articles.length}`);
      console.log(`✓ With images: ${withImages.length} (${Math.round(withImages.length / articles.length * 100)}%)`);
      console.log(`✗ Without images: ${withoutImages.length} (${Math.round(withoutImages.length / articles.length * 100)}%)`);
      
      // Show breakdown by source
      const sourceBreakdown: Record<string, { total: number; withImages: number }> = {};
      articles.forEach(article => {
        const source = article.source.name;
        if (!sourceBreakdown[source]) {
          sourceBreakdown[source] = { total: 0, withImages: 0 };
        }
        sourceBreakdown[source].total++;
        if (article.urlToImage) {
          sourceBreakdown[source].withImages++;
        }
      });
      
      console.log('\n📊 Breakdown by source:');
      Object.entries(sourceBreakdown).forEach(([source, stats]) => {
        const pct = Math.round(stats.withImages / stats.total * 100);
        console.log(`   ${source}: ${stats.withImages}/${stats.total} (${pct}%)`);
      });
      
    } catch (error) {
      console.error(`❌ Error testing ${category}:`, error);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ RSS Feed Test Complete!');
}

testRSSFeeds().catch(console.error);

