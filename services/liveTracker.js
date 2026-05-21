const WS_URL = 'wss://ws-live-data.polymarket.com';
const REST_URL =
  'https://data-api.polymarket.com/trades?filterType=CASH&filterAmount=100000&limit=50';
const PING_INTERVAL = 10_000;
const POLL_INTERVAL = 30_000;
const RECONNECT_DELAY = 5_000;
const MAX_SEEN = 500;
const MIN_USDC = 100_000;

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
  if (
    /\b(nba|nfl|nhl|mlb|soccer|football|basketball|baseball|tennis|golf|ufc|mma|sport|team|match|game|championship|league|cup|tournament|player|score)\b/.test(
      t
    )
  )
    return 'sports';
  if (
    /\b(bitcoin|btc|eth|ethereum|crypto|token|defi|nft|blockchain|coin|solana|sol|bnb|doge|altcoin)\b/.test(
      t
    )
  )
    return 'crypto';
  if (
    /\b(president|election|senate|congress|democrat|republican|poll|vote|biden|trump|government|policy|minister|political|party|law|bill|supreme court)\b/.test(
      t
    )
  )
    return 'politics';
  if (
    /\b(movie|film|music|celebrity|award|oscar|grammy|actor|actress|singer|show|series|tv|box office|album|chart|entertainment)\b/.test(
      t
    )
  )
    return 'entertainment';
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
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} minute${m !== 1 ? 's' : ''} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} hour${h !== 1 ? 's' : ''} ago`;
  }
  const d = Math.floor(diff / 86400);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

function normaliseTrade(raw) {
  const size = Number(raw.size ?? 0);
  const price = Number(raw.price ?? 0);
  const usdc = size * price;
  if (usdc < MIN_USDC) return null;

  const id =
    raw.transactionHash ?? raw.id ?? `${raw.timestamp}${raw.proxyWallet}`;
  const outcome = raw.outcome ?? '';
  const side = (raw.side ?? '').toUpperCase();
  // BUY = going long on this outcome (YES), SELL = exiting/shorting (NO).
  // Fall back to outcome text only if side is missing (e.g. older REST records).
  const direction = side === 'BUY'
    ? 'YES'
    : side === 'SELL'
      ? 'NO'
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
  }

  stop() {
    this._stopped = true;
    this._clearTimers();
    if (this._ws) {
      try {
        this._ws.close();
      } catch (_) {}
      this._ws = null;
    }
  }

  refresh() {
    this._poll();
  }

  _connectWs() {
    if (this._stopped) return;
    try {
      const ws = new WebSocket(WS_URL);
      this._ws = ws;

      ws.onopen = () => {
        if (this._stopped) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            action: 'subscribe',
            subscriptions: [{ topic: 'activity', type: 'trades' }],
          })
        );
        this._onStatus('live');
        this._clearPollTimer();
        this._clearReconnectTimer();
        this._startPing(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            msg.topic === 'activity' &&
            msg.type === 'trades' &&
            msg.payload
          ) {
            this._processTrade(msg.payload);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (this._stopped) return;
        this._clearPingTimer();
        this._onStatus('polling');
        this._startPolling();
        this._reconnectTimer = setTimeout(() => {
          this._connectWs();
        }, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        if (this._stopped) return;
        this._clearPingTimer();
        try {
          ws.close();
        } catch (_) {}
        this._ws = null;
        this._onStatus('polling');
        this._startPolling();
      };
    } catch (_) {
      if (!this._stopped) {
        this._onStatus('polling');
        this._startPolling();
      }
    }
  }

  _startPing(ws) {
    this._clearPingTimer();
    this._pingTimer = setInterval(() => {
      if (ws.readyState === 1) {
        try {
          ws.send('ping');
        } catch (_) {}
      }
    }, PING_INTERVAL);
  }

  _startPolling() {
    this._poll();
    this._clearPollTimer();
    this._pollTimer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  async _poll() {
    try {
      const res = await fetch(REST_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach((raw) => this._processTrade(raw));
      }
    } catch (_) {
      this._onStatus('error');
    }
  }

  _processTrade(raw) {
    const trade = normaliseTrade(raw);
    if (!trade) return;
    if (this._seen.has(trade.id)) return;

    if (this._seen.size >= MAX_SEEN) {
      const first = this._seen.values().next().value;
      this._seen.delete(first);
    }
    this._seen.add(trade.id);
    this._onTrade(trade);
  }

  _clearTimers() {
    this._clearPingTimer();
    this._clearPollTimer();
    this._clearReconnectTimer();
  }

  _clearPingTimer() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  _clearPollTimer() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
