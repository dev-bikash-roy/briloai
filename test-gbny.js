import { load as loadHTML } from "cheerio";

async function testGBNY() {
  try {
    const response = await fetch('https://gbny.com/pages/upcoming');
    const html = await response.text();
    
    // Parse with cheerio
    const $ = loadHTML(html);
    
    console.log('=== Analyzing GB&Y Upcoming Releases Page ===\n');
    
    // Look for the main content area
    const mainContent = $('main, .main-content, [role="main"]');
    console.log(`Found ${mainContent.length} main content areas`);
    
    // Look for collections or product grids specifically
    const productGrids = $('.collection-grid, .product-grid, .product-list, .grid, .products');
    console.log(`Found ${productGrids.length} product grids`);
    
    // Look for list items that might contain releases
    const listItems = $('li, .product-item, .item');
    console.log(`Found ${listItems.length} list items`);
    
    // Try to find items with both product names and prices
    listItems.each((i, el) => {
      const text = $(el).text();
      if (text.includes('$') && (text.toLowerCase().includes('nike') || text.toLowerCase().includes('jordan'))) {
        console.log(`\n--- Product Item ${i+1} ---`);
        console.log('Text:', text.trim().replace(/\s+/g, ' ').substring(0, 150) + '...');
        
        // Try to extract structured data
        const title = $(el).find('.title, h3, h4, .product-title').text().trim();
        const price = $(el).find('.price, .money').text().trim();
        console.log('Title:', title || 'Not found');
        console.log('Price:', price || 'Not found');
      }
    });
    
    // Look for any text that looks like release information
    const bodyText = $('body').text();
    const lines = bodyText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Find lines that contain both date-like and price-like patterns
    const releaseLines = lines.filter(line => {
      return (line.match(/\$[0-9]+/) && 
              (line.toLowerCase().includes('nike') || line.toLowerCase().includes('jordan') || line.toLowerCase().includes('air')));
    });
    
    console.log(`\n=== Found ${releaseLines.length} potential release lines ===`);
    releaseLines.slice(0, 10).forEach((line, i) => {
      console.log(`${i+1}. ${line}`);
    });
    
    // Try to parse the structure more systematically
    console.log('\n=== Looking for structured data ===');
    const allDivs = $('div');
    console.log(`Total div elements: ${allDivs.length}`);
    
    // Look for divs with specific class patterns
    const productDivs = $('div[class*="product"], div[class*="item"], div[class*="release"]');
    console.log(`Product-related divs: ${productDivs.length}`);
    
    productDivs.slice(0, 5).each((i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 50) {  // Only show substantial content
        console.log(`\n--- Product Div ${i+1} ---`);
        console.log('Classes:', $(el).attr('class'));
        console.log('Content:', text.substring(0, 200) + '...');
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testGBNY();