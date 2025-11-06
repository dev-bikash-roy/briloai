// Local test for the new GB&Y implementation
import { load as loadHTML } from "cheerio";

// Copy the necessary functions from releases.js
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

function toISOFromTextDate(s, allowHistorical = false) {
  if (!s) return null;
  const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})?/);
  if (!m) return null;
  
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  
  const month = months[m[1].toLowerCase()];
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
  
  // Look for lines that contain release information (brand, model, price)
  const releaseLines = lines.filter(line => {
    return (line.match(/\$[0-9]+/) && 
            (line.toLowerCase().includes('nike') || 
             line.toLowerCase().includes('jordan') || 
             line.toLowerCase().includes('air')));
  });
  
  console.log(`Found ${releaseLines.length} potential release lines`);
  
  // Process each release line
  for (const line of releaseLines) {
    try {
      // Try to match the pattern with date and time info
      // Pattern: [Month] [Day] [DayOfWeek], [Time] [Brand and Product] - [Category] [SKU] $[Price]
      const dateTimePattern = /([A-Z][a-z]{2})\s+(\d{1,2})\s+([A-Z][a-z]+),\s*([0-9:]+\s*[A-Z]+)\s+(.+?)\s+\$\s*(\d+)/;
      const dateTimeMatch = line.match(dateTimePattern);
      
      if (dateTimeMatch) {
        const month = dateTimeMatch[1];
        const day = dateTimeMatch[2];
        const dayOfWeek = dateTimeMatch[3];
        const time = dateTimeMatch[4];
        const productInfo = dateTimeMatch[5];
        const price = dateTimeMatch[6];
        
        // Parse the date
        const dateStr = `${month} ${day}`;
        const dateISO = toISOFromTextDate(dateStr);
        
        // Extract brand and title
        const brand = normalizeBrand(productInfo);
        const title = productInfo;
        
        releases.push({
          title: title.trim(),
          brand: brand,
          release_date: dateISO,
          url: "https://gbny.com/pages/upcoming",
        });
        continue;
      }
      
      // Try a simpler pattern for cases like:
      // "Nike Air Trainer Huarache "Baroque Brown Black" - Men's IB0497-001 $170"
      const simplePattern = /(Nike|Air Jordan|Jordan|Adidas|New Balance|Asics|Puma|Reebok|Converse|Saucony|Vans|Balenciaga|Bape|Under Armour)(.+?)\$\s*(\d+)/i;
      const simpleMatch = line.match(simplePattern);
      
      if (simpleMatch) {
        const brandName = simpleMatch[1];
        const productDetails = simpleMatch[2].trim();
        const price = simpleMatch[3];
        
        const fullTitle = `${brandName} ${productDetails}`.replace(/\s+/g, ' ').trim();
        const brand = normalizeBrand(brandName);
        
        releases.push({
          title: fullTitle,
          brand: brand,
          url: "https://gbny.com/pages/upcoming",
        });
        continue;
      }
    } catch (error) {
      console.error('Error parsing release line:', line, error.message);
    }
  }
  
  return releases;
}

// Test the GB&Y parsing function directly
async function testGBNYParsing() {
  console.log('=== Testing GB&Y Parsing Function ===\n');
  
  try {
    // Fetch actual GB&Y page content
    const response = await fetch('https://gbny.com/pages/upcoming');
    const html = await response.text();
    
    console.log(`Fetched HTML content, length: ${html.length} characters`);
    
    // Parse the releases
    const releases = parseGBNYReleases(html);
    
    console.log(`\nFound ${releases.length} releases from GB&Y:`);
    
    // Show first 5 releases
    const displayReleases = releases.slice(0, 5);
    displayReleases.forEach((release, i) => {
      console.log(`${i+1}. ${release.title}`);
      console.log(`   Brand: ${release.brand || 'Unknown'}`);
      console.log(`   Date: ${release.release_date || 'Unknown'}`);
      console.log(`   URL: ${release.url}`);
      console.log('');
    });
    
    // Filter for Jordan brand
    const jordanReleases = releases.filter(r => r.brand === 'Jordan');
    console.log(`\n--- Jordan Releases (${jordanReleases.length} found) ---`);
    jordanReleases.slice(0, 3).forEach((release, i) => {
      console.log(`${i+1}. ${release.title}`);
    });
    
  } catch (error) {
    console.error('Error testing GB&Y parsing:', error);
  }
}

testGBNYParsing();