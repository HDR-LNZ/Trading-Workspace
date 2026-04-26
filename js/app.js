// App entry: wires GridStack, layout persistence, add-widget modal, and chat overlay.

import { SECTORS, DEFAULT_SECTOR_ORDER } from "./sectors.js";
import { WIDGET_FACTORIES } from "./widgets.js";
import * as api from "./api.js";

const LAYOUT_KEY = "tw.layout.v1";
const CHAT_KEY = (id) => `tw.chat.${id}`;

/* ------------------------------------------------ default layout */

function defaultLayout() {
  const widgets = [];
  // Permanent banner: AI-generated executive summary across all watchlists
  widgets.push({ id: "w-summary", type: "summary", config: {}, x: 0, y: 0, w: 12, h: 4 });
  // Row 1: 2 watchlists, chart, news
  widgets.push({ id: "w-cm", type: "watchlist", config: { sectorId: "critical-minerals" }, x: 0, y: 4, w: 3, h: 8 });
  widgets.push({ id: "w-def", type: "watchlist", config: { sectorId: "defense" }, x: 3, y: 4, w: 3, h: 8 });
  widgets.push({ id: "w-chart", type: "chart", config: { symbol: "SPY", range: "1D", interval: "5m" }, x: 6, y: 4, w: 3, h: 8 });
  widgets.push({ id: "w-news", type: "news", config: { symbol: "GENERAL" }, x: 9, y: 4, w: 3, h: 8 });
  // Row 2: 4 watchlists
  widgets.push({ id: "w-ai", type: "watchlist", config: { sectorId: "ai-infra" }, x: 0, y: 12, w: 3, h: 6 });
  widgets.push({ id: "w-nuc", type: "watchlist", config: { sectorId: "nuclear" }, x: 3, y: 12, w: 3, h: 6 });
  widgets.push({ id: "w-eng", type: "watchlist", config: { sectorId: "energy" }, x: 6, y: 12, w: 3, h: 6 });
  widgets.push({ id: "w-cyb", type: "watchlist", config: { sectorId: "cyber" }, x: 9, y: 12, w: 3, h: 6 });
  return widgets;
}

function loadLayout() {
  let items;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) items = JSON.parse(raw);
  } catch {}
  if (!items) return defaultLayout();
  // Migration: if user's saved layout has no summary widget, prepend one
  // and shift everything down by 4 rows.
  if (!items.find(i => i.type === "summary")) {
    items = items.map(i => ({ ...i, y: (i.y || 0) + 4 }));
    items.unshift({ id: "w-summary", type: "summary", config: {}, x: 0, y: 0, w: 12, h: 4 });
  }
  return items;
}

function persistLayout() {
  const items = [];
  grid.engine.nodes.forEach((n) => {
    const inst = instances.get(n.id);
    if (!inst) return;
    items.push({
      id: n.id,
      type: inst.type,
      config: inst.api.config,
      x: n.x, y: n.y, w: n.w, h: n.h,
    });
  });
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(items));
}

/* ------------------------------------------------ grid setup */

const gridEl = document.getElementById("grid");
const grid = GridStack.init({
  cellHeight: 50,
  margin: 6,
  column: 12,
  float: false,
  draggable: { handle: ".pane-header" },
  resizable: { handles: "se,sw,ne,nw,e,w" },
  acceptWidgets: false,
  animate: true,
}, gridEl);

// On mobile (≤720px) make the grid static so drag/resize don't hijack touch.
// CSS overrides absolute positioning to a vertical stack; setStatic prevents
// GridStack from intercepting touch events on .pane-header.
const mobileQuery = window.matchMedia("(max-width: 720px)");
function applyResponsiveMode() {
  const isMobile = mobileQuery.matches;
  document.body.classList.toggle("is-mobile", isMobile);
  grid.setStatic(isMobile);
}
applyResponsiveMode();
mobileQuery.addEventListener("change", applyResponsiveMode);

const instances = new Map(); // id -> { type, api: widgetInstance }
const quoteSubscribers = new Set();
const ctx = {
  openChat,
  persistLayout,
  getAllQuotes() {
    const seen = new Map();
    for (const [, { type, api: w }] of instances) {
      if (type !== "watchlist") continue;
      const quotes = w.getQuotes?.() || [];
      for (const q of quotes) {
        if (q?.symbol && !seen.has(q.symbol)) seen.set(q.symbol, q);
      }
    }
    return [...seen.values()];
  },
  onQuotesUpdated(fn) { quoteSubscribers.add(fn); return () => quoteSubscribers.delete(fn); },
  notifyQuotesUpdated() { for (const fn of quoteSubscribers) try { fn(); } catch {} },
};

function addWidget(item) {
  const id = item.id || `w-${Math.random().toString(36).slice(2, 8)}`;
  const el = document.createElement("div");
  el.classList.add("grid-stack-item");
  el.setAttribute("gs-id", id);
  el.setAttribute("gs-x", item.x ?? 0);
  el.setAttribute("gs-y", item.y ?? 0);
  el.setAttribute("gs-w", item.w ?? 3);
  el.setAttribute("gs-h", item.h ?? 6);
  const content = document.createElement("div");
  content.className = "grid-stack-item-content";
  el.appendChild(content);
  grid.makeWidget(el);

  const factory = WIDGET_FACTORIES[item.type];
  if (!factory) {
    content.innerHTML = `<div class="empty">Unknown widget: ${item.type}</div>`;
    return;
  }
  const widgetApi = factory(content, item.config || {}, ctx);
  instances.set(id, { type: item.type, api: widgetApi });

  widgetApi.closeBtn.addEventListener("click", () => removeWidget(id));
}

function removeWidget(id) {
  const inst = instances.get(id);
  if (inst) inst.api.destroy?.();
  instances.delete(id);
  const el = gridEl.querySelector(`[gs-id="${id}"]`);
  if (el) grid.removeWidget(el);
  persistLayout();
}

function clearAll() {
  for (const id of [...instances.keys()]) removeWidget(id);
}

function loadAll(items) {
  for (const item of items) addWidget(item);
}

grid.on("change", () => persistLayout());
grid.on("resizestop", () => persistLayout());
grid.on("dragstop", () => persistLayout());

loadAll(loadLayout());

/* ------------------------------------------------ topbar buttons */

document.getElementById("reset-workspace").addEventListener("click", () => {
  if (!confirm("Reset workspace to default layout?")) return;
  clearAll();
  localStorage.removeItem(LAYOUT_KEY);
  loadAll(defaultLayout());
});

document.getElementById("add-widget").addEventListener("click", () => {
  document.getElementById("add-widget-modal").hidden = false;
  document.getElementById("modal-options").hidden = true;
});
document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("add-widget-modal").hidden = true;
});
document.querySelectorAll(".add-card[data-type]").forEach(btn => {
  btn.addEventListener("click", () => showAddOptions(btn.dataset.type));
});

function showAddOptions(type) {
  const opts = document.getElementById("modal-options");
  opts.hidden = false;
  opts.innerHTML = "";
  if (type === "summary") {
    addWidget({ type: "summary", config: {}, x: 0, y: 0, w: 12, h: 4 });
    persistLayout();
    document.getElementById("add-widget-modal").hidden = true;
    return;
  }
  if (type === "watchlist") {
    const select = document.createElement("div");
    select.innerHTML = `
      <div class="field">
        <label>Sector</label>
        <select id="add-sector">
          ${Object.entries(SECTORS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-primary" id="add-confirm">Add watchlist</button>
    `;
    opts.appendChild(select);
    select.querySelector("#add-confirm").addEventListener("click", () => {
      const sectorId = select.querySelector("#add-sector").value;
      addWidget({ type: "watchlist", config: { sectorId }, x: 0, y: 100, w: 3, h: 6 });
      persistLayout();
      document.getElementById("add-widget-modal").hidden = true;
    });
  } else if (type === "chart") {
    opts.innerHTML = `
      <div class="field">
        <label>Symbol</label>
        <input id="add-symbol" type="text" value="SPY" />
      </div>
      <button class="btn btn-primary" id="add-confirm">Add chart</button>
    `;
    opts.querySelector("#add-confirm").addEventListener("click", () => {
      const symbol = (opts.querySelector("#add-symbol").value || "SPY").toUpperCase();
      addWidget({ type: "chart", config: { symbol, range: "1D", interval: "5m" }, x: 0, y: 100, w: 4, h: 8 });
      persistLayout();
      document.getElementById("add-widget-modal").hidden = true;
    });
  } else if (type === "news") {
    opts.innerHTML = `
      <div class="field">
        <label>Filter</label>
        <input id="add-symbol" type="text" value="GENERAL" placeholder="GENERAL or ticker" />
      </div>
      <button class="btn btn-primary" id="add-confirm">Add news</button>
    `;
    opts.querySelector("#add-confirm").addEventListener("click", () => {
      const symbol = (opts.querySelector("#add-symbol").value || "GENERAL").toUpperCase();
      addWidget({ type: "news", config: { symbol }, x: 0, y: 100, w: 3, h: 8 });
      persistLayout();
      document.getElementById("add-widget-modal").hidden = true;
    });
  }
}

/* ------------------------------------------------ chat overlay */

const chatOverlay = document.getElementById("chat-overlay");
const chatTitle = document.getElementById("chat-title");
const chatSub = document.getElementById("chat-sub");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

let chatState = null; // { sectorId, history: [{role, content}] }

function openChat({ sectorId, quotes }) {
  const sector = SECTORS[sectorId];
  if (!sector) return;
  chatState = {
    sectorId,
    history: loadChatHistory(sectorId),
    quotes: quotes || [],
  };
  chatTitle.textContent = `${sector.name} · Chat`;
  chatSub.textContent = "Picks-and-shovels analysis powered by Claude";
  renderChat();
  chatOverlay.hidden = false;
  chatInput.focus();
}

function loadChatHistory(sectorId) {
  try {
    const raw = localStorage.getItem(CHAT_KEY(sectorId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveChatHistory() {
  if (!chatState) return;
  localStorage.setItem(CHAT_KEY(chatState.sectorId), JSON.stringify(chatState.history));
}

function renderChat() {
  chatMessages.innerHTML = "";
  if (!chatState.history.length) {
    const intro = document.createElement("div");
    intro.className = "chat-msg assistant";
    const sector = SECTORS[chatState.sectorId];
    intro.textContent = `Ask me about ${sector.name}. I know the tickers in this list, their current prices, and the picks-and-shovels thesis. Try: "Which of these has the cleanest balance sheet?" or "Why did MP move today?"`;
    chatMessages.appendChild(intro);
  }
  for (const msg of chatState.history) {
    const div = document.createElement("div");
    div.className = `chat-msg ${msg.role}`;
    div.textContent = msg.content;
    chatMessages.appendChild(div);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById("chat-close").addEventListener("click", () => {
  chatOverlay.hidden = true;
  chatState = null;
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!chatState) return;
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";

  chatState.history.push({ role: "user", content: text });
  renderChat();
  saveChatHistory();

  const sector = SECTORS[chatState.sectorId];
  const ctxLines = chatState.quotes.length
    ? chatState.quotes.map(q => `- ${q.symbol} (${q.name}): $${q.price?.toFixed(2)} ${q.changePct >= 0 ? "+" : ""}${q.changePct?.toFixed(2)}%`).join("\n")
    : "(quotes not yet loaded)";

  const system = `You are a sharp markets analyst helping the user invest where institutional and government money is flowing. Your focus right now is the "${sector.name}" sector.

Sector thesis: ${sector.description}

Current quotes for the watchlist:
${ctxLines}

Today's date: ${new Date().toISOString().split("T")[0]}.

Be concise (2-4 short paragraphs max). Use specific tickers from the watchlist. When relevant, name the picks-and-shovels angle (who supplies the supplier?). Flag if the user asks about something outside this sector. Do NOT give financial advice — frame everything as analysis.`;

  const placeholder = document.createElement("div");
  placeholder.className = "chat-msg assistant";
  placeholder.textContent = "…";
  chatMessages.appendChild(placeholder);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await api.chat(chatState.history, system);
    placeholder.remove();
    chatState.history.push({ role: "assistant", content: res.content });
    renderChat();
    saveChatHistory();
  } catch (e) {
    placeholder.remove();
    const err = document.createElement("div");
    err.className = "chat-msg error";
    err.textContent = `Chat failed: ${e.message}`;
    chatMessages.appendChild(err);
  }
});

/* ------------------------------------------------ market status indicator */

function updateMarketStatus() {
  const el = document.getElementById("market-status");
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const utcMinTotal = utcHour * 60 + utcMin;
  // NYSE: 9:30-16:00 ET = 14:30-21:00 UTC (EDT) or 13:30-20:00 UTC (EST). Approximate.
  const day = now.getUTCDay();
  const isWeekday = day >= 1 && day <= 5;
  let status = "Closed";
  if (isWeekday) {
    if (utcMinTotal >= 14 * 60 + 30 && utcMinTotal < 21 * 60) status = "Open";
    else if (utcMinTotal >= 9 * 60 && utcMinTotal < 14 * 60 + 30) status = "Pre-market";
    else if (utcMinTotal >= 21 * 60 && utcMinTotal < 25 * 60) status = "After-hours";
  }
  el.textContent = `US Market · ${status}`;
}
updateMarketStatus();
setInterval(updateMarketStatus, 60_000);

/* ------------------------------------------------ refresh on tab focus */
// Browsers throttle setInterval in background tabs (down to 1/min or paused).
// When the user returns, immediately refresh every widget so quotes are current.
let lastFocusRefresh = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // Throttle: don't blast a full refresh more than once every 5s on rapid tab switching.
  if (Date.now() - lastFocusRefresh < 5_000) return;
  lastFocusRefresh = Date.now();
  for (const [, { api: w }] of instances) {
    try { w.refresh?.(); } catch {}
  }
  updateMarketStatus();
});

/* ------------------------------------------------ register service worker */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// expose for debugging
window.tw = { grid, instances, api, SECTORS };
