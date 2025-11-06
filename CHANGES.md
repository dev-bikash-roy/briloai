# Changes Summary

## Overview
This update modifies the webhook scraper to fetch sneaker release data from [GB&Y Upcoming Releases](https://gbny.com/pages/upcoming) instead of KicksOnFire.

## Files Modified

### 1. `api/releases.js`
- Updated the data source from KicksOnFire to GB&Y
- Replaced KicksOnFire scraping logic with GB&Y text parsing
- Modified the `fetchGBNYReleases` function to fetch and parse data from https://gbny.com/pages/upcoming
- Updated the response metadata to indicate "gbny" as the source

### 2. `README.md`
- Updated documentation to reflect the new data source
- Modified deployment and testing instructions

## New Functionality

### GB&Y Data Parsing
The new implementation parses release information directly from the text content of the GB&Y upcoming releases page:

1. Fetches the HTML content of https://gbny.com/pages/upcoming
2. Extracts text content and identifies lines containing release information
3. Uses regex patterns to parse:
   - Brand information (Nike, Jordan, etc.)
   - Product names and details
   - Pricing information
4. Normalizes brand names using the existing `normalizeBrand` function
5. Constructs release objects with title, brand, and URL

### API Endpoints
The API endpoints remain the same but now return data from GB&Y:
- GET `/api/releases`
- POST `/api/releases`

### Parameters
Supported parameters remain the same:
- `brand` - Filter by brand (e.g., "Jordan", "Nike")
- `limit` - Maximum number of releases to return (default: 50, max: 300)

## Testing
- Created local test scripts to verify the new parsing logic
- Set up a local API server for testing the complete implementation
- Verified that both filtered (by brand) and unfiltered requests work correctly

## Limitations
- Release dates are not currently parsed from the GB&Y page (only available in the page title)
- No image URLs are available from the text parsing approach
- The implementation depends on the consistent formatting of the GB&Y page

## Future Improvements
- Enhance date parsing if more structured date information becomes available
- Add image URL extraction if image elements are added to the page
- Implement more robust error handling for network requests