// Polymarket CLOB API — global recent trades, no auth required
const CLOB_BASE = 'https://clob.polymarket.com';

const WHALE_THRESHOLD_USDC = 1_000; // start low until we confirm field names

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

// Called after we confirm field names from logs — maps one trade to a whale card
function tradeToWhale(trade, index) {
  // Log first trade so we can confirm every field name
  if (index === 0) {
    console.log('[Spouter] tradeToWhale field check:', JSON.stringify(trade));
  }

  // Try every plausible USDC size field
  const rawSize = parseFloat(
    trade.size ?? trade.usdcSize ?? trade.amount ?? trade.notional ?? 0
  );
  const price = parseFloat(trade.price ?? 1);
  // If price looks like a share price (0–1), size is shares → multiply
  const usdc = price > 0 && price < 1 ? rawSize * price : rawSize;

  // Wallet address — try every known field name
  const addr =
    trade.maker_address ?? trade.makerAddress ??
    trade.owner ?? trade.proxyWallet ??
    trade.taker ?? '';

  // Display name — pseudonym if present, else shortened address
  const name = trade.pseudonym ?? trade.name ?? shortenAddress(addr) ?? `Whale #${index + 1}`;

  // Market question — try every nesting
  const question =
    trade.title ?? trade.question ??
    trade.market?.question ?? trade.market?.title ??
    trade.outcome_title ?? '';

  // Direction from outcome + side
  const outcome = trade.outcome ?? '';
  const side = (trade.side ?? 'BUY').toUpperCase();
  const direction =
    (side === 'BUY' && outcome.toUpperCase().startsWith('Y')) ||
    (side === 'SELL' && outcome.toUpperCase().startsWith('N'))
      ? 'YES' : 'NO';

  // Timestamp
  const ts = trade.match_time ?? trade.timestamp ?? trade.created_at ?? trade.matchTime ?? Date.now();

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
    id: trade.id ?? trade.transaction_hash ?? trade.transactionHash ?? `trade-${index}`,
    name,
    type,
    badge: categoryBadge,
    market: question.slice(0, 42) || 'Unknown market',
    amount: formatUsdc(usdc),
    direction,
    time: timeAgo(ts),
    stat,
    raw: { addr, usdc, question, category, direction },
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
    const url = `${CLOB_BASE}/trades?limit=50`;
    console.log('[Spouter] Fetching:', url);

    const res = await fetch(url);
    console.log('[Spouter] HTTP status:', res.status);

    if (!res.ok) {
      console.log('[Spouter] Non-OK response, going mock');
      return MOCK_WHALES;
    }

    const raw = await res.text(); // text first so we can log it even if JSON parse fails
    console.log('[Spouter] Raw response (first 500 chars):', raw.slice(0, 500));

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.log('[Spouter] JSON parse failed:', e.message);
      return MOCK_WHALES;
    }

    console.log('[Spouter] Parsed type:', Array.isArray(data) ? 'array' : typeof data);
    if (!Array.isArray(data)) {
      console.log('[Spouter] Top-level keys:', Object.keys(data));
    }

    const trades = Array.isArray(data) ? data : data.data ?? data.trades ?? data.results ?? [];
    console.log('[Spouter] Trade count:', trades.length);

    if (!trades.length) {
      console.log('[Spouter] No trades, going mock');
      return MOCK_WHALES;
    }

    console.log('[Spouter] First trade keys:', Object.keys(trades[0]));
    console.log('[Spouter] First trade:', JSON.stringify(trades[0]));
    console.log('[Spouter] Second trade:', JSON.stringify(trades[1]));

    // Filter for whale-sized trades
    const whaleEvents = trades.filter((t) => {
      const rawSize = parseFloat(t.size ?? t.usdcSize ?? t.amount ?? t.notional ?? 0);
      const price = parseFloat(t.price ?? 1);
      const usdc = price > 0 && price < 1 ? rawSize * price : rawSize;
      return usdc >= WHALE_THRESHOLD_USDC;
    });
    console.log(`[Spouter] Trades >= $${WHALE_THRESHOLD_USDC}: ${whaleEvents.length} / ${trades.length}`);

    const topUsdc = trades.map((t) => {
      const rawSize = parseFloat(t.size ?? t.usdcSize ?? t.amount ?? t.notional ?? 0);
      const price = parseFloat(t.price ?? 1);
      return price > 0 && price < 1 ? rawSize * price : rawSize;
    }).sort((a, b) => b - a).slice(0, 5);
    console.log('[Spouter] Top 5 computed USDC values:', topUsdc.map((v) => `$${Math.round(v)}`).join(', '));

    if (!whaleEvents.length) {
      console.log('[Spouter] Nothing above threshold, going mock');
      return MOCK_WHALES;
    }

    // Deduplicate by maker address, keep biggest per wallet
    const byAddr = new Map();
    for (const t of whaleEvents) {
      const addr = t.maker_address ?? t.makerAddress ?? t.owner ?? t.proxyWallet ?? t.taker ?? `anon-${t.id}`;
      const rawSize = parseFloat(t.size ?? t.usdcSize ?? t.amount ?? 0);
      const price = parseFloat(t.price ?? 1);
      const usdc = price > 0 && price < 1 ? rawSize * price : rawSize;
      const existing = byAddr.get(addr);
      const existingUsdc = (() => {
        if (!existing) return 0;
        const es = parseFloat(existing.size ?? existing.usdcSize ?? existing.amount ?? 0);
        const ep = parseFloat(existing.price ?? 1);
        return ep > 0 && ep < 1 ? es * ep : es;
      })();
      if (usdc > existingUsdc) byAddr.set(addr, t);
    }
    console.log('[Spouter] Unique wallets:', byAddr.size);

    const result = [...byAddr.values()]
      .sort((a, b) => {
        const calcUsdc = (t) => {
          const s = parseFloat(t.size ?? t.usdcSize ?? t.amount ?? 0);
          const p = parseFloat(t.price ?? 1);
          return p > 0 && p < 1 ? s * p : s;
        };
        return calcUsdc(b) - calcUsdc(a);
      })
      .slice(0, 8)
      .map(tradeToWhale);

    console.log('[Spouter] Returning', result.length, 'live whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] UNEXPECTED ERROR:', err.message, err.stack);
    return MOCK_WHALES;
  }
}
