// Local API test for the new GB&Y implementation
import http from 'http';
import url from 'url';

// Copy the necessary functions from releases.js
import { load as loadHTML } from "cheerio";

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
  if (!m[3]) {
    const currentYear = now.getUTCFullYear();
    const tmp = new Date(Date.UTC(currentYear, month - 1, day));

    if (allowHistorical) {
      const sixMonthsFromNow = new Date(now);
      sixMonthsFromNow.setMonth(now.getMonth() + 6);

      if (tmp > sixMonthsFromNow) {
        year = currentYear - 1;
      } else {
        year = currentYear;
      }
    } else {
      if (tmp < now) {
        year = currentYear + 1;
      } else {
        year = currentYear;
      }
    }
  }

  const constructedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (isNaN(constructedDate.getTime())) {
    return null;
  }

  const minYear = 2020;
  const maxYear = now.getUTCFullYear() + 2;

  if (year < minYear || year > maxYear) {
    return null;
  }

  return constructedDate.toISOString();
}

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
        
        // Extract main price if it exists in the current line
        const pricePattern = /\$\s*(\d+)/;
        const priceMatch = line.match(pricePattern);
        const mainPrice = priceMatch ? `$${priceMatch[1]}` : null;
        
        // Remove brand name from product info for cleaner title
        const fullTitle = line.replace(brandName, '').trim();
        const title = `${brandName} ${fullTitle}`.replace(/\s+/g, ' ').trim();
        
        // Look ahead for size variants in the following lines
        const sizeVariants = {};
        let lookAheadIndex = i + 1;
        let linesChecked = 0;
        const maxLinesToCheck = 10; // Limit how far we look ahead
        
        while (lookAheadIndex < lines.length && linesChecked < maxLinesToCheck) {
          const nextLine = lines[lookAheadIndex];
          
          // Stop if we encounter a new date or brand line (indicates a new product)
          if (/^([A-Z]{3})\s+(\d{1,2})$/.test(nextLine) || 
              /(Nike|Air Jordan|Jordan|Adidas|New Balance|Asics|Puma|Reebok|Converse|Saucony|Vans|Balenciaga|Bape|Under Armour)/i.test(nextLine)) {
            break;
          }
          
          // Check for GS variant
          const gsPattern = /GS\s*-\s*([A-Z0-9\-]+)\s*-\s*\$(\d+)/i;
          const gsMatch = nextLine.match(gsPattern);
          if (gsMatch) {
            sizeVariants.GS = {
              sku: gsMatch[1],
              price: `$${gsMatch[2]}`
            };
          }
          
          // Check for PS variant
          const psPattern = /PS\s*-\s*([A-Z0-9\-]+)\s*-\s*\$(\d+)/i;
          const psMatch = nextLine.match(psPattern);
          if (psMatch) {
            sizeVariants.PS = {
              sku: psMatch[1],
              price: `$${psMatch[2]}`
            };
          }
          
          // Check for TD variant
          const tdPattern = /TD\s*-\s*([A-Z0-9\-]+)\s*-\s*\$(\d+)/i;
          const tdMatch = nextLine.match(tdPattern);
          if (tdMatch) {
            sizeVariants.TD = {
              sku: tdMatch[1],
              price: `$${tdMatch[2]}`
            };
          }
          
          lookAheadIndex++;
          linesChecked++;
        }
        
        releases.push({
          title: title,
          brand: brand,
          release_date: currentDateISO, // Include the ISO date for sorting
          release_date_display: currentDate, // Include the human-readable date
          day_of_week: currentDayOfWeek, // Include the day of week if available
          time: currentTime, // Include the time if available
          url: "https://gbny.com/pages/upcoming",
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

// Add time-based filtering functions
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

async function fetchGBNYReleases(brandFilter = '') {
  try {
    const url = "https://gbny.com/pages/upcoming";
    console.log(`Fetching GB&Y releases from ${url}`);
    
    const response = await fetch(url);
    const html = await response.text();
    
    if (!html) {
      console.warn(`Empty response from GB&Y page`);
      return [];
    }

    const releases = parseGBNYReleases(html);
    console.log(`Found ${releases.length} releases from GB&Y`);

    // Apply brand filter if specified
    if (brandFilter) {
      return releases.filter(r => 
        (r.brand || "").toLowerCase().includes(brandFilter.toLowerCase())
      );
    }
    
    return releases;
  } catch (error) {
    console.error('Error fetching GB&Y releases:', error.message);
    return [];
  }
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

// Mock handler function
async function handler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const params = parsedUrl.query || {};
  
  const brandFilter = (params.brand || "").toString().trim();
  const limit = Math.min(parseInt(params.limit || "50", 10) || 50, 300);
  // Add time-based filtering parameters
  const timeFilter = (params.time || "").toString().toLowerCase().trim();
  
  console.log(`Processing request with brandFilter="${brandFilter}", limit=${limit}, timeFilter="${timeFilter}"`);
  
  try {
    // Fetch releases from GB&Y as the primary source
    let gbnyReleases = [];
    
    try {
      gbnyReleases = await fetchGBNYReleases(brandFilter);
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

    // Apply brand filter if specified
    if (brandFilter) {
      const beforeFilter = currentReleases.length;
      currentReleases = currentReleases.filter(r => 
        (r.brand || "").toLowerCase().includes(brandFilter.toLowerCase())
      );
      console.log(`After brand filter: ${currentReleases.length} releases (filtered ${beforeFilter - currentReleases.length})`);
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
      }
    };
    
    // Send JSON response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
    
  } catch (error) {
    console.error('API Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/releases')) {
    handler(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const PORT = 3003;
server.listen(PORT, () => {
  console.log(`Local API server running at http://localhost:${PORT}/api/releases`);
  console.log(`Try: http://localhost:${PORT}/api/releases?brand=Jordan&limit=5`);
});
