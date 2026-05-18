// Polymarket public APIs
// Trade events endpoint: clob.polymarket.com/live-activity/events/{conditionId} (no auth required)
// Markets endpoint:      gamma-api.polymarket.com/markets (public)
const CLOB_BASE = 'https://clob.polymarket.com';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';

const WHALE_THRESHOLD_USDC = 5_000; // $5K minimum in USDC

// Fetch top active markets sorted by volume so we know which conditionIds to watch
async function fetchTopMarkets(limit = 8) {
  const url = `${GAMMA_BASE}/markets?active=true&closed=false&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma markets HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.data ?? data.markets ?? [];
  return list
    .filter((m) => m.conditionId || m.condition_id)
    .map((m) => ({
      conditionId: m.conditionId ?? m.condition_id,
      question: m.question ?? m.title ?? '',
    }));
}

// Public endpoint — returns recent MarketTradeEvent[] for a given market
// Fields per event: event_type, market{condition_id,question,slug},
//   user{address,pseudonym,username}, side, size, price, outcome, timestamp
async function fetchMarketTradeEvents(conditionId) {
  const res = await fetch(`${CLOB_BASE}/live-activity/events/${conditionId}`);
  if (!res.ok) throw new Error(`Trade events HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data ?? [];
}

// USDC value of a trade: size (shares) × price ($/share)
function usdcValue(event) {
  return parseFloat(event.size ?? 0) * parseFloat(event.price ?? 1);
}

function detectCategory(question = '') {
  const q = question.toLowerCase();
  if (/bitcoin|btc|eth|crypto|solana|defi/.test(q)) return 'crypto';
  if (/trump|election|president|congress|senate|democrat|republican|political|tariff/.test(q)) return 'politics';
  if (/ufc|boxing|fight|mma|canelo|fury/.test(q)) return 'ufc';
  if (/soccer|football|champions|premier|world cup|copa|bundesliga|la liga|nba|nfl|mlb/.test(q)) return 'sports';
  return 'other';
}

function displayName(event) {
  const u = event.user ?? {};
  return u.pseudonym || u.username || shortenAddress(u.address ?? '');
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

// Map a MarketTradeEvent + resolved question into the whale card shape
function eventToWhale(event, index) {
  const usdc = usdcValue(event);
  // outcome "Yes"/"No" tells us which token was traded;
  // side BUY/SELL tells us direction relative to that token
  const outcome = (event.outcome ?? 'Yes');
  const side = (event.side ?? 'BUY').toUpperCase();
  const direction =
    (side === 'BUY' && outcome.startsWith('Y')) || (side === 'SELL' && outcome.startsWith('N'))
      ? 'YES' : 'NO';

  const question = event.market?.question ?? '';
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
    id: event.transaction_hash ?? `event-${index}`,
    name: displayName(event) || `Whale #${index + 1}`,
    type,
    badge: categoryBadge,
    market: question.slice(0, 42) || 'Unknown market',
    amount: formatUsdc(usdc),
    direction,
    time: timeAgo(event.timestamp ?? Date.now()),
    stat,
    raw: {
      addr: event.user?.address ?? '',
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
  try {
    // Step 1: get top markets to watch
    const markets = await fetchTopMarkets(8);
    if (!markets.length) {
      console.warn('[Spouter] Gamma API returned no markets');
      return MOCK_WHALES;
    }

    // Step 2: fetch trade events for all markets in parallel
    const eventBatches = await Promise.allSettled(
      markets.map((m) => fetchMarketTradeEvents(m.conditionId))
    );

    // Flatten all events from successful fetches
    const allEvents = eventBatches.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : []
    );

    if (!allEvents.length) {
      console.warn('[Spouter] No trade events returned from any market');
      return MOCK_WHALES;
    }

    // Step 3: filter for whale-sized trades
    const whaleEvents = allEvents.filter((e) => usdcValue(e) >= WHALE_THRESHOLD_USDC);

    if (!whaleEvents.length) {
      console.warn(`[Spouter] No trades >= $${WHALE_THRESHOLD_USDC} found in ${allEvents.length} events`);
      return MOCK_WHALES;
    }

    // Step 4: deduplicate by user address, keep largest trade per wallet
    const byAddr = new Map();
    for (const e of whaleEvents) {
      const addr = e.user?.address ?? e.transaction_hash ?? `anon-${Math.random()}`;
      const existing = byAddr.get(addr);
      if (!existing || usdcValue(e) > usdcValue(existing)) {
        byAddr.set(addr, e);
      }
    }

    // Step 5: sort by USDC size descending, take top 8
    return [...byAddr.values()]
      .sort((a, b) => usdcValue(b) - usdcValue(a))
      .slice(0, 8)
      .map(eventToWhale);

  } catch (err) {
    console.warn('[Spouter] API error, falling back to mock data:', err.message);
    return MOCK_WHALES;
  }
}
