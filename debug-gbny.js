import { load as loadHTML } from "cheerio";

async function debugGBNY() {
  try {
    console.log('Fetching GB&Y page content...');
    const response = await fetch('https://gbny.com/pages/upcoming');
    const html = await response.text();
    
    console.log(`Fetched HTML content, length: ${html.length} characters`);
    
    // Parse with cheerio
    const $ = loadHTML(html);
    
    // Get all text from the page
    const bodyText = $('body').text();
    
    // Split into lines and filter for relevant content
    const lines = bodyText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log(`Found ${lines.length} lines of text`);
    
    // Look for lines that contain release information (brand, model, price)
    const releaseLines = lines.filter(line => {
      return (line.match(/\$[0-9]+/) && 
              (line.toLowerCase().includes('nike') || 
               line.toLowerCase().includes('jordan') || 
               line.toLowerCase().includes('air')));
    });
    
    console.log(`Found ${releaseLines.length} potential release lines`);
    
    // Show all release lines
    releaseLines.forEach((line, i) => {
      console.log(`${i+1}. ${line}`);
    });
    
    // Specifically look for Taxi, Gamma, and Saturday
    console.log('\n--- Searching for specific terms ---');
    const taxiLines = releaseLines.filter(line => line.toLowerCase().includes('taxi'));
    console.log(`Found ${taxiLines.length} lines with 'taxi':`);
    taxiLines.forEach(line => console.log(`  ${line}`));
    
    const gammaLines = releaseLines.filter(line => line.toLowerCase().includes('gamma'));
    console.log(`Found ${gammaLines.length} lines with 'gamma':`);
    gammaLines.forEach(line => console.log(`  ${line}`));
    
    const saturdayLines = lines.filter(line => line.toLowerCase().includes('saturday'));
    console.log(`Found ${saturdayLines.length} lines with 'saturday':`);
    saturdayLines.forEach(line => console.log(`  ${line}`));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugGBNY();