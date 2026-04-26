// API client. All requests go through the Cloudflare Worker which hides keys
// and proxies Finnhub + Yahoo Finance + Anthropic.
//
// To run against a local Worker: set localStorage.WORKER_URL = "http://127.0.0.1:8787"
// To run against production: it falls back to the constant below.

const DEFAULT_WORKER_URL = "https://trading-workspace-api.haiderlnz.workers.dev";

export function getWorkerUrl() {
  return localStorage.getItem("WORKER_URL") || DEFAULT_WORKER_URL;
}

export function setWorkerUrl(url) {
  if (url) localStorage.setItem("WORKER_URL", url);
  else localStorage.removeItem("WORKER_URL");
}

export const MOCK_MODE = !getWorkerUrl();

async function workerFetch(path, opts = {}) {
  const base = getWorkerUrl();
  if (!base) throw new Error("Worker URL not configured");
  const r = await fetch(`${base}${path}`, opts);
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText);
    throw new Error(`API ${r.status}: ${text}`);
  }
  return r.json();
}

/* ---- quotes ---- */
// Returns: [{ symbol, name, price, change, changePct, prevClose,
//             preMarketPrice, preMarketChangePct, postMarketPrice, postMarketChangePct,
//             marketState }]
export async function getQuotes(symbols) {
  if (!symbols?.length) return [];
  if (MOCK_MODE) return mockQuotes(symbols);
  return workerFetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
}

/* ---- candles for chart ---- */
// range: 1d | 5d | 1mo | 3mo | 6mo | 1y | 2y | 5y
// interval: 1m | 5m | 15m | 30m | 1h | 1d
// Returns: { symbol, candles: [{ time, open, high, low, close, volume }] }
export async function getCandles(symbol, range = "1d", interval = "5m") {
  if (MOCK_MODE) return mockCandles(symbol, range, interval);
  return workerFetch(`/api/candles?symbol=${symbol}&range=${range}&interval=${interval}`);
}

/* ---- news ---- */
// symbol can be a ticker or "GENERAL" for market-wide news
export async function getNews(symbol = "GENERAL", limit = 10) {
  if (MOCK_MODE) return mockNews(symbol, limit);
  return workerFetch(`/api/news?symbol=${symbol}&limit=${limit}`);
}

/* ---- chat ---- */
// messages: [{role: 'user'|'assistant', content: string}]
// system: optional system prompt
export async function chat(messages, system) {
  if (MOCK_MODE) return mockChat(messages);
  return workerFetch(`/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system }),
  });
}

/* ----------------------------------------------------------------------------
   Mock data (used when WORKER_URL is not configured) so the UI is testable
   before the Worker is deployed.
---------------------------------------------------------------------------- */

const COMPANY_NAMES = {
  ALB: "Albemarle Corporation", SQM: "Sociedad Quimica y Minera",
  MP: "MP Materials Corp.", LYSDY: "Lynas Rare Earths",
  FCX: "Freeport-McMoRan Inc.", VALE: "Vale S.A.",
  GLNCY: "Glencore PLC", CMCLF: "CMOC Group Ltd",
  LAC: "Lithium Americas Corp.", PLL: "Piedmont Lithium",
  LMT: "Lockheed Martin Corp.", NOC: "Northrop Grumman Corp.",
  RTX: "RTX Corporation", GD: "General Dynamics Corp.",
  LHX: "L3Harris Technologies", HII: "Huntington Ingalls Industries",
  BA: "Boeing Co.", LDOS: "Leidos Holdings", KTOS: "Kratos Defense",
  CCJ: "Cameco Corporation", UEC: "Uranium Energy Corp.",
  UUUU: "Energy Fuels Inc.", NXE: "NexGen Energy Ltd.",
  DNN: "Denison Mines Corp.", OKLO: "Oklo Inc.",
  SMR: "NuScale Power Corp.", BWXT: "BWX Technologies",
  LEU: "Centrus Energy Corp.",
  NVDA: "Nvidia Corp.", AMD: "Advanced Micro Devices",
  AVGO: "Broadcom Inc.", TSM: "Taiwan Semiconductor",
  ASML: "ASML Holding NV", ARM: "Arm Holdings",
  MU: "Micron Technology", ANET: "Arista Networks",
  VRT: "Vertiv Holdings", SMCI: "Super Micro Computer",
  XOM: "Exxon Mobil Corp.", CVX: "Chevron Corp.",
  OXY: "Occidental Petroleum", COP: "ConocoPhillips",
  EOG: "EOG Resources", SLB: "Schlumberger Ltd.",
  MPC: "Marathon Petroleum", LNG: "Cheniere Energy",
  FANG: "Diamondback Energy",
  CRWD: "CrowdStrike Holdings", PANW: "Palo Alto Networks",
  ZS: "Zscaler Inc.", NET: "Cloudflare Inc.",
  S: "SentinelOne Inc.", OKTA: "Okta Inc.", FTNT: "Fortinet Inc.",
  SPY: "SPDR S&P 500 ETF",
};

function seeded(symbol, salt = 0) {
  let h = salt;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(Math.sin(h)) % 1;
}

function mockQuotes(symbols) {
  return symbols.map((sym) => {
    const base = 20 + seeded(sym) * 500;
    const pct = (seeded(sym, 7) - 0.5) * 8;
    const price = +(base * (1 + pct / 100)).toFixed(2);
    const change = +(base * (pct / 100)).toFixed(2);
    return {
      symbol: sym,
      name: COMPANY_NAMES[sym] || sym,
      price,
      change,
      changePct: +pct.toFixed(2),
      prevClose: +base.toFixed(2),
      preMarketPrice: null,
      preMarketChangePct: null,
      postMarketPrice: null,
      postMarketChangePct: null,
      marketState: "REGULAR",
    };
  });
}

function mockCandles(symbol, range, interval) {
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  const stepSec = interval === "1d" ? 86400 : interval === "1h" ? 3600 : 300;
  const count = range === "1d" ? 78 : range === "5d" ? 200 : 200;
  let p = 100 + seeded(symbol) * 400;
  for (let i = count; i >= 0; i--) {
    const t = now - i * stepSec;
    const drift = (Math.sin((i + seeded(symbol) * 100) / 8) + (Math.random() - 0.5)) * 0.5;
    const open = p;
    const close = +(p + drift).toFixed(2);
    const high = +Math.max(open, close, p + Math.abs(drift) * 1.4).toFixed(2);
    const low = +Math.min(open, close, p - Math.abs(drift) * 1.4).toFixed(2);
    const volume = Math.round(50000 + Math.random() * 250000);
    candles.push({ time: t, open, high, low, close, volume });
    p = close;
  }
  return { symbol, candles };
}

function mockNews(symbol, limit) {
  const now = Date.now();
  const samples = [
    { headline: "Wall Street futures slip as Hormuz tensions deepen", sentiment: "negative" },
    { headline: "Treasury yields jump after surprise inflation print", sentiment: "negative" },
    { headline: `${symbol} signs supply deal — analysts call it a tailwind`, sentiment: "positive" },
    { headline: "Pentagon awards new long-range strike contract", sentiment: "positive" },
    { headline: `Major fund quietly builds 5% stake in ${symbol}`, sentiment: "positive" },
    { headline: "DOE green-lights new uranium enrichment capacity", sentiment: "positive" },
    { headline: "Critical-minerals stocks slide on China export rumor", sentiment: "negative" },
  ];
  return samples.slice(0, limit).map((s, i) => ({
    id: `${symbol}-${i}`,
    headline: s.headline,
    summary: "",
    source: ["Bloomberg", "Reuters", "WSJ", "FT", "CNBC"][i % 5],
    url: "#",
    image: "",
    publishedAt: now - i * 1000 * 60 * 60 * 6,
    sentiment: s.sentiment,
    related: symbol,
  }));
}

async function mockChat(messages) {
  await new Promise((r) => setTimeout(r, 600));
  const last = messages[messages.length - 1]?.content || "";
  return {
    content:
      `[Mock response — Worker not configured yet]\n\n` +
      `You asked: "${last}"\n\n` +
      `Once the Cloudflare Worker is deployed and \`WORKER_URL\` is set, this will respond from Claude with full sector context including live prices.`,
  };
}
