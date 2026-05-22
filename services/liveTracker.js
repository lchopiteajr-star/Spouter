const WS_URL = 'wss://ws-live-data.polymarket.com';
const PING_INTERVAL = 10_000;
const POLL_INTERVAL = 30_000;
const RECONNECT_DELAY = 5_000;
const MAX_SEEN = 10_000;
const MIN_USDC = 50_000;

function restUrl(filterAmount, limit = 500) {
  return `https://data-api.polymarket.com/trades?filterType=CASH&filterAmount=${filterAmount}&limit=${limit}`;
}

export const CATEGORY_BADGE = {
  sports: '⚽ Sports',
  crypto: '⚡ Crypto',
  politics: '🏛 Politics',
  entertainment: '🎬 Entertainment',
  other: '📊 Other',
};

export const CATEGORY_COLOR = {
  sports: '#00c896',
  crypto: '#f7931a',
  politics: '#e040fb',
  entertainment: '#ff6b6b',
  other: '#00aaff',
};

function detectCategory(title = '') {
  const t = title.toLowerCase();
  if (/\b(nba|nfl|nhl|mlb|soccer|football|basketball|baseball|tennis|golf|ufc|mma|sport|team|match|game|championship|league|cup|tournament|player|score)\b/.test(t)) return 'sports';
  if (/\b(bitcoin|btc|eth|ethereum|crypto|token|defi|nft|blockchain|coin|solana|sol|bnb|doge|altcoin)\b/.test(t)) return 'crypto';
  if (/\b(president|election|senate|congress|democrat|republican|poll|vote|biden|trump|government|policy|minister|political|party|law|bill|supreme court)\b/.test(t)) return 'politics';
  if (/\b(movie|film|music|celebrity|award|oscar|grammy|actor|actress|singer|show|series|tv|box office|album|chart|entertainment)\b/.test(t)) return 'entertainment';
  return 'other';
}

function formatUsdc(usdc) {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${Math.round(usdc / 1_000)}K`;
  return `$${Math.round(usdc)}`;
}

function walletShort(addr = '') {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(timestamp) {
  const diff = Date.now() / 1000 - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) { const m = Math.floor(diff / 60); return `${m} minute${m !== 1 ? 's' : ''} ago`; }
  if (diff < 86400) { const h = Math.floor(diff / 3600); return `${h} hour${h !== 1 ? 's' : ''} ago`; }
  const d = Math.floor(diff / 86400); return `${d} day${d !== 1 ? 's' : ''} ago`;
}

function normaliseTrade(raw) {
  const size = Number(raw.size ?? 0);
  const price = Number(raw.price ?? 0);
  const usdc = size * price;
  if (usdc < MIN_USDC) return null;

  const id = raw.transactionHash ?? raw.id ?? `${raw.timestamp}${raw.proxyWallet}`;
  const outcome = raw.outcome ?? '';
  const side = (raw.side ?? '').toUpperCase();
  const direction = side === 'BUY' ? 'YES'
    : side === 'SELL' ? 'NO'
    : /^(yes|up)/i.test(outcome) ? 'YES' : 'NO';

  return {
    id,
    usdc,
    usdcDisplay: formatUsdc(usdc),
    pseudonym: raw.pseudonym ?? 'Unknown',
    wallet: raw.proxyWallet ?? '',
    walletShort: walletShort(raw.proxyWallet ?? ''),
    title: raw.title ?? '',
    outcome,
    direction,
    category: detectCategory(raw.title ?? ''),
    timestamp: Number(raw.timestamp ?? 0),
    timeAgo: timeAgo(Number(raw.timestamp ?? 0)),
  };
}

export class LiveTracker {
  constructor({ onTrade, onStatus }) {
    this._onTrade = onTrade;
    this._onStatus = onStatus;
    this._ws = null;
    this._pingTimer = null;
    this._pollTimer = null;
    this._reconnectTimer = null;
    this._seen = new Set();
    this._stopped = false;
  }

  start() {
    this._stopped = false;
    this._onStatus('connecting');
    this._connectWs();
    this._initialLoad();
  }

  stop() {
    this._stopped = true;
    this._clearTimers();
    if (this._ws) {
      try { this._ws.close(); } catch (_) {}
      this._ws = null;
    }
  }

  refresh() {
    this._fetch(100_000);
  }

  // Called when user taps a filter chip — re-fetches at that threshold
  fetchForFilter(amount) {
    if (!this._stopped) this._fetch(amount);
  }

  async _initialLoad() {
    // Step 1: load recent $100K+ trades immediately
    const newCount = await this._fetch(100_000);
    // Step 2: if feed is thin, supplement with $50K+ trades
    if (newCount < 20) await this._fetch(50_000);
    // Step 3: start continuous 30s polling to catch anything WebSocket misses
    this._clearPollTimer();
    this._pollTimer = setInterval(() => this._fetch(100_000), POLL_INTERVAL);
  }

  async _fetch(filterAmount) {
    if (this._stopped) return 0;
    try {
      const res = await fetch(restUrl(filterAmount));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let newCount = 0;
      if (Array.isArray(data)) {
        data.forEach((raw) => { if (this._processTrade(raw)) newCount++; });
      }
      return newCount;
    } catch (_) {
      if (filterAmount === 100_000) this._onStatus('error');
      return 0;
    }
  }

  _connectWs() {
    if (this._stopped) return;
    try {
      const ws = new WebSocket(WS_URL);
      this._ws = ws;

      ws.onopen = () => {
        if (this._stopped) { ws.close(); return; }
        ws.send(JSON.stringify({
          action: 'subscribe',
          subscriptions: [{ topic: 'activity', type: 'trades' }],
        }));
        this._onStatus('live');
        this._clearReconnectTimer();
        this._startPing(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.topic === 'activity' && msg.type === 'trades' && msg.payload) {
            this._processTrade(msg.payload);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (this._stopped) return;
        this._clearPingTimer();
        this._onStatus('polling');
        this._reconnectTimer = setTimeout(() => this._connectWs(), RECONNECT_DELAY);
      };

      ws.onerror = () => {
        if (this._stopped) return;
        this._clearPingTimer();
        try { ws.close(); } catch (_) {}
        this._ws = null;
        this._onStatus('polling');
      };
    } catch (_) {
      if (!this._stopped) this._onStatus('polling');
    }
  }

  _startPing(ws) {
    this._clearPingTimer();
    this._pingTimer = setInterval(() => {
      if (ws.readyState === 1) { try { ws.send('ping'); } catch (_) {} }
    }, PING_INTERVAL);
  }

  // Returns true if trade was new (not a duplicate)
  _processTrade(raw) {
    const trade = normaliseTrade(raw);
    if (!trade) return false;
    if (this._seen.has(trade.id)) return false;
    if (this._seen.size >= MAX_SEEN) {
      this._seen.delete(this._seen.values().next().value);
    }
    this._seen.add(trade.id);
    this._onTrade(trade);
    return true;
  }

  _clearTimers() {
    this._clearPingTimer();
    this._clearPollTimer();
    this._clearReconnectTimer();
  }
  _clearPingTimer() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
  }
  _clearPollTimer() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }
  _clearReconnectTimer() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
  }
}
