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
  console.log('[Spouter] fetchWhaleActivity START');
  try {
    // Step 1: get top markets to watch
    console.log('[Spouter] Step 1: fetching markets from Gamma API...');
    let markets;
    try {
      markets = await fetchTopMarkets(8);
    } catch (e) {
      console.log('[Spouter] Step 1 FAILED:', e.message);
      return MOCK_WHALES;
    }
    console.log('[Spouter] Step 1 OK — markets count:', markets.length);
    console.log('[Spouter] Step 1 sample:', JSON.stringify(markets[0]));

    if (!markets.length) {
      console.log('[Spouter] Step 1: no markets returned, going to mock');
      return MOCK_WHALES;
    }

    // Step 2: fetch trade events for all markets in parallel
    console.log('[Spouter] Step 2: fetching trade events for', markets.length, 'markets...');
    const eventBatches = await Promise.allSettled(
      markets.map((m) => fetchMarketTradeEvents(m.conditionId))
    );
    eventBatches.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`[Spouter] Step 2 market[${i}] OK — events:`, r.value.length, '| sample:', JSON.stringify(r.value[0]));
      } else {
        console.log(`[Spouter] Step 2 market[${i}] FAILED:`, r.reason?.message);
      }
    });

    const allEvents = eventBatches.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : []
    );
    console.log('[Spouter] Step 2: total events across all markets:', allEvents.length);

    if (!allEvents.length) {
      console.log('[Spouter] Step 2: no events at all, going to mock');
      return MOCK_WHALES;
    }

    // Step 3: filter for whale-sized trades
    const sample = allEvents[0];
    console.log('[Spouter] Step 3: first raw event keys:', Object.keys(sample));
    console.log('[Spouter] Step 3: first raw event:', JSON.stringify(sample));
    console.log('[Spouter] Step 3: computed usdcValue for first event:', usdcValue(sample));

    const whaleEvents = allEvents.filter((e) => usdcValue(e) >= WHALE_THRESHOLD_USDC);
    console.log(`[Spouter] Step 3: events >= $${WHALE_THRESHOLD_USDC}: ${whaleEvents.length} / ${allEvents.length}`);
    if (allEvents.length > 0) {
      const topUsdc = allEvents.map(usdcValue).sort((a, b) => b - a).slice(0, 5);
      console.log('[Spouter] Step 3: top 5 USDC values seen:', topUsdc.map((v) => `$${Math.round(v)}`).join(', '));
    }

    if (!whaleEvents.length) {
      console.log('[Spouter] Step 3: nothing above threshold, going to mock');
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
    console.log('[Spouter] Step 4: unique wallets after dedup:', byAddr.size);

    // Step 5: sort by USDC size descending, take top 8
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
