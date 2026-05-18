// Strategy: Gamma API for top markets by volume → data-api trades per market
//   data-api field names confirmed from logs:
//     proxyWallet, pseudonym, name, side, size (shares), price ($/share),
//     timestamp (unix secs), title, outcome, outcomeIndex, transactionHash, conditionId
//
// True USDC = size × price  (both fields confirmed present)
const DATA_API_BASE = 'https://data-api.polymarket.com';

const WHALE_THRESHOLD_USDC = 200;

// 5-minute/15-minute up-down micro markets — these dominate recent trades
// but have tiny dollar amounts; exclude them to surface real whale markets
const MICRO_MARKET = /up or down|up-down-\d+m|\d+:\d+[ap]m.*(et|est|pt)|updown/i;

// ── Category detection ───────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

// Confirmed: size = shares, price = $/share → USDC = size × price
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

// ── Fetch 1500 global trades across 3 pages ──────────────────────────────────

async function fetchAllRecentTrades() {
  const offsets = [0, 500, 1000];
  const pages = await Promise.allSettled(
    offsets.map((offset) =>
      fetch(`${DATA_API_BASE}/trades?limit=500&offset=${offset}`)
        .then((r) => r.ok ? r.json() : [])
        .then((d) => Array.isArray(d) ? d : d.data ?? d.trades ?? [])
        .catch(() => [])
    )
  );
  const all = pages.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
  console.log(`[Spouter] Raw trades fetched: ${all.length} (${offsets.length} pages)`);
  return all;
}

// ── Map trade → whale card ────────────────────────────────────────────────────

function tradeToWhale(trade, marketTitle, index) {
  const usdc = extractUsdc(trade);
  const question = trade.title ?? marketTitle ?? '';
  const category = detectCategory(question);

  const addr = trade.proxyWallet ?? '';
  const name = (trade.pseudonym ?? trade.name ?? shortenAddress(addr)) || `Whale #${index + 1}`;

  // outcome field is "Up"/"Down"/"Yes"/"No"; side is "BUY"/"SELL"
  const outcome = trade.outcome ?? '';
  const direction = /^(yes|up|buy)/i.test(outcome) ? 'YES' : 'NO';

  let type = 'dormant';
  let stat = 'Notable trade';
  if (usdc >= 500_000) { type = 'consensus'; stat = 'Mega move'; }
  else if (usdc >= 100_000) { type = 'active'; stat = 'Large position'; }
  else if (usdc >= 20_000) { type = 'ghost'; stat = 'Mid-tier whale'; }
  else if (usdc >= 5_000) { type = 'active'; stat = 'Whale bet'; }

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
  { id: 2, name: 'Ghost wallet', type: 'ghost', badge: '📊 Market', market: 'Chimaev to win', amount: '$500K', direction: 'YES', time: '8 min ago', stat: 'Mid-tier whale', raw: { category: 'other' } },
  { id: 3, name: 'Whale #7', type: 'dormant', badge: '🏛 Politics', market: 'Trump 2026 midterms', amount: '$900K', direction: 'NO', time: '22 min ago', stat: 'Notable trade', raw: { category: 'politics' } },
  { id: 4, name: 'BTC Caller', type: 'consensus', badge: '⚡ Crypto', market: 'BTC > $100K by EOY', amount: '$1.8M combined', direction: 'YES', time: '1 hr ago', stat: 'Mega move', raw: { category: 'crypto' } },
];

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchWhaleActivity() {
  console.log('[Spouter] fetchWhaleActivity START');
  try {
    const raw = await fetchAllRecentTrades();
    if (!raw.length) {
      console.log('[Spouter] No trades returned, going mock');
      return MOCK_WHALES;
    }

    // Filter out 5-min micro markets — they dominate volume but have tiny $ sizes
    const real = raw.filter((t) => !MICRO_MARKET.test(t.title ?? ''));
    console.log(`[Spouter] After micro-market filter: ${real.length}/${raw.length}`);

    if (!real.length) {
      console.log('[Spouter] All trades were micro markets, going mock');
      return MOCK_WHALES;
    }

    // Sort by true USDC value descending
    real.sort((a, b) => extractUsdc(b) - extractUsdc(a));

    const top8usdc = real.slice(0, 8).map((t) => `$${Math.round(extractUsdc(t))}`);
    console.log('[Spouter] Top 8 USDC after filter+sort:', top8usdc.join(', '));
    if (real[0]) console.log('[Spouter] Biggest trade title:', real[0].title, '| USDC:', `$${Math.round(extractUsdc(real[0]))}`);

    // Filter by whale threshold
    const whaleTrades = real.filter((t) => extractUsdc(t) >= WHALE_THRESHOLD_USDC);
    console.log(`[Spouter] Above $${WHALE_THRESHOLD_USDC}: ${whaleTrades.length}/${real.length}`);
    const source = whaleTrades.length ? whaleTrades : real;

    // Deduplicate by wallet, keep largest trade per address
    const byAddr = new Map();
    for (const t of source) {
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
      .map((t, i) => tradeToWhale(t, t.title ?? '', i));

    console.log('[Spouter] Returning', result.length, 'live whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] ERROR:', err.message);
    return MOCK_WHALES;
  }
}
