// Data source: data-api.polymarket.com/trades
// filterType=CASH&filterAmount=N filters server-side to trades ≥ $N USDC
// Field names confirmed from live logs:
//   proxyWallet, pseudonym, name, side, size (shares), price ($/share),
//   timestamp (unix secs), title, outcome, outcomeIndex, transactionHash, conditionId
const DATA_API_BASE = 'https://data-api.polymarket.com';

const WHALE_MIN_USDC = 10_000;

// ── Category detection ────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { category: 'sports',        re: /soccer|football|nfl|nba|nhl|mlb|champions|premier league|world cup|copa|bundesliga|la liga|f1|formula 1|tennis|golf|rugby|cricket|nascar|olympics|super bowl|playoff|championship|tournament|ufc|boxing|mma|fight|canelo|fury/i },
  { category: 'crypto',        re: /bitcoin|btc|eth|ethereum|crypto|token|blockchain|coin|defi|solana|sol|doge|xrp|bnb/i },
  { category: 'politics',      re: /election|president|trump|congress|senate|vote|government|biden|harris|democrat|republican|tariff|policy|legislation|ballot|minister|parliament/i },
  { category: 'entertainment', re: /oscar|emmy|grammy|netflix|movie|film|show|tv|television|celebrity|music|album|taylor|kanye|hollywood|box office|streaming|award|actor|actress/i },
];

function detectCategory(question = '') {
  for (const { category, re } of CATEGORY_RULES) {
    if (re.test(question)) return category;
  }
  return 'other';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
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

// ── Map trade → whale card ────────────────────────────────────────────────────

function tradeToWhale(trade, index) {
  const usdc = extractUsdc(trade);
  const question = trade.title ?? '';
  const category = detectCategory(question);
  const addr = trade.proxyWallet ?? '';
  const name = (trade.pseudonym ?? trade.name ?? shortenAddress(addr)) || `Whale #${index + 1}`;

  // outcome is "Yes"/"No"/"Up"/"Down"; outcomeIndex 0=Yes 1=No as fallback
  const outcome = trade.outcome ?? (trade.outcomeIndex === 0 ? 'Yes' : 'No');
  const direction = /^(yes|up)/i.test(outcome) ? 'YES' : 'NO';

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
    time: timeAgo(trade.timestamp),
    stat,
    raw: { addr, usdc, question, category, direction },
  };
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

export const MOCK_WHALES = [
  { id: 1, name: 'Whale #3', type: 'active', badge: '⚽ Sports', market: 'Brazil World Cup', amount: '$280K', direction: 'YES', time: '2 min ago', stat: 'Large position', raw: { category: 'sports' } },
  { id: 2, name: 'Ghost wallet', type: 'ghost', badge: '📊 Market', market: 'Chimaev to win', amount: '$500K', direction: 'YES', time: '8 min ago', stat: 'Big bet', raw: { category: 'other' } },
  { id: 3, name: 'Whale #7', type: 'dormant', badge: '🏛 Politics', market: 'Trump 2026 midterms', amount: '$900K', direction: 'NO', time: '22 min ago', stat: 'Whale bet', raw: { category: 'politics' } },
  { id: 4, name: 'BTC Caller', type: 'consensus', badge: '⚡ Crypto', market: 'BTC > $100K by EOY', amount: '$1.8M', direction: 'YES', time: '1 hr ago', stat: 'Mega move', raw: { category: 'crypto' } },
];

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchWhaleActivity() {
  console.log('[Spouter] fetchWhaleActivity START');
  try {
    const trades = await fetchWhaleTrades();

    if (!trades.length) {
      console.log('[Spouter] No whale trades returned, going mock');
      return MOCK_WHALES;
    }

    // Deduplicate by wallet — keep largest trade per address
    const byAddr = new Map();
    for (const t of trades) {
      const addr = t.proxyWallet ?? t.transactionHash ?? `anon-${Math.random()}`;
      const usdc = extractUsdc(t);
      if (!byAddr.has(addr) || usdc > extractUsdc(byAddr.get(addr))) {
        byAddr.set(addr, t);
      }
    }
    console.log('[Spouter] Unique wallets:', byAddr.size);

    const result = [...byAddr.values()]
      .sort((a, b) => extractUsdc(b) - extractUsdc(a))
      .slice(0, 8)
      .map(tradeToWhale);

    console.log('[Spouter] Returning', result.length, 'live whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] ERROR:', err.message);
    return MOCK_WHALES;
  }
}
