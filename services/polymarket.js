// Data source: data-api.polymarket.com (confirmed working)
//   Global trades: GET /trades?limit=500&sortBy=usdcSize&sortDirection=desc
const DATA_API_BASE = 'https://data-api.polymarket.com';

const WHALE_THRESHOLD_USDC = 10_000;

// ── Category detection ───────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { category: 'sports',        re: /soccer|football|nfl|nba|nhl|mlb|champions|premier league|world cup|copa|bundesliga|la liga|f1|formula 1|tennis|golf|rugby|cricket|nascar|olympics|super bowl|playoff|championship|tournament|match|win|game|season|ufc|boxing|mma|fight|canelo|fury|bout/i },
  { category: 'crypto',        re: /bitcoin|btc|eth|ethereum|crypto|token|blockchain|coin|defi|solana|sol|doge|xrp|bnb|altcoin/i },
  { category: 'politics',      re: /election|president|trump|congress|senate|vote|government|biden|harris|democrat|republican|political|tariff|policy|legislation|ballot|minister|parliament/i },
  { category: 'entertainment', re: /oscar|emmy|grammy|netflix|movie|film|show|tv|television|celebrity|music|album|taylor|kanye|hollywood|box office|streaming|award|actor|actress|series|season|episode/i },
];

function detectCategory(question = '') {
  for (const { category, re } of CATEGORY_RULES) {
    if (re.test(question)) return category;
  }
  return 'other';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortenAddress(addr = '') {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsdc(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function timeAgo(ts) {
  const ms = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : new Date(ts).getTime();
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}

function extractUsdc(trade) {
  const candidates = [
    trade.usdcSize, trade.size, trade.amount,
    trade.collateralAmount, trade.tradeAmount, trade.notional, trade.value,
  ];
  for (const v of candidates) {
    if (v == null) continue;
    const n = parseFloat(v);
    if (Number.isFinite(n) && n > 0) return n > 1e9 ? n / 1e6 : n;
  }
  const size = parseFloat(trade.size ?? trade.shares ?? 0);
  const price = parseFloat(trade.price ?? trade.sharePrice ?? 0);
  if (size > 0 && price > 0 && price <= 1) return size * price;
  return 0;
}

// ── Global trades fetch ───────────────────────────────────────────────────────

async function fetchGlobalTrades() {
  // Fetch A: with sortBy — see if usdcSize field appears when sorting by it
  const urlA = `${DATA_API_BASE}/trades?limit=10&sortBy=usdcSize&sortDirection=desc`;
  // Fetch B: without sortBy — plain recent trades, may expose different fields
  const urlB = `${DATA_API_BASE}/trades?limit=10`;

  console.log('[Spouter] Fetching A (sortBy=usdcSize):', urlA);
  console.log('[Spouter] Fetching B (no sortBy):', urlB);

  const [resA, resB] = await Promise.all([fetch(urlA), fetch(urlB)]);
  console.log('[Spouter] A status:', resA.status, '| B status:', resB.status);

  const logTrade = (label, trade) => {
    console.log(`[Spouter] ${label} ALL keys+values:`);
    for (const [k, v] of Object.entries(trade)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  };

  if (resA.ok) {
    const dataA = await resA.json();
    const tradesA = Array.isArray(dataA) ? dataA : dataA.data ?? dataA.trades ?? [];
    console.log('[Spouter] A trade count:', tradesA.length);
    if (tradesA[0]) logTrade('A[0]', tradesA[0]);
    if (tradesA[1]) logTrade('A[1]', tradesA[1]);
  }

  if (resB.ok) {
    const dataB = await resB.json();
    const tradesB = Array.isArray(dataB) ? dataB : dataB.data ?? dataB.trades ?? [];
    console.log('[Spouter] B trade count:', tradesB.length);
    if (tradesB[0]) logTrade('B[0]', tradesB[0]);
  }

  // For the actual data, use A (sorted) as the main fetch with full limit
  const urlMain = `${DATA_API_BASE}/trades?limit=500&sortBy=usdcSize&sortDirection=desc`;
  const resMain = await fetch(urlMain);
  if (!resMain.ok) throw new Error(`data-api HTTP ${resMain.status}`);
  const dataMain = await resMain.json();
  return Array.isArray(dataMain) ? dataMain : dataMain.data ?? dataMain.trades ?? [];
}

// ── Map trade → whale card ────────────────────────────────────────────────────

function tradeToWhale(trade, index) {
  const usdc = extractUsdc(trade);
  const question = trade.title ?? trade.question ?? trade.market?.question ?? trade.market?.title ?? '';
  const category = detectCategory(question);
  const addr = trade.proxyWallet ?? trade.maker ?? trade.user ?? trade.trader ?? trade.owner ?? '';
  const name = (trade.pseudonym ?? trade.name ?? trade.username ?? shortenAddress(addr)) || `Whale #${index + 1}`;
  const outcome = String(trade.outcome ?? trade.side ?? '');
  const direction = /^y|^yes|^buy/i.test(outcome) ? 'YES' : 'NO';
  const ts = trade.timestamp ?? trade.createdAt ?? trade.created_at ?? trade.matchTime ?? trade.match_time;

  let type = 'dormant';
  let stat = 'Notable trade';
  if (usdc >= 500_000) { type = 'consensus'; stat = 'Mega move'; }
  else if (usdc >= 100_000) { type = 'active'; stat = 'Large position'; }
  else if (usdc >= 20_000) { type = 'ghost'; stat = 'Mid-tier whale'; }

  const categoryBadge = {
    crypto: '⚡ Crypto', politics: '🏛 Politics',
    sports: '⚽ Sports', ufc: '⚽ Sports', entertainment: '🎬 Entertainment', other: '📊 Market',
  }[category];

  return {
    id: trade.id ?? trade.transactionHash ?? trade.transaction_hash ?? `trade-${index}`,
    name,
    type,
    badge: categoryBadge,
    market: question.slice(0, 42) || 'Unknown market',
    amount: formatUsdc(usdc),
    direction,
    time: ts ? timeAgo(ts) : 'recently',
    stat,
    raw: { addr, usdc, question, category, direction },
  };
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

export const MOCK_WHALES = [
  { id: 1, name: 'Whale #3', type: 'active', badge: '⚽ Sports', market: 'Brazil World Cup', amount: '$280K', direction: 'YES', time: '2 min ago', stat: 'Large position', raw: { category: 'sports' } },
  { id: 2, name: 'Ghost wallet', type: 'ghost', badge: '🥊 UFC', market: 'Chimaev to win', amount: '$500K', direction: 'YES', time: '8 min ago', stat: 'Mid-tier whale', raw: { category: 'ufc' } },
  { id: 3, name: 'Whale #7', type: 'dormant', badge: '🏛 Politics', market: 'Trump 2026 midterms', amount: '$900K', direction: 'NO', time: '22 min ago', stat: 'Notable trade', raw: { category: 'politics' } },
  { id: 4, name: 'BTC Caller', type: 'consensus', badge: '⚡ Crypto', market: 'BTC > $100K by EOY', amount: '$1.8M combined', direction: 'YES', time: '1 hr ago', stat: 'Mega move', raw: { category: 'crypto' } },
];

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchWhaleActivity() {
  console.log('[Spouter] fetchWhaleActivity START — global trades');
  try {
    const trades = await fetchGlobalTrades();

    if (!trades.length) {
      console.log('[Spouter] No trades returned, going mock');
      return MOCK_WHALES;
    }

    // Log size distribution to confirm usdcSize field is correct
    const sizes = trades.slice(0, 10).map((t) => `$${Math.round(extractUsdc(t))}`);
    console.log('[Spouter] Top 10 USDC sizes:', sizes.join(', '));

    // Filter by whale threshold
    const whaleTrades = trades.filter((t) => extractUsdc(t) >= WHALE_THRESHOLD_USDC);
    console.log(`[Spouter] Above $${WHALE_THRESHOLD_USDC}: ${whaleTrades.length}/${trades.length}`);
    const source = whaleTrades.length ? whaleTrades : trades;

    // Deduplicate by wallet, keep largest trade per address
    const byAddr = new Map();
    for (const t of source) {
      const addr = t.proxyWallet ?? t.maker ?? t.user ?? t.trader ?? t.id ?? `anon-${Math.random()}`;
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
