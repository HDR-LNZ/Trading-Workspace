// Cloudflare Worker: proxies Finnhub + Yahoo Finance + Anthropic.
// Hides API keys; restricts CORS to the dashboard origin(s).
//
// Required secrets (set with `wrangler secret put NAME`):
//   FINNHUB_KEY      - your Finnhub API key
//   ANTHROPIC_KEY    - your Anthropic API key
//
// Optional vars in wrangler.toml [vars]:
//   ALLOWED_ORIGINS  - comma-separated list (default: GitHub Pages + localhost)

const DEFAULT_ALLOWED = [
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://hdr-lnz.github.io",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      let body;
      switch (url.pathname) {
        case "/api/quotes":   body = await handleQuotes(url, env); break;
        case "/api/candles":  body = await handleCandles(url, env); break;
        case "/api/news":     body = await handleNews(url, env); break;
        case "/api/chat":     body = await handleChat(request, env); break;
        case "/":             body = { ok: true, service: "trading-workspace-api" }; break;
        default:
          return json({ error: "Not found", path: url.pathname }, 404, request, env);
      }
      return json(body, 200, request, env);
    } catch (e) {
      console.error("worker error", e);
      return json({ error: e.message || String(e) }, 500, request, env);
    }
  },
};

/* -------------------------------------------------------- helpers */

function allowedOrigins(env) {
  if (env.ALLOWED_ORIGINS) return env.ALLOWED_ORIGINS.split(",").map(s => s.trim());
  return DEFAULT_ALLOWED;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  const allow = allowed.includes(origin) ? origin : (allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
    },
  });
}

/* -------------------------------------------------------- quotes */
// Strategy: Yahoo Finance v7 quote endpoint via crumb dance for regular + pre/post.
// Falls back to Finnhub /quote (regular only) if Yahoo fails.

async function handleQuotes(url, env) {
  const symbols = (url.searchParams.get("symbols") || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!symbols.length) return [];

  try {
    return await yahooQuotes(symbols);
  } catch (e) {
    console.warn("Yahoo quotes failed, falling back to Finnhub", e.message);
    return await finnhubQuotes(symbols, env);
  }
}

let cachedCrumb = null;
let cachedCookie = null;
let crumbExpires = 0;

async function getYahooCrumb() {
  if (cachedCrumb && Date.now() < crumbExpires) return { crumb: cachedCrumb, cookie: cachedCookie };
  // Step 1: hit fc.yahoo.com to get the A1 cookie
  const r1 = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": UA },
  });
  const setCookie = r1.headers.get("set-cookie") || "";
  const cookie = setCookie.split(",").map(s => s.split(";")[0]).join("; ");
  // Step 2: getcrumb
  const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, "Cookie": cookie },
  });
  const crumb = await r2.text();
  cachedCrumb = crumb.trim();
  cachedCookie = cookie;
  crumbExpires = Date.now() + 30 * 60 * 1000; // cache 30 min
  return { crumb: cachedCrumb, cookie: cachedCookie };
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function yahooQuotes(symbols) {
  const { crumb, cookie } = await getYahooCrumb();
  const u = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
  u.searchParams.set("symbols", symbols.join(","));
  u.searchParams.set("crumb", crumb);
  const r = await fetch(u, { headers: { "User-Agent": UA, "Cookie": cookie } });
  if (!r.ok) throw new Error(`Yahoo quote ${r.status}`);
  const data = await r.json();
  const results = data?.quoteResponse?.result || [];
  return results.map((q) => ({
    symbol: q.symbol,
    name: q.longName || q.shortName || q.symbol,
    price: q.regularMarketPrice ?? null,
    change: q.regularMarketChange ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    prevClose: q.regularMarketPreviousClose ?? null,
    preMarketPrice: q.preMarketPrice ?? null,
    preMarketChangePct: q.preMarketChangePercent ?? null,
    postMarketPrice: q.postMarketPrice ?? null,
    postMarketChangePct: q.postMarketChangePercent ?? null,
    marketState: q.marketState || "REGULAR",
    marketCap: q.marketCap ?? null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    fiftyDayAverage: q.fiftyDayAverage ?? null,
    twoHundredDayAverage: q.twoHundredDayAverage ?? null,
    averageDailyVolume3Month: q.averageDailyVolume3Month ?? null,
  }));
}

async function finnhubQuotes(symbols, env) {
  if (!env.FINNHUB_KEY) throw new Error("FINNHUB_KEY not set");
  const results = await Promise.all(symbols.map(async (sym) => {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${env.FINNHUB_KEY}`);
    const q = await r.json();
    const profile = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${env.FINNHUB_KEY}`)
      .then(r => r.json()).catch(() => ({}));
    return {
      symbol: sym,
      name: profile.name || sym,
      price: q.c ?? null,
      change: q.d ?? null,
      changePct: q.dp ?? null,
      prevClose: q.pc ?? null,
      preMarketPrice: null,
      preMarketChangePct: null,
      postMarketPrice: null,
      postMarketChangePct: null,
      marketState: "REGULAR",
      marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null,
    };
  }));
  return results;
}

/* -------------------------------------------------------- candles */
// Yahoo /v8/finance/chart works without crumb in most cases.

async function handleCandles(url, env) {
  const symbol = url.searchParams.get("symbol");
  const range = url.searchParams.get("range") || "1d";
  const interval = url.searchParams.get("interval") || "5m";
  if (!symbol) throw new Error("symbol required");
  const u = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  u.searchParams.set("range", range);
  u.searchParams.set("interval", interval);
  u.searchParams.set("includePrePost", "false");
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Yahoo chart ${r.status}`);
  const data = await r.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("no chart data");
  const timestamps = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const candles = timestamps.map((t, i) => ({
    time: t,
    open: q.open?.[i] ?? null,
    high: q.high?.[i] ?? null,
    low: q.low?.[i] ?? null,
    close: q.close?.[i] ?? null,
    volume: q.volume?.[i] ?? 0,
  })).filter(c => c.open != null && c.close != null);
  return { symbol, candles };
}

/* -------------------------------------------------------- news */

async function handleNews(url, env) {
  const symbol = url.searchParams.get("symbol") || "GENERAL";
  const limit = parseInt(url.searchParams.get("limit") || "12", 10);
  if (!env.FINNHUB_KEY) throw new Error("FINNHUB_KEY not set");

  let raw;
  if (symbol === "GENERAL") {
    const r = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${env.FINNHUB_KEY}`);
    raw = await r.json();
  } else {
    const to = new Date();
    const from = new Date(to.getTime() - 14 * 86400 * 1000);
    const fmt = (d) => d.toISOString().split("T")[0];
    const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fmt(from)}&to=${fmt(to)}&token=${env.FINNHUB_KEY}`);
    raw = await r.json();
  }
  if (!Array.isArray(raw)) raw = [];
  return raw.slice(0, limit).map((n) => ({
    id: String(n.id),
    headline: n.headline,
    summary: n.summary,
    source: n.source,
    url: n.url,
    image: n.image || "",
    publishedAt: (n.datetime || 0) * 1000,
    sentiment: classifySentiment(n.headline),
    related: n.related || symbol,
  }));
}

// quick keyword sentiment classifier — Finnhub free tier doesn't include real sentiment
function classifySentiment(text = "") {
  const t = text.toLowerCase();
  const neg = ["fall", "slip", "drop", "plunge", "crash", "miss", "warn", "lawsuit", "probe", "downgrade", "bearish", "loss", "cut", "fraud", "decline", "weak"];
  const pos = ["beat", "surge", "rally", "soar", "jump", "rise", "win", "approve", "upgrade", "bullish", "record", "strong", "deal", "expand", "grow"];
  if (neg.some(k => t.includes(k))) return "negative";
  if (pos.some(k => t.includes(k))) return "positive";
  return "neutral";
}

/* -------------------------------------------------------- chat */

async function handleChat(request, env) {
  if (request.method !== "POST") throw new Error("POST required");
  if (!env.ANTHROPIC_KEY) throw new Error("ANTHROPIC_KEY not set");
  const { messages, system } = await request.json();
  if (!Array.isArray(messages)) throw new Error("messages required");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: system || "You are a helpful markets analyst.",
      messages,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Anthropic ${r.status}: ${err}`);
  }
  const data = await r.json();
  const content = data?.content?.[0]?.text || "";
  return { content, model: data?.model, usage: data?.usage };
}
