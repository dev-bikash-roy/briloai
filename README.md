# Brilo KicksOnFire Webhook (v2)

Selectors are tailored to the markup you shared:

- List page: `.releases-container .release-item-continer` (cards)
- Card link: `a.release-item` (href)
- Date or price badge: `.release-price-from` (e.g., "Sep 13" or "$308")
- Title: `.release-item-title`
- Image: `.release-item-image img[src]`

Detail page:
- Attempts to read **"Release Date Month Day, Year"** in the body text.
- Falls back to the calendar's month/day if a year isn't present on the detail page.
- Returns an `image` and an optional `price_hint` if the card showed a price instead of a date.

## Deploy to Vercel (UI)
1. Go to https://vercel.com/new → **Add New → Project**.
2. Import a Git repo with these files or upload manually.
3. Framework: **Other**. Node 18+ is fine.
4. (Optional) Add env var `WEBHOOK_TOKEN` = `gbny-12345`.
5. Deploy.
6. Endpoint: `https://<your-project>.vercel.app/api/releases`

## Test
GET:
```
curl "https://<your-project>.vercel.app/api/releases?page=2&pages=3&limit=10&brand=Jordan"   -H "Authorization: Bearer gbny-12345"
```

POST:
```
curl -X POST "https://<your-project>.vercel.app/api/releases"   -H "Content-Type: application/json"   -H "Authorization: Bearer gbny-12345"   -d '{ "parameters": { "page": 2, "pages": 3, "limit": 10, "brand": "Jordan" } }'
```

## Notes
- Uses a 120s in-memory cache per serverless instance.
- The parser tolerates the first card showing a **price** instead of a **date**.
- Results are sorted by `release_date` (items without a date fall to the bottom).
