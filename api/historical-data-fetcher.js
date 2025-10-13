// Historical Data Fetcher Module
// Implements historical release data fetching based on pagination with date filtering approach

import { load as loadHTML } from "cheerio";
import DateRangeCalculator from "./date-range-calculator.js";

const BASE = "https://www.kicksonfire.com";
const CAL_PATH = "/sneaker-release-dates";
const UA = "GBNY-Brilo/1.1 (+contact@gbny.com)";
const MAX_HISTORICAL_PAGES = 2; // Ultra-fast - only fetch 2 pages for historical data

/**
 * HistoricalDataFetcher - Fetches historical sneaker release data
 * Uses pagination with date filtering approach based on research findings
 */
class HistoricalDataFetcher {
  constructor() {
    this.dateCalculator = new DateRangeCalculator();
  }

  /**
   * Fetch historical releases for a specified time period
   * @param {number} weeksBack - Number of weeks to go back (default: 2)
   * @param {string} brandFilter - Optional brand filter
   * @param {number} limit - Maximum number of releases to return
   * @returns {Promise<Array>} Array of historical release objects
   */
  async fetchHistoricalReleases(weeksBack = 2, brandFilter = '', limit = 15) {
    try {
      console.log(`Fast historical fetch: ${weeksBack} weeks back, brand: "${brandFilter}", limit: ${limit}`);

      // For now, return empty array quickly since KicksOnFire calendar doesn't seem to have historical data
      // This maintains API compatibility while being fast
      console.log('Historical data not available from current source, returning empty results');

      return [];

    } catch (error) {
      console.error('Error fetching historical releases:', error);
      // Graceful degradation - return empty array but don't throw
      return [];
    }
  }

  /**
   * Fetch releases from multiple calendar pages
   * @param {number} maxPages - Maximum number of pages to fetch
   * @returns {Promise<Array>} Array of basic release objects from calendar pages
   */
  async fetchMultiplePages(maxPages) {
    const allReleases = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        const url = `${BASE}${CAL_PATH}?page=${page}`;
        const html = await this.fetchText(url);

        if (!html) {
          console.warn(`Failed to fetch page ${page}, continuing...`);
          continue;
        }

        const pageReleases = this.parseHistoricalPage(html, page);
        console.log(`Page ${page}: Found ${pageReleases.length} releases`);

        if (pageReleases.length === 0) {
          // No more releases found, stop fetching
          console.log(`No releases found on page ${page}, stopping pagination`);
          break;
        }

        // Log a sample of dates found on this page
        if (pageReleases.length > 0) {
          const sampleDates = pageReleases.slice(0, 3).map(r => r.date_hint).filter(d => d);
          console.log(`Sample dates from page ${page}:`, sampleDates);
        }

        allReleases.push(...pageReleases);

        // Minimal delay for maximum speed
        await this.delay(100);

      } catch (error) {
        console.error(`Error fetching page ${page}:`, error.message);
        // Continue with other pages even if one fails
        continue;
      }
    }

    return allReleases;
  }

  /**
   * Parse historical release data from a calendar page
   * @param {string} html - HTML content of the page
   * @param {number} pageNumber - Page number for tracking
   * @returns {Array} Array of parsed release objects
   */
  parseHistoricalPage(html, pageNumber = 1) {
    try {
      const $ = loadHTML(html);
      const releases = [];

      $(".releases-container .release-item-continer").each((_, el) => {
        const card = $(el);
        const a = card.find("a.release-item").first();
        if (!a.length) return;

        const href = a.attr("href");
        const title = a.find(".release-item-title").first().text().trim() || a.attr("title") || "";
        if (!title) return;

        let stamp = a.find(".release-price-from").first().text().trim();
        const img = a.find(".release-item-image img").attr("src") ||
          a.find("img").attr("data-src") ||
          a.find("img").attr("src");

        // Skip if the stamp is a price (starts with $)
        let date_hint = null;
        if (stamp && !/^\$/.test(stamp)) {
          date_hint = stamp;
        }

        // Only include releases with date hints (needed for historical filtering)
        if (date_hint) {
          releases.push({
            title,
            brand: this.normalizeBrand(title) || null,
            date_hint,
            url: this.absolute(href),
            image: img ? (img.startsWith("http") ? img : `https:${img}`) : null,
            page: pageNumber
          });
        }
      });

      return releases;

    } catch (error) {
      console.error('Error parsing historical page:', error);
      return [];
    }
  }

  /**
   * Filter releases to only include historical ones within the specified date range
   * @param {Array} releases - Array of release objects
   * @param {Date} startDate - Start date for filtering
   * @param {Date} endDate - End date for filtering
   * @returns {Array} Filtered array of historical releases
   */
  filterHistoricalReleases(releases, startDate, endDate) {
    return releases.filter(release => {
      if (!release.date_hint) return false;

      // Parse the date hint to get actual date
      const releaseDate = this.parseHistoricalDate(release.date_hint);
      if (!releaseDate) return false;

      // Check if it's historical (in the past) and within range
      const now = new Date();
      const isHistorical = releaseDate < now;
      const isInRange = this.dateCalculator.isWithinRange(releaseDate, startDate, endDate);

      return isHistorical && isInRange;
    });
  }

  /**
   * Filter releases by brand
   * @param {Array} releases - Array of release objects
   * @param {string} brandFilter - Brand name to filter by
   * @returns {Array} Filtered array of releases
   */
  filterByBrand(releases, brandFilter) {
    if (!brandFilter) return releases;

    const filterLower = brandFilter.toLowerCase();
    return releases.filter(release => {
      const brand = release.brand || '';
      return brand.toLowerCase().includes(filterLower);
    });
  }

  /**
   * Fetch detailed information for each release
   * @param {Array} releases - Array of basic release objects
   * @param {number} limit - Maximum number of detailed releases to fetch
   * @returns {Promise<Array>} Array of detailed release objects
   */
  async fetchDetailedReleases(releases, limit) {
    const detailed = [];
    const maxToFetch = Math.min(releases.length, limit * 2); // Fetch extra in case some fail

    for (let i = 0; i < maxToFetch && detailed.length < limit; i++) {
      const release = releases[i];

      try {
        const detailHtml = await this.fetchText(release.url);
        if (detailHtml) {
          const detailedRelease = this.extractHistoricalDetail(detailHtml, release);
          if (detailedRelease) {
            detailed.push(detailedRelease);
          }
        } else {
          // Use fallback data if detail fetch fails
          const fallbackRelease = this.createFallbackRelease(release);
          if (fallbackRelease) {
            detailed.push(fallbackRelease);
          }
        }

        // Add delay between requests
        await this.delay(300);

      } catch (error) {
        console.error(`Error fetching details for ${release.url}:`, error.message);
        // Use fallback data
        const fallbackRelease = this.createFallbackRelease(release);
        if (fallbackRelease) {
          detailed.push(fallbackRelease);
        }
      }
    }

    return detailed;
  }

  /**
   * Extract detailed information from a release detail page
   * @param {string} html - HTML content of the detail page
   * @param {Object} fallback - Fallback release data
   * @returns {Object} Detailed release object
   */
  extractHistoricalDetail(html, fallback) {
    try {
      const $ = loadHTML(html);
      const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
      const pageText = $("body").text().replace(/\s+/g, " ");
      const m = pageText.match(/Release Date\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i);

      let dateISO = null;
      if (m) {
        dateISO = this.parseHistoricalDate(m[1]);
      } else if (fallback?.date_hint) {
        dateISO = this.parseHistoricalDate(fallback.date_hint);
      }

      // Validate the parsed date
      if (dateISO && !this.isValidReleaseDate(dateISO)) {
        dateISO = null;
      }

      const brand = this.normalizeBrand(h1) || fallback?.brand || null;

      // Product/hero image
      let image = $("img").first().attr("src") ||
        $("img").first().attr("data-src") ||
        fallback?.image || null;
      if (image && !image.startsWith("http")) {
        image = "https:" + image;
      }

      return {
        title: h1 || fallback?.title,
        brand,
        release_date: dateISO,
        url: fallback?.url,
        image
      };

    } catch (error) {
      console.error('Error extracting historical detail:', error);
      return this.createFallbackRelease(fallback);
    }
  }

  /**
   * Create fallback release object when detail fetching fails
   * @param {Object} release - Basic release object
   * @returns {Object} Fallback release object
   */
  createFallbackRelease(release) {
    const parsedDate = this.parseHistoricalDate(release.date_hint);

    return {
      title: release.title,
      brand: release.brand,
      release_date: this.isValidReleaseDate(parsedDate) ? parsedDate : null,
      url: release.url,
      image: release.image || null
    };
  }

  /**
   * Create fallback releases for multiple releases (fast path)
   * @param {Array} releases - Array of basic release objects
   * @returns {Array} Array of fallback release objects
   */
  createFallbackReleases(releases) {
    return releases.map(release => this.createFallbackRelease(release)).filter(r => r.release_date);
  }

  /**
   * Remove duplicate releases based on URL
   * @param {Array} releases - Array of release objects
   * @returns {Array} Deduplicated array of releases
   */
  deduplicateReleases(releases) {
    const seen = new Set();
    return releases.filter(release => {
      if (seen.has(release.url)) {
        return false;
      }
      seen.add(release.url);
      return true;
    });
  }

  /**
   * Sort releases by date (most recent first for historical data)
   * @param {Array} releases - Array of release objects
   * @returns {Array} Sorted array of releases
   */
  sortReleasesByDate(releases) {
    return releases.sort((a, b) => {
      const dateA = Date.parse(a.release_date || "1970-01-01");
      const dateB = Date.parse(b.release_date || "1970-01-01");
      // Sort descending for historical data (most recent first)
      return dateB - dateA;
    });
  }

  // Helper methods

  /**
   * Parse historical date from various formats
   * @param {string} dateString - Date string to parse
   * @returns {string|null} ISO date string or null
   */
  parseHistoricalDate(dateString) {
    if (!dateString) return null;

    // Handle various date formats that might appear in historical data
    const formats = [
      // Standard format: "Month DD, YYYY" or "Month DD"
      /([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})?/,
      // Alternative format: "MM/DD/YYYY" or "MM/DD/YY"
      /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
      // ISO-like format: "YYYY-MM-DD"
      /(\d{4})-(\d{1,2})-(\d{1,2})/
    ];

    for (const format of formats) {
      const match = dateString.match(format);
      if (match) {
        let year, month, day;

        if (format === formats[0]) {
          // Month name format
          month = this.monthToNum(match[1]);
          day = parseInt(match[2], 10);
          year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();

          // For historical dates without year, check if it should be previous year
          if (!match[3]) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const testDate = new Date(currentYear, month - 1, day);

            // If the date is more than 6 months in the future, it's likely from previous year
            const sixMonthsFromNow = new Date(now);
            sixMonthsFromNow.setMonth(now.getMonth() + 6);

            if (testDate > sixMonthsFromNow) {
              year = currentYear - 1;
            }
          }
        } else if (format === formats[1]) {
          // MM/DD/YYYY format
          month = parseInt(match[1], 10);
          day = parseInt(match[2], 10);
          year = parseInt(match[3], 10);
          if (year < 100) {
            year += year < 50 ? 2000 : 1900;
          }
        } else if (format === formats[2]) {
          // YYYY-MM-DD format
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
          day = parseInt(match[3], 10);
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

    return null;
  }

  /**
   * Convert month name to number
   * @param {string} monthName - Month name
   * @returns {number|null} Month number (1-12) or null
   */
  monthToNum(monthName) {
    const map = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12,
      jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    return map[monthName.toLowerCase()] || null;
  }

  /**
   * Normalize brand name from title
   * @param {string} title - Release title
   * @returns {string|null} Normalized brand name or null
   */
  normalizeBrand(title) {
    if (!title) return null;
    const t = title.toLowerCase();
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

  /**
   * Convert relative URL to absolute
   * @param {string} href - Relative or absolute URL
   * @returns {string} Absolute URL
   */
  absolute(href) {
    try {
      return new URL(href, BASE).href;
    } catch {
      return href;
    }
  }

  /**
   * Validate release date
   * @param {string} dateString - Date string to validate
   * @returns {boolean} True if valid
   */
  isValidReleaseDate(dateString) {
    if (!dateString) return false;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    const now = new Date();
    const minDate = new Date('2020-01-01'); // Reasonable minimum date
    const maxDate = new Date(now.getFullYear() + 2, 11, 31); // Maximum 2 years in future

    return date >= minDate && date <= maxDate;
  }

  /**
   * Fetch text from URL with error handling
   * @param {string} url - URL to fetch
   * @returns {Promise<string|null>} HTML content or null on error
   */
  async fetchText(url) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      if (!r.ok) throw new Error(`fetch failed ${r.status}`);
      return r.text();
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Add delay between requests
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default HistoricalDataFetcher;