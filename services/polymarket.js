// Polymarket public data API — large trades feed
// Docs: https://docs.polymarket.com/#trades
const CLOB_BASE = 'https://clob.polymarket.com';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';

// Minimum USDC size to classify as a "whale" trade
const WHALE_THRESHOLD = 10_000;

async function fetchLargeTrades() {
  const res = await fetch(`${CLOB_BASE}/trades?limit=100`);
  if (!res.ok) throw new Error(`CLOB trades ${res.status}`);
  const data = await res.json();
  const trades = Array.isArray(data) ? data : data.data ?? [];
  return trades.filter((t) => parseFloat(t.size ?? t.usdcSize ?? 0) >= WHALE_THRESHOLD);
}

async function fetchMarketQuestion(conditionId) {
  try {
    const res = await fetch(`${GAMMA_BASE}/markets?condition_id=${conditionId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const markets = Array.isArray(data) ? data : data.data ?? [];
    return markets[0]?.question ?? null;
  } catch {
    return null;
  }
}

// Coarse category detection from a market question string
function detectCategory(question = '') {
  const q = question.toLowerCase();
  if (/bitcoin|btc|eth|crypto|solana/.test(q)) return 'crypto';
  if (/trump|election|president|congress|senate|democrat|republican|political/.test(q)) return 'politics';
  if (/ufc|boxing|fight|mma|canelo/.test(q)) return 'ufc';
  if (/soccer|football|champions|premier|world cup|copa|bundesliga|la liga/.test(q)) return 'sports';
  return 'other';
}

function shortenAddress(addr = '') {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

function formatSize(size) {
  const n = parseFloat(size);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function timeAgo(ts) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

// Map a raw CLOB trade into the whale card shape FeedScreen expects
function tradeToWhale(trade, index, question) {
  const size = parseFloat(trade.size ?? trade.usdcSize ?? 0);
  const side = (trade.side ?? '').toUpperCase();
  const direction = side === 'BUY' ? 'YES' : side === 'SELL' ? 'NO' : (trade.outcome ?? 'YES').toUpperCase();
  const addr = trade.maker ?? trade.proxyWallet ?? '';
  const category = detectCategory(question);

  // Assign a whale archetype by size tier
  let type = 'active';
  let stat = '';
  if (size >= 500_000) { type = 'consensus'; stat = 'Mega move'; }
  else if (size >= 200_000) { type = 'active'; stat = 'Large position'; }
  else if (size >= 50_000) { type = 'ghost'; stat = 'Mid-tier whale'; }
  else { type = 'dormant'; stat = 'Notable trade'; }

  const categoryBadge = {
    crypto: '⚡ Crypto', politics: '🏛 Politics',
    sports: '⚽ Sports', ufc: '🥊 UFC', other: '📊 Market',
  }[category];

  return {
    id: trade.id ?? `trade-${index}`,
    name: shortenAddress(addr) || `Whale #${index + 1}`,
    type,
    badge: categoryBadge,
    market: question ? question.slice(0, 38) : 'Unknown market',
    amount: formatSize(size),
    direction,
    time: timeAgo(trade.created_at ?? trade.timestamp ?? Date.now()),
    stat,
    // raw data passed through to profile screen
    raw: { addr, size, question, category, direction },
  };
}

// --- Mock fallback (shown when API is unavailable) ---
export const MOCK_WHALES = [
  {
    id: 1, name: 'Whale #3', type: 'active', badge: '⚽ Sports',
    market: 'Brazil World Cup', amount: '$280K', direction: 'YES',
    time: '2 min ago', stat: '$1.4M profit', raw: { category: 'sports' },
  },
  {
    id: 2, name: 'Ghost wallet', type: 'ghost', badge: '🥊 UFC',
    market: 'Chimaev to win', amount: '$500K', direction: 'YES',
    time: '8 min ago', stat: 'First ever bet', raw: { category: 'ufc' },
  },
  {
    id: 3, name: 'Whale #7', type: 'dormant', badge: '🏛 Politics',
    market: 'Trump 2026 midterms', amount: '$900K', direction: 'NO',
    time: '22 min ago', stat: 'Just woke up', raw: { category: 'politics' },
  },
  {
    id: 4, name: 'BTC Caller', type: 'consensus', badge: '⚡ Crypto',
    market: 'BTC > $100K by EOY', amount: '$1.8M combined', direction: 'YES',
    time: '1 hr ago', stat: 'Strong signal', raw: { category: 'crypto' },
  },
];

export async function fetchWhaleActivity() {
  try {
    const trades = await fetchLargeTrades();
    if (!trades.length) return MOCK_WHALES;

    // Deduplicate by maker address, keep biggest trade per wallet
    const byAddr = new Map();
    for (const t of trades) {
      const addr = t.maker ?? t.proxyWallet ?? `anon-${t.id}`;
      const existing = byAddr.get(addr);
      const size = parseFloat(t.size ?? t.usdcSize ?? 0);
      if (!existing || size > parseFloat(existing.size ?? existing.usdcSize ?? 0)) {
        byAddr.set(addr, t);
      }
    }

    // Take top 8 whales by trade size
    const top = [...byAddr.values()]
      .sort((a, b) => parseFloat(b.size ?? b.usdcSize ?? 0) - parseFloat(a.size ?? a.usdcSize ?? 0))
      .slice(0, 8);

    // Fetch market questions in parallel (best-effort)
    const questions = await Promise.all(
      top.map((t) => fetchMarketQuestion(t.market ?? t.conditionId).catch(() => null))
    );

    return top.map((t, i) => tradeToWhale(t, i, questions[i] ?? ''));
  } catch (err) {
    console.warn('Polymarket API unavailable, using mock data:', err.message);
    return MOCK_WHALES;
  }
}
