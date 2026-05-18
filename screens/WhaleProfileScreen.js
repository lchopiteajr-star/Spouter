import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import Svg, { Polyline, Defs, LinearGradient, Stop, Path } from 'react-native-svg';

// ── Constants ────────────────────────────────────────────────────────────────

const WALLET = '0x8a791620dd6260079bf849dc5567adc3f2fdc318';
const SLUG   = 'anoin123';
const REFRESH_MS = 30_000;

// ── Step 1: resolve the slug → proxy wallet address ──────────────────────────
// Polymarket creates a proxy wallet (Safe) per user that differs from their EOA.
// The data-api positions endpoint needs the PROXY wallet, not the EOA.
// We try two slug-resolution paths; if both fail we fall back to WALLET as-is.
const SLUG_CANDIDATES = [
  `https://gamma-api.polymarket.com/users?slug=${SLUG}`,
  `https://data-api.polymarket.com/users?slug=${SLUG}`,
];

// ── Step 2: positions (tried after we have a confirmed address) ──────────────
// NOTE: sizeThreshold is dropped — it was filtering everything out in tests.
function buildActiveCandidates(addr) {
  return [
    `https://data-api.polymarket.com/positions?user=${addr}&limit=200`,
    `https://data-api.polymarket.com/positions?user=${addr}&limit=200&sizeThreshold=.01`,
    `https://gamma-api.polymarket.com/positions?user=${addr}&limit=200`,
  ];
}
function buildClosedCandidates(addr) {
  return [
    `https://data-api.polymarket.com/positions?user=${addr}&limit=200&closed=true`,
    `https://gamma-api.polymarket.com/positions?user=${addr}&limit=200&closed=true`,
  ];
}

// ── Step 3: trades — used as a diagnostic fallback to confirm address works ──
function buildTradeCandidate(addr) {
  return `https://data-api.polymarket.com/trades?user=${addr}&limit=5`;
}

const CHART_CANDIDATES = [
  `https://data-api.polymarket.com/portfolio-value?user=${WALLET}&interval=1d`,
  `https://data-api.polymarket.com/value?user=${WALLET}&interval=1d`,
];

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 32;
const CHART_H = 130;
const TIME_TABS = ['1D', '1W', '1M', '1Y', 'YTD', 'ALL'];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUsdc(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${Math.round(abs)}`;
}

function fmtPnl(n) {
  const abs = Math.abs(n);
  const s   = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(2)}M`
             : abs >= 1_000    ? `$${(abs / 1_000).toFixed(1)}K`
             : `$${Math.round(abs)}`;
  return n >= 0 ? `+${s}` : `-${s}`;
}

function fmtShares(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(1);
}

// ── Extract a usable array from any API response shape ───────────────────────

function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data))      return data.data;
  if (Array.isArray(data?.positions)) return data.positions;
  if (Array.isArray(data?.results))   return data.results;
  return [];
}

// ── Normalise one position regardless of which API returned it ───────────────
// data-api fields: avgPrice, curPrice, size, title, outcome, cashPnl, redeemable
// gamma-api fields: may use price, currentPrice, shares, market.question, side

function normalisePosition(p) {
  // Price (0-1 range)
  const avgPrice = parseFloat(
    p.avgPrice ?? p.averagePrice ?? p.price ?? 0
  );
  const curPrice = parseFloat(
    p.curPrice ?? p.currentPrice ?? p.lastTradePrice ?? p.price ?? 0
  );
  // Shares
  const size = parseFloat(p.size ?? p.shares ?? p.amount ?? 0);
  // Values
  const initialValue = size * avgPrice;
  const currentValue = size * curPrice;
  const pnl          = currentValue - initialValue;
  const pnlPct       = initialValue > 0 ? (pnl / initialValue) * 100 : 0;

  // Direction
  const rawSide    = p.outcome ?? p.side ?? p.outcomeTitle ?? '';
  const direction  = /^(yes|up|true|1)/i.test(String(rawSide)) ? 'YES' : 'NO';

  // Market title
  const title = (
    p.title ??
    p.market?.title ??
    p.market?.question ??
    p.question ??
    'Unknown market'
  ).slice(0, 80);

  return {
    title,
    direction,
    avgCents:            (avgPrice * 100).toFixed(1),
    curCents:            (curPrice * 100).toFixed(1),
    shares:              size,
    sharesDisplay:       fmtShares(size),
    initialValue,
    currentValue,
    currentValueDisplay: fmtUsdc(currentValue),
    pnl,
    pnlDisplay:          fmtPnl(pnl),
    pnlPct:              `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
    positive:            pnl >= 0,
    redeemable:          p.redeemable === true,
    won:                 p.cashPnl != null
                           ? parseFloat(p.cashPnl) > 0
                           : pnl > 0,
  };
}

function processPositions(raw) {
  return raw
    .map(normalisePosition)
    .filter((p) => p.currentValue > 0 || p.initialValue > 0)
    .sort((a, b) => b.currentValue - a.currentValue);
}

// ── Fetch with fallback across candidate URLs ─────────────────────────────────
// Logs every attempt so you can see results in Expo logs (Metro terminal / Flipper).

async function fetchWithFallback(candidates, label) {
  const log = [];
  for (const url of candidates) {
    try {
      console.log(`[${label}] trying:`, url);
      const res = await fetch(url);
      console.log(`[${label}] HTTP ${res.status} from`, url);
      const text = await res.text();
      console.log(`[${label}] raw response (first 400 chars):`, text.slice(0, 400));

      if (!res.ok) {
        log.push({ url, error: `HTTP ${res.status}`, preview: text.slice(0, 100) });
        continue;
      }

      let data;
      try { data = JSON.parse(text); } catch {
        log.push({ url, error: 'JSON parse failed', preview: text.slice(0, 100) });
        continue;
      }

      const arr = extractArray(data);
      console.log(`[${label}] array length:`, arr.length,
        arr.length ? '— first item keys: ' + Object.keys(arr[0]).join(', ') : '(empty)');

      if (arr.length > 0) return { arr, url, log };
      log.push({ url, error: 'empty array', preview: text.slice(0, 100) });
    } catch (e) {
      console.log(`[${label}] network error:`, e.message);
      log.push({ url, error: e.message });
    }
  }
  return { arr: [], url: null, log };
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

function PnlChart({ points, totalPnl }) {
  const data = points.length >= 2 ? points : (() => {
    const trend = totalPnl >= 0 ? 1 : -1;
    return Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      return 0.5 + trend * t * 0.38 + Math.sin(i * 2.3) * 0.08 * (1 - t * 0.5);
    });
  })();

  const minV  = Math.min(...data);
  const maxV  = Math.max(...data);
  const range = maxV - minV || 1;
  const pad   = 6;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (CHART_W - pad * 2),
    y: CHART_H - pad - ((v - minV) / range) * (CHART_H - pad * 2),
  }));

  const polyStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const areaD   = [
    `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`,
    `L ${pts[pts.length - 1].x} ${CHART_H - pad}`,
    `L ${pts[0].x} ${CHART_H - pad} Z`,
  ].join(' ');

  const color = totalPnl >= 0 ? '#00c896' : '#ff5555';
  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaD} fill="url(#grad)" />
      <Polyline points={polyStr} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Direction chip ────────────────────────────────────────────────────────────

function DirChip({ direction }) {
  const yes = direction === 'YES';
  return (
    <View style={[styles.dirChip, { backgroundColor: yes ? '#0a2a1a' : '#2a0a0a' }]}>
      <Text style={[styles.dirText, { color: yes ? '#00c896' : '#ff5555' }]}>
        {yes ? '↑ YES' : '↓ NO'}
      </Text>
    </View>
  );
}

// ── Active position row ───────────────────────────────────────────────────────

function ActiveRow({ pos, isLast }) {
  const c = pos.positive ? '#00c896' : '#ff5555';
  return (
    <View style={[styles.posRow, isLast && styles.posRowLast]}>
      <Text style={styles.posTitle} numberOfLines={2}>{pos.title}</Text>
      <View style={styles.posMeta}>
        <DirChip direction={pos.direction} />
        <Text style={styles.posShares}>{pos.sharesDisplay} shares</Text>
      </View>
      <View style={styles.posDetail}>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Avg</Text>
          <Text style={styles.posDetailVal}>{pos.avgCents}¢</Text>
        </View>
        <Text style={styles.posDot}>·</Text>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Now</Text>
          <Text style={[styles.posDetailVal, { color: '#ddd' }]}>{pos.curCents}¢</Text>
        </View>
        <Text style={styles.posDot}>·</Text>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Value</Text>
          <Text style={styles.posDetailVal}>{pos.currentValueDisplay}</Text>
        </View>
        <View style={[styles.pnlChip, { backgroundColor: pos.positive ? '#0a2a1a' : '#2a0a0a', marginLeft: 'auto' }]}>
          <Text style={[styles.pnlChipText, { color: c }]}>{pos.pnlDisplay} ({pos.pnlPct})</Text>
        </View>
      </View>
    </View>
  );
}

// ── Closed position row ───────────────────────────────────────────────────────

function ClosedRow({ pos, isLast }) {
  const c    = pos.won ? '#00c896' : '#ff5555';
  const exit = pos.redeemable ? '100.0' : pos.curCents;
  return (
    <View style={[styles.posRow, isLast && styles.posRowLast]}>
      <View style={styles.closedTopRow}>
        <Text style={styles.posTitle} numberOfLines={2}>{pos.title}</Text>
        <View style={[styles.outcomeChip, { backgroundColor: pos.won ? '#0a2a1a' : '#2a0a0a' }]}>
          <Text style={[styles.outcomeText, { color: c }]}>{pos.won ? 'WON' : 'LOST'}</Text>
        </View>
      </View>
      <View style={styles.posMeta}>
        <DirChip direction={pos.direction} />
        <Text style={styles.posShares}>{pos.sharesDisplay} shares</Text>
      </View>
      <View style={styles.posDetail}>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Entry</Text>
          <Text style={styles.posDetailVal}>{pos.avgCents}¢</Text>
        </View>
        <Text style={styles.posArrow}>→</Text>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Exit</Text>
          <Text style={[styles.posDetailVal, { color: c }]}>{exit}¢</Text>
        </View>
        <View style={[styles.pnlChip, { backgroundColor: pos.won ? '#0a2a1a' : '#2a0a0a', marginLeft: 'auto' }]}>
          <Text style={[styles.pnlChipText, { color: c }]}>{pos.pnlDisplay} ({pos.pnlPct})</Text>
        </View>
      </View>
    </View>
  );
}

// ── Debug panel ───────────────────────────────────────────────────────────────

function DebugPanel({ log }) {
  if (!log?.length) return null;
  return (
    <View style={styles.debugPanel}>
      <Text style={styles.debugTitle}>API diagnostic</Text>
      {log.map((entry, i) => (
        <View key={i} style={styles.debugEntry}>
          <Text style={styles.debugUrl} numberOfLines={2}>{entry.url}</Text>
          <Text style={[styles.debugResult, { color: entry.error ? '#ff5555' : '#00c896' }]}>
            {entry.error ?? '✓ data received'}
          </Text>
          {entry.preview ? <Text style={styles.debugPreview} numberOfLines={2}>{entry.preview}</Text> : null}
        </View>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function WhaleProfileScreen({ route, navigation }) {
  const [activePositions, setActivePositions] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [chartPoints,     setChartPoints]     = useState([]);
  const [resolvedAddr,    setResolvedAddr]    = useState(WALLET);
  const [activeLoading,   setActiveLoading]   = useState(true);
  const [closedLoading,   setClosedLoading]   = useState(false);
  const [closedFetched,   setClosedFetched]   = useState(false);
  const [error,           setError]           = useState(null);
  const [debugLog,        setDebugLog]        = useState([]);
  const [posTab,          setPosTab]          = useState('active');
  const [timeTab,         setTimeTab]         = useState('ALL');
  const [lastRefresh,     setLastRefresh]     = useState(null);
  const intervalRef = useRef(null);

  // ── Step 1: resolve slug → proxy wallet address ─────────────────────────────
  const resolveAddress = useCallback(async () => {
    const { arr, url } = await fetchWithFallback(SLUG_CANDIDATES, 'SLUG');
    if (arr.length) {
      // gamma-api returns [{proxyWallet, address, pseudonym, ...}]
      const user  = arr[0];
      const proxy = user.proxyWallet ?? user.proxy_wallet ?? user.address ?? WALLET;
      console.log('[SLUG] resolved', SLUG, '→', proxy, 'via', url);
      console.log('[SLUG] full user object:', JSON.stringify(user).slice(0, 300));
      setResolvedAddr(proxy);
      return proxy;
    }
    console.log('[SLUG] could not resolve slug, using hardcoded WALLET');
    return WALLET;
  }, []);

  // ── Step 2: fetch positions using confirmed address ──────────────────────────
  const loadActive = useCallback(async (addr) => {
    const { arr, url, log } = await fetchWithFallback(buildActiveCandidates(addr), 'ACTIVE');
    setDebugLog(log);

    if (arr.length) {
      setActivePositions(processPositions(arr));
      setLastRefresh(new Date());
      setError(null);
      console.log(`[ACTIVE] loaded ${arr.length} positions from`, url);
    } else {
      // Fallback diagnostic: check if TRADES work for this address
      const tradeUrl = buildTradeCandidate(addr);
      console.log('[DIAGNOSTIC] trying trades endpoint:', tradeUrl);
      try {
        const r = await fetch(tradeUrl);
        const t = await r.text();
        console.log('[DIAGNOSTIC] trades HTTP', r.status, '— first 300 chars:', t.slice(0, 300));
      } catch (e) {
        console.log('[DIAGNOSTIC] trades fetch failed:', e.message);
      }
      setError(`Address ${addr.slice(0, 8)}… returned 0 positions from all endpoints. Check Metro logs for [DIAGNOSTIC] output.`);
    }
    setActiveLoading(false);
  }, []);

  const loadClosed = useCallback(async (addr) => {
    if (closedFetched) return;
    setClosedLoading(true);
    const { arr, url } = await fetchWithFallback(buildClosedCandidates(addr), 'CLOSED');
    if (arr.length) {
      setClosedPositions(processPositions(arr));
      console.log(`[CLOSED] loaded ${arr.length} positions from`, url);
    }
    setClosedLoading(false);
    setClosedFetched(true);
  }, [closedFetched]);

  const loadChart = useCallback(async (addr) => {
    const candidates = CHART_CANDIDATES.map((u) => u.replace(WALLET, addr));
    const { arr } = await fetchWithFallback(candidates, 'CHART');
    if (arr.length) {
      const pts = arr.map((d) => parseFloat(d.value ?? d.portfolioValue ?? d.v ?? 0));
      setChartPoints(pts);
      console.log('[CHART] loaded', pts.length, 'data points');
    }
  }, []);

  // ── Boot sequence ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const addr = await resolveAddress();
      setResolvedAddr(addr);
      await loadActive(addr);
      loadChart(addr);
      intervalRef.current = setInterval(() => loadActive(addr), REFRESH_MS);
    })();
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (posTab === 'closed') loadClosed(resolvedAddr);
  }, [posTab]);

  const allPositions = [...activePositions, ...closedPositions];
  const totalValue   = activePositions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl     = allPositions.reduce((s, p) => s + p.pnl, 0);
  const biggestWin   = allPositions.reduce((best, p) => p.pnl > best ? p.pnl : best, 0);
  const pnlColor     = totalPnl >= 0 ? '#00c896' : '#ff5555';

  const displayList = posTab === 'active' ? activePositions : closedPositions;
  const isLoading   = posTab === 'active' ? activeLoading : closedLoading;

  const secsAgo     = lastRefresh ? Math.round((Date.now() - lastRefresh) / 1000) : null;
  const refreshLabel = secsAgo === null ? '' : secsAgo < 5 ? '● just now' : `● ${secsAgo}s ago`;
  const shortAddr    = `${resolvedAddr.slice(0, 6)}…${resolvedAddr.slice(-4)}`;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.nav}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarLetter}>A</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.handle}>anoin123</Text>
            <Text style={styles.addr}>{shortAddr}</Text>
          </View>
          {refreshLabel ? <Text style={styles.liveLabel}>{refreshLabel}</Text> : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{fmtUsdc(totalValue)}</Text>
            <Text style={styles.statLabel}>Positions Value</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxBorder]}>
            <Text style={[styles.statVal, { color: '#00c896' }]}>
              {biggestWin > 0 ? fmtUsdc(biggestWin) : '—'}
            </Text>
            <Text style={styles.statLabel}>Biggest Win</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxBorder]}>
            <Text style={styles.statVal}>{allPositions.length || '—'}</Text>
            <Text style={styles.statLabel}>Predictions</Text>
          </View>
        </View>

        {/* PnL + time tabs */}
        <View style={styles.pnlSection}>
          <Text style={[styles.pnlBig, { color: pnlColor }]}>{fmtPnl(totalPnl)}</Text>
          <Text style={styles.pnlSub}>Profit / Loss</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }} contentContainerStyle={styles.timeTabs}>
            {TIME_TABS.map((t) => (
              <TouchableOpacity key={t}
                style={[styles.timeTab, timeTab === t && styles.timeTabActive]}
                onPress={() => setTimeTab(t)}>
                <Text style={[styles.timeTabText, timeTab === t && styles.timeTabTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Chart */}
        <View style={styles.chartWrap}>
          <PnlChart points={chartPoints} totalPnl={totalPnl} />
        </View>

        {/* Active / Closed tabs */}
        <View style={styles.posTabRow}>
          {['active', 'closed'].map((tab) => (
            <TouchableOpacity key={tab}
              style={[styles.posTab, posTab === tab && styles.posTabActive]}
              onPress={() => setPosTab(tab)}>
              <Text style={[styles.posTabText, posTab === tab && styles.posTabTextActive]}>
                {tab === 'active'
                  ? `Active${activePositions.length ? ` (${activePositions.length})` : ''}`
                  : `Closed${closedPositions.length ? ` (${closedPositions.length})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Position list */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00c896" />
            <Text style={styles.loadingText}>
              {posTab === 'active' ? 'Fetching live positions…' : 'Loading closed positions…'}
            </Text>
          </View>
        ) : error && posTab === 'active' ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorEmoji}>📡</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadActive}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
            <DebugPanel log={debugLog} />
          </View>
        ) : displayList.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.errorEmoji}>📭</Text>
            <Text style={styles.errorText}>
              {posTab === 'active' ? 'No active positions found.' : 'No closed positions found.'}
            </Text>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.positionsBox}>
              {displayList.map((pos, i) =>
                posTab === 'active'
                  ? <ActiveRow key={i} pos={pos} isLast={i === displayList.length - 1} />
                  : <ClosedRow key={i} pos={pos} isLast={i === displayList.length - 1} />
              )}
            </View>
          </View>
        )}

        {/* Always show debug panel while we're diagnosing */}
        {!activeLoading && debugLog.length > 0 && displayList.length === 0 && posTab === 'active' && (
          <DebugPanel log={debugLog} />
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#080808' },
  nav:             { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 },
  back:            { fontSize: 14, color: '#00c896' },

  identity:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  avatarRing:      { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0a2a1a', borderWidth: 1.5, borderColor: '#00c89666', alignItems: 'center', justifyContent: 'center' },
  avatarLetter:    { fontSize: 18, fontWeight: '800', color: '#00c896' },
  handle:          { fontSize: 18, fontWeight: '800', color: '#fff' },
  addr:            { fontSize: 11, color: '#444', marginTop: 2, fontFamily: 'monospace' },
  liveLabel:       { fontSize: 10, color: '#444' },

  statsRow:        { flexDirection: 'row', marginHorizontal: 16, marginBottom: 20, backgroundColor: '#111', borderRadius: 14, borderWidth: 0.5, borderColor: '#1e1e1e' },
  statBox:         { flex: 1, padding: 14 },
  statBoxBorder:   { borderLeftWidth: 0.5, borderLeftColor: '#1e1e1e' },
  statVal:         { fontSize: 15, fontWeight: '800', color: '#fff' },
  statLabel:       { fontSize: 9, color: '#444', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },

  pnlSection:      { paddingHorizontal: 16, marginBottom: 14 },
  pnlBig:          { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  pnlSub:          { fontSize: 11, color: '#444', marginTop: 2, marginBottom: 12 },
  timeTabs:        { flexDirection: 'row', gap: 6 },
  timeTab:         { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: '#222' },
  timeTabActive:   { backgroundColor: '#1c1c1c', borderColor: '#444' },
  timeTabText:     { fontSize: 12, fontWeight: '600', color: '#444' },
  timeTabTextActive: { color: '#fff' },

  chartWrap:       { paddingHorizontal: 16, marginBottom: 20 },

  posTabRow:       { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 4 },
  posTab:          { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: '#222' },
  posTabActive:    { backgroundColor: '#151515', borderColor: '#555' },
  posTabText:      { fontSize: 13, fontWeight: '600', color: '#444' },
  posTabTextActive:{ color: '#fff' },

  section:         { paddingHorizontal: 16, marginBottom: 16 },
  positionsBox:    { backgroundColor: '#111', borderRadius: 14, borderWidth: 0.5, borderColor: '#1e1e1e', overflow: 'hidden' },

  posRow:          { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#181818', gap: 7 },
  posRowLast:      { borderBottomWidth: 0 },
  posTitle:        { fontSize: 13, color: '#ddd', fontWeight: '600', lineHeight: 18, flex: 1 },

  closedTopRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  outcomeChip:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, flexShrink: 0 },
  outcomeText:     { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  posMeta:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirChip:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  dirText:         { fontSize: 10, fontWeight: '800' },
  posShares:       { fontSize: 11, color: '#555' },

  posDetail:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  posDetailItem:   { alignItems: 'flex-start', gap: 1 },
  posDetailLabel:  { fontSize: 9, color: '#444', textTransform: 'uppercase' },
  posDetailVal:    { fontSize: 12, color: '#aaa', fontWeight: '600' },
  posDot:          { fontSize: 12, color: '#333' },
  posArrow:        { fontSize: 12, color: '#555' },
  pnlChip:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pnlChipText:     { fontSize: 12, fontWeight: '800' },

  center:          { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  errorWrap:       { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16, gap: 10 },
  loadingText:     { fontSize: 13, color: '#444' },
  errorEmoji:      { fontSize: 30 },
  errorText:       { fontSize: 13, color: '#666', textAlign: 'center' },
  retryBtn:        { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 8, borderWidth: 0.5, borderColor: '#00c896' },
  retryText:       { color: '#00c896', fontSize: 13, fontWeight: '600' },

  debugPanel:      { margin: 16, padding: 12, backgroundColor: '#0d0d0d', borderRadius: 10, borderWidth: 0.5, borderColor: '#2a2a2a' },
  debugTitle:      { fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  debugEntry:      { marginBottom: 10 },
  debugUrl:        { fontSize: 9, color: '#444', fontFamily: 'monospace' },
  debugResult:     { fontSize: 11, fontWeight: '700', marginTop: 2 },
  debugPreview:    { fontSize: 9, color: '#333', fontFamily: 'monospace', marginTop: 2 },
});
