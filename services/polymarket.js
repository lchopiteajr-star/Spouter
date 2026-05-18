// Polymarket public APIs (V2 CLOB client + Gamma)
// Trade events: clob.polymarket.com/markets/live-activity/{conditionId}  ← V2 path, no auth
// Markets list: gamma-api.polymarket.com/markets
//
// Real-time Trade field names (from real-time-data-client schema — all top-level):
//   proxyWallet, pseudonym, name, side, size, price, outcome, timestamp,
//   transactionHash, conditionId, title, slug, eventSlug, asset
const CLOB_BASE = 'https://clob.polymarket.com';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';

const WHALE_THRESHOLD_USDC = 5_000;

const SPORTS_KEYWORDS = /soccer|football|nfl|nba|mlb|nhl|champions|premier|world cup|copa|bundesliga|la liga|cricket|tennis|golf|rugby|f1|formula|ufc|boxing|mma|fight|nascar|olympics|super bowl|playoff|tournament|match|game|season|championship/i;

async function fetchTopMarkets(limit = 20) {
  // Sort by volume descending so the busiest markets come first
  const url = `${GAMMA_BASE}/markets?active=true&closed=false&limit=${limit}&order=volume&ascending=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma markets HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.data ?? data.markets ?? [];

  // Filter to sports/UFC markets, fall back to all markets if none match
  const all = list.filter((m) => m.conditionId || m.condition_id);
  const sports = all.filter((m) => SPORTS_KEYWORDS.test(m.question ?? m.title ?? ''));
  const source = sports.length >= 3 ? sports : all;

  console.log(`[Spouter] fetchTopMarkets: ${all.length} total, ${sports.length} sports → using ${source.length}`);

  return source.slice(0, 10).map((m) => ({
    conditionId: m.conditionId ?? m.condition_id,
    question: m.question ?? m.title ?? '',
  }));
}

// V2 path: /markets/live-activity/{conditionId} — public, no auth
// Response is an array of Trade objects with flat field names
async function fetchMarketTradeEvents(conditionId) {
  const res = await fetch(`${CLOB_BASE}/markets/live-activity/${conditionId}`);
  if (!res.ok) throw new Error(`Trade events HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? data.trades ?? [];
}

// Trade field names per real-time-data-client: size (USDC), price (share price)
// size here appears to be raw USDC — confirm via debug logs
function usdcValue(event) {
  // Try both: raw USDC size field, and shares×price calculation
  const rawSize = parseFloat(event.size ?? 0);
  const price = parseFloat(event.price ?? 1);
  // If price is between 0–1 (share price), size is likely in shares → multiply
  // If price > 1 or size looks like a dollar amount, use size directly
  return price > 0 && price <= 1 ? rawSize * price : rawSize;
}

function detectCategory(question = '') {
  const q = question.toLowerCase();
  if (/bitcoin|btc|eth|crypto|solana|defi/.test(q)) return 'crypto';
  if (/trump|election|president|congress|senate|democrat|republican|political|tariff/.test(q)) return 'politics';
  if (/ufc|boxing|fight|mma|canelo|fury/.test(q)) return 'ufc';
  if (/soccer|football|champions|premier|world cup|copa|bundesliga|la liga|nba|nfl|mlb/.test(q)) return 'sports';
  return 'other';
}

// All fields are top-level in V2: proxyWallet, pseudonym, name, title, etc.
function displayName(event) {
  return (
    event.pseudonym ||
    event.name ||
    shortenAddress(event.proxyWallet ?? event.user?.address ?? '')
  );
}

function shortenAddress(addr = '') {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

function formatUsdc(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function timeAgo(ts) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}

function eventToWhale(event, index) {
  const usdc = usdcValue(event);
  const outcome = event.outcome ?? 'Yes';
  const side = (event.side ?? 'BUY').toUpperCase();
  const direction =
    (side === 'BUY' && outcome.startsWith('Y')) || (side === 'SELL' && outcome.startsWith('N'))
      ? 'YES' : 'NO';

  // V2: market question is top-level 'title'; fall back to nested market.question
  const question = event.title ?? event.market?.question ?? '';
  const category = detectCategory(question);

  let type = 'active';
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
    id: event.transactionHash ?? event.transaction_hash ?? `event-${index}`,
    name: displayName(event) || `Whale #${index + 1}`,
    type,
    badge: categoryBadge,
    market: question.slice(0, 42) || 'Unknown market',
    amount: formatUsdc(usdc),
    direction,
    time: timeAgo(event.timestamp ?? Date.now()),
    stat,
    raw: {
      addr: event.proxyWallet ?? event.user?.address ?? '',
      usdc,
      question,
      category,
      direction,
    },
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
  console.log('[Spouter] fetchWhaleActivity START');
  try {
    console.log('[Spouter] Step 1: fetching markets from Gamma API...');
    let markets;
    try {
      markets = await fetchTopMarkets(8);
    } catch (e) {
      console.log('[Spouter] Step 1 FAILED:', e.message);
      return MOCK_WHALES;
    }
    console.log('[Spouter] Step 1 OK — markets:', markets.length);
    console.log('[Spouter] Step 1 sample:', JSON.stringify(markets[0]));

    if (!markets.length) {
      console.log('[Spouter] Step 1: no markets, going mock');
      return MOCK_WHALES;
    }

    console.log('[Spouter] Step 2: fetching /markets/live-activity/ for', markets.length, 'markets...');
    const eventBatches = await Promise.allSettled(
      markets.map((m) => fetchMarketTradeEvents(m.conditionId))
    );
    eventBatches.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`[Spouter] Step 2 market[${i}] OK — events: ${r.value.length} | sample:`, JSON.stringify(r.value[0]));
      } else {
        console.log(`[Spouter] Step 2 market[${i}] FAILED:`, r.reason?.message);
      }
    });

    const allEvents = eventBatches.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : []
    );
    console.log('[Spouter] Step 2 total events:', allEvents.length);

    if (!allEvents.length) {
      console.log('[Spouter] Step 2: no events, going mock');
      return MOCK_WHALES;
    }

    const sample = allEvents[0];
    console.log('[Spouter] Step 3 first event keys:', Object.keys(sample));
    console.log('[Spouter] Step 3 first event:', JSON.stringify(sample));
    console.log('[Spouter] Step 3 usdcValue(first):', usdcValue(sample));

    const whaleEvents = allEvents.filter((e) => usdcValue(e) >= WHALE_THRESHOLD_USDC);
    const topUsdc = allEvents.map(usdcValue).sort((a, b) => b - a).slice(0, 5);
    console.log(`[Spouter] Step 3: ${whaleEvents.length}/${allEvents.length} above $${WHALE_THRESHOLD_USDC} | top 5:`, topUsdc.map((v) => `$${Math.round(v)}`).join(', '));

    if (!whaleEvents.length) {
      console.log('[Spouter] Step 3: nothing above threshold, going mock');
      return MOCK_WHALES;
    }

    const byAddr = new Map();
    for (const e of whaleEvents) {
      const addr = e.proxyWallet ?? e.user?.address ?? e.transactionHash ?? `anon-${Math.random()}`;
      const existing = byAddr.get(addr);
      if (!existing || usdcValue(e) > usdcValue(existing)) byAddr.set(addr, e);
    }
    console.log('[Spouter] Step 4: unique wallets:', byAddr.size);

    const result = [...byAddr.values()]
      .sort((a, b) => usdcValue(b) - usdcValue(a))
      .slice(0, 8)
      .map(eventToWhale);
    console.log('[Spouter] Step 5: returning', result.length, 'live whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] UNEXPECTED ERROR:', err.message, err.stack);
    return MOCK_WHALES;
  }
}
