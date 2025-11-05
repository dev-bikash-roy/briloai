# Elfsight Widget Integration

This document explains how the Elfsight Event Calendar widget integration works in the Brilo webhook system.

## Overview

The Brilo webhook now fetches sneaker release data directly from the GBNY Elfsight Event Calendar widget instead of using hardcoded manual data. This allows for real-time updates without requiring code changes.

## How It Works

1. The system fetches widget settings from Elfsight's API using the widget ID: `484318bf-f059-4367-8e84-a6481c2be688`
2. The raw widget data is parsed and converted to the standardized release format
3. If the Elfsight fetch fails, the system falls back to the manual data

## Data Mapping

The Elfsight widget events are mapped to the following fields in the release format:

| Elfsight Field | Release Field | Notes |
|----------------|---------------|-------|
| title/name | title | Price information is extracted if present |
| brand/brandName | brand | Auto-detected from title if not explicitly provided |
| date/releaseDate | release_date | Various date formats are supported |
| price/retailPrice | price_hint | Extracted from title if not in dedicated field |
| image | image | URL extracted from various image formats |
| link | url | Direct link to product page if available |

## Testing

To test the Elfsight integration:

```bash
npm run test-elfsight
```

Or directly:

```bash
node test-elfsight.js
```

## Fallback Mechanism

If the Elfsight widget data cannot be fetched, the system will fall back to the hardcoded manual data to ensure continuity of service.

## Updating the Widget ID

To use a different Elfsight widget, update the `WIDGET_ID` constant in [api/elfsight-fetcher.js](file:///G:/briloai/api/elfsight-fetcher.js).