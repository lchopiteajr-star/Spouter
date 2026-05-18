// Data source: data-api.polymarket.com/trades
// filterType=CASH&filterAmount=N filters server-side to trades ≥ $N USDC
// Field names confirmed from live logs:
//   proxyWallet, pseudonym, name, side, size (shares), price ($/share),
//   timestamp (unix secs), title, outcome, outcomeIndex, transactionHash, conditionId
const DATA_API_BASE = 'https://data-api.polymarket.com';

const WHALE_MIN_USDC = 10_000;

// ── Category detection ────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  // Crypto first — "Up or Down" price markets should be crypto, not sports
  { category: 'crypto', re: /bitcoin|btc|eth|ethereum|crypto|token|coin|blockchain|defi|solana|sol|doge|xrp|bnb|altcoin|nft|web3|price|up or down|updown/i },
  // Politics
  { category: 'politics', re: /trump|biden|harris|election|president|congress|senate|vote|voting|democrat|republican|gop|maga|government|tariff|policy|legislation|ballot|prime minister|parliament|white house|supreme court|fed rate|federal reserve/i },
  // Entertainment
  { category: 'entertainment', re: /oscar|emmy|grammy|golden globe|netflix|hulu|disney|movie|film|box office|album|song|music|taylor swift|kanye|beyonce|celebrity|hollywood|tv show|television|season|episode|streaming|award show|actor|actress|kardashian/i },
  // Sports — broad: leagues, terms, and enough team/player signals to catch most markets
  { category: 'sports', re: /nfl|nba|nhl|mlb|ufc|mma|f1|formula 1|premier league|champions league|world cup|super bowl|playoffs|championship|tournament|moneyline|spread|over under|\bwin\b|game 7|series|match|vs\.|cavalier|laker|celtics|warriors|heat|knicks|bulls|pistons|bucks|suns|nuggets|pacers|thunder|nets|spurs|maverick|hawk|magic|wolf|grizzl|rocket|jazz|clipper|pelican|hornet|blazer|king|pistons|patriot|chief|eagle|cowboy|packers|49er|bear|lion|falcon|raider|bronco|dolphin|jet|giant|charger|steeler|browns|raven|texan|colts|titan|jaguar|bengal|viking|saint|buccaneer|panther|seahawk|ram|\bfc\b|\bsc\b|\bunited\b|city fc|arsenal|chelsea|liverpool|barcelona|madrid|psg|bayern|juventus|milan|tennis|golf|ufc|boxing|wrestling|nascar|moto|tour de france|wimbledon|grand slam|open|masters|pga|lpga|soccer|football|rugby|cricket|baseball|basketball|hockey|volleyball|swimming|athletics|marathon/i },
];

function detectCategory(question = '') {
  for (const { category, re } of CATEGORY_RULES) {
    if (re.test(question)) return category;
  }
  return 'other';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_MAP = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

function isPastMarket(title = '') {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // ISO date: 2026-05-17
  const iso = title.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    if (d < now) return true;
  }

  // "May 17" or "May 17, 2026"
  const mdy = title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase().slice(0, 3)];
    const day = parseInt(mdy[2]);
    const year = mdy[3] ? parseInt(mdy[3]) : now.getFullYear();
    const d = new Date(year, month, day);
    if (d < now) return true;
  }

  return false;
}

function formatBet(outcome, category) {
  if (category === 'sports' && !/^(yes|no|up|down|over|under|higher|lower|\d)/i.test(outcome)) {
    return `${outcome} to win`;
  }
  return outcome;
}

function extractDateFromTitle(title = '') {
  // ISO date embedded in title: 2026-05-17 → "May 17"
  const iso = title.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // "May 17" or "May 17, 2026" — return formatted directly
  const mdy = title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*\d{4})?/i);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase().slice(0, 3)];
    const day = parseInt(mdy[2]);
    const d = new Date(new Date().getFullYear(), month, day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return null;
}

// size = shares, price = $/share → USDC = size × price (confirmed from logs)
function extractUsdc(trade) {
  return parseFloat(trade.size ?? 0) * parseFloat(trade.price ?? 0);
}

function shortenAddress(addr = '') {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsdc(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function timeAgo(unixSecs) {
  const mins = Math.round((Date.now() - unixSecs * 1000) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

// ── Map trade → whale card ────────────────────────────────────────────────────

function tradeToWhale(trade, index) {
  const usdc = extractUsdc(trade);
  const question = trade.title ?? '';
  const category = detectCategory(question);
  const addr = trade.proxyWallet ?? '';
  const name = (trade.pseudonym ?? trade.name ?? shortenAddress(addr)) || `Whale #${index + 1}`;

  // outcome is the actual selection: "Cavaliers", "Yes", "No", "Up", "Down", etc.
  const rawOutcome = trade.outcome ?? (trade.outcomeIndex === 0 ? 'Yes' : 'No');
  // direction drives chip color; YES = green for Yes/Up/team picks, NO = red for No/Down
  const direction = /^(yes|up)/i.test(rawOutcome) ? 'YES' : 'NO';
  const bet = formatBet(rawOutcome, category);

  const eventDate = extractDateFromTitle(question);

  let type = 'dormant';
  let stat = 'Whale bet';
  if (usdc >= 500_000) { type = 'consensus'; stat = 'Mega move'; }
  else if (usdc >= 100_000) { type = 'active'; stat = 'Large position'; }
  else if (usdc >= 50_000) { type = 'ghost'; stat = 'Big bet'; }
  else if (usdc >= 10_000) { type = 'dormant'; stat = 'Whale bet'; }

  const categoryBadge = {
    crypto: '⚡ Crypto', politics: '🏛 Politics',
    sports: '⚽ Sports', entertainment: '🎬 Entertainment', other: '📊 Market',
  }[category];

  return {
    id: trade.transactionHash ?? `trade-${index}`,
    name,
    type,
    badge: categoryBadge,
    market: question.slice(0, 42) || 'Unknown market',
    amount: formatUsdc(usdc),
    direction,
    bet,
    eventDate,
    time: timeAgo(trade.timestamp),
    stat,
    raw: { addr, usdc, question, category, direction },
  };
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

export const MOCK_WHALES = [
  { id: 1, name: 'Whale #3', type: 'active', badge: '⚽ Sports', market: 'Brazil World Cup', amount: '$280K', direction: 'YES', bet: 'Brazil to win', eventDate: 'Jun 14', time: '2 min ago', stat: 'Large position', raw: { category: 'sports' } },
  { id: 2, name: 'Ghost wallet', type: 'ghost', badge: '📊 Market', market: 'Chimaev to win', amount: '$500K', direction: 'YES', bet: 'Yes', eventDate: null, time: '8 min ago', stat: 'Big bet', raw: { category: 'other' } },
  { id: 3, name: 'Whale #7', type: 'dormant', badge: '🏛 Politics', market: 'Trump 2026 midterms', amount: '$900K', direction: 'NO', bet: 'No', eventDate: 'Nov 3', time: '22 min ago', stat: 'Whale bet', raw: { category: 'politics' } },
  { id: 4, name: 'BTC Caller', type: 'consensus', badge: '⚡ Crypto', market: 'BTC > $100K by EOY', amount: '$1.8M', direction: 'YES', bet: 'Yes', eventDate: 'Dec 31', time: '1 hr ago', stat: 'Mega move', raw: { category: 'crypto' } },
];

// ── Module-level cache so leaderboard can reuse feed data ────────────────────

let _whaleCache = null;
export function getCachedWhales() { return _whaleCache; }

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchWhaleActivity() {
  console.log('[Spouter] fetchWhaleActivity START');
  try {
    const trades = await fetchWhaleTrades();

    if (!trades.length) {
      console.log('[Spouter] No whale trades returned, going mock');
      return MOCK_WHALES;
    }

    const filtered = trades.filter((t) => !isPastMarket(t.title ?? ''));
    console.log('[Spouter] After past-date filter:', filtered.length, '/', trades.length);

    // Deduplicate by wallet — keep largest trade per address
    const byAddr = new Map();
    for (const t of filtered) {
      const addr = t.proxyWallet ?? t.transactionHash ?? `anon-${Math.random()}`;
      const usdc = extractUsdc(t);
      if (!byAddr.has(addr) || usdc > extractUsdc(byAddr.get(addr))) {
        byAddr.set(addr, t);
      }
    }
    console.log('[Spouter] Unique wallets:', byAddr.size);

    if (!byAddr.size) {
      console.log('[Spouter] No candidates, going mock');
      return MOCK_WHALES;
    }

    const result = [...byAddr.values()]
      .sort((a, b) => extractUsdc(b) - extractUsdc(a))
      .slice(0, 8)
      .map(tradeToWhale);

    _whaleCache = result;
    console.log('[Spouter] Returning', result.length, 'live whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] ERROR:', err.message);
    return MOCK_WHALES;
  }
}

// ── Whale profile ─────────────────────────────────────────────────────────────

export async function fetchWhaleProfile(addr) {
  if (!addr) return null;
  const url = `${DATA_API_BASE}/trades?user=${addr}&limit=50`;
  console.log('[Spouter] Profile fetch:', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const trades = Array.isArray(data) ? data : data.data ?? data.trades ?? [];
  if (!trades.length) return null;

  const pseudonym = trades[0]?.pseudonym ?? trades[0]?.name ?? null;

  let totalVolume = 0;
  let biggestTrade = 0;
  const catCounts = {};

  for (const t of trades) {
    const usdc = extractUsdc(t);
    totalVolume += usdc;
    if (usdc > biggestTrade) biggestTrade = usdc;
    const cat = detectCategory(t.title ?? '');
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }

  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const topCatLabel = {
    crypto: '⚡ Crypto', politics: '🏛 Politics',
    sports: '⚽ Sports', entertainment: '🎬 Entertainment', other: '📊 Market',
  }[topCat];

  const recentTrades = trades.slice(0, 10).map((t) => {
    const usdc = extractUsdc(t);
    const outcome = t.outcome ?? (t.outcomeIndex === 0 ? 'Yes' : 'No');
    const side = (t.side ?? '').toUpperCase();
    const isYes = /^yes$/i.test(outcome);
    const isNo = /^no$/i.test(outcome);
    const isBuy = side === 'BUY';
    let result = 'open';
    if ((isYes && isBuy) || (isNo && !isBuy)) result = 'win';
    else if ((isYes && !isBuy) || (isNo && isBuy)) result = 'loss';
    return {
      market: (t.title ?? 'Unknown market').slice(0, 40),
      amount: formatUsdc(usdc),
      outcome,
      result,
      time: timeAgo(t.timestamp),
    };
  });

  return { pseudonym, totalVolume: formatUsdc(totalVolume), biggestTrade: formatUsdc(biggestTrade), topCategory: topCatLabel, totalTrades: trades.length, recentTrades };
}

// ── Fetch whale trades ────────────────────────────────────────────────────────

async function fetchWhaleTrades() {
  // filterType=CASH&filterAmount=N → server returns only trades ≥ $N USDC
  // takerOnly=true (default) — only completed trades, no open orders
  const url = `${DATA_API_BASE}/trades?filterType=CASH&filterAmount=${WHALE_MIN_USDC}&limit=100`;
  console.log('[Spouter] Fetching:', url);
  const res = await fetch(url);
  console.log('[Spouter] HTTP status:', res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const trades = Array.isArray(data) ? data : data.data ?? data.trades ?? [];
  console.log('[Spouter] Trades returned:', trades.length);
  if (trades[0]) {
    console.log('[Spouter] First trade:', JSON.stringify(trades[0]));
    console.log('[Spouter] Top 5 USDC:', trades.slice(0, 5).map((t) => `$${Math.round(extractUsdc(t))}`).join(', '));
  }
  return trades;
}
