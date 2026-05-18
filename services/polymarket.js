// Data sources:
//   Trades:  The Graph — polymarket/polymarket-matic subgraph (public, no auth)
//   Titles:  Gamma API — gamma-api.polymarket.com/markets (public)
//
// FpmmTransaction schema fields:
//   id, type (Buy|Sell), timestamp (BigInt unix secs), user (address),
//   tradeAmount (BigInt USDC 6-decimal), feeAmount, outcomeIndex (0=Yes 1=No),
//   outcomeTokensAmount, market { id, conditions }

const GRAPH_URL = 'https://api.thegraph.com/subgraphs/name/polymarket/polymarket-matic';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';

// tradeAmount is in USDC with 6 decimal places
const USDC_DECIMALS = 1e6;
const WHALE_THRESHOLD_USDC = 5_000;

// Build the GraphQL query — last 24h, ordered by tradeAmount desc
function buildQuery(since) {
  return {
    query: `{
      fpmmTransactions(
        first: 20
        orderBy: tradeAmount
        orderDirection: desc
        where: {
          timestamp_gte: "${since}"
          type: Buy
        }
      ) {
        id
        type
        timestamp
        tradeAmount
        outcomeIndex
        user
        market {
          id
          conditions
        }
      }
    }`,
  };
}

async function fetchGraphTrades() {
  const since = String(Math.floor(Date.now() / 1000) - 86400); // 24h ago
  const body = buildQuery(since);

  console.log('[Spouter] Graph query since:', since);

  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  console.log('[Spouter] Graph HTTP status:', res.status);
  if (!res.ok) throw new Error(`Graph HTTP ${res.status}`);

  const json = await res.json();
  console.log('[Spouter] Graph raw (first 600):', JSON.stringify(json).slice(0, 600));

  if (json.errors) {
    console.log('[Spouter] Graph errors:', JSON.stringify(json.errors));
    throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  }

  const trades = json?.data?.fpmmTransactions ?? [];
  console.log('[Spouter] Graph trades returned:', trades.length);
  if (trades.length > 0) {
    console.log('[Spouter] First trade:', JSON.stringify(trades[0]));
  }
  return trades;
}

// Best-effort: fetch market title from Gamma API using FPMM address or conditionId
async function fetchMarketTitles(trades) {
  // Collect unique condition IDs (first condition per market)
  const conditionIds = [...new Set(
    trades.map((t) => t.market?.conditions?.[0]).filter(Boolean)
  )];

  if (!conditionIds.length) return {};

  try {
    // Gamma API supports querying by condition_id
    const qs = conditionIds.map((id) => `condition_ids=${id}`).join('&');
    const res = await fetch(`${GAMMA_BASE}/markets?${qs}&limit=${conditionIds.length}`);
    if (!res.ok) throw new Error(`Gamma HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.data ?? [];

    const map = {};
    for (const m of list) {
      const cid = m.conditionId ?? m.condition_id ?? '';
      if (cid) map[cid] = m.question ?? m.title ?? '';
    }
    console.log('[Spouter] Market titles fetched:', Object.keys(map).length, '/', conditionIds.length);
    return map;
  } catch (e) {
    console.log('[Spouter] Title fetch failed (non-fatal):', e.message);
    return {};
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

function timeAgo(unixSecs) {
  const diffMs = Date.now() - unixSecs * 1000;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}

function tradeToWhale(trade, titleMap, index) {
  const usdc = parseInt(trade.tradeAmount, 10) / USDC_DECIMALS;
  const conditionId = trade.market?.conditions?.[0] ?? '';
  const question = titleMap[conditionId] ?? '';
  const category = detectCategory(question);

  // outcomeIndex 0 = Yes/first outcome, 1 = No/second outcome
  // type=Buy always here (we filter to Buy in the query)
  const direction = parseInt(trade.outcomeIndex, 10) === 0 ? 'YES' : 'NO';

  let type = 'dormant';
  let stat = '';
  if (usdc >= 500_000) { type = 'consensus'; stat = 'Mega move'; }
  else if (usdc >= 100_000) { type = 'active'; stat = 'Large position'; }
  else if (usdc >= 20_000) { type = 'ghost'; stat = 'Mid-tier whale'; }
  else { type = 'dormant'; stat = 'Notable trade'; }

  const categoryBadge = {
    crypto: '⚡ Crypto', politics: '🏛 Politics',
    sports: '⚽ Sports', ufc: '🥊 UFC', other: '📊 Market',
  }[category];

  return {
    id: trade.id ?? `trade-${index}`,
    name: shortenAddress(trade.user) || `Whale #${index + 1}`,
    type,
    badge: categoryBadge,
    market: question.slice(0, 42) || `Market ${shortenAddress(trade.market?.id ?? '')}`,
    amount: formatUsdc(usdc),
    direction,
    time: timeAgo(parseInt(trade.timestamp, 10)),
    stat,
    raw: { addr: trade.user ?? '', usdc, question, category, direction },
  };
}

// --- Mock fallback ---
export const MOCK_WHALES = [
  {
    id: 1, name: 'Whale #3', type: 'active', badge: '⚽ Sports',
    market: 'Brazil World Cup', amount: '$280K', direction: 'YES',
    time: '2 min ago', stat: 'Large position', raw: { category: 'sports' },
  },
  {
    id: 2, name: 'Ghost wallet', type: 'ghost', badge: '🥊 UFC',
    market: 'Chimaev to win', amount: '$500K', direction: 'YES',
    time: '8 min ago', stat: 'Mid-tier whale', raw: { category: 'ufc' },
  },
  {
    id: 3, name: 'Whale #7', type: 'dormant', badge: '🏛 Politics',
    market: 'Trump 2026 midterms', amount: '$900K', direction: 'NO',
    time: '22 min ago', stat: 'Notable trade', raw: { category: 'politics' },
  },
  {
    id: 4, name: 'BTC Caller', type: 'consensus', badge: '⚡ Crypto',
    market: 'BTC > $100K by EOY', amount: '$1.8M combined', direction: 'YES',
    time: '1 hr ago', stat: 'Mega move', raw: { category: 'crypto' },
  },
];

export async function fetchWhaleActivity() {
  console.log('[Spouter] fetchWhaleActivity START — using The Graph');
  try {
    const trades = await fetchGraphTrades();

    if (!trades.length) {
      console.log('[Spouter] No trades from Graph, going mock');
      return MOCK_WHALES;
    }

    // Filter by whale threshold
    const whaleTrades = trades.filter(
      (t) => parseInt(t.tradeAmount, 10) / USDC_DECIMALS >= WHALE_THRESHOLD_USDC
    );
    const topAmounts = trades
      .map((t) => parseInt(t.tradeAmount, 10) / USDC_DECIMALS)
      .sort((a, b) => b - a)
      .slice(0, 5)
      .map((v) => `$${Math.round(v)}`);
    console.log(`[Spouter] Threshold filter: ${whaleTrades.length}/${trades.length} above $${WHALE_THRESHOLD_USDC} | top 5:`, topAmounts.join(', '));

    const source = whaleTrades.length ? whaleTrades : trades; // use all if none pass threshold

    // Deduplicate by wallet, keep largest
    const byAddr = new Map();
    for (const t of source) {
      const addr = t.user ?? `anon-${t.id}`;
      const usdc = parseInt(t.tradeAmount, 10) / USDC_DECIMALS;
      const existingUsdc = byAddr.has(addr)
        ? parseInt(byAddr.get(addr).tradeAmount, 10) / USDC_DECIMALS : 0;
      if (usdc > existingUsdc) byAddr.set(addr, t);
    }
    console.log('[Spouter] Unique wallets:', byAddr.size);

    const sorted = [...byAddr.values()]
      .sort((a, b) => parseInt(b.tradeAmount, 10) - parseInt(a.tradeAmount, 10))
      .slice(0, 8);

    // Fetch market titles best-effort
    const titleMap = await fetchMarketTitles(sorted);

    const result = sorted.map((t, i) => tradeToWhale(t, titleMap, i));
    console.log('[Spouter] Returning', result.length, 'live whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] ERROR:', err.message);
    return MOCK_WHALES;
  }
}
