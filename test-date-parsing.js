// Test the updated date parsing logic
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
  
  // Variables to track date information
  let currentDate = null;
  let currentDateISO = null;
  
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
        console.log(`Found date: ${currentDate} -> ${currentDateISO}`);
        continue;
      }
      
      // Check if this line contains release information with price
      const releasePattern = /(Nike|Air Jordan|Jordan|Adidas|New Balance|Asics|Puma|Reebok|Converse|Saucony|Vans|Balenciaga|Bape|Under Armour)(.+?)\$\s*(\d+)/i;
      const releaseMatch = line.match(releasePattern);
      
      if (releaseMatch && currentDate) {
        const brandName = releaseMatch[1];
        const productDetails = releaseMatch[2].trim();
        const price = releaseMatch[3];
        
        const fullTitle = `${brandName} ${productDetails}`.replace(/\s+/g, ' ').trim();
        const brand = normalizeBrand(brandName);
        
        console.log(`Found release: ${fullTitle} with date ${currentDateISO}`);
        
        releases.push({
          title: fullTitle,
          brand: brand,
          release_date: currentDateISO, // Include the date we found
          url: "https://gbny.com/pages/upcoming",
        });
        
        // Reset current date after using it
        currentDate = null;
        currentDateISO = null;
        continue;
      }
    } catch (error) {
      console.error('Error parsing line:', line, error.message);
    }
  }
  
  return releases;
}

// Test with sample content
const sampleContent = `
UPCOMING RELEASES
NOV 7
Friday, 10:00 AM

Nike Air Trainer Huarache "Baroque Brown Black" - Men's IB0497-001 $170

A stylish sneaker featuring a mix of brown suede, black mesh, and blue accents, with a unique strap design.

NOV 7
Friday, 10:00 AM

Nike Air Trainer Huarache "Triple Black" - Men's IB0497-002 $170

Black athletic shoes with a mix of suede and mesh materials, featuring a strap across the midfoot and a textured sole.

NOV 8
Saturday, 10:00 AM

Air Jordan 12 Retro "Taxi" - Family Collection

A stylish pair of high-top sneakers featuring a white leather upper with black accents and gold detailing.

Men's - CT8013-117 - $215

GS - 153265-117 - $165

PS - 151186-117 - $105

NOV 11
Tuesday, 10:00 AM

Air Jordan 11 Retro "Pearl" - Family Collection

A white high-top sneaker with a sleek design, featuring a prominent logo and a translucent sole.

Women's - AR0715-110 - $235

PS - DO3857-110 - $105

TD - DO3856-110 - $90
`;

// Mock HTML structure
const mockHtml = `
<!DOCTYPE html>
<html>
<head><title>UPCOMING RELEASES</title></head>
<body>
${sampleContent}
</body>
</html>
`;

console.log('Testing date parsing...\n');

const releases = parseGBNYReleases(mockHtml);

console.log(`\nFound ${releases.length} releases with dates:`);
releases.forEach((release, i) => {
  console.log(`${i+1}. ${release.title} (${release.brand}) - ${release.release_date}`);
});