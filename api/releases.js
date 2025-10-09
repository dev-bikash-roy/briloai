import { load as loadHTML } from "cheerio";
import HistoricalDataFetcher from "./historical-data-fetcher.js";

// Base calendar & list pages (pagination via ?page=N)
const BASE = "https://www.kicksonfire.com";
const CAL_PATH = "/sneaker-release-dates";
const DEFAULT_PAGES = 2;                // how many pages to fetch by default
const UA = "GBNY-Brilo/1.1 (+contact@gbny.com)";

// simple in-memory cache (per serverless instance)
const cache = new Map();
const TTL_MS = 120 * 1000;

// ---------- helpers ----------
function monthToNum(m) {
  const map = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,sept:9,october:10,november:11,december:12,
    jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
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

async function fetchText(url) {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error("fetch failed " + r.status);
  return r.text();
}

function absolute(href) {
  try { return new URL(href, BASE).href; } catch { return href; }
}

// --------- PARSERS (no price capture) ---------
// Cards live under: .releases-container .release-item-continer
// Each card has: a.release-item > spans: .release-price-from (date or $price), .release-item-title (title).
// Image at .release-item-image img[src]
function extractCardList(html) {
  const $ = loadHTML(html);
  const items = [];
  $(".releases-container .release-item-continer").each((_, el) => {
    const card = $(el);
    const a = card.find("a.release-item").first();
    if (!a.length) return;

    const href = a.attr("href");
    const title = a.find(".release-item-title").first().text().trim() || a.attr("title") || "";
    if (!title) return;

    let stamp = a.find(".release-price-from").first().text().trim();
    const img = a.find(".release-item-image img").attr("src") || a.find("img").attr("data-src") || a.find("img").attr("src");

    // If the stamp is a price (starts with $), ignore it entirely (do not store or show)
    let date_hint = null;
    if (stamp && !/^\$/.test(stamp)) {
      date_hint = stamp;           // e.g., "Sep 13"
    }

    items.push({
      title,
      brand: normalizeBrand(title) || null,
      date_hint,
      url: absolute(href),
      image: img ? (img.startsWith("http") ? img : `https:${img}`) : null
    });
  });

  // dedupe by URL
  const seen = new Set();
  return items.filter(it => (seen.has(it.url) ? false : (seen.add(it.url), true)));
}

// Detail page: try to read a "Release Date ..." label; otherwise keep the calendar date.
function extractDetail(html, fallback, isHistorical = false) {
  const $ = loadHTML(html);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const pageText = $("body").text().replace(/\s+/g, " ");
  const m = pageText.match(/Release Date\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i);
  
  let dateISO = null;
  if (m) {
    // Try enhanced parsing for historical dates first
    dateISO = isHistorical ? parseHistoricalDate(m[1]) : toISOFromTextDate(m[1], isHistorical);
  } else if (fallback?.date_hint) {
    // Use enhanced parsing for fallback date as well
    dateISO = isHistorical ? parseHistoricalDate(fallback.date_hint) : toISOFromTextDate(fallback.date_hint, isHistorical);
  }
  
  // Validate the parsed date
  if (dateISO && !isValidReleaseDate(dateISO)) {
    dateISO = null;
  }
  
  const brand = normalizeBrand(h1) || fallback?.brand || null;

  // product/hero image
  let image = $("img").first().attr("src") || $("img").first().attr("data-src") || fallback?.image || null;
  if (image && !image.startsWith("http")) image = "https:" + image;

  return {
    title: h1 || fallback?.title,
    brand,
    release_date: dateISO,
    url: fallback?.url,
    image
    // no price fields
  };
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
      limit = 15,
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
  const token = process.env.WEBHOOK_TOKEN;
  const auth = req.headers["authorization"] || "";
  if (token && auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const brandFilter = (params.brand || "").toString().trim();
  const limit = Math.min(parseInt(params.limit || "15", 10) || 15, 50);
  const startPage = parseInt(params.page || "1", 10) || 1;
  const pages = Math.min(parseInt(params.pages || DEFAULT_PAGES, 10) || DEFAULT_PAGES, 10);

  // Parse new historical parameters (Requirements 4.1, 4.2, 4.3, 5.1)
  const includeHistorical = params.include_historical === true || params.include_historical === "true";
  const weeksBack = validateWeeksBackParameter(params.weeks_back);
  const historicalOnly = params.historical_only === true || params.historical_only === "true";

  // Cache (include historical parameters in cache key)
  const cacheKey = JSON.stringify({ 
    brandFilter, 
    limit, 
    startPage, 
    pages, 
    includeHistorical, 
    weeksBack, 
    historicalOnly 
  });
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return res.json(cached.data);

  // Initialize response merger and historical data fetcher
  const responseMerger = new ResponseMerger();
  const historicalFetcher = new HistoricalDataFetcher();

  let currentReleases = [];
  let historicalReleases = [];

  // 1) Fetch current releases (unless historical_only is true)
  if (!historicalOnly) {
    // collect list items across pages
    const list = [];
    for (let p = 0; p < pages; p++) {
      const url = `${BASE}${CAL_PATH}?page=${startPage + p}`;
      try {
        const html = await fetchText(url);
        list.push(...extractCardList(html));
        if (list.length >= limit) break;
      } catch {
        // continue on failure
      }
    }

    // unique & trim to limit
    const seen = new Set();
    const unique = [];
    for (const it of list) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      unique.push(it);
      if (unique.length >= limit) break;
    }

    // 2) visit detail pages (no price collected)
    const out = [];
    for (const it of unique) {
      try {
        const detailHtml = await fetchText(it.url);
        out.push(extractDetail(detailHtml, it));
      } catch {
        // Use enhanced date parsing for fallback as well
        const parsedDate = parseHistoricalDate(it.date_hint) || toISOFromTextDate(it.date_hint);
        out.push({
          title: it.title,
          brand: it.brand,
          release_date: isValidReleaseDate(parsedDate) ? parsedDate : null,
          url: it.url,
          image: it.image || null
          // no price fields
        });
      }
      if (out.length >= limit) break;
    }

    // filter current releases by brand
    currentReleases = brandFilter
      ? out.filter(r => (r.brand || "").toLowerCase().includes(brandFilter.toLowerCase()))
      : out;
  }

  // 2) Fetch historical releases if requested
  if (includeHistorical || historicalOnly) {
    try {
      console.log(`Fetching historical releases: weeksBack=${weeksBack}, brandFilter="${brandFilter}"`);
      historicalReleases = await historicalFetcher.fetchHistoricalReleases(
        weeksBack,
        brandFilter,
        limit
      );
      console.log(`Historical fetch result: ${historicalReleases.length} releases found`);
    } catch (error) {
      console.error('Error fetching historical releases:', error);
      // Continue with empty historical releases for graceful degradation
      historicalReleases = [];
    }
  }

  // 3) Merge current and historical releases using ResponseMerger
  const mergedResponse = responseMerger.mergeCurrentAndHistorical(
    currentReleases,
    historicalReleases,
    {
      includeHistorical,
      historicalOnly,
      limit,
      weeksBack
    }
  );

  // 4) Build final payload with enhanced metadata
  const payload = {
    results: mergedResponse.releases,
    meta: {
      source: "kicksonfire",
      start_page: startPage,
      pages_fetched: pages,
      count: mergedResponse.releases.length,
      last_updated: new Date().toISOString(),
      // Enhanced metadata for historical support (Requirements 5.2, 5.3)
      includes_historical: mergedResponse.metadata.includes_historical,
      historical_only: mergedResponse.metadata.historical_only,
      historical_weeks_back: mergedResponse.metadata.historical_weeks_back,
      historical_count: mergedResponse.metadata.historical_count,
      current_count: mergedResponse.metadata.current_count
    }
  };

  cache.set(cacheKey, { at: now, data: payload });
  return res.json(payload);
}
