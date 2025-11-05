/**
 * Elfsight Widget Data Fetcher
 * Fetches data from Elfsight Event Calendar widget and converts it to standardized release format
 */

const WIDGET_ID = "484318bf-f059-4367-8e84-a6481c2be688";
const BASE_URL = "https://core.service.elfsight.com/p/boot/";

/**
 * Fetch raw widget settings from Elfsight API
 * @returns {Promise<Object>} Raw widget settings data
 */
async function fetchWidgetSettings() {
  const url = `${BASE_URL}?w=${WIDGET_ID}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data.widgets[WIDGET_ID].data.settings;
  } catch (err) {
    console.error("Elfsight widget fetch error:", err);
    throw err;
  }
}

/**
 * Convert Elfsight widget events to standardized release format
 * @param {Object} widgetSettings - Raw widget settings from Elfsight
 * @returns {Array<Object>} Array of release objects in standardized format
 */
function convertEventsToReleases(widgetSettings) {
  const releases = [];
  
  // Check if widget has events data
  if (!widgetSettings?.events?.length) {
    console.warn("No events found in widget settings");
    return releases;
  }
  
  // Process each event in the widget
  for (const event of widgetSettings.events) {
    try {
      // Extract the required fields
      const release = {
        title: extractProductName(event),
        brand: extractBrandName(event),
        release_date: extractReleaseDate(event),
        price_hint: extractPrice(event),
        availability: extractAvailability(event),
        url: event.link || null,
        image: extractImage(event)
      };
      
      // Only add release if it has meaningful data
      if (release.title || release.brand) {
        releases.push(release);
      }
    } catch (err) {
      console.error("Error processing event:", err, event);
    }
  }
  
  return releases;
}

/**
 * Extract product name from event
 * @param {Object} event - Elfsight event object
 * @returns {string|null} Product name
 */
function extractProductName(event) {
  // Try various fields that might contain product name
  let title = event.title || 
              event.name || 
              event.productName || 
              event.headline ||
              null;
              
  if (title) {
    // If title contains price info (like "$155"), remove it
    title = title.replace(/\s*\$\d+$/, '').trim();
  }
  
  return title;
}

/**
 * Extract brand name from event
 * @param {Object} event - Elfsight event object
 * @returns {string|null} Brand name
 */
function extractBrandName(event) {
  // Try various fields that might contain brand
  const brand = event.brand || 
                event.brandName || 
                event.manufacturer ||
                null;
                
  if (brand) return brand;
  
  // Try to extract from title if not explicitly provided
  const title = extractProductName(event);
  if (title) {
    // Simple brand detection from common sneaker brands
    const brandMap = {
      'jordan': 'Jordan',
      'air jordan': 'Jordan',
      'nike': 'Nike',
      'adidas': 'Adidas',
      'new balance': 'New Balance',
      'asics': 'Asics',
      'puma': 'Puma',
      'reebok': 'Reebok',
      'converse': 'Converse',
      'saucony': 'Saucony',
      'vans': 'Vans',
      'balenciaga': 'Balenciaga',
      'bape': 'Bape',
      'under armour': 'Under Armour'
    };
    
    const lowerTitle = title.toLowerCase();
    for (const [key, value] of Object.entries(brandMap)) {
      if (lowerTitle.includes(key)) {
        return value;
      }
    }
  }
  
  return null;
}

/**
 * Extract release date from event
 * @param {Object} event - Elfsight event object
 * @returns {string|null} ISO formatted date string
 */
function extractReleaseDate(event) {
  // Try various date fields
  const dateValue = event.date || 
                    event.releaseDate || 
                    event.launchDate || 
                    event.startDate ||
                    event.dateTime ||
                    event.start ||
                    null;
  
  if (!dateValue) return null;
  
  // If it's already a valid date string, return it
  if (typeof dateValue === 'string') {
    // Try to parse as date
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  
  // If it's a timestamp
  if (typeof dateValue === 'number') {
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  
  // If it's an object with date information
  if (typeof dateValue === 'object') {
    // Handle various date object formats
    if (dateValue.date) {
      // Might be { date: "2025-12-15", timezone_type: 3, timezone: "UTC" }
      const date = new Date(dateValue.date);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    
    if (dateValue.start) {
      // Might be { start: "2025-12-15T10:00:00Z" }
      const date = new Date(dateValue.start);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }
  
  return null;
}

/**
 * Extract price from event
 * @param {Object} event - Elfsight event object
 * @returns {string|null} Price information
 */
function extractPrice(event) {
  // Try various price fields
  let price = event.price || 
              event.pricing || 
              event.cost || 
              event.officialPricing ||
              event.retailPrice ||
              null;
              
  // If not found in dedicated fields, try to extract from title
  if (!price) {
    const title = event.title || event.name || '';
    const priceMatch = title.match(/\$(\d+)/);
    if (priceMatch) {
      price = `$${priceMatch[1]}`;
    }
  }
  
  return price;
}

/**
 * Extract availability information from event
 * @param {Object} event - Elfsight event object
 * @returns {string|null} Availability information
 */
function extractAvailability(event) {
  // Try various availability fields
  return event.availability || 
         event.generalAvailability || 
         event.status || 
         event.stockStatus ||
         event.availabilityStatus ||
         null;
}

/**
 * Extract image URL from event
 * @param {Object} event - Elfsight event object
 * @returns {string|null} Image URL
 */
function extractImage(event) {
  // Handle various image formats
  if (event.image) {
    if (typeof event.image === 'string') {
      return event.image;
    }
    
    // Handle object format { url: "...", width: ..., height: ... }
    if (event.image.url) {
      return event.image.url;
    }
    
    // Handle array of images
    if (Array.isArray(event.image) && event.image.length > 0) {
      const firstImage = event.image[0];
      if (typeof firstImage === 'string') {
        return firstImage;
      }
      if (firstImage && firstImage.url) {
        return firstImage.url;
      }
    }
  }
  
  return null;
}

/**
 * Main function to fetch and convert Elfsight widget data
 * @returns {Promise<Array<Object>>} Array of release objects
 */
export async function fetchElfsightReleases() {
  try {
    // Fetch raw widget settings
    const widgetSettings = await fetchWidgetSettings();
    
    // Convert to standardized release format
    const releases = convertEventsToReleases(widgetSettings);
    
    console.log(`Successfully fetched ${releases.length} releases from Elfsight widget`);
    return releases;
  } catch (err) {
    console.error("Failed to fetch Elfsight releases:", err);
    throw err;
  }
}

export default {
  fetchElfsightReleases
};