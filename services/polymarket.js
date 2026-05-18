// Data source: data-api.polymarket.com/trades
// filterType=CASH&filterAmount=N → server-side filter for trades ≥ $N USDC
// Field names confirmed from live device logs:
//   proxyWallet, pseudonym, name, side, size (shares), price ($/share),
//   timestamp (unix secs), title, outcome, outcomeIndex, transactionHash, conditionId
const DATA_API_BASE = 'https://data-api.polymarket.com';
const WHALE_MIN_USDC = 10_000;
const CACHE_TTL_MS   = 60_000;

// ── Category detection ────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { category: 'crypto',        re: /bitcoin|btc|eth|ethereum|crypto|token|coin|blockchain|defi|solana|sol|doge|xrp|bnb|altcoin|nft|web3|price|up or down|updown/i },
  { category: 'politics',      re: /trump|biden|harris|election|president|congress|senate|vote|voting|democrat|republican|gop|maga|government|tariff|policy|legislation|ballot|prime minister|parliament|white house|supreme court|fed rate|federal reserve/i },
  { category: 'entertainment', re: /oscar|emmy|grammy|golden globe|netflix|hulu|disney|movie|film|box office|album|song|music|taylor swift|kanye|beyonce|celebrity|hollywood|tv show|television|season|episode|streaming|award show|actor|actress|kardashian/i },
  { category: 'sports',        re: /nfl|nba|nhl|mlb|ufc|mma|f1|formula 1|premier league|champions league|world cup|super bowl|playoffs|championship|tournament|moneyline|spread|over under|\bwin\b|game 7|series|match|vs\.|cavalier|laker|celtics|warriors|heat|knicks|bulls|pistons|bucks|suns|nuggets|pacers|thunder|nets|spurs|maverick|hawk|magic|wolf|grizzl|rocket|jazz|clipper|pelican|hornet|blazer|king|patriot|chief|eagle|cowboy|packers|49er|bear|lion|falcon|raider|bronco|dolphin|jet|giant|charger|steeler|browns|raven|texan|colts|titan|jaguar|bengal|viking|saint|buccaneer|panther|seahawk|ram|\bfc\b|\bsc\b|\bunited\b|city fc|arsenal|chelsea|liverpool|barcelona|madrid|psg|bayern|juventus|milan|tennis|golf|boxing|wrestling|nascar|moto|tour de france|wimbledon|grand slam|open|masters|pga|lpga|soccer|football|rugby|cricket|baseball|basketball|hockey|volleyball|swimming|athletics|marathon/i },
  { category: 'other',         re: /temperature|weather|seoul|science|space|nasa|climate|earthquake|volcano|hurricane|asteroid|species|population|gdp|recession|inflation|interest rate/i },
];

function detectCategory(question = '') {
  for (const { category, re } of CATEGORY_RULES) {
    if (re.test(question)) return category;
  }
  return 'other';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_BADGE = {
  crypto:        '⚡ Crypto',
  politics:      '🏛 Politics',
  sports:        '⚽ Sports',
  entertainment: '🎬 Entertainment',
  other:         '📊 Other',
};

const MONTH_MAP = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

function isPastMarket(title = '') {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const iso = title.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    if (d < now) return true;
  }
  const mdy = title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase().slice(0, 3)];
    const day   = parseInt(mdy[2]);
    const year  = mdy[3] ? parseInt(mdy[3]) : now.getFullYear();
    if (new Date(year, month, day) < now) return true;
  }
  return false;
}

function extractDateFromTitle(title = '') {
  const iso = title.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const mdy = title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*\d{4})?/i);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase().slice(0, 3)];
    const day   = parseInt(mdy[2]);
    return new Date(new Date().getFullYear(), month, day)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return null;
}

function formatBet(outcome, category) {
  if (category === 'sports' && !/^(yes|no|up|down|over|under|higher|lower|\d)/i.test(outcome)) {
    return `${outcome} to win`;
  }
  return outcome;
}

function extractUsdc(trade) {
  return parseFloat(trade.size ?? 0) * parseFloat(trade.price ?? 0);
}

function shortenAddress(addr = '') {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatUsdc(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function formatPnl(n) {
  const abs = Math.abs(n);
  const str = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M`
             : abs >= 1_000    ? `$${Math.round(abs / 1_000)}K`
             : `$${Math.round(abs)}`;
  return n >= 0 ? `+${str}` : `-${str}`;
}

function timeAgo(unixSecs) {
  const mins = Math.round((Date.now() - unixSecs * 1000) / 60_000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function formatMonthYear(unixSecs) {
  if (!unixSecs) return null;
  return new Date(unixSecs * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Whale Score ───────────────────────────────────────────────────────────────
// volume 40% + PnL 40% + trade count 20%
// Feed score uses volume only (PnL/count unknown at that point)

export function computeWhaleScore(usdc, totalCashPnl = null, tradeCount = null) {
  const volScore = Math.min(usdc / 500_000, 1) * 40;
  const pnlScore = totalCashPnl === null
    ? 20
    : totalCashPnl >= 10_000  ? 40
    : totalCashPnl > 0        ? 20 + (totalCashPnl / 10_000) * 20
    : totalCashPnl > -10_000  ? Math.max(0, 20 + (totalCashPnl / 10_000) * 20)
    : 0;
  const cntScore = tradeCount === null ? 10 : Math.min(tradeCount / 30, 1) * 20;
  return Math.round(Math.min(100, Math.max(1, volScore + pnlScore + cntScore)));
}

export function scoreColor(score) {
  if (score >= 80) return '#ffd700';
  if (score >= 60) return '#00c896';
  return '#666';
}

// ── Fetch raw whale trades ────────────────────────────────────────────────────

async function fetchWhaleTrades() {
  const url = `${DATA_API_BASE}/trades?filterType=CASH&filterAmount=${WHALE_MIN_USDC}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Trades fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? data.trades ?? [];
}

// ── Map trade → whale card ────────────────────────────────────────────────────

function tradeToWhale(trade, index) {
  const usdc       = extractUsdc(trade);
  const question   = trade.title ?? '';
  const category   = detectCategory(question);
  const addr       = trade.proxyWallet ?? '';
  const name       = (trade.pseudonym ?? trade.name ?? shortenAddress(addr)) || `Whale #${index + 1}`;
  const rawOutcome = trade.outcome ?? (trade.outcomeIndex === 0 ? 'Yes' : 'No');
  const direction  = /^(yes|up)/i.test(rawOutcome) ? 'YES' : 'NO';
  const bet        = formatBet(rawOutcome, category);
  const eventDate  = extractDateFromTitle(question);
  const score      = computeWhaleScore(usdc);

  let type = 'dormant', stat = 'Whale bet';
  if      (usdc >= 500_000) { type = 'consensus'; stat = 'Mega move'; }
  else if (usdc >= 100_000) { type = 'active';    stat = 'Large position'; }
  else if (usdc >= 50_000)  { type = 'ghost';     stat = 'Big bet'; }

  return {
    id:        trade.transactionHash ?? `trade-${index}`,
    name,
    type,
    score,
    badge:     CATEGORY_BADGE[category] ?? '📊 Other',
    market:    question.slice(0, 60) || 'Unknown market',
    amount:    formatUsdc(usdc),
    direction,
    bet,
    eventDate,
    time:      timeAgo(trade.timestamp),
    stat,
    raw:       { addr, usdc, question, category, direction },
  };
}

// ── Module-level cache ────────────────────────────────────────────────────────

let _whaleCache     = null;
let _whaleCacheTime = 0;

export function getCachedWhales() { return _whaleCache; }

export function getCacheAge() {
  if (!_whaleCacheTime) return null;
  return Math.round((Date.now() - _whaleCacheTime) / 60_000);
}

// ── Feed data export ──────────────────────────────────────────────────────────

export async function fetchWhaleActivity(forceRefresh = false) {
  if (!forceRefresh && _whaleCache && (Date.now() - _whaleCacheTime) < CACHE_TTL_MS) {
    return _whaleCache;
  }

  const trades = await fetchWhaleTrades(); // throws on network/HTTP error

  if (!trades.length) return [];

  const filtered = trades.filter((t) => !isPastMarket(t.title ?? ''));

  const byAddr = new Map();
  for (const t of filtered) {
    const addr = t.proxyWallet ?? t.transactionHash ?? `anon-${Math.random()}`;
    const usdc = extractUsdc(t);
    if (!byAddr.has(addr) || usdc > extractUsdc(byAddr.get(addr))) {
      byAddr.set(addr, t);
    }
  }

  if (!byAddr.size) return [];

  const result = [...byAddr.values()]
    .sort((a, b) => extractUsdc(b) - extractUsdc(a))
    .slice(0, 8)
    .map(tradeToWhale);

  _whaleCache     = result;
  _whaleCacheTime = Date.now();
  return result;
}

// ── Positions processing ──────────────────────────────────────────────────────

function processPositions(positions) {
  const now = new Date();
  let totalCashPnl = 0;

  const list = positions.map((p) => {
    const cashPnl        = parseFloat(p.cashPnl ?? 0);
    const percentPnl     = parseFloat(p.percentPnl ?? 0);
    const curPriceRaw    = parseFloat(p.curPrice ?? p.currentValue ?? 0);
    const initialValueRaw = parseFloat(p.initialValue ?? p.cashInvested ?? 0);
    const redeemable     = p.redeemable === true;
    const endDate        = p.endDate ? new Date(p.endDate) : null;
    const isPast         = endDate ? endDate <= now : false;
    const isFuture       = endDate ? endDate > now  : false;

    totalCashPnl += cashPnl;

    let status;
    if      (redeemable && cashPnl > 0)     status = 'WON';
    else if (redeemable && cashPnl < 0)     status = 'LOST';
    else if (redeemable && cashPnl === 0)   status = 'EVEN';
    else if (curPriceRaw === 0 && isPast)   status = 'LOST';
    else if (!redeemable && isFuture)       status = 'OPEN';
    else                                     status = null;

    // percentPnl: ratio (0.42) or already percentage (42.0)
    const pctDisplay = `${percentPnl >= 0 ? '+' : ''}${(Math.abs(percentPnl) <= 1 ? percentPnl * 100 : percentPnl).toFixed(1)}%`;

    return {
      title:          (p.title ?? p.market?.title ?? 'Unknown market').slice(0, 60),
      outcome:        p.outcome ?? p.outcomeTitle ?? '—',
      initialValue:   initialValueRaw > 0 ? formatUsdc(initialValueRaw) : null,
      initialValueRaw,
      curPrice:       curPriceRaw > 0 ? formatUsdc(curPriceRaw) : null,
      curPriceRaw,
      cashPnl:        formatPnl(cashPnl),
      cashPnlRaw:     cashPnl,
      pctDisplay,
      status,
    };
  });

  // Biggest positions first (by initial investment)
  list.sort((a, b) => (b.initialValueRaw ?? 0) - (a.initialValueRaw ?? 0));

  return { list, totalCashPnl };
}

// ── Whale profile ─────────────────────────────────────────────────────────────

export async function fetchWhaleProfile(addr) {
  if (!addr) return null;

  const [trades, positions] = await Promise.all([
    fetch(`${DATA_API_BASE}/trades?user=${addr}&limit=50`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => Array.isArray(d) ? d : d.data ?? d.trades ?? [])
      .catch(() => []),

    fetch(`${DATA_API_BASE}/positions?user=${addr}&limit=50`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => Array.isArray(d) ? d : d.data ?? d.positions ?? [])
      .catch(() => []),
  ]);

  if (!trades.length && !positions.length) return null;

  const pseudonym = trades[0]?.pseudonym ?? trades[0]?.name ?? null;

  let totalVolume = 0, biggestTrade = 0;
  const catCounts = {};
  let earliestTs = Infinity;

  for (const t of trades) {
    const usdc = extractUsdc(t);
    totalVolume += usdc;
    if (usdc > biggestTrade) biggestTrade = usdc;
    const cat = detectCategory(t.title ?? '');
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    if (t.timestamp && t.timestamp < earliestTs) earliestTs = t.timestamp;
  }

  const topCat      = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const topCategory = CATEGORY_BADGE[topCat] ?? '📊 Other';
  const memberSince = earliestTs < Infinity ? formatMonthYear(earliestTs) : null;

  const { list: positionList, totalCashPnl } = processPositions(positions);

  const score = computeWhaleScore(totalVolume, positionList.length ? totalCashPnl : null, trades.length);

  return {
    pseudonym,
    totalVolume:     formatUsdc(totalVolume),
    totalVolumeRaw:  totalVolume,
    biggestTrade:    formatUsdc(biggestTrade),
    topCategory,
    totalTrades:     trades.length,
    memberSince,
    score,
    positions:       positionList,
    totalCashPnl:    positionList.length ? formatPnl(totalCashPnl) : null,
    totalCashPnlRaw: totalCashPnl,
  };
}

// ── Leaderboard PnL (lightweight — positions only) ───────────────────────────

export async function fetchWhalePnl(addr) {
  if (!addr) return null;
  try {
    const res  = await fetch(`${DATA_API_BASE}/positions?user=${addr}&limit=50`);
    if (!res.ok) return null;
    const data = await res.json();
    const positions = Array.isArray(data) ? data : data.data ?? data.positions ?? [];
    const total = positions.reduce((s, p) => s + parseFloat(p.cashPnl ?? 0), 0);
    return { totalCashPnl: total, formatted: formatPnl(total) };
  } catch {
    return null;
  }
}
