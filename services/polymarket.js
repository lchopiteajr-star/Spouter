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

// ── Probe positions endpoints ─────────────────────────────────────────────────

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

const LEADERBOARD_ENDPOINTS = [
  `${DATA_API_BASE}/leaderboard/profit?limit=100`,
  `${DATA_API_BASE}/leaderboard/volume?limit=100`,
  `${GAMMA_BASE}/leaderboard?limit=100`,
  `${GAMMA_BASE}/users?limit=100&sortBy=volume&sortDirection=desc`,
];

async function probeLeaderboards() {
  const results = await Promise.allSettled(
    LEADERBOARD_ENDPOINTS.map((url) =>
      fetch(url).then(async (res) => {
        const text = await res.text();
        console.log(`[Spouter] ${url}`);
        console.log(`[Spouter]   → HTTP ${res.status} | first 500: ${text.slice(0, 500)}`);
        return { url, status: res.status, text };
      }).catch((e) => {
        console.log(`[Spouter] ${url} → ERROR: ${e.message}`);
        return { url, status: 0, text: '' };
      })
    )
  );
  // Return the first 200 response that has data
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { status, text, url } = r.value;
    if (status !== 200 || !text || text === '[]' || text === 'null') continue;
    try {
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : data.data ?? data.users ?? data.leaderboard ?? [];
      if (!items.length) continue;
      console.log(`[Spouter] Winner: ${url} (${items.length} items)`);
      console.log('[Spouter] First item keys+values:');
      for (const [k, v] of Object.entries(items[0])) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
      return items;
    } catch { continue; }
  }
  return [];
}

async function fetchWalletPositions(walletAddr) {
  const url = `${DATA_API_BASE}/positions?user=${walletAddr}&limit=20&sortBy=currentValue&sortDirection=desc`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.data ?? data.positions ?? [];
  } catch {
    return [];
  }
}

// Extract wallet address from a leaderboard entry — try every likely field
function extractWallet(entry) {
  return entry.proxyWallet ?? entry.address ?? entry.userAddress ??
    entry.wallet ?? entry.user ?? entry.pseudonym ?? null;
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

// Map a position/holding item → whale card
function positionToWhale(pos, index) {
  // Try every plausible field name for USDC value
  const usdc = parseFloat(
    pos.currentValue ?? pos.value ?? pos.size ?? pos.usdcValue ??
    pos.positionValue ?? pos.marketValue ?? pos.amount ?? 0
  );

  const question = pos.title ?? pos.question ?? pos.market?.title ?? pos.market?.question ?? pos.marketTitle ?? '';
  const category = detectCategory(question);
  const addr = pos.proxyWallet ?? pos.user ?? pos.userAddress ?? pos.wallet ?? pos.address ?? '';
  const name = (pos.pseudonym ?? pos.name ?? pos.username ?? shortenAddress(addr)) || `Whale #${index + 1}`;
  const outcome = pos.outcome ?? pos.side ?? pos.outcomeIndex ?? '';
  const direction = /^(yes|up|buy|1)/i.test(String(outcome)) ? 'YES' : 'NO';
  const ts = pos.timestamp ?? pos.updatedAt ?? pos.updated_at ?? pos.createdAt ?? null;

  let type = 'dormant';
  let stat = 'Open position';
  if (usdc >= 500_000) { type = 'consensus'; stat = 'Mega position'; }
  else if (usdc >= 100_000) { type = 'active'; stat = 'Large position'; }
  else if (usdc >= 20_000) { type = 'ghost'; stat = 'Mid-tier whale'; }
  else if (usdc >= 5_000) { type = 'active'; stat = 'Whale bet'; }

  const categoryBadge = {
    crypto: '⚡ Crypto', politics: '🏛 Politics',
    sports: '⚽ Sports', entertainment: '🎬 Entertainment', other: '📊 Market',
  }[category];

  return {
    id: pos.id ?? pos.proxyWallet ?? `pos-${index}`,
    name,
    type,
    badge: categoryBadge,
    market: question.slice(0, 42) || 'Unknown market',
    amount: formatUsdc(usdc),
    direction,
    time: ts ? timeAgo(ts) : 'live now',
    stat,
    raw: { addr, usdc, question, category, direction },
  };
}

export async function fetchWhaleActivity() {
  console.log('[Spouter] fetchWhaleActivity START — leaderboard → positions');
  try {
    // Step 1: get top wallets from leaderboard
    const leaderboard = await probeLeaderboards();
    if (!leaderboard.length) {
      console.log('[Spouter] No leaderboard data, going mock');
      return MOCK_WHALES;
    }

    // Step 2: extract wallet addresses and fetch their open positions
    const wallets = leaderboard
      .map(extractWallet)
      .filter(Boolean)
      .filter((w) => w.startsWith('0x')) // only real addresses, not pseudonyms
      .slice(0, 20); // top 20 wallets
    console.log(`[Spouter] Fetching positions for ${wallets.length} wallets`);

    const positionBatches = await Promise.allSettled(
      wallets.map(fetchWalletPositions)
    );

    const successCount = positionBatches.filter(
      (r) => r.status === 'fulfilled' && r.value.length > 0
    ).length;
    console.log(`[Spouter] Wallets with positions: ${successCount}/${wallets.length}`);

    // Log first successful position result to confirm field names
    const firstSuccess = positionBatches.find(
      (r) => r.status === 'fulfilled' && r.value.length > 0
    );
    if (firstSuccess?.value?.[0]) {
      console.log('[Spouter] First position keys+values:');
      for (const [k, v] of Object.entries(firstSuccess.value[0])) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }

    // Flatten: one entry per wallet — their largest position
    const allPositions = positionBatches.flatMap((r, i) => {
      if (r.status !== 'fulfilled' || !r.value.length) return [];
      // Keep only the biggest position per wallet and attach the wallet addr
      const sorted = [...r.value].sort((a, b) =>
        parseFloat(b.currentValue ?? b.value ?? b.size ?? b.amount ?? 0) -
        parseFloat(a.currentValue ?? a.value ?? a.size ?? a.amount ?? 0)
      );
      return [{ ...sorted[0], _wallet: wallets[i] }];
    });

    console.log('[Spouter] Positions collected:', allPositions.length);

    const topVals = allPositions
      .slice(0, 8)
      .map((p) => `$${Math.round(parseFloat(p.currentValue ?? p.value ?? p.size ?? p.amount ?? 0))}`);
    console.log('[Spouter] Top values:', topVals.join(', '));

    // Filter out micro markets
    const real = allPositions.filter(
      (p) => !MICRO_MARKET.test(p.title ?? p.question ?? p.marketTitle ?? '')
    );
    const source = real.length ? real : allPositions;

    const result = source
      .sort((a, b) =>
        parseFloat(b.currentValue ?? b.value ?? b.size ?? b.amount ?? 0) -
        parseFloat(a.currentValue ?? a.value ?? a.size ?? a.amount ?? 0)
      )
      .slice(0, 8)
      .map(positionToWhale);

    console.log('[Spouter] Returning', result.length, 'whale cards');
    return result;

  } catch (err) {
    console.log('[Spouter] ERROR:', err.message);
    return MOCK_WHALES;
  }
}
