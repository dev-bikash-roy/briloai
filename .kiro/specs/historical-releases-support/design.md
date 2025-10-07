# Design Document

## Overview

This design enhances the existing Brilo KicksOnFire webhook to support fetching historical sneaker releases from the past 2-3 weeks. The solution will extend the current API without breaking existing functionality, adding new parameters and data sources to provide comprehensive release information.

## Architecture

The enhanced system will maintain the existing architecture while adding new components:

### Current Architecture (Maintained)
- Single API endpoint (`/api/releases`) 
- Cheerio-based HTML parsing
- In-memory caching (120s TTL)
- KicksOnFire calendar page scraping

### New Components
- **Historical Data Fetcher**: New module to fetch past releases
- **Date Range Calculator**: Utility to determine historical date ranges
- **Unified Response Merger**: Combines current and historical data
- **Extended Cache Strategy**: Separate caching for historical data (longer TTL)

## Components and Interfaces

### 1. Enhanced API Endpoint

The existing `/api/releases` endpoint will accept new optional parameters:

```javascript
// New parameters
{
  include_historical: boolean,    // Whether to include past releases
  weeks_back: number,            // How many weeks back to fetch (default: 2)
  historical_only: boolean       // Only return historical data
}
```

### 2. Historical Data Fetcher Module

```javascript
class HistoricalDataFetcher {
  async fetchHistoricalReleases(weeksBack = 2, brandFilter = '', limit = 15)
  async parseHistoricalPage(url)
  calculateDateRange(weeksBack)
  filterByDateRange(releases, startDate, endDate)
}
```

### 3. Date Range Calculator

```javascript
class DateRangeCalculator {
  getHistoricalRange(weeksBack)
  isWithinRange(releaseDate, startDate, endDate)
  formatDateForComparison(dateString)
}
```

### 4. Response Merger

```javascript
class ResponseMerger {
  mergeCurrentAndHistorical(currentReleases, historicalReleases)
  deduplicateReleases(releases)
  sortByRelevance(releases, includeHistorical)
}
```

## Data Models

The existing data model remains unchanged to maintain backward compatibility:

```javascript
{
  title: string,
  brand: string | null,
  release_date: string | null,  // ISO format
  url: string,
  image: string | null
}
```

Response structure enhanced with metadata:

```javascript
{
  results: Release[],
  meta: {
    source: "kicksonfire",
    start_page: number,
    pages_fetched: number,
    count: number,
    last_updated: string,
    // New fields
    includes_historical: boolean,
    historical_weeks_back: number,
    historical_count: number,
    current_count: number
  }
}
```

## Implementation Strategy

### Phase 1: Historical Data Source Research
Since KicksOnFire's calendar primarily shows upcoming releases, we need to identify how to access historical data:

1. **Archive Pages**: Check if KicksOnFire has archive or past release pages
2. **Date-based URLs**: Test if calendar URLs accept date parameters for past dates
3. **Alternative Approach**: Use the existing calendar but filter for releases that have passed their release date

### Phase 2: Core Implementation
Based on research findings, implement the most viable approach:

**Option A: Archive Pages** (if available)
- Discover archive URL patterns
- Adapt existing parsing logic for archive pages
- Implement date-based navigation

**Option B: Date Parameter URLs** (if supported)
- Modify calendar URL construction to accept past dates
- Test pagination for historical periods
- Ensure parsing compatibility

**Option C: Filter-based Approach** (fallback)
- Fetch more pages from current calendar
- Filter results to only include past releases
- Calculate release dates that have already occurred

### Phase 3: Integration and Caching

```javascript
// Enhanced caching strategy
const historicalCache = new Map();
const HISTORICAL_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Cache keys will include date range
const historicalCacheKey = `historical_${weeksBack}_${brandFilter}_${limit}`;
```

## Error Handling

### Historical Data Unavailable
- Gracefully degrade to current releases only
- Log warning but don't fail the request
- Include metadata indicating historical data unavailability

### Date Parsing Errors
- Skip releases with unparseable dates
- Continue processing remaining releases
- Log parsing errors for monitoring

### Network Failures
- Implement retry logic for historical fetches
- Use cached data if available during failures
- Provide partial results when possible

## Testing Strategy

### Unit Tests
- Date range calculation accuracy
- Historical data filtering logic
- Response merging and deduplication
- Cache key generation and validation

### Integration Tests
- End-to-end API requests with historical parameters
- Backward compatibility with existing API calls
- Cache behavior verification
- Error handling scenarios

### Performance Tests
- Response time with historical data enabled
- Memory usage with extended caching
- Concurrent request handling

## Backward Compatibility

The design ensures zero breaking changes:

1. **Default Behavior**: Without new parameters, API behaves exactly as before
2. **Response Format**: Existing fields remain unchanged, only metadata is extended
3. **Error Handling**: New failures don't affect existing functionality
4. **Caching**: Historical caching is separate from existing cache

## Security Considerations

- **Rate Limiting**: Historical fetches may require more requests, implement appropriate delays
- **Input Validation**: Validate `weeks_back` parameter to prevent excessive historical fetching
- **Resource Usage**: Limit historical data fetching to prevent abuse

## Performance Optimizations

1. **Intelligent Caching**: Longer TTL for historical data since it doesn't change
2. **Lazy Loading**: Only fetch historical data when explicitly requested
3. **Batch Processing**: Combine multiple historical page requests efficiently
4. **Memory Management**: Implement cache size limits for historical data