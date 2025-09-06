import { load as loadHTML } from "cheerio";

// Base calendar & list pages (pagination via ?page=N)
const BASE = "https://www.kicksonfire.com";
const CAL_PATH = "/sneaker-release-dates";
const DEFAULT_PAGES = 2;                // how many pages to fetch by default
const UA = "GBNY-Brilo/1.1 (+contact@gbny.com)";

// simple in-memory cache (per serverless instance)
const cache = new Map();
const TTL_MS = 120 * 1000;

// ---------- helpers ----------
function monthToNum(m) {
  const map = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,sept:9,october:10,november:11,december:12,
    jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
  };
  return map[m.toLowerCase()] || null;
}

function toISOFromTextDate(s) {
  if (!s) return null;
  const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})?/);
  if (!m) return null;
  const month = monthToNum(m[1]);
  const day = parseInt(m[2], 10);
  let year = m[3] ? parseInt(m[3], 10) : (new Date()).getFullYear();
  if (!month || !day) return null;
  const now = new Date();
  if (!m[3]) {
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
    if (tmp < now) year = now.getUTCFullYear() + 1;
  }
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

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

async function fetchText(url) {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error("fetch failed " + r.status);
  return r.text();
}

function absolute(href) {
  try { return new URL(href, BASE).href; } catch { return href; }
}

// --------- PARSERS tailored to the HTML you shared ---------
// Cards live under: .releases-container .release-item-continer
// Each card has: a.release-item > spans: .release-price-from (date or $price), .release-item-title (title).
// Image at .release-item-image img[src]
function extractCardList(html) {
  const $ = loadHTML(html);
  const items = [];
  $(".releases-container .release-item-continer").each((_, el) => {
    const card = $(el);
    const a = card.find("a.release-item").first();
    if (!a.length) return;

    const href = a.attr("href");
    const title = a.find(".release-item-title").first().text().trim() || a.attr("title") || "";
    if (!title) return;

    let stamp = a.find(".release-price-from").first().text().trim();
    const img = a.find(".release-item-image img").attr("src") || a.find("img").attr("data-src") || a.find("img").attr("src");

    let date_hint = null;
    let price = null;
    if (/^\$/.test(stamp)) {
      price = stamp;               // Sometimes the first card shows a price instead of a date
      stamp = null;
    } else if (stamp) {
      date_hint = stamp;           // e.g., "Sep 13"
    }

    items.push({
      title,
      brand: normalizeBrand(title) || null,
      date_hint,
      price,
      url: absolute(href),
      image: img ? (img.startsWith("http") ? img : `https:${img}`) : null
    });
  });

  // dedupe by URL
  const seen = new Set();
  return items.filter(it => (seen.has(it.url) ? false : (seen.add(it.url), true)));
}

// Detail page: try to read a "Release Date ..." label; otherwise keep the calendar date.
function extractDetail(html, fallback) {
  const $ = loadHTML(html);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const pageText = $("body").text().replace(/\s+/g, " ");
  const m = pageText.match(/Release Date\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i);
  const dateISO = m ? toISOFromTextDate(m[1]) : (fallback?.date_hint ? toISOFromTextDate(fallback.date_hint) : null);
  const brand = normalizeBrand(h1) || fallback?.brand || null;

  // product/hero image
  let image = $("img").first().attr("src") || $("img").first().attr("data-src") || fallback?.image || null;
  if (image && !image.startsWith("http")) image = "https:" + image;

  return {
    title: h1 || fallback?.title,
    brand,
    release_date: dateISO,
    url: fallback?.url,
    image,
    price_hint: fallback?.price || null
  };
}

export default async function handler(req, res) {
  const method = req.method || "GET";
  let params = {};
  try {
    if (method === "POST") {
      const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
      params = body.parameters || body || {};
    } else {
      params = req.query || {};
    }
  } catch { params = {}; }

  // Optional bearer token (set WEBHOOK_TOKEN in Vercel → Settings → Environment Variables)
  const token = process.env.WEBHOOK_TOKEN;
  const auth = req.headers["authorization"] || "";
  if (token && auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const brandFilter = (params.brand || "").toString().trim();
  const limit = Math.min(parseInt(params.limit || "15", 10) || 15, 50);
  const startPage = parseInt(params.page || "1", 10) || 1;
  const pages = Math.min(parseInt(params.pages || DEFAULT_PAGES, 10) || DEFAULT_PAGES, 10);

  // Cache
  const cacheKey = JSON.stringify({ brandFilter, limit, startPage, pages });
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return res.json(cached.data);

  // 1) collect list items across pages (using the exact classes from your HTML)
  const list = [];
  for (let p = 0; p < pages; p++) {
    const url = `${BASE}${CAL_PATH}?page=${startPage + p}`;
    try {
      const html = await fetchText(url);
      list.push(...extractCardList(html));
      if (list.length >= limit) break;
    } catch (err) {
      // proceed even if one page fails
    }
  }

  // unique & trim to limit
  const seen = new Set();
  const unique = [];
  for (const it of list) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    unique.push(it);
    if (unique.length >= limit) break;
  }

  // 2) visit detail pages to capture full date + image
  const out = [];
  for (const it of unique) {
    try {
      const detailHtml = await fetchText(it.url);
      out.push(extractDetail(detailHtml, it));
    } catch {
      out.push({
        title: it.title,
        brand: it.brand,
        release_date: toISOFromTextDate(it.date_hint),
        url: it.url,
        image: it.image || null,
        price_hint: it.price || null
      });
    }
    if (out.length >= limit) break;
  }

  // filter & sort
  const filtered = brandFilter
    ? out.filter(r => (r.brand || "").toLowerCase().includes(brandFilter.toLowerCase()))
    : out;

  filtered.sort((a, b) => {
    const ta = Date.parse(a.release_date || "9999-12-31");
    const tb = Date.parse(b.release_date || "9999-12-31");
    return ta - tb;
  });

  const payload = {
    results: filtered,
    meta: {
      source: "kicksonfire",
      start_page: startPage,
      pages_fetched: pages,
      count: filtered.length,
      last_updated: new Date().toISOString()
    }
  };

  cache.set(cacheKey, { at: now, data: payload });
  return res.json(payload);
}
