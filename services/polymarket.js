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

// ── Static whale roster (single wallet while debugging) ──────────────────────
// Hardcoded to anoin123 until API connectivity is confirmed on-device.

const ANOIN123_ADDR = '0x8a791620dd6260079bf849dc5567adc3f2fdc318';

const STATIC_WHALES = [
  {
    id:        'anoin123',
    name:      'anoin123',
    type:      'consensus',
    score:     92,
    badge:     '🏛 Politics',
    market:    'Will the Iranian regime fall by June 30?',
    amount:    '$524K',
    direction: 'NO',
    bet:       'No',
    eventDate: 'Jun 30',
    time:      'recently',
    stat:      'Mega move',
    raw: {
      addr:      ANOIN123_ADDR,
      usdc:      524_518,
      question:  'Will the Iranian regime fall by June 30?',
      category:  'politics',
      direction: 'NO',
    },
  },
];

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
  _whaleCache     = STATIC_WHALES;
  _whaleCacheTime = Date.now();
  return STATIC_WHALES;
}

// ── Positions processing ──────────────────────────────────────────────────────

function processPositions(positions) {
  const now = new Date();
  let totalCashPnl       = 0;
  let totalOpenValue     = 0;
  let biggestWin         = 0;
  let wins = 0, losses = 0, opens = 0;

  const list = positions.map((p) => {
    const cashPnl          = parseFloat(p.cashPnl ?? 0);
    const percentPnl       = parseFloat(p.percentPnl ?? 0);
    const size             = parseFloat(p.size ?? 0);
    const curPricePerShare = parseFloat(p.curPrice ?? 0);
    const currentValueRaw  = parseFloat(p.currentValue ?? 0) || (curPricePerShare * size);
    const initialValueRaw  = parseFloat(p.initialValue ?? p.cashInvested ?? 0);

    // Average entry price per share = total spent ÷ shares
    const avgPrice = size > 0 ? initialValueRaw / size : 0;

    const redeemable = p.redeemable === true;
    const endDate    = p.endDate ? new Date(p.endDate) : null;
    const isFuture   = endDate ? endDate > now : false;
    const isResolved = !isFuture && (redeemable || curPricePerShare < 0.005 || curPricePerShare > 0.995);

    totalCashPnl += cashPnl;

    // Status:
    //  WON  — redeemable=true means market resolved and this outcome won
    //  LOST — market ended, price near 0 (losing outcome) or near-zero value vs initial
    //  OPEN — market end date in future, or unresolved with active price
    let status;
    if (redeemable) {
      status = 'WON';
    } else if (curPricePerShare < 0.005 && !isFuture) {
      status = 'LOST';
    } else if (initialValueRaw > 0 && currentValueRaw < initialValueRaw * 0.05 && isResolved) {
      status = 'LOST';
    } else if (isFuture || (!isResolved && curPricePerShare > 0.005)) {
      status = 'OPEN';
    } else {
      status = null;
    }

    if (status === 'WON')        { wins++;   if (cashPnl > biggestWin) biggestWin = cashPnl; }
    else if (status === 'LOST')  losses++;
    else if (status === 'OPEN')  { opens++; totalOpenValue += currentValueRaw; }

    // Prices in cents (1 share = $1 max, so price is 0–1 range → multiply by 100 for ¢)
    const avgPriceCents = avgPrice > 0 ? (avgPrice * 100).toFixed(1) : null;
    const curPriceCents = curPricePerShare > 0 ? (curPricePerShare * 100).toFixed(1) : null;

    // Unrealised PnL = (curPrice − avgPrice) × shares = currentValue − initialValue = cashPnl
    // percentPnl: API returns ratio (0.42) or already pct (42.0) — normalise
    const pctRaw = Math.abs(percentPnl) <= 1 ? percentPnl * 100 : percentPnl;
    const pctDisplay = `${pctRaw >= 0 ? '+' : ''}${pctRaw.toFixed(2)}%`;

    const rawOutcome = p.outcome ?? p.outcomeTitle ?? '';
    const direction  = /^(yes|up)/i.test(rawOutcome) ? 'YES' : 'NO';

    return {
      title:          (p.title ?? p.market?.title ?? 'Unknown market').slice(0, 60),
      outcome:        rawOutcome || '—',
      direction,
      initialValue:   initialValueRaw > 0 ? formatUsdc(initialValueRaw) : null,
      initialValueRaw,
      currentValue:   currentValueRaw > 0 ? formatUsdc(currentValueRaw) : null,
      currentValueRaw,
      cashPnl:        formatPnl(cashPnl),
      cashPnlRaw:     cashPnl,
      pctDisplay,
      avgPriceCents,
      curPriceCents,
      size,
      status,
    };
  });

  list.sort((a, b) => (b.initialValueRaw ?? 0) - (a.initialValueRaw ?? 0));

  return { list, totalCashPnl, totalOpenValue, biggestWin, wins, losses, opens };
}

// ── Whale profile ─────────────────────────────────────────────────────────────

export async function fetchWhaleProfile(addr) {
  if (!addr) return null;

  const [trades, positions] = await Promise.all([
    fetch(`${DATA_API_BASE}/trades?user=${addr}&limit=100`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => Array.isArray(d) ? d : d.data ?? d.trades ?? [])
      .catch(() => []),

    fetch(`${DATA_API_BASE}/positions?user=${addr}&limit=200`)
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

  const {
    list: positionList, totalCashPnl, totalOpenValue, biggestWin, wins, losses, opens,
  } = processPositions(positions);

  const score = computeWhaleScore(totalVolume, positionList.length ? totalCashPnl : null, trades.length);

  return {
    pseudonym,
    totalVolume:          formatUsdc(totalVolume),
    totalVolumeRaw:       totalVolume,
    biggestTrade:         formatUsdc(biggestTrade),
    topCategory,
    totalTrades:          trades.length,
    totalPredictions:     positionList.length,
    memberSince,
    score,
    wins,
    losses,
    opens,
    positions:            positionList,
    totalCashPnl:         positionList.length ? formatPnl(totalCashPnl) : null,
    totalCashPnlRaw:      totalCashPnl,
    totalOpenValue:       totalOpenValue > 0 ? formatUsdc(totalOpenValue) : null,
    totalOpenValueRaw:    totalOpenValue,
    biggestWin:           biggestWin > 0 ? formatPnl(biggestWin) : null,
    biggestWinRaw:        biggestWin,
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
