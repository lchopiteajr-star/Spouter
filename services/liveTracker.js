const WS_URL = 'wss://ws-live-data.polymarket.com';
const REST_URL =
  'https://data-api.polymarket.com/trades?filterType=CASH&filterAmount=100000&limit=50';
const SUBSCRIBE_MSG = JSON.stringify({
  action: 'subscribe',
  subscriptions: [{ topic: 'activity', type: 'trades' }],
});
const WHALE_THRESHOLD = 100_000;
const DEDUP_CAP = 500;
const PING_INTERVAL = 10_000;
const POLL_INTERVAL = 30_000;
const RECONNECT_DELAY = 5_000;

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
  if (/\b(nba|nfl|nhl|mlb|soccer|football|basketball|baseball|tennis|golf|sport|match|game|championship|league|playoff|world cup|super bowl|mvp|coach|team|player)\b/.test(t))
    return 'sports';
  if (/\b(bitcoin|btc|eth|ethereum|crypto|token|defi|nft|blockchain|solana|coinbase|binance|altcoin)\b/.test(t))
    return 'crypto';
  if (/\b(president|election|senate|congress|vote|democrat|republican|trump|biden|harris|governor|policy|political|legislation|party|ballot)\b/.test(t))
    return 'politics';
  if (/\b(oscar|emmy|grammy|movie|film|actor|actress|celebrity|music|album|tv|show|award|box office|streaming|netflix|disney|hollywood)\b/.test(t))
    return 'entertainment';
  return 'other';
}

function formatUSDC(usdc) {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${Math.round(usdc / 1_000)}K`;
  return `$${Math.round(usdc)}`;
}

function walletShort(addr = '') {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts) {
  const diffSec = Math.floor(Date.now() / 1000) - ts;
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function detectDirection(outcome = '', side = '') {
  return /^(yes|up|buy)/i.test(outcome) || /^(yes|up|buy)/i.test(side)
    ? 'YES'
    : 'NO';
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
    this._connectWS();
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

  _clearTimers() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _connectWS() {
    if (this._stopped) return;
    try {
      const ws = new WebSocket(WS_URL);
      this._ws = ws;

      ws.onopen = () => {
        if (this._stopped) return;
        ws.send(SUBSCRIBE_MSG);
        this._onStatus('live');
        // Stop polling when WS is live
        if (this._pollTimer) {
          clearInterval(this._pollTimer);
          this._pollTimer = null;
        }
        // Keep-alive ping every 10s
        this._pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        if (this._stopped) return;
        try {
          const msg = JSON.parse(event.data);
          if (
            msg.topic === 'activity' &&
            msg.type === 'trades' &&
            msg.payload
          ) {
            const trade = this._normaliseTrade(msg.payload);
            if (trade) this._onTrade(trade);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (this._stopped) return;
        if (this._pingTimer) {
          clearInterval(this._pingTimer);
          this._pingTimer = null;
        }
        this._onStatus('polling');
        this._startPolling();
        this._reconnectTimer = setTimeout(() => {
          this._connectWS();
        }, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        if (this._stopped) return;
        if (this._pingTimer) {
          clearInterval(this._pingTimer);
          this._pingTimer = null;
        }
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

  _startPolling() {
    if (this._pollTimer) return;
    this._poll();
    this._pollTimer = setInterval(() => {
      this._poll();
    }, POLL_INTERVAL);
  }

  async _poll() {
    try {
      const res = await fetch(REST_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const raw of data) {
          const trade = this._normaliseTrade(raw);
          if (trade) this._onTrade(trade);
        }
      }
    } catch (_) {
      if (!this._stopped) {
        this._onStatus('error');
      }
    }
  }

  _normaliseTrade(raw) {
    const size = Number(raw.size ?? 0);
    const price = Number(raw.price ?? 0);
    const usdc = size * price;
    if (usdc < WHALE_THRESHOLD) return null;

    const dedupeKey =
      raw.transactionHash ??
      raw.id ??
      `${raw.timestamp}:${raw.proxyWallet}`;

    if (this._seen.has(dedupeKey)) return null;

    // Cap the dedup set
    if (this._seen.size >= DEDUP_CAP) {
      const first = this._seen.values().next().value;
      this._seen.delete(first);
    }
    this._seen.add(dedupeKey);

    const title = raw.title ?? raw.market ?? '';
    const outcome = raw.outcome ?? '';
    const side = raw.side ?? '';
    const pseudonym = raw.pseudonym ?? raw.name ?? 'Anonymous';
    const wallet = raw.proxyWallet ?? raw.wallet ?? '';
    const timestamp = Number(raw.timestamp ?? Math.floor(Date.now() / 1000));
    const category = detectCategory(title);
    const direction = detectDirection(outcome, side);

    return {
      id: dedupeKey,
      usdc,
      usdcDisplay: formatUSDC(usdc),
      pseudonym,
      wallet,
      walletShort: walletShort(wallet),
      title,
      outcome,
      direction,
      category,
      timestamp,
      timeAgo: timeAgo(timestamp),
    };
  }
}
