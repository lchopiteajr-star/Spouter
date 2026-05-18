// BUILD v4 — address resolution via trades feed + closed-position fallback
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import Svg, { Polyline, Defs, LinearGradient, Stop, Path } from 'react-native-svg';

console.log('=== WhaleProfileScreen BUILD v4 loaded ===');

// ── Constants ────────────────────────────────────────────────────────────────

const WALLET_HINT = '0x8a791620dd6260079bf849dc5567adc3f2fdc318'; // may be EOA not proxy
const SLUG        = 'anoin123';
const REFRESH_MS  = 30_000;

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

// ── Extract array from any API response shape ─────────────────────────────────

function toArray(data) {
  if (Array.isArray(data))            return data;
  if (Array.isArray(data?.data))      return data.data;
  if (Array.isArray(data?.positions)) return data.positions;
  if (Array.isArray(data?.results))   return data.results;
  return [];
}

// ── Normalise one position record ────────────────────────────────────────────

function normalise(p) {
  const avgPrice     = parseFloat(p.avgPrice ?? p.averagePrice ?? p.price ?? 0);
  const curPrice     = parseFloat(p.curPrice ?? p.currentPrice ?? p.lastPrice ?? 0);
  const size         = parseFloat(p.size ?? p.shares ?? p.amount ?? 0);
  const initialValue = size * avgPrice;
  const currentValue = size * curPrice;
  const pnl          = currentValue - initialValue;
  const pnlPct       = initialValue > 0 ? (pnl / initialValue) * 100 : 0;
  const rawSide      = p.outcome ?? p.side ?? p.outcomeTitle ?? '';
  const direction    = /^(yes|up|true|1)/i.test(String(rawSide)) ? 'YES' : 'NO';
  const title        = (p.title ?? p.market?.title ?? p.market?.question ?? p.question ?? 'Unknown market').slice(0, 80);

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
    won:                 p.cashPnl != null ? parseFloat(p.cashPnl) > 0 : pnl > 0,
  };
}

function processPositions(raw) {
  return raw
    .map(normalise)
    .filter((p) => p.currentValue > 0.01 || p.initialValue > 0.01)
    .sort((a, b) => b.currentValue - a.currentValue);
}

// ── Safe fetch + log ──────────────────────────────────────────────────────────

async function tryFetch(url, label) {
  console.log(`[${label}] GET ${url}`);
  try {
    const res  = await fetch(url);
    const text = await res.text();
    console.log(`[${label}] HTTP ${res.status} — preview: ${text.slice(0, 300)}`);
    if (!res.ok) return { ok: false, status: res.status, text };
    let json;
    try { json = JSON.parse(text); } catch { return { ok: false, status: res.status, text }; }
    return { ok: true, json, text };
  } catch (e) {
    console.log(`[${label}] NETWORK ERROR: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ── Address resolution strategies ────────────────────────────────────────────
// Strategy A: gamma-api /profiles or /users lookup by slug
// Strategy B: scan live trades feed for a trade whose pseudonym === SLUG
// Strategy C: fall back to WALLET_HINT

async function resolveProxyWallet() {
  // A: slug-based lookup
  const slugUrls = [
    `https://gamma-api.polymarket.com/profiles?slug=${SLUG}`,
    `https://gamma-api.polymarket.com/users?slug=${SLUG}`,
    `https://gamma-api.polymarket.com/profiles?handle=${SLUG}`,
    `https://data-api.polymarket.com/users?slug=${SLUG}`,
  ];
  for (const url of slugUrls) {
    const { ok, json } = await tryFetch(url, 'SLUG');
    if (ok && json) {
      const arr  = toArray(json);
      const item = Array.isArray(arr) && arr.length ? arr[0] : (typeof json === 'object' ? json : null);
      if (item) {
        const proxy = item.proxyWallet ?? item.proxy_wallet ?? item.address ?? item.walletAddress;
        console.log('[SLUG] candidate item keys:', Object.keys(item).join(', '));
        if (proxy) {
          console.log('[SLUG] resolved proxy wallet:', proxy);
          return { addr: proxy, source: 'slug-api' };
        }
      }
    }
  }

  // B: scan trades feed
  console.log('[RESOLVE] slug API failed — scanning trades feed for pseudonym:', SLUG);
  const { ok, json } = await tryFetch(
    `https://data-api.polymarket.com/trades?filterType=CASH&filterAmount=1000&limit=500`,
    'TRADES_SCAN'
  );
  if (ok && json) {
    const trades = toArray(json);
    console.log('[TRADES_SCAN] got', trades.length, 'trades');
    if (trades.length) {
      console.log('[TRADES_SCAN] sample trade keys:', Object.keys(trades[0]).join(', '));
    }
    const match = trades.find((t) =>
      (t.pseudonym ?? '').toLowerCase() === SLUG.toLowerCase() ||
      (t.name ?? '').toLowerCase() === SLUG.toLowerCase()
    );
    if (match) {
      console.log('[TRADES_SCAN] found trade for', SLUG, '— proxyWallet:', match.proxyWallet);
      console.log('[TRADES_SCAN] full match:', JSON.stringify(match).slice(0, 300));
      return { addr: match.proxyWallet ?? WALLET_HINT, source: 'trades-scan' };
    }
    console.log('[TRADES_SCAN] no trade matched pseudonym', SLUG);
  }

  // C: fall back to hint
  console.log('[RESOLVE] using WALLET_HINT as fallback:', WALLET_HINT);
  return { addr: WALLET_HINT, source: 'fallback' };
}

// ── Fetch positions for a given address, trying open then closed ──────────────

async function fetchPositions(addr) {
  // Try both open and closed in parallel — anoin123 may have zero OPEN positions
  // (all markets resolved), so closed=true is equally important on first load.
  // No sizeThreshold — it was silently filtering everything.
  const variants = [
    { url: `https://data-api.polymarket.com/positions?user=${addr}&limit=200`, closed: false },
    { url: `https://data-api.polymarket.com/positions?user=${addr}&limit=200&closed=true`, closed: true },
    { url: `https://data-api.polymarket.com/positions?user=${addr}&limit=500&closed=true`, closed: true },
  ];

  const results = await Promise.all(
    variants.map(async ({ url, closed }) => {
      const { ok, json } = await tryFetch(url, closed ? 'CLOSED' : 'OPEN');
      const arr = ok ? toArray(json) : [];
      console.log(`[${closed ? 'CLOSED' : 'OPEN'}] got ${arr.length} positions`);
      if (arr.length) console.log(`[${closed ? 'CLOSED' : 'OPEN'}] first item keys:`, Object.keys(arr[0]).join(', '));
      return { arr, closed };
    })
  );

  const open   = results.find((r) => !r.closed)?.arr ?? [];
  const closed = results.find((r) => r.closed)?.arr ?? [];
  return { open, closed };
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

function PnlChart({ totalPnl }) {
  const trend  = totalPnl >= 0 ? 1 : -1;
  const points = Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    return 0.5 + trend * t * 0.38 + Math.sin(i * 2.3) * 0.08 * (1 - t * 0.4);
  });
  const minV  = Math.min(...points);
  const maxV  = Math.max(...points);
  const range = maxV - minV || 1;
  const pad   = 6;
  const pts   = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (CHART_W - pad * 2),
    y: CHART_H - pad - ((v - minV) / range) * (CHART_H - pad * 2),
  }));
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${pts[pts.length-1].x} ${CHART_H-pad} L ${pts[0].x} ${CHART_H-pad} Z`;
  const col  = totalPnl >= 0 ? '#00c896' : '#ff5555';
  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={col} stopOpacity="0.3" />
          <Stop offset="1" stopColor={col} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#g)" />
      <Polyline points={poly} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" />
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function WhaleProfileScreen({ route, navigation }) {
  const [activePositions, setActivePositions] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [resolvedAddr,    setResolvedAddr]    = useState('');
  const [addrSource,      setAddrSource]      = useState('');
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [posTab,          setPosTab]          = useState('active');
  const [timeTab,         setTimeTab]         = useState('ALL');
  const [lastRefresh,     setLastRefresh]     = useState(null);
  const intervalRef = useRef(null);

  const boot = async () => {
    setLoading(true);
    setError(null);

    const { addr, source } = await resolveProxyWallet();
    setResolvedAddr(addr);
    setAddrSource(source);

    const { open, closed } = await fetchPositions(addr);
    const processedOpen   = processPositions(open);
    const processedClosed = processPositions(closed);

    setActivePositions(processedOpen);
    setClosedPositions(processedClosed);
    setLastRefresh(new Date());

    if (!processedOpen.length && !processedClosed.length) {
      setError(`0 positions found for ${addr.slice(0,8)}… (source: ${source}). Full logs in Metro.`);
    }
    setLoading(false);
  };

  const refreshActive = async () => {
    if (!resolvedAddr) return;
    const { open } = await fetchPositions(resolvedAddr);
    const processed = processPositions(open);
    setActivePositions(processed);
    setLastRefresh(new Date());
  };

  useEffect(() => {
    boot();
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (resolvedAddr) {
      intervalRef.current = setInterval(refreshActive, REFRESH_MS);
      return () => clearInterval(intervalRef.current);
    }
  }, [resolvedAddr]);

  const allPositions = [...activePositions, ...closedPositions];
  const totalValue   = activePositions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl     = allPositions.reduce((s, p) => s + p.pnl, 0);
  const biggestWin   = allPositions.reduce((best, p) => p.pnl > best ? p.pnl : best, 0);
  const pnlColor     = totalPnl >= 0 ? '#00c896' : '#ff5555';

  const displayList  = posTab === 'active' ? activePositions : closedPositions;
  const secsAgo      = lastRefresh ? Math.round((Date.now() - lastRefresh) / 1000) : null;
  const refreshLabel = secsAgo === null ? '' : secsAgo < 5 ? '● live' : `● ${secsAgo}s ago`;
  const shortAddr    = resolvedAddr ? `${resolvedAddr.slice(0,6)}…${resolvedAddr.slice(-4)}` : '…';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.nav}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.buildTag}>v3</Text>
        </View>

        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarLetter}>A</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.handle}>anoin123</Text>
            <Text style={styles.addr}>{shortAddr} {addrSource ? `· ${addrSource}` : ''}</Text>
          </View>
          {refreshLabel ? <Text style={styles.liveLabel}>{refreshLabel}</Text> : null}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00c896" size="large" />
            <Text style={styles.loadingText}>Resolving wallet & fetching positions…</Text>
          </View>
        ) : (
          <>
            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{fmtUsdc(totalValue)}</Text>
                <Text style={styles.statLabel}>Positions Value</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxBorder]}>
                <Text style={[styles.statVal, { color: '#00c896' }]}>{biggestWin > 0 ? fmtUsdc(biggestWin) : '—'}</Text>
                <Text style={styles.statLabel}>Biggest Win</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxBorder]}>
                <Text style={styles.statVal}>{allPositions.length || '—'}</Text>
                <Text style={styles.statLabel}>Predictions</Text>
              </View>
            </View>

            {/* PnL */}
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
              <PnlChart totalPnl={totalPnl} />
            </View>

            {/* Error */}
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
                <TouchableOpacity onPress={boot} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Tabs */}
            <View style={styles.posTabRow}>
              {[
                { key: 'active', label: `Active (${activePositions.length})` },
                { key: 'closed', label: `Closed (${closedPositions.length})` },
              ].map(({ key, label }) => (
                <TouchableOpacity key={key}
                  style={[styles.posTab, posTab === key && styles.posTabActive]}
                  onPress={() => setPosTab(key)}>
                  <Text style={[styles.posTabText, posTab === key && styles.posTabTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Position list */}
            {displayList.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.errorEmoji}>📭</Text>
                <Text style={styles.errorText}>No {posTab} positions found.</Text>
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
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#080808' },
  nav:             { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back:            { fontSize: 14, color: '#00c896' },
  buildTag:        { fontSize: 10, color: '#333', fontFamily: 'monospace' },

  identity:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  avatarRing:      { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0a2a1a', borderWidth: 1.5, borderColor: '#00c89666', alignItems: 'center', justifyContent: 'center' },
  avatarLetter:    { fontSize: 18, fontWeight: '800', color: '#00c896' },
  handle:          { fontSize: 18, fontWeight: '800', color: '#fff' },
  addr:            { fontSize: 10, color: '#444', marginTop: 2, fontFamily: 'monospace' },
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

  errorBanner:     { marginHorizontal: 16, marginBottom: 12, padding: 12, backgroundColor: '#1a0a0a', borderRadius: 10, borderWidth: 0.5, borderColor: '#ff555533', gap: 8 },
  errorBannerText: { fontSize: 11, color: '#ff5555', fontFamily: 'monospace' },

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
  loadingText:     { fontSize: 13, color: '#444' },
  errorEmoji:      { fontSize: 30 },
  errorText:       { fontSize: 13, color: '#666' },
  retryBtn:        { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 8, borderWidth: 0.5, borderColor: '#00c896' },
  retryText:       { color: '#00c896', fontSize: 13, fontWeight: '600' },
});
