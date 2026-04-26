// Widget render functions. Each widget is a function that takes a container DOM node
// and a config object, returns an instance with { refresh(), destroy(), config }.

import * as api from "./api.js";
import { SECTORS } from "./sectors.js";

const fmtPrice = (n) => (n == null ? "—" : n >= 100 ? n.toFixed(2) : n.toFixed(2));
const fmtPct = (n) => {
  if (n == null || isNaN(n)) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
};
const fmtChange = (n) => {
  if (n == null || isNaN(n)) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
};
const upDown = (n) => (n == null || n === 0 ? "flat" : n > 0 ? "up" : "down");
const initials = (sym) => sym.slice(0, Math.min(3, sym.length));

/* ------------------------------------------------------------------ shared */

function paneShell({ title, sub, sectorId, onChat, onRefresh }) {
  const wrap = document.createElement("div");
  wrap.className = "pane";

  const header = document.createElement("header");
  header.className = "pane-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "pane-title-wrap";
  titleWrap.innerHTML = `
    <span class="pane-title-icon">≡</span>
    <span class="pane-title">${escapeHtml(title)}</span>
  `;
  header.appendChild(titleWrap);

  const actions = document.createElement("div");
  actions.className = "pane-actions";
  if (onChat) {
    const chatBtn = document.createElement("button");
    chatBtn.className = "btn-icon btn-chat";
    chatBtn.title = "Chat about this sector";
    chatBtn.textContent = "💬";
    chatBtn.addEventListener("click", (e) => { e.stopPropagation(); onChat(); });
    actions.appendChild(chatBtn);
  }
  if (onRefresh) {
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "btn-icon";
    refreshBtn.title = "Refresh";
    refreshBtn.textContent = "↻";
    refreshBtn.addEventListener("click", (e) => { e.stopPropagation(); onRefresh(); });
    actions.appendChild(refreshBtn);
  }
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-icon close-btn";
  closeBtn.title = "Remove widget";
  closeBtn.textContent = "✕";
  actions.appendChild(closeBtn);
  header.appendChild(actions);

  wrap.appendChild(header);

  const body = document.createElement("div");
  body.className = "pane-body";
  if (sub) {
    const subEl = document.createElement("div");
    subEl.className = "pane-subtitle";
    subEl.textContent = sub;
    body.appendChild(subEl);
  }
  wrap.appendChild(body);

  return { wrap, body, header, closeBtn };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ------------------------------------------------------------------ watchlist */

export function createWatchlist(container, config, ctx) {
  const sector = SECTORS[config.sectorId] || SECTORS["critical-minerals"];
  let lastQuotes = [];

  const shell = paneShell({
    title: sector.name,
    sub: sector.description,
    sectorId: config.sectorId,
    onChat: () => ctx.openChat({ kind: "sector", sectorId: config.sectorId, quotes: lastQuotes }),
    onRefresh: () => instance.refresh(),
  });
  container.appendChild(shell.wrap);

  const listWrap = document.createElement("div");
  listWrap.className = "watchlist";
  shell.body.appendChild(listWrap);

  // initial skeleton
  for (let i = 0; i < Math.min(6, sector.tickers.length); i++) {
    const sk = document.createElement("div");
    sk.className = "skeleton";
    listWrap.appendChild(sk);
  }

  function render(quotes) {
    listWrap.innerHTML = "";
    for (const q of quotes) {
      const row = document.createElement("div");
      row.className = `watchlist-row ${upDown(q.changePct)}`;
      const ext = (q.preMarketPrice || q.postMarketPrice) ? renderExtended(q) : "";
      row.innerHTML = `
        <div class="tk-icon" style="background:${sector.color}33;color:${sector.color};border-color:${sector.color}55">${escapeHtml(initials(q.symbol))}</div>
        <div class="tk-meta">
          <div class="tk-symbol">${escapeHtml(q.symbol)}</div>
          <div class="tk-name" title="${escapeHtml(q.name || "")}">${escapeHtml(q.name || "")}</div>
        </div>
        <div class="tk-quote">
          <div class="tk-price">${fmtPrice(q.price)}</div>
          <div class="tk-change ${upDown(q.changePct)}">${fmtPct(q.changePct)}</div>
          ${ext}
        </div>
      `;
      listWrap.appendChild(row);
    }
  }

  function renderExtended(q) {
    if (q.postMarketPrice != null) {
      return `<span class="tk-extended"><span class="label">Post</span> ${fmtPrice(q.postMarketPrice)} ${fmtPct(q.postMarketChangePct)}</span>`;
    }
    if (q.preMarketPrice != null) {
      return `<span class="tk-extended"><span class="label">Pre</span> ${fmtPrice(q.preMarketPrice)} ${fmtPct(q.preMarketChangePct)}</span>`;
    }
    return "";
  }

  let timer;
  const instance = {
    config,
    closeBtn: shell.closeBtn,
    getQuotes: () => lastQuotes,
    async refresh() {
      try {
        const quotes = await api.getQuotes(sector.tickers);
        lastQuotes = quotes;
        render(quotes);
        ctx.notifyQuotesUpdated?.();
      } catch (e) {
        listWrap.innerHTML = `<div class="empty">Quotes failed: ${escapeHtml(e.message)}</div>`;
      }
    },
    destroy() { clearInterval(timer); },
  };

  instance.refresh();
  timer = setInterval(() => instance.refresh(), 20_000);
  return instance;
}

/* ------------------------------------------------------------------ chart */

export function createChart(container, config, ctx) {
  let symbol = (config.symbol || "SPY").toUpperCase();
  let range = config.range || "1D";
  let interval = config.interval || "5m";
  let auto = config.auto !== false; // default ON — picks biggest mover from watchlists
  const MIN_MARKET_CAP = 10e9; // exclude small/meme caps
  let chart, candleSeries, volumeSeries;

  const shell = paneShell({
    title: `Chart`,
    sectorId: null,
    onRefresh: () => instance.refresh(),
  });
  container.appendChild(shell.wrap);

  const pane = document.createElement("div");
  pane.className = "chart-pane";

  const toolbar = document.createElement("div");
  toolbar.className = "chart-toolbar";
  toolbar.innerHTML = `
    <button class="auto-pill ${auto ? "active" : ""}" data-auto title="Auto-pick biggest mover from watchlists (market cap ≥ $10B)">AUTO</button>
    <input type="text" class="chart-symbol-input" value="${symbol}" />
    <div class="range-pills">
      ${["1D", "1W", "1M", "3M", "6M", "1Y", "2Y"].map(r => `<button class="range-pill ${r === range ? "active" : ""}" data-range="${r}">${r}</button>`).join("")}
    </div>
    <div class="chart-price-block">
      <span class="chart-price">—</span>
      <span class="chart-change">—</span>
    </div>
  `;
  pane.appendChild(toolbar);

  const chartContainer = document.createElement("div");
  chartContainer.className = "chart-container";
  pane.appendChild(chartContainer);

  const stats = document.createElement("div");
  stats.className = "chart-stats";
  stats.innerHTML = `
    <div><span class="label">Open</span><span class="val" data-stat="open">—</span></div>
    <div><span class="label">High</span><span class="val" data-stat="high">—</span></div>
    <div><span class="label">Low</span><span class="val" data-stat="low">—</span></div>
    <div><span class="label">Close</span><span class="val" data-stat="close">—</span></div>
    <div><span class="label">Volume</span><span class="val" data-stat="volume">—</span></div>
    <div><span class="label">Prev close</span><span class="val" data-stat="prev">—</span></div>
    <div><span class="label">Net</span><span class="val" data-stat="net">—</span></div>
    <div><span class="label">Range</span><span class="val" data-stat="range">${range} · ${interval}</span></div>
  `;
  pane.appendChild(stats);

  shell.body.appendChild(pane);

  const symbolInput = toolbar.querySelector(".chart-symbol-input");
  const autoBtn = toolbar.querySelector(".auto-pill");
  symbolInput.title = "Type ticker, press Enter (turns AUTO off)";

  function setAuto(on) {
    auto = on;
    autoBtn.classList.toggle("active", auto);
    config.auto = auto;
    symbolInput.disabled = false;
    symbolInput.style.opacity = auto ? "0.6" : "1";
    ctx.persistLayout?.();
  }

  function applySymbol() {
    const next = (symbolInput.value || "").trim().toUpperCase();
    if (!next || next === symbol) { symbolInput.value = symbol; return; }
    symbol = next;
    symbolInput.value = symbol;
    config.symbol = symbol;
    setAuto(false); // manual override
    instance.refresh();
  }
  symbolInput.addEventListener("change", applySymbol);
  symbolInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applySymbol(); symbolInput.blur(); }
  });
  autoBtn.addEventListener("click", () => {
    setAuto(!auto);
    if (auto) instance.refresh();
  });
  setAuto(auto); // apply initial styling
  toolbar.querySelectorAll(".range-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      toolbar.querySelectorAll(".range-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      range = btn.dataset.range;
      interval = rangeToInterval(range);
      stats.querySelector('[data-stat="range"]').textContent = `${range} · ${interval}`;
      config.range = range; config.interval = interval;
      ctx.persistLayout?.();
      instance.refresh();
    });
  });

  function rangeToInterval(r) {
    return { "1D": "5m", "1W": "30m", "1M": "1h", "3M": "1d", "6M": "1d", "1Y": "1d", "2Y": "1d" }[r] || "1d";
  }

  function buildChart() {
    if (chart) { chart.remove(); chart = null; }
    const opts = {
      width: chartContainer.clientWidth,
      height: chartContainer.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: "#8a92a6",
      },
      grid: {
        vertLines: { color: "rgba(31,37,54,0.5)" },
        horzLines: { color: "rgba(31,37,54,0.5)" },
      },
      crosshair: { mode: 1 },
      timeScale: { borderColor: "#1f2536", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#1f2536" },
    };
    chart = LightweightCharts.createChart(chartContainer, opts);
    // v5 API
    candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: "#2ee07a", downColor: "#ff4d7a",
      borderUpColor: "#2ee07a", borderDownColor: "#ff4d7a",
      wickUpColor: "#2ee07a", wickDownColor: "#ff4d7a",
    });
    volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
      color: "#5b637a",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
  }

  const ro = new ResizeObserver(() => {
    if (chart && chartContainer.clientWidth > 0) {
      chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
    }
  });
  ro.observe(chartContainer);

  let timer;
  const instance = {
    config,
    closeBtn: shell.closeBtn,
    async refresh() {
      try {
        if (!chart) buildChart();
        if (auto) {
          const picked = pickBiggestMover();
          if (picked && picked !== symbol) {
            symbol = picked;
            symbolInput.value = symbol;
            config.symbol = symbol;
            ctx.persistLayout?.();
          }
        }
        const data = await api.getCandles(symbol, mapRange(range), interval);
        const series = data.candles;
        if (!series?.length) {
          toolbar.querySelector(".chart-price").textContent = "No data";
          return;
        }
        candleSeries.setData(series.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
        volumeSeries.setData(series.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? "rgba(46,224,122,0.4)" : "rgba(255,77,122,0.4)" })));

        // Session stats — aggregate over the visible range, not just the last candle.
        const sessionOpen = series[0].open;
        const sessionHigh = series.reduce((m, c) => Math.max(m, c.high), -Infinity);
        const sessionLow = series.reduce((m, c) => Math.min(m, c.low), Infinity);
        const sessionClose = series[series.length - 1].close;
        const sessionVolume = series.reduce((s, c) => s + (c.volume || 0), 0);
        const net = sessionClose - sessionOpen;
        const netPct = (net / sessionOpen) * 100;

        // Header price/change reflects day-over-day (matches what watchlists show).
        // Session stats below reflect the displayed range's intraday OHLCV.
        const dayQuote = ctx.getAllQuotes?.().find(q => q.symbol === symbol);
        const headerPrice = dayQuote?.price ?? sessionClose;
        const headerChange = dayQuote?.change ?? net;
        const headerPct = dayQuote?.changePct ?? netPct;
        toolbar.querySelector(".chart-price").textContent = fmtPrice(headerPrice);
        const ch = toolbar.querySelector(".chart-change");
        ch.textContent = `${fmtChange(headerChange)} (${fmtPct(headerPct)})`;
        ch.className = `chart-change ${upDown(headerChange)}`;
        stats.querySelector('[data-stat="open"]').textContent = fmtPrice(sessionOpen);
        stats.querySelector('[data-stat="high"]').textContent = fmtPrice(sessionHigh);
        stats.querySelector('[data-stat="low"]').textContent = fmtPrice(sessionLow);
        stats.querySelector('[data-stat="close"]').textContent = fmtPrice(sessionClose);
        stats.querySelector('[data-stat="volume"]').textContent = sessionVolume.toLocaleString();
        stats.querySelector('[data-stat="prev"]').textContent = fmtPrice(sessionOpen);
        const netEl = stats.querySelector('[data-stat="net"]');
        netEl.textContent = fmtPct(netPct);
        netEl.style.color = net >= 0 ? "var(--green)" : "var(--red)";
        chart.timeScale().fitContent();
      } catch (e) {
        console.error("chart refresh failed", e);
        toolbar.querySelector(".chart-price").textContent = "Error";
      }
    },
    destroy() { clearInterval(timer); ro.disconnect(); chart?.remove(); },
  };

  function mapRange(r) {
    return { "1D": "1d", "1W": "5d", "1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "2Y": "2y" }[r] || "1d";
  }

  function pickBiggestMover() {
    const all = ctx.getAllQuotes?.() || [];
    const eligible = all.filter(q =>
      q.changePct != null && q.marketCap != null && q.marketCap >= MIN_MARKET_CAP
    );
    if (!eligible.length) return null;
    eligible.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    return eligible[0].symbol;
  }

  // Re-pick symbol whenever a watchlist publishes new quotes.
  // Only refetches candles if the picked symbol actually changed (cheap no-op otherwise).
  const unsubscribe = ctx.onQuotesUpdated?.(() => {
    if (!auto) return;
    const picked = pickBiggestMover();
    if (picked && picked !== symbol) {
      symbol = picked;
      symbolInput.value = symbol;
      config.symbol = symbol;
      ctx.persistLayout?.();
      instance.refresh();
    }
  });

  // initial build deferred until container has size
  setTimeout(() => { buildChart(); instance.refresh(); }, 50);
  timer = setInterval(() => instance.refresh(), 30_000);
  const baseDestroy = instance.destroy;
  instance.destroy = () => { unsubscribe?.(); baseDestroy(); };
  return instance;
}

/* ------------------------------------------------------------------ news */

export function createNews(container, config, ctx) {
  const symbol = (config.symbol || "GENERAL").toUpperCase();

  const shell = paneShell({
    title: symbol === "GENERAL" ? "Market News" : `News: ${symbol}`,
    sectorId: null,
    onRefresh: () => instance.refresh(),
  });
  container.appendChild(shell.wrap);

  const list = document.createElement("div");
  list.className = "news-list";
  shell.body.appendChild(list);

  for (let i = 0; i < 4; i++) {
    const sk = document.createElement("div");
    sk.className = "skeleton";
    sk.style.height = "76px";
    list.appendChild(sk);
  }

  let timer;
  const instance = {
    config,
    closeBtn: shell.closeBtn,
    async refresh() {
      try {
        const items = await api.getNews(symbol, 12);
        list.innerHTML = "";
        if (!items.length) {
          list.innerHTML = `<div class="empty">No recent headlines.</div>`;
          return;
        }
        for (const it of items) {
          const div = document.createElement("div");
          div.className = "news-item";
          const date = new Date(it.publishedAt);
          const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
            date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
          div.innerHTML = `
            <div>
              <div class="news-headline">${escapeHtml(it.headline)}</div>
              <div class="news-meta">
                ${it.sentiment ? `<span class="news-sentiment ${it.sentiment}">${it.sentiment === "positive" ? "↗ Positive" : it.sentiment === "negative" ? "↘ Negative" : "Neutral"}</span>` : ""}
                <span class="news-source">${escapeHtml(it.source || "")}</span>
                <span>${dateStr}</span>
              </div>
            </div>
            ${it.image ? `<div class="news-thumb" style="background-image:url('${escapeHtml(it.image)}')"></div>` : `<div></div>`}
          `;
          if (it.url && it.url !== "#") {
            div.addEventListener("click", () => window.open(it.url, "_blank", "noopener"));
          }
          list.appendChild(div);
        }
      } catch (e) {
        list.innerHTML = `<div class="empty">News failed: ${escapeHtml(e.message)}</div>`;
      }
    },
    destroy() { clearInterval(timer); },
  };

  instance.refresh();
  timer = setInterval(() => instance.refresh(), 2 * 60_000);
  return instance;
}

/* ------------------------------------------------------------------ summary */

const SUMMARY_SYSTEM = `You are a sharp markets analyst writing a permanent executive summary on a trader's dashboard. The dashboard tracks where institutional and government money is flowing, with a picks-and-shovels lens.

Read the live sector watchlist data and produce 2-3 short paragraphs of plain prose (NO bullets, NO headers, NO markdown). Cover:
1. Which sector is leading and which is lagging today, with concrete %.
2. 2-3 specific tickers that exemplify the flow — frame as picks-and-shovels.
3. Any rotation, weakness, or unusual divergence worth flagging.
End with a single sentence on overall risk sentiment.

Reference real tickers and real numbers. Be sharp. Avoid hedging language. Do NOT give financial advice — frame as analysis.`;

function buildSummaryPrompt(quotes) {
  const bySector = {};
  for (const sector of Object.values(SECTORS)) {
    const sectorQuotes = quotes.filter(q => sector.tickers.includes(q.symbol));
    if (sectorQuotes.length) bySector[sector.name] = sectorQuotes;
  }

  const lines = [];
  lines.push(`Date: ${new Date().toISOString().split("T")[0]}`);
  lines.push(`Market state: ${quotes[0]?.marketState || "UNKNOWN"}`);
  lines.push("");

  for (const [name, qs] of Object.entries(bySector)) {
    const avg = qs.reduce((s, q) => s + (q.changePct ?? 0), 0) / qs.length;
    const up = qs.filter(q => (q.changePct ?? 0) > 0).length;
    const down = qs.filter(q => (q.changePct ?? 0) < 0).length;
    lines.push(`${name} — avg ${avg.toFixed(2)}% (${up} up / ${down} down)`);
    for (const q of qs) {
      const pct = q.changePct ?? 0;
      lines.push(`  ${q.symbol} ${q.name || ""}: $${q.price?.toFixed(2)} ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`);
    }
    lines.push("");
  }

  const movers = [...quotes]
    .filter(q => q.changePct != null && q.marketCap != null && q.marketCap >= 10e9)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 5);
  lines.push(`Top large-cap movers (|%|, mc ≥ $10B):`);
  for (const q of movers) {
    lines.push(`  ${q.symbol} ${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}% (mc $${(q.marketCap / 1e9).toFixed(0)}B)`);
  }

  return lines.join("\n");
}

export function createSummary(container, config, ctx) {
  const shell = paneShell({
    title: "Money Flow Summary",
    sub: "Live read on where capital is rotating across the watchlists. Refreshed every 5 min.",
    sectorId: null,
    onRefresh: () => instance.refresh(true),
  });
  container.appendChild(shell.wrap);
  container.classList.add("summary-content");

  const body = document.createElement("div");
  body.className = "summary-body";
  body.innerHTML = `<div class="summary-loading">Waiting for market data…</div>`;
  shell.body.appendChild(body);

  const COOLDOWN_MS = 5 * 60_000;
  let lastGeneratedAt = 0;
  let inFlight = false;
  let timer;

  async function generate(force = false) {
    if (inFlight) return;
    if (!force && Date.now() - lastGeneratedAt < COOLDOWN_MS) return;
    const quotes = ctx.getAllQuotes?.() || [];
    if (quotes.length < 5) return; // wait until enough watchlists have loaded
    inFlight = true;
    body.classList.add("loading");
    try {
      const prompt = buildSummaryPrompt(quotes);
      const res = await api.chat([{ role: "user", content: prompt }], SUMMARY_SYSTEM);
      const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      body.innerHTML = `
        <div class="summary-text">${escapeHtml(res.content)}</div>
        <div class="summary-meta">Generated ${time} · ${quotes.length} tickers across ${Object.keys(SECTORS).length} sectors</div>
      `;
      lastGeneratedAt = Date.now();
    } catch (e) {
      body.innerHTML = `<div class="empty">Summary failed: ${escapeHtml(e.message)}</div>`;
    } finally {
      body.classList.remove("loading");
      inFlight = false;
    }
  }

  const unsubscribe = ctx.onQuotesUpdated?.(() => {
    if (!lastGeneratedAt) generate(); // first generation as soon as quotes arrive
  });
  timer = setInterval(() => generate(false), 60_000); // hourly check, gated by cooldown

  const instance = {
    config,
    closeBtn: shell.closeBtn,
    refresh: (force = true) => generate(force),
    destroy() { clearInterval(timer); unsubscribe?.(); },
  };
  return instance;
}

export const WIDGET_FACTORIES = {
  summary: createSummary,
  watchlist: createWatchlist,
  chart: createChart,
  news: createNews,
};
