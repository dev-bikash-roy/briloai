# Brilo GB&Y Webhook (v2)

This webhook now fetches sneaker release data from [GB&Y Upcoming Releases](https://gbny.com/pages/upcoming) instead of KicksOnFire.

The parser extracts release information directly from the text content of the GB&Y page, including:
- Brand (Nike, Jordan, etc.)
- Product name and details
- Pricing information

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
curl "https://<your-project>.vercel.app/api/releases?limit=10&brand=Jordan"   -H "Authorization: Bearer gbny-12345"
```

POST:
```
curl -X POST "https://<your-project>.vercel.app/api/releases"   -H "Content-Type: application/json"   -H "Authorization: Bearer gbny-12345"   -d '{ "parameters": { "limit": 10, "brand": "Jordan" } }'
```

## Notes
- Uses a 120s in-memory cache per serverless instance.
- Results are sorted by `release_date` (items without a date fall to the bottom).
- The parser extracts information from the text content of the GB&Y upcoming releases page.