import { load as loadHTML } from "cheerio";
import HistoricalDataFetcher from "./historical-data-fetcher.js";

// Base calendar & list pages (using KicksOnFire as reliable source)
const BASE = "https://www.kicksonfire.com";
const CAL_PATH = "/sneaker-release-dates";

// GBNY manual data (since their Elfsight widget can't be scraped)
// This would need to be updated manually or through a different approach
const GBNY_MANUAL_RELEASES = [
  // This will be populated dynamically from Elfsight widget
];

const DEFAULT_PAGES = 5;                // how many pages to fetch by default (increased for more upcoming releases)
const UA = "GBNY-Brilo/1.1 (+contact@gbny.com)";

// Enhanced caching system with separate historical cache
const cache = new Map();
const historicalCache = new Map();
const TTL_MS = 300 * 1000; // 5 minutes for current releases
const HISTORICAL_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours for historical data (longer since it doesn't change)

// Cache management utilities
function cleanExpiredCache() {
  const now = Date.now();
  
  // Clean main cache
  for (const [key, value] of cache.entries()) {
    if (now - value.at > TTL_MS) {
      cache.delete(key);
    }
  }
  
  // Clean historical cache
  for (const [key, value] of historicalCache.entries()) {
    if (now - value.at > HISTORICAL_TTL_MS) {
      historicalCache.delete(key);
    }
  }
}

// Cache statistics for monitoring
function getCacheStats() {
  return {
    main_cache_size: cache.size,
    historical_cache_size: historicalCache.size,
    main_ttl_minutes: TTL_MS / (60 * 1000),
    historical_ttl_hours: HISTORICAL_TTL_MS / (60 * 60 * 1000)
  };
}

// ---------- helpers ----------
function monthToNum(m) {
  const map = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  return map[m.toLowerCase()] || null;
}

function toISOFromTextDate(s, allowHistorical = false) {
  if (!s) return null;
  const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})?/);
  if (!m) return null;
  const month = monthToNum(m[1]);
  const day = parseInt(m[2], 10);
  let year = m[3] ? parseInt(m[3], 10) : (new Date()).getFullYear();
  if (!month || !day) return null;

  const now = new Date();

  // Enhanced logic for historical date handling
  if (!m[3]) {
    const currentYear = now.getUTCFullYear();
    const tmp = new Date(Date.UTC(currentYear, month - 1, day));

    if (allowHistorical) {
      // For historical parsing, if the date is more than 6 months in the future,
      // it's likely from the previous year
      const sixMonthsFromNow = new Date(now);
      sixMonthsFromNow.setMonth(now.getMonth() + 6);

      if (tmp > sixMonthsFromNow) {
        year = currentYear - 1;
      } else {
        year = currentYear;
      }
    } else {
      // Original logic for upcoming releases
      if (tmp < now) {
        year = currentYear + 1;
      } else {
        year = currentYear;
      }
    }
  }

  // Validate the constructed date
  const constructedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (isNaN(constructedDate.getTime())) {
    return null;
  }

  // Additional validation for reasonable date ranges
  const minYear = 2020; // Reasonable minimum year for sneaker releases
  const maxYear = now.getUTCFullYear() + 2; // Maximum 2 years in the future

  if (year < minYear || year > maxYear) {
    return null;
  }

  return constructedDate.toISOString();
}

function normalizeBrand(s) {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("air jordan") || t.startsWith("jordan")) return "Jordan";
  if (t.includes("nike")) return "Nike";
  if (t.includes("adidas")) return "Adidas";
  if (t.includes("new balance")) return "New Balance";
  if (t.includes("asics")) return "Asics";
  if (t.includes("puma")) return "Puma";
  if (t.includes("reebok")) return "Reebok";
  if (t.includes("converse")) return "Converse";
  if (t.includes("saucony")) return "Saucony";
  if (t.includes("vans")) return "Vans";
  if (t.includes("balenciaga")) return "Balenciaga";
  if (t.includes("bape")) return "Bape";
  if (t.includes("under armour")) return "Under Armour";
  return null;
}

// Enhanced date parsing for historical data with better edge case handling
function parseHistoricalDate(dateString) {
  if (!dateString) return null;

  // Handle various date formats that might appear in historical data
  const formats = [
    // Standard format: "Month DD, YYYY" or "Month DD"
    /([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})?/,
    // Alternative format: "MM/DD/YYYY" or "MM/DD/YY"
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
    // ISO-like format: "YYYY-MM-DD"
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    // Compact format: "MMDDYYYY" or "MMDDYY"
    /(\d{2})(\d{2})(\d{2,4})/
  ];

  for (const format of formats) {
    const match = dateString.match(format);
    if (match) {
      let year, month, day;

      if (format === formats[0]) {
        // Month name format
        month = monthToNum(match[1]);
        day = parseInt(match[2], 10);
        year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
      } else if (format === formats[1]) {
        // MM/DD/YYYY format
        month = parseInt(match[1], 10);
        day = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
        // Handle 2-digit years
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }
      } else if (format === formats[2]) {
        // YYYY-MM-DD format
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else if (format === formats[3]) {
        // MMDDYYYY format
        month = parseInt(match[1], 10);
        day = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }
      }

      // Validate parsed values
      if (month && day && year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }
  }

  // Fallback to original parsing
  return toISOFromTextDate(dateString, true);
}

// Validate weeks_back parameter with bounds checking
function validateWeeksBackParameter(weeksBack) {
  // Convert to number if it's a string
  const numWeeks = typeof weeksBack === 'string' ? parseInt(weeksBack, 10) : weeksBack;

  // If invalid or not provided, default to 2 weeks (Requirements 4.1, 4.3)
  if (isNaN(numWeeks) || numWeeks < 1) {
    return 2;
  }

  // Set reasonable upper bound to prevent excessive historical fetching
  // Maximum of 12 weeks (3 months) to prevent abuse
  if (numWeeks > 12) {
    return 12;
  }

  return numWeeks;
}

// Enhanced date validation for edge cases
function isValidReleaseDate(dateString) {
  if (!dateString) return false;

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;

  const now = new Date();
  const minDate = new Date('2020-01-01'); // Reasonable minimum date
  const maxDate = new Date(now.getFullYear() + 2, 11, 31); // Maximum 2 years in future

  return date >= minDate && date <= maxDate;
}

async function fetchText(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      console.log(`Fetching ${url} (attempt ${attempt}/${retries})`);
      const r = await fetch(url, { 
        headers: { "user-agent": UA },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!r.ok) {
        throw new Error(`HTTP ${r.status} ${r.statusText}`);
      }
      
      const text = await r.text();
      console.log(`Successfully fetched ${url} (attempt ${attempt}/${retries})`);
      return text;
    } catch (error) {
      clearTimeout(timeoutId);
      
      console.warn(`Attempt ${attempt} failed for ${url}: ${error.message}`);
      
      // If this was the last attempt, throw the error
      if (attempt === retries) {
        throw new Error(`Failed to fetch ${url} after ${retries} attempts: ${error.message}`);
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

function absolute(href) {
  try { return new URL(href, BASE).href; } catch { return href; }
}

// --------- PARSERS (no price capture) ---------
// Updated for GBNY.com structure
// --------- SIMPLE MANUAL DATA APPROACH ---------
// Since GBNY uses Elfsight widget that can't be scraped, we use manual data
// This could be updated via a separate process or API in the future

// Detail page: try to read a "Release Date ..." label; otherwise keep the calendar date.
function extractDetail(html, fallback, isHistorical = false) {
  const $ = loadHTML(html);
  const h1 = $("h1, .product-title, .page-title").first().text().replace(/\s+/g, " ").trim();
  const pageText = $("body").text().replace(/\s+/g, " ");
  
  // Try multiple patterns for release date
  const datePatterns = [
    /Release Date\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i,
    /Launch Date\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i,
    /Available\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i,
    /Drop Date\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i
  ];
  
  let dateISO = null;
  let matchedDate = null;
  
  for (const pattern of datePatterns) {
    const m = pageText.match(pattern);
    if (m) {
      matchedDate = m[1];
      break;
    }
  }
  
  if (matchedDate) {
    dateISO = isHistorical ? parseHistoricalDate(matchedDate) : toISOFromTextDate(matchedDate, isHistorical);
  } else if (fallback?.date_hint) {
    dateISO = isHistorical ? parseHistoricalDate(fallback.date_hint) : toISOFromTextDate(fallback.date_hint, isHistorical);
  }

  // Validate the parsed date
  if (dateISO && !isValidReleaseDate(dateISO)) {
    dateISO = null;
  }

  const brand = normalizeBrand(h1) || fallback?.brand || null;

  // Try multiple selectors for product image
  let image = $(".product-image img, .hero-image img, .main-image img").first().attr("src") ||
              $(".product-image img, .hero-image img, .main-image img").first().attr("data-src") ||
              $("img").first().attr("src") || 
              $("img").first().attr("data-src") || 
              fallback?.image || null;
              
  if (image && !image.startsWith("http")) {
    image = image.startsWith("//") ? `https:${image}` : `${BASE}${image}`;
  }

  return {
    title: h1 || fallback?.title,
    brand,
    release_date: dateISO,
    url: fallback?.url,
    image
    // no price fields
  };
}

// Fast KicksOnFire scraping (optimized for 1 month of releases)
async function fetchKicksOnFireReleases(maxPages = 5, brandFilter = '') {
  const releases = [];

  console.log(`Fetching KicksOnFire releases (max ${maxPages} pages)...`);

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `${BASE}${CAL_PATH}?page=${page}`;
      console.log(`Fetching KicksOnFire page ${page}...`);
      
      const html = await fetchText(url);
      if (!html) {
        console.warn(`Empty response from KicksOnFire page ${page}`);
        continue;
      }

      const $ = loadHTML(html);
      let pageReleases = 0;

      $(".releases-container .release-item-continer").each((_, el) => {
        try {
          const card = $(el);
          const a = card.find("a.release-item").first();
          if (!a.length) return;

          const href = a.attr("href");
          if (!href) return;

          const title = a.find(".release-item-title").first().text().replace(/\s+/g, " ").trim();
          const dateStamp = a.find(".release-price-from").first().text().trim();
          
          // Don't skip items with prices - try to parse them as dates too
          if (!title || !dateStamp) return;

          const brand = normalizeBrand(title);
          
          // Apply brand filter early if specified
          if (brandFilter && brand && !brand.toLowerCase().includes(brandFilter.toLowerCase())) {
            return;
          }

          // Try to parse the date stamp - it might be a date or price
          let releaseDate = null;
          if (!/^\$/.test(dateStamp)) {
            // Try to parse as date if it doesn't start with $
            releaseDate = toISOFromTextDate(dateStamp);
          }

          const image = a.find("img").first().attr("src") || a.find("img").first().attr("data-src") || null;

          releases.push({
            title,
            brand,
            release_date: releaseDate,
            url: absolute(href),
            image: image ? absolute(image) : null
          });

          pageReleases++;
        } catch (itemError) {
          console.error(`Error processing KicksOnFire release item on page ${page}:`, itemError.message);
          // Continue with other items
        }
      });

      console.log(`  Found ${pageReleases} releases on page ${page}`);
      
      // Continue fetching even if no releases found on this page
      // Some pages might be empty but others might have data

      // Minimal delay for speed
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`Error fetching KicksOnFire page ${page}:`, error.message);
      // Continue with next page instead of stopping completely
      continue;
    }
  }

  console.log(`KicksOnFire fetch completed. Total releases: ${releases.length}`);
  return releases;
}

// Simple deduplication by title similarity
function deduplicateReleasesByTitle(releases) {
  const seen = new Set();
  const deduplicated = [];

  for (const release of releases) {
    const normalizedTitle = release.title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!seen.has(normalizedTitle)) {
      seen.add(normalizedTitle);
      deduplicated.push(release);
    }
  }

  return deduplicated;
}

/**
 * ResponseMerger - Handles merging current and historical release data
 * Requirements: 1.1, 1.2, 5.2
 */
class ResponseMerger {
  /**
   * Merge current and historical releases into a unified response
   * @param {Array} currentReleases - Array of current/upcoming releases
   * @param {Array} historicalReleases - Array of historical releases
   * @param {Object} options - Merging options
   * @returns {Object} Merged response with releases and metadata
   */
  mergeCurrentAndHistorical(currentReleases = [], historicalReleases = [], options = {}) {
    const {
      includeHistorical = false,
      historicalOnly = false,
      limit = 50,
      weeksBack = 2
    } = options;

    let combinedReleases = [];
    let currentCount = 0;
    let historicalCount = 0;

    // Determine which releases to include based on parameters
    if (historicalOnly) {
      // Only historical releases (Requirements 1.1, 1.2)
      combinedReleases = [...historicalReleases];
      historicalCount = historicalReleases.length;
    } else if (includeHistorical) {
      // Both current and historical releases (Requirements 1.1, 1.2, 5.2)
      combinedReleases = [...currentReleases, ...historicalReleases];
      currentCount = currentReleases.length;
      historicalCount = historicalReleases.length;
    } else {
      // Only current releases (default behavior for backward compatibility)
      combinedReleases = [...currentReleases];
      currentCount = currentReleases.length;
    }

    // Remove duplicates across current and historical results (Requirements 5.2)
    const deduplicated = this.deduplicateReleases(combinedReleases);

    // Sort releases appropriately based on whether historical data is included
    const sorted = this.sortByRelevance(deduplicated, includeHistorical, historicalOnly);

    // Apply final limit
    const finalReleases = sorted.slice(0, limit);

    return {
      releases: finalReleases,
      metadata: {
        includes_historical: includeHistorical || historicalOnly,
        historical_only: historicalOnly,
        historical_weeks_back: includeHistorical || historicalOnly ? weeksBack : null,
        historical_count: historicalCount,
        current_count: currentCount,
        total_before_limit: deduplicated.length,
        final_count: finalReleases.length
      }
    };
  }

  /**
   * Remove duplicate releases based on URL and title similarity
   * @param {Array} releases - Array of release objects
   * @returns {Array} Deduplicated array of releases
   */
  deduplicateReleases(releases) {
    const seen = new Map();
    const deduplicated = [];

    for (const release of releases) {
      // Primary deduplication by URL
      if (release.url && seen.has(release.url)) {
        continue;
      }

      // Secondary deduplication by title similarity (for cases where URLs might differ)
      const normalizedTitle = this.normalizeTitle(release.title);
      let isDuplicate = false;

      for (const [existingUrl, existingTitle] of seen.entries()) {
        if (this.areTitlesSimilar(normalizedTitle, existingTitle)) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.set(release.url, normalizedTitle);
        deduplicated.push(release);
      }
    }

    return deduplicated;
  }

  /**
   * Sort releases by relevance based on whether historical data is included
   * @param {Array} releases - Array of release objects
   * @param {boolean} includeHistorical - Whether historical data is included
   * @param {boolean} historicalOnly - Whether only historical data is requested
   * @returns {Array} Sorted array of releases
   */
  sortByRelevance(releases, includeHistorical, historicalOnly) {
    return releases.sort((a, b) => {
      const dateA = Date.parse(a.release_date || "1970-01-01");
      const dateB = Date.parse(b.release_date || "1970-01-01");
      const now = Date.now();

      if (historicalOnly) {
        // For historical only, sort by date descending (most recent historical first)
        return dateB - dateA;
      } else if (includeHistorical) {
        // For mixed data, prioritize upcoming releases, then recent historical
        const aIsUpcoming = dateA > now;
        const bIsUpcoming = dateB > now;

        if (aIsUpcoming && !bIsUpcoming) {
          return -1; // a (upcoming) comes before b (historical)
        } else if (!aIsUpcoming && bIsUpcoming) {
          return 1; // b (upcoming) comes before a (historical)
        } else if (aIsUpcoming && bIsUpcoming) {
          return dateA - dateB; // Both upcoming, sort by date ascending
        } else {
          return dateB - dateA; // Both historical, sort by date descending
        }
      } else {
        // Default behavior: sort upcoming releases by date ascending
        return dateA - dateB;
      }
    });
  }

  /**
   * Normalize title for comparison
   * @param {string} title - Release title
   * @returns {string} Normalized title
   */
  normalizeTitle(title) {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Check if two titles are similar enough to be considered duplicates
   * @param {string} title1 - First title
   * @param {string} title2 - Second title
   * @returns {boolean} True if titles are similar
   */
  areTitlesSimilar(title1, title2) {
    if (!title1 || !title2) return false;

    // Simple similarity check - if 80% of words match, consider similar
    const words1 = title1.split(' ').filter(w => w.length > 2);
    const words2 = title2.split(' ').filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return false;

    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);

    return similarity >= 0.8;
  }
}

export default async function handler(req, res) {
  const method = req.method || "GET";
  let params = {};
  try {
    if (method === "POST") {
      const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
      params = body.parameters || body || {};
    } else {
      params = req.query || {};
    }
  } catch { params = {}; }

  // Optional bearer token (set WEBHOOK_TOKEN in Vercel → Settings → Environment Variables)
  // Removed authentication requirement for easier testing
  // const token = process.env.WEBHOOK_TOKEN;
  // const auth = req.headers["authorization"] || "";
  // if (token && auth !== `Bearer ${token}`) {
  //   return res.status(401).json({ error: "Unauthorized" });
  // }

  const brandFilter = (params.brand || "").toString().trim();
  const limit = Math.min(parseInt(params.limit || "50", 10) || 50, 300); // Increased max limit
  const startPage = parseInt(params.page || "1", 10) || 1;
  const pages = Math.min(parseInt(params.pages || DEFAULT_PAGES, 10) || DEFAULT_PAGES, 20); // Allow up to 20 pages
  
  // Add performance warning for large requests
  if (pages > 10 && limit > 100) {
    console.log(`⚠️  Large request: ${pages} pages, ${limit} limit - this may take 30-60 seconds`);
  }

  // Parse new historical parameters (Requirements 4.1, 4.2, 4.3, 5.1)
  const includeHistorical = params.include_historical === true || params.include_historical === "true";
  const weeksBack = validateWeeksBackParameter(params.weeks_back);
  const historicalOnly = params.historical_only === true || params.historical_only === "true";

  // Enhanced caching with separate historical cache
  const now = Date.now();
  
  // Clean expired cache entries periodically (10% chance per request)
  if (Math.random() < 0.1) {
    cleanExpiredCache();
  }
  
  // Generate cache keys for current and historical data
  const currentCacheKey = JSON.stringify({
    brandFilter,
    limit,
    startPage,
    pages,
    type: 'current'
  });
  
  const historicalCacheKey = JSON.stringify({
    brandFilter,
    weeksBack,
    limit,
    type: 'historical'
  });
  
  // Check for complete cached response first (for exact same request)
  const completeCacheKey = JSON.stringify({
    brandFilter,
    limit,
    startPage,
    pages,
    includeHistorical,
    weeksBack,
    historicalOnly
  });
  
  const completeCached = cache.get(completeCacheKey);
  if (completeCached && now - completeCached.at < TTL_MS) {
    console.log('Cache hit: complete response');
    return res.json(completeCached.data);
  }

  // Initialize response merger and historical data fetcher
  const responseMerger = new ResponseMerger();
  const historicalFetcher = new HistoricalDataFetcher();

  let currentReleases = [];
  let historicalReleases = [];

  // 1) Fetch current releases (unless historical_only is true)
  if (!historicalOnly) {
    console.log('Fetching current releases from multiple sources...');
    
    // Fetch releases from KicksOnFire as the primary source
    let kicksOnFireReleases = [];
    
    try {
      kicksOnFireReleases = await fetchKicksOnFireReleases(5, brandFilter);
      console.log(`Fetched ${kicksOnFireReleases.length} releases from KicksOnFire`);
    } catch (error) {
      console.error('KicksOnFire fetch failed:', error.message);
      kicksOnFireReleases = [];
    }
    
    // Use KicksOnFire releases as the primary data source
    let gbnyReleases = [];

    // Combine and deduplicate releases
    currentReleases = [...gbnyReleases, ...kicksOnFireReleases];

    console.log(`Combined total before deduplication: ${currentReleases.length} releases`);
    
    // Apply deduplication only if we have releases
    if (currentReleases.length > 0) {
      currentReleases = deduplicateReleasesByTitle(currentReleases);
      console.log(`Combined total after deduplication: ${currentReleases.length} releases`);
    } else {
      console.log('No releases fetched from any source');
    }

    // Apply brand filter if specified
    if (brandFilter) {
      const beforeFilter = currentReleases.length;
      currentReleases = currentReleases.filter(r => 
        (r.brand || "").toLowerCase().includes(brandFilter.toLowerCase())
      );
      console.log(`After brand filter: ${currentReleases.length} releases (filtered ${beforeFilter - currentReleases.length})`);
    }
    
    // Log a warning if we have no releases
    if (currentReleases.length === 0) {
      console.warn('Warning: No releases found from any source. Check data sources and connectivity.');
    }
  }

  // 2) Fetch historical releases if requested (with enhanced caching)
  if (includeHistorical || historicalOnly) {
    // Check historical cache first
    const historicalCached = historicalCache.get(historicalCacheKey);
    if (historicalCached && now - historicalCached.at < HISTORICAL_TTL_MS) {
      console.log('Cache hit: historical data');
      historicalReleases = historicalCached.data;
    } else {
      try {
        console.log(`Fetching historical releases: weeksBack=${weeksBack}, brandFilter="${brandFilter}"`);
        historicalReleases = await historicalFetcher.fetchHistoricalReleases(
          weeksBack,
          brandFilter,
          limit
        );
        console.log(`Historical fetch result: ${historicalReleases.length} releases found`);
        
        // Cache the historical results with longer TTL
        historicalCache.set(historicalCacheKey, {
          at: now,
          data: historicalReleases
        });
        console.log('Historical data cached');
      } catch (error) {
        console.error('Error fetching historical releases:', error);
        // Continue with empty historical releases for graceful degradation
        historicalReleases = [];
        
        // Log the error but don't fail the entire request
        console.log('Continuing with current releases only due to historical fetch failure');
      }
    }
  }

  // 3) Merge current and historical releases using ResponseMerger
  let mergedResponse;
  try {
    mergedResponse = responseMerger.mergeCurrentAndHistorical(
      currentReleases,
      historicalReleases,
      {
        includeHistorical,
        historicalOnly,
        limit,
        weeksBack
      }
    );
  } catch (error) {
    console.error('Error merging releases:', error);
    // Fallback to current releases only for backward compatibility
    mergedResponse = {
      releases: currentReleases.slice(0, limit),
      metadata: {
        includes_historical: false,
        historical_only: false,
        historical_weeks_back: null,
        historical_count: 0,
        current_count: currentReleases.length,
        total_before_limit: currentReleases.length,
        final_count: Math.min(currentReleases.length, limit)
      }
    };
    console.log('Using fallback response due to merge failure');
  }

  // 4) Build final payload with enhanced metadata
  const finalResults = mergedResponse.releases.slice(0, limit); // Apply final limit here

  const payload = {
    results: finalResults,
    meta: {
      source: "kicksonfire",
      start_page: startPage,
      pages_fetched: pages,
      count: finalResults.length,
      total_found: mergedResponse.releases.length, // Total before limit
      last_updated: new Date().toISOString(),
      // Enhanced metadata for historical support (Requirements 5.2, 5.3)
      includes_historical: mergedResponse.metadata.includes_historical,
      historical_only: mergedResponse.metadata.historical_only,
      historical_weeks_back: mergedResponse.metadata.historical_weeks_back,
      historical_count: mergedResponse.metadata.historical_count,
      current_count: mergedResponse.metadata.current_count,
      // Cache statistics for monitoring
      cache_stats: getCacheStats()
    }
  };

  // Cache the complete response
  cache.set(completeCacheKey, { at: now, data: payload });
  console.log('Complete response cached');
  
  return res.json(payload);
}
