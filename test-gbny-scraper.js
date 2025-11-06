// Test the new GB&Y scraper implementation
import fs from 'fs';

// Copy the parseGBNYReleases function from releases.js for testing
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
      console.log('Processing line:', line.substring(0, 100) + '...');
      
      // Try to match the pattern with date and time info
      // Pattern: [Month] [Day] [DayOfWeek], [Time] [Brand and Product] - [Category] [SKU] $[Price]
      const dateTimePattern = /([A-Z][a-z]{2})\s+(\d{1,2})\s+([A-Z][a-z]+),\s*([0-9:]+\s*[A-Z]+)\s+(.+?)\s+\$\s*(\d+)/;
      const dateTimeMatch = line.match(dateTimePattern);
      
      if (dateTimeMatch) {
        console.log('Matched dateTimePattern');
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
          // No image available from text parsing
        });
        continue;
      }
      
      // Try a simpler pattern for cases like:
      // "Nike Air Trainer Huarache "Baroque Brown Black" - Men's IB0497-001 $170"
      const simplePattern = /(Nike|Air Jordan|Jordan|Adidas|New Balance|Asics|Puma|Reebok|Converse|Saucony|Vans|Balenciaga|Bape|Under Armour)(.+?)\$\s*(\d+)/i;
      const simpleMatch = line.match(simplePattern);
      
      if (simpleMatch) {
        console.log('Matched simplePattern');
        const brandName = simpleMatch[1];
        const productDetails = simpleMatch[2].trim();
        const price = simpleMatch[3];
        
        const fullTitle = `${brandName} ${productDetails}`.replace(/\s+/g, ' ').trim();
        const brand = normalizeBrand(brandName);
        
        releases.push({
          title: fullTitle,
          brand: brand,
          url: "https://gbny.com/pages/upcoming",
          // No date or image available from this parsing method
        });
        continue;
      }
      
      console.log('No pattern matched for line');
    } catch (error) {
      console.error('Error parsing release line:', line, error.message);
    }
  }
  
  return releases;
}

async function testGBNYScraper() {
  try {
    console.log('Testing GB&Y scraper...\n');
    
    // Mock HTML content similar to what we'd get from the page
    const mockHtml = `
    <!doctype html>
    <html>
    <head><title>UPCOMING RELEASES</title></head>
    <body>
      <h1>UPCOMING RELEASES</h1>
      <p>NOV 7 Friday, 10:00 AM Nike Air Trainer Huarache "Baroque Brown Black" - Men's IB0497-001 $170</p>
      <p>NOV 7 Friday, 10:00 AM Nike Air Trainer Huarache "Triple Black" - Men's IB0497-002 $170</p>
      <p>NOV 8 Saturday, 10:00 AM Air Jordan 12 Retro "Taxi" - Family Collection Men's - CT8013-117 - $215 GS - 153265-117 - $165 PS - 151186-117</p>
      <p>NOV 9 Sunday, 10:00 AM Nike Air Max Uptempo '95 "Black Volt" - Men's CK0892-001 $170</p>
      <p>NOV 10 Monday, 10:00 AM Air Jordan 11 City Pack 285 - Men's IO8959-133 $235</p>
    </body>
    </html>
    `;
    
    // Test the parsing function
    const releases = parseGBNYReleases(mockHtml);
    
    console.log(`\nFound ${releases.length} releases:`);
    releases.forEach((release, i) => {
      console.log(`${i+1}. ${release.title} (${release.brand || 'Unknown'}) - ${release.release_date || 'No date'}`);
    });
    
    // Test with a brand filter
    console.log('\n--- Testing brand filter for "Jordan" ---');
    const jordanReleases = releases.filter(r => r.brand === "Jordan");
    console.log(`Found ${jordanReleases.length} Jordan releases:`);
    jordanReleases.forEach((release, i) => {
      console.log(`${i+1}. ${release.title}`);
    });
    
  } catch (error) {
    console.error('Error testing GB&Y scraper:', error);
  }
}

testGBNYScraper();