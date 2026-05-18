// Data source: Polymarket Gamma API (confirmed working)
//   Markets: GET /markets?limit=50&order=volume&ascending=false
//   Trades:  URL format TBD — probed at runtime
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const DATA_API_BASE = 'https://data-api.polymarket.com';

const WHALE_THRESHOLD_USDC = 100;

async function fetchTopMarkets(limit = 50) {
  const url = `${GAMMA_BASE}/markets?limit=${limit}&order=volume&ascending=false&active=true&closed=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma markets HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.data ?? data.markets ?? [];
  console.log('[Spouter] Markets count:', list.length);
  if (list[0]) {
    console.log('[Spouter] Market[0] keys:', Object.keys(list[0]));
    console.log('[Spouter] Market[0]:', JSON.stringify(list[0]).slice(0, 400));
  }
  return list;
}

// Probe all candidate URL formats on the first call; reuse the winner for the rest.
let workingTradesUrl = null; // pattern string, e.g. 'gamma-conditionId'

const TRADE_URL_BUILDERS = [
  (m) => ({ tag: 'gamma-conditionId', url: `${GAMMA_BASE}/trades?conditionId=${m.conditionId ?? m.condition_id}&limit=20` }),
  (m) => ({ tag: 'gamma-market-numeric', url: `${GAMMA_BASE}/markets/${m.id}/trades?limit=20` }),
  (m) => ({ tag: 'data-api-market-numeric', url: `${DATA_API_BASE}/trades?market=${m.id}&limit=20` }),
  (m) => ({ tag: 'data-api-conditionId', url: `${DATA_API_BASE}/trades?market=${m.conditionId ?? m.condition_id}&limit=20` }),
];

async function probeTradesUrl(market) {
  for (const builder of TRADE_URL_BUILDERS) {
    const { tag, url } = builder(market);
    console.log(`[Spouter] Probing [${tag}]:`, url);
    try {
      const res = await fetch(url);
      console.log(`[Spouter] [${tag}] → HTTP ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`[Spouter] [${tag}] raw (first 300):`, text.slice(0, 300));
        const data = JSON.parse(text);
        const trades = Array.isArray(data) ? data : data.data ?? data.trades ?? [];
        console.log(`[Spouter] [${tag}] trade count:`, trades.length);
        if (trades[0]) console.log(`[Spouter] [${tag}] first trade:`, JSON.stringify(trades[0]));
        workingTradesUrl = tag;
        return { tag, trades };
      }
    } catch (e) {
      console.log(`[Spouter] [${tag}] ERROR:`, e.message);
    }
  }
  console.log('[Spouter] All URL formats failed');
  return { tag: null, trades: [] };
}

async function fetchTradesForMarket(market) {
  if (!workingTradesUrl) {
    // First call — probe to find the working URL format
    const { trades } = await probeTradesUrl(market);
    return trades;
  }
  // Subsequent calls — use confirmed format directly
  const builder = TRADE_URL_BUILDERS.find((b) => b(market).tag === workingTradesUrl);
  if (!builder) return [];
  const { url } = builder(market);
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.data ?? data.trades ?? [];
  } catch {
    return [];
  }
}

function detectCategory(question = '') {
  const q = question.toLowerCase();
  if (/bitcoin|btc|eth|crypto|solana|defi/.test(q)) return 'crypto';
  if (/trump|election|president|congress|senate|democrat|republican|political|tariff/.test(q)) return 'politics';
  if (/ufc|boxing|fight|mma|canelo|fury/.test(q)) return 'ufc';
  if (/soccer|football|champions|premier|world cup|copa|bundesliga|la liga|nba|nfl|mlb/.test(q)) return 'sports';
  return 'other';
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

function timeAgo(ts) {
  // ts may be unix seconds (int) or ISO string
  const ms = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : new Date(ts).getTime();
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}

// Extract USDC amount — try every plausible field, handle 6-decimal BigInts
function extractUsdc(trade) {
  // Try direct dollar-value fields first
  const candidates = [
    trade.usdcSize, trade.size, trade.amount, trade.collateralAmount,
    trade.tradeAmount, trade.notional, trade.value,
  ];
  for (const v of candidates) {
    if (v == null) continue;
    const n = parseFloat(v);
    if (Number.isFinite(n) && n > 0) {
      // If the number looks like it's in base units (>1e4 for a $1 trade) divide by 1e6
      return n > 1e9 ? n / 1e6 : n;
    }
  }
  // shares × price fallback
  const size = parseFloat(trade.size ?? trade.shares ?? 0);
  const price = parseFloat(trade.price ?? trade.sharePrice ?? 0);
  if (size > 0 && price > 0 && price <= 1) return size * price;
  return 0;
}

function tradeToWhale(trade, question, index) {
  if (index === 0) {
    console.log('[Spouter] tradeToWhale[0] keys:', Object.keys(trade));
    console.log('[Spouter] tradeToWhale[0]:', JSON.stringify(trade));
  }

  const usdc = extractUsdc(trade);
  const category = detectCategory(question);

  // Wallet address
  const addr = trade.proxyWallet ?? trade.maker ?? trade.user ?? trade.trader ?? trade.owner ?? '';

  // Display name
  const name = trade.pseudonym ?? trade.name ?? trade.username ?? shortenAddress(addr) ?? `Whale #${index + 1}`;

  // Direction
  const outcome = String(trade.outcome ?? trade.side ?? '');
  const direction = /^y|^yes|^buy/i.test(outcome) ? 'YES' : 'NO';

  // Timestamp
  const ts = trade.timestamp ?? trade.createdAt ?? trade.created_at ?? trade.matchTime ?? trade.match_time;

  let type = 'dormant';
  let stat = 'Notable trade';
  if (usdc >= 500_000) { type = 'consensus'; stat = 'Mega move'; }
  else if (usdc >= 100_000) { type = 'active'; stat = 'Large position'; }
  else if (usdc >= 20_000) { type = 'ghost'; stat = 'Mid-tier whale'; }

  const categoryBadge = {
    crypto: '⚡ Crypto', politics: '🏛 Politics',
    sports: '⚽ Sports', ufc: '🥊 UFC', other: '📊 Market',
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

// --- Mock fallback ---
export const MOCK_WHALES = [
  { id: 1, name: 'Whale #3', type: 'active', badge: '⚽ Sports', market: 'Brazil World Cup', amount: '$280K', direction: 'YES', time: '2 min ago', stat: 'Large position', raw: { category: 'sports' } },
  { id: 2, name: 'Ghost wallet', type: 'ghost', badge: '🥊 UFC', market: 'Chimaev to win', amount: '$500K', direction: 'YES', time: '8 min ago', stat: 'Mid-tier whale', raw: { category: 'ufc' } },
  { id: 3, name: 'Whale #7', type: 'dormant', badge: '🏛 Politics', market: 'Trump 2026 midterms', amount: '$900K', direction: 'NO', time: '22 min ago', stat: 'Notable trade', raw: { category: 'politics' } },
  { id: 4, name: 'BTC Caller', type: 'consensus', badge: '⚡ Crypto', market: 'BTC > $100K by EOY', amount: '$1.8M combined', direction: 'YES', time: '1 hr ago', stat: 'Mega move', raw: { category: 'crypto' } },
];

export async function fetchWhaleActivity() {
  console.log('[Spouter] fetchWhaleActivity START — Gamma trades');
  try {
    // Step 1: top markets by volume
    const markets = await fetchTopMarkets(50);
    if (!markets.length) {
      console.log('[Spouter] No markets, going mock');
      return MOCK_WHALES;
    }

    // Step 2: probe first market to find working URL format, then batch the rest
    const top50 = markets.slice(0, 50);
    // First call is sequential (probe); rest run in parallel once format is known
    const firstTrades = await fetchTradesForMarket(top50[0]);
    const restBatches = await Promise.allSettled(
      top50.slice(1).map((m) => fetchTradesForMarket(m))
    );
    const batches = [
      { status: 'fulfilled', value: firstTrades },
      ...restBatches,
    ];

    batches.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`[Spouter] market[${i}] trades: ${r.value.length}`);
        if (i === 0 && r.value[0]) {
          console.log('[Spouter] First trade keys:', Object.keys(r.value[0]));
          console.log('[Spouter] First trade:', JSON.stringify(r.value[0]));
        }
      } else {
        console.log(`[Spouter] market[${i}] FAILED:`, r.reason?.message);
      }
    });

    // Pair each trade with its market question
    const allPairs = batches.flatMap((r, i) =>
      r.status === 'fulfilled'
        ? r.value.map((trade) => ({
            trade,
            question: top50[i].question ?? top50[i].title ?? '',
          }))
        : []
    );
    console.log('[Spouter] Total trades collected:', allPairs.length);

    if (!allPairs.length) {
      console.log('[Spouter] No trades at all, going mock');
      return MOCK_WHALES;
    }

    // Log USDC distribution
    const usdcValues = allPairs.map(({ trade }) => extractUsdc(trade)).sort((a, b) => b - a);
    console.log('[Spouter] Top 5 USDC:', usdcValues.slice(0, 5).map((v) => `$${Math.round(v)}`).join(', '));
    console.log('[Spouter] Median USDC:', `$${Math.round(usdcValues[Math.floor(usdcValues.length / 2)])}`);

    // Filter whales
    const whalePairs = allPairs.filter(({ trade }) => extractUsdc(trade) >= WHALE_THRESHOLD_USDC);
    console.log(`[Spouter] Above $${WHALE_THRESHOLD_USDC}: ${whalePairs.length}/${allPairs.length}`);
    const source = whalePairs.length ? whalePairs : allPairs;

    // Deduplicate by wallet, keep largest per address
    const byAddr = new Map();
    for (const pair of source) {
      const addr = pair.trade.proxyWallet ?? pair.trade.maker ?? pair.trade.user ?? pair.trade.id ?? `anon-${Math.random()}`;
      const usdc = extractUsdc(pair.trade);
      if (!byAddr.has(addr) || usdc > extractUsdc(byAddr.get(addr).trade)) {
        byAddr.set(addr, pair);
      }
    }
    console.log('[Spouter] Unique wallets:', byAddr.size);

    const result = [...byAddr.values()]
      .sort((a, b) => extractUsdc(b.trade) - extractUsdc(a.trade))
      .slice(0, 8)
      .map(({ trade, question }, i) => tradeToWhale(trade, question, i));

    console.log('[Spouter] Returning', result.length, 'live whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] ERROR:', err.message);
    return MOCK_WHALES;
  }
}
