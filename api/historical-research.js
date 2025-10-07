// Historical Data Source Research Script
// This script investigates different methods to access historical release data from KicksOnFire

import { load as loadHTML } from "cheerio";

const BASE = "https://www.kicksonfire.com";
const CAL_PATH = "/sneaker-release-dates";
const UA = "GBNY-Brilo/1.1 (+contact@gbny.com)";

async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA } });
    if (!r.ok) throw new Error(`fetch failed ${r.status}`);
    return r.text();
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

// Test different URL patterns for accessing historical data
async function testHistoricalURLPatterns() {
  console.log("=== Testing Historical URL Patterns ===");
  
  const testUrls = [
    // Test if calendar accepts date parameters
    `${BASE}${CAL_PATH}?date=2024-01-01`,
    `${BASE}${CAL_PATH}?month=01&year=2024`,
    `${BASE}${CAL_PATH}?from=2024-01-01&to=2024-01-31`,
    
    // Test archive-style URLs
    `${BASE}/archive`,
    `${BASE}/releases/archive`,
    `${BASE}/past-releases`,
    `${BASE}/sneaker-release-dates/archive`,
    
    // Test date-based paths
    `${BASE}/sneaker-release-dates/2024/01`,
    `${BASE}/releases/2024/01`,
    `${BASE}/2024/01/releases`,
    
    // Test if there are specific historical sections
    `${BASE}/released`,
    `${BASE}/past`,
    `${BASE}/history`,
  ];

  const results = [];
  
  for (const url of testUrls) {
    console.log(`Testing: ${url}`);
    const html = await fetchText(url);
    
    if (html) {
      const $ = loadHTML(html);
      const hasReleaseItems = $(".release-item-continer, .release-item").length > 0;
      const pageTitle = $("title").text().trim();
      const hasCalendarStructure = $(".releases-container").length > 0;
      
      results.push({
        url,
        accessible: true,
        hasReleaseItems,
        hasCalendarStructure,
        pageTitle,
        contentLength: html.length
      });
      
      console.log(`  ✓ Accessible - Title: "${pageTitle}" - Release items: ${hasReleaseItems ? 'Yes' : 'No'}`);
    } else {
      results.push({
        url,
        accessible: false,
        hasReleaseItems: false,
        hasCalendarStructure: false,
        pageTitle: null,
        contentLength: 0
      });
      
      console.log(`  ✗ Not accessible`);
    }
    
    // Add delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

// Analyze the current calendar structure for historical data possibilities
async function analyzeCurrentCalendarStructure() {
  console.log("\n=== Analyzing Current Calendar Structure ===");
  
  // Fetch multiple pages to see if older releases appear
  const pages = [1, 2, 3, 4, 5, 10, 15, 20];
  const allReleases = [];
  
  for (const page of pages) {
    const url = `${BASE}${CAL_PATH}?page=${page}`;
    console.log(`Fetching page ${page}...`);
    
    const html = await fetchText(url);
    if (!html) continue;
    
    const $ = loadHTML(html);
    const releases = [];
    
    $(".releases-container .release-item-continer").each((_, el) => {
      const card = $(el);
      const a = card.find("a.release-item").first();
      if (!a.length) return;
      
      const title = a.find(".release-item-title").first().text().trim();
      const dateStamp = a.find(".release-price-from").first().text().trim();
      
      if (title && dateStamp && !/^\$/.test(dateStamp)) {
        releases.push({
          title,
          dateStamp,
          page
        });
      }
    });
    
    allReleases.push(...releases);
    console.log(`  Found ${releases.length} releases on page ${page}`);
    
    // Stop if no releases found (reached end)
    if (releases.length === 0) {
      console.log(`  No more releases found, stopping at page ${page}`);
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Analyze date patterns
  console.log(`\nTotal releases found: ${allReleases.length}`);
  
  if (allReleases.length > 0) {
    console.log("\nSample releases:");
    allReleases.slice(0, 10).forEach((release, i) => {
      console.log(`  ${i + 1}. ${release.title} - ${release.dateStamp} (page ${release.page})`);
    });
    
    console.log("\nLast few releases:");
    allReleases.slice(-5).forEach((release, i) => {
      console.log(`  ${release.title} - ${release.dateStamp} (page ${release.page})`);
    });
  }
  
  return allReleases;
}

// Test if we can find historical releases by parsing dates
async function testDateBasedFiltering() {
  console.log("\n=== Testing Date-Based Filtering Approach ===");
  
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
  
  console.log(`Looking for releases between ${twoWeeksAgo.toISOString().split('T')[0]} and ${now.toISOString().split('T')[0]}`);
  
  // Fetch several pages and check for historical releases
  const historicalReleases = [];
  
  for (let page = 1; page <= 10; page++) {
    const url = `${BASE}${CAL_PATH}?page=${page}`;
    const html = await fetchText(url);
    if (!html) continue;
    
    const $ = loadHTML(html);
    
    $(".releases-container .release-item-continer").each((_, el) => {
      const card = $(el);
      const a = card.find("a.release-item").first();
      if (!a.length) return;
      
      const title = a.find(".release-item-title").first().text().trim();
      const dateStamp = a.find(".release-price-from").first().text().trim();
      
      if (title && dateStamp && !/^\$/.test(dateStamp)) {
        // Try to parse the date
        const releaseDate = parseDateStamp(dateStamp);
        if (releaseDate && releaseDate < now && releaseDate >= twoWeeksAgo) {
          historicalReleases.push({
            title,
            dateStamp,
            parsedDate: releaseDate,
            page
          });
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`Found ${historicalReleases.length} potential historical releases`);
  historicalReleases.forEach(release => {
    console.log(`  ${release.title} - ${release.dateStamp} (${release.parsedDate.toISOString().split('T')[0]})`);
  });
  
  return historicalReleases;
}

// Helper function to parse date stamps
function parseDateStamp(dateStamp) {
  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5, july: 6,
    august: 7, september: 8, october: 9, november: 10, december: 11
  };
  
  const match = dateStamp.match(/([A-Za-z]{3,9})\s+(\d{1,2})/i);
  if (!match) return null;
  
  const monthName = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const month = monthMap[monthName];
  
  if (month === undefined) return null;
  
  const currentYear = new Date().getFullYear();
  const date = new Date(currentYear, month, day);
  
  // If the date is in the future, it might be from last year
  if (date > new Date()) {
    date.setFullYear(currentYear - 1);
  }
  
  return date;
}

// Main research function
async function runHistoricalResearch() {
  console.log("Starting Historical Data Source Research...\n");
  
  try {
    // Test 1: URL patterns
    const urlResults = await testHistoricalURLPatterns();
    
    // Test 2: Calendar structure analysis
    const calendarReleases = await analyzeCurrentCalendarStructure();
    
    // Test 3: Date-based filtering
    const historicalReleases = await testDateBasedFiltering();
    
    // Summary
    console.log("\n=== RESEARCH SUMMARY ===");
    console.log("URL Pattern Results:");
    const accessibleUrls = urlResults.filter(r => r.accessible && r.hasReleaseItems);
    if (accessibleUrls.length > 0) {
      console.log("  Found accessible URLs with release data:");
      accessibleUrls.forEach(r => console.log(`    ${r.url} - ${r.pageTitle}`));
    } else {
      console.log("  No alternative URLs found with release data");
    }
    
    console.log(`\nCalendar Analysis: Found ${calendarReleases.length} total releases across pages`);
    console.log(`Date Filtering: Found ${historicalReleases.length} historical releases in the last 2 weeks`);
    
    // Determine best approach
    let recommendedApproach = "pagination-with-filtering";
    let reasoning = "Based on analysis, the most viable approach is to fetch multiple pages from the current calendar and filter for historical releases based on parsed dates.";
    
    if (accessibleUrls.length > 0) {
      recommendedApproach = "alternative-urls";
      reasoning = "Found alternative URLs that may provide better access to historical data.";
    }
    
    console.log(`\nRecommended Approach: ${recommendedApproach}`);
    console.log(`Reasoning: ${reasoning}`);
    
    return {
      urlResults,
      calendarReleases,
      historicalReleases,
      recommendedApproach,
      reasoning
    };
    
  } catch (error) {
    console.error("Research failed:", error);
    throw error;
  }
}

// Export for use in other modules
export { runHistoricalResearch, testHistoricalURLPatterns, analyzeCurrentCalendarStructure, testDateBasedFiltering };

// Run research if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('historical-research.js')) {
  runHistoricalResearch().catch(console.error);
}