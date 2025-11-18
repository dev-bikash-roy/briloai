import { load as loadHTML } from "cheerio";
import HistoricalDataFetcher from "./historical-data-fetcher.js";
import DateRangeCalculator from "./date-range-calculator.js";

// Base URL for GB&Y upcoming releases page
const GBNY_BASE = "https://gbny.com";
const GBNY_UPCOMING_PATH = "/pages/upcoming";

// KicksOnFire constants (keeping for reference, but won't be used)
const KICKS_BASE = "https://www.kicksonfire.com";
const KICKS_CAL_PATH = "/sneaker-release-dates";

// GBNY manual data (since their page can be scraped directly now)
const GBNY_MANUAL_RELEASES = [];

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

// Convert month number to short name
function monthNumToShortName(monthNum) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return months[monthNum - 1] || null;
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

function absolute(href, base = GBNY_BASE) {
  try { return new URL(href, base).href; } catch { return href; }
}

// --------- PARSERS (no price capture) ---------
// Updated for GBNY.com structure
// --------- GB&Y DATA APPROACH ---------

// Parse GB&Y upcoming releases page
function parseGBNYReleases(html) {
  const $ = loadHTML(html);
  const releases = [];
  
  // Get all text from the page
  const bodyText = $('body').text();
  
  // Split into lines and filter for relevant content
  const lines = bodyText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Variables to track date information
  let currentDate = null;
  let currentDateISO = null;
  let currentDayOfWeek = null;
  let currentTime = null;
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    try {
      // Check if this line contains a date (e.g., "NOV 7")
      const datePattern = /^([A-Z]{3})\s+(\d{1,2})$/;
      const dateMatch = line.match(datePattern);
      
      if (dateMatch) {
        // Found a date line, store it for the next release
        currentDate = `${dateMatch[1]} ${dateMatch[2]}`;
        currentDateISO = toISOFromTextDate(currentDate);
        continue;
      }
      
      // Check if this line contains a day of week with time (e.g., "Saturday, 10:00 AM")
      const dayTimePattern = /^([A-Z][a-z]+day),\s*([0-9:]+\s*[A-Z]+)$/;
      const dayTimeMatch = line.match(dayTimePattern);
      
      if (dayTimeMatch) {
        currentDayOfWeek = dayTimeMatch[1];
        currentTime = dayTimeMatch[2];
        continue;
      }
      
      // Check if this line contains release information with brand name
      const brandPattern = /(Nike|Air Jordan|Jordan|Adidas|New Balance|Asics|Puma|Reebok|Converse|Saucony|Vans|Balenciaga|Bape|Under Armour)/i;
      const brandMatch = line.match(brandPattern);
      
      if (brandMatch && currentDate) {
        const brandName = brandMatch[1];
        const brand = normalizeBrand(brandName);
        
        // Extract size variants if they exist in the line
        const sizeVariants = {};
        
        // GS pattern
        const gsPattern = /GS\s*-\s*([A-Z0-9\-]+)\s*-\s*\$(\d+)/gi;
        let gsMatch;
        while ((gsMatch = gsPattern.exec(line)) !== null) {
          sizeVariants.GS = {
            sku: gsMatch[1],
            price: `$${gsMatch[2]}`
          };
        }
        
        // PS pattern
        const psPattern = /PS\s*-\s*([A-Z0-9\-]+)\s*-\s*\$(\d+)/gi;
        let psMatch;
        while ((psMatch = psPattern.exec(line)) !== null) {
          sizeVariants.PS = {
            sku: psMatch[1],
            price: `$${psMatch[2]}`
          };
        }
        
        // TD pattern
        const tdPattern = /TD\s*-\s*([A-Z0-9\-]+)\s*-\s*\$(\d+)/gi;
        let tdMatch;
        while ((tdMatch = tdPattern.exec(line)) !== null) {
          sizeVariants.TD = {
            sku: tdMatch[1],
            price: `$${tdMatch[2]}`
          };
        }
        
        // Extract main price if it exists
        const pricePattern = /\$\s*(\d+)/;
        const priceMatch = line.match(pricePattern);
        const mainPrice = priceMatch ? `$${priceMatch[1]}` : null;
        
        // Extract product information (everything before size variants)
        let productInfo = line;
        const sizeVariantIndex = Math.min(
          line.indexOf(' GS') !== -1 ? line.indexOf(' GS') : Infinity,
          line.indexOf(' PS') !== -1 ? line.indexOf(' PS') : Infinity,
          line.indexOf(' TD') !== -1 ? line.indexOf(' TD') : Infinity
        );
        
        if (sizeVariantIndex !== Infinity) {
          productInfo = line.substring(0, sizeVariantIndex).trim();
        }
        
        // Remove brand name from product info for cleaner title
        const fullTitle = productInfo.replace(brandName, '').trim();
        const title = `${brandName} ${fullTitle}`.replace(/\s+/g, ' ').trim();
        
        releases.push({
          title: title,
          brand: brand,
          release_date: currentDateISO, // Include the ISO date for sorting
          release_date_display: currentDate, // Include the human-readable date
          day_of_week: currentDayOfWeek, // Include the day of week if available
          time: currentTime, // Include the time if available
          url: `${GBNY_BASE}${GBNY_UPCOMING_PATH}`,
          price: mainPrice, // Include the main price
          size_variants: Object.keys(sizeVariants).length > 0 ? sizeVariants : null // Include size variants if available
        });
        
        // Reset current date after using it
        currentDate = null;
        currentDateISO = null;
        currentDayOfWeek = null;
        currentTime = null;
        continue;
      }
    } catch (error) {
      console.error('Error parsing line:', line, error.message);
    }
  }
  
  return releases;
}

// Enhanced search function with more flexible matching
function flexibleSearch(releases, query) {
  if (!query) return releases;
  
  // Convert query to lowercase for case-insensitive matching
  const searchQuery = query.toLowerCase().trim();
  
  // If query is empty, return all releases
  if (!searchQuery) return releases;
  
  // Split query into words for more flexible matching
  const queryWords = searchQuery.split(/\s+/).filter(word => word.length > 0);
  
  return releases.filter(release => {
    // Get all searchable fields
    const title = (release.title || "").toLowerCase();
    const brand = (release.brand || "").toLowerCase();
    const dayOfWeek = (release.day_of_week || "").toLowerCase();
    const dateDisplay = (release.release_date_display || "").toLowerCase();
    
    // Create a combined searchable string
    const searchableText = `${title} ${brand} ${dayOfWeek} ${dateDisplay}`;
    
    // Exact match check
    if (searchableText.includes(searchQuery)) {
      return true;
    }
    
    // Word-by-word matching for more flexible search
    for (const word of queryWords) {
      // Special handling for common search terms
      if (word.includes("taxi") && title.includes("taxi")) {
        return true;
      }
      if (word.includes("gamma") && title.includes("gamma")) {
        return true;
      }
      if ((word.includes("saturday") || word.includes("sat")) && dayOfWeek.includes("sat")) {
        return true;
      }
      if (word.includes("jordan") && (title.includes("jordan") || brand.includes("jordan"))) {
        return true;
      }
      if (word === "12" && (title.includes("12") || title.includes("twelve"))) {
        return true;
      }
      if (word === "11" && (title.includes("11") || title.includes("eleven"))) {
        return true;
      }
      
      // Partial matching for brand names
      if (word.includes("nike") && brand.includes("nike")) {
        return true;
      }
      if (word.includes("adidas") && brand.includes("adidas")) {
        return true;
      }
      if (word.includes("new") && brand.includes("new balance")) {
        return true;
      }
      if (word.includes("balance") && brand.includes("new balance")) {
        return true;
      }
      
      // Check if word is in any of the searchable fields
      if (searchableText.includes(word)) {
        return true;
      }
    }
    
    return false;
  });
}

// Fetch releases from GB&Y upcoming page
async function fetchGBNYReleases(searchQuery = '') {
  try {
    const url = `${GBNY_BASE}${GBNY_UPCOMING_PATH}`;
    console.log(`Fetching GB&Y releases from ${url}`);
    
    const html = await fetchText(url);
    if (!html) {
      console.warn(`Empty response from GB&Y page`);
      return [];
    }

    const releases = parseGBNYReleases(html);
    console.log(`Found ${releases.length} releases from GB&Y`);

    // Apply search filter if specified
    if (searchQuery) {
      return flexibleSearch(releases, searchQuery);
    }
    
    return releases;
  } catch (error) {
    console.error('Error fetching GB&Y releases:', error.message);
    return [];
  }
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

// Add this helper function after the existing helper functions
function isThisWeek(dateString) {
  if (!dateString) return false;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;
  
  const now = new Date();
  const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay())); // Sunday
  startOfWeek.setUTCHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6); // Saturday
  endOfWeek.setUTCHours(23, 59, 59, 999);
  
  return date >= startOfWeek && date <= endOfWeek;
}

function isToday(dateString) {
  if (!dateString) return false;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;
  
  const today = new Date();
  const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  startOfDay.setUTCHours(0, 0, 0, 0);
  
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCHours(23, 59, 59, 999);
  
  return date >= startOfDay && date <= endOfDay;
}

// Add weekend filtering function
function isThisWeekend(dateString) {
  if (!dateString) return false;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;
  
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  
  // Calculate this weekend (Saturday and Sunday)
  let saturday, sunday;
  
  if (dayOfWeek === 0) { // Sunday
    // This weekend is yesterday (Saturday) and today (Sunday)
    saturday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else {
    // This weekend is the upcoming Saturday and Sunday
    const daysUntilSaturday = 6 - dayOfWeek;
    saturday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSaturday));
    sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSaturday + 1));
  }
  
  saturday.setUTCHours(0, 0, 0, 0);
  sunday.setUTCHours(23, 59, 59, 999);
  
  return date >= saturday && date <= sunday;
}

// Add helper function to parse specific dates from natural language
function parseSpecificDate(query) {
  if (!query) return null;
  
  const now = new Date();
  const queryLower = query.toLowerCase().trim();
  
  // Handle yesterday, today, tomorrow based on New York time
  if (queryLower === "yesterday" || queryLower === "today" || queryLower === "tomorrow") {
    // Convert current time to New York time
    const nyTimeString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const nyDate = new Date(nyTimeString);
    
    let targetDate;
    if (queryLower === "yesterday") {
      targetDate = new Date(nyDate);
      targetDate.setDate(nyDate.getDate() - 1);
    } else if (queryLower === "today") {
      targetDate = new Date(nyDate);
    } else { // tomorrow
      targetDate = new Date(nyDate);
      targetDate.setDate(nyDate.getDate() + 1);
    }
    
    // Convert back to UTC for consistent date string
    return targetDate.toISOString().split('T')[0];
  }
  
  // Handle specific dates like "nov 12", "november 12", etc.
  const months = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };
  
  // Pattern for "nov 12", "november 12", etc.
  const datePattern = /^([a-z]+)\s+(\d{1,2})$/;
  const match = queryLower.match(datePattern);
  
  if (match) {
    const monthName = match[1];
    const day = parseInt(match[2], 10);
    
    if (months[monthName] !== undefined && day >= 1 && day <= 31) {
      const month = months[monthName];
      const year = now.getUTCFullYear();
      
      // If the date has already passed this year, use next year
      const dateThisYear = new Date(Date.UTC(year, month, day));
      const targetYear = dateThisYear < now ? year + 1 : year;
      
      return new Date(Date.UTC(targetYear, month, day)).toISOString().split('T')[0];
    }
  }
  
  return null;
}

// Add function to check if a release is on a specific date
function isOnSpecificDate(releaseDate, targetDate) {
  if (!releaseDate || !targetDate) return false;
  
  try {
    const release = new Date(releaseDate);
    const target = new Date(targetDate + 'T00:00:00.000Z');
    
    return release.getUTCFullYear() === target.getUTCFullYear() &&
           release.getUTCMonth() === target.getUTCMonth() &&
           release.getUTCDate() === target.getUTCDate();
  } catch {
    return false;
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

  const searchQuery = (params.q || params.search || params.brand || "").toString().trim();
  const limit = Math.min(parseInt(params.limit || "50", 10) || 50, 300); // Increased max limit
  
  // Add time-based filtering parameters
  const timeFilter = (params.time || "").toString().toLowerCase().trim();
  
  console.log(`Processing request with searchQuery="${searchQuery}", limit=${limit}, timeFilter="${timeFilter}"`);
  
  // Enhanced caching with separate historical cache
  const now = Date.now();
  
  // Clean expired cache entries periodically (10% chance per request)
  if (Math.random() < 0.1) {
    cleanExpiredCache();
  }
  
  // Generate cache key for current data
  const currentCacheKey = JSON.stringify({
    searchQuery,
    limit,
    timeFilter,
    type: 'current'
  });
  
  // Check for cached response first
  const completeCached = cache.get(currentCacheKey);
  if (completeCached && now - completeCached.at < TTL_MS) {
    console.log('Cache hit: complete response');
    return res.json(completeCached.data);
  }

  try {
    // Fetch releases from GB&Y as the primary source
    let gbnyReleases = [];
    
    try {
      gbnyReleases = await fetchGBNYReleases(searchQuery);
      console.log(`Fetched ${gbnyReleases.length} releases from GB&Y`);
    } catch (error) {
      console.error('GB&Y fetch failed:', error.message);
      gbnyReleases = [];
    }
    
    // Use GB&Y releases as the primary data source
    let currentReleases = [...gbnyReleases];

    console.log(`Combined total before deduplication: ${currentReleases.length} releases`);
    
    // Apply deduplication only if we have releases
    if (currentReleases.length > 0) {
      currentReleases = deduplicateReleasesByTitle(currentReleases);
      console.log(`Combined total after deduplication: ${currentReleases.length} releases`);
    } else {
      console.log('No releases fetched from any source');
    }
    
    // Apply time-based filtering if requested
    if (timeFilter) {
      const beforeFilter = currentReleases.length;
      
      if (timeFilter === "today") {
        currentReleases = currentReleases.filter(release => isToday(release.release_date));
        console.log(`Filtered for today: ${currentReleases.length} releases (filtered ${beforeFilter - currentReleases.length})`);
      } else if (timeFilter === "week" || timeFilter === "this week" || timeFilter === "this-week") {
        currentReleases = currentReleases.filter(release => isThisWeek(release.release_date));
        console.log(`Filtered for this week: ${currentReleases.length} releases (filtered ${beforeFilter - currentReleases.length})`);
      } else if (timeFilter === "weekend" || timeFilter === "this weekend" || timeFilter === "this-weekend") {
        currentReleases = currentReleases.filter(release => isThisWeekend(release.release_date));
        console.log(`Filtered for this weekend: ${currentReleases.length} releases (filtered ${beforeFilter - currentReleases.length})`);
      } else {
        // Handle specific dates like "yesterday", "tomorrow", "nov 12", etc.
        const specificDate = parseSpecificDate(timeFilter);
        if (specificDate) {
          currentReleases = currentReleases.filter(release => isOnSpecificDate(release.release_date, specificDate));
          console.log(`Filtered for specific date ${specificDate}: ${currentReleases.length} releases (filtered ${beforeFilter - currentReleases.length})`);
        }
      }
    }
    
    // Apply limit
    const finalResults = currentReleases.slice(0, limit);
    
    // Build final payload
    const payload = {
      results: finalResults,
      meta: {
        source: "gbny",
        count: finalResults.length,
        total_found: currentReleases.length,
        last_updated: new Date().toISOString(),
        // Cache statistics for monitoring
        cache_stats: getCacheStats()
      }
    };

    // Cache the complete response
    cache.set(currentCacheKey, { at: now, data: payload });
    console.log('Complete response cached');
    
    return res.json(payload);
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
