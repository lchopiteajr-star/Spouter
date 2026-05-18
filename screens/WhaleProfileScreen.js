import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import Svg, { Polyline, Defs, LinearGradient, Stop, Path } from 'react-native-svg';

// ── Constants ────────────────────────────────────────────────────────────────

const WALLET   = '0x8a791620dd6260079bf849dc5567adc3f2fdc318';
const BASE_URL = `https://data-api.polymarket.com/positions?user=${WALLET}&sizeThreshold=.01&limit=200`;
const ACTIVE_URL = BASE_URL;
const CLOSED_URL = `${BASE_URL}&closed=true`;
const REFRESH_MS = 30_000;

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

// ── Process API response ──────────────────────────────────────────────────────

function processPositions(raw) {
  return raw
    .map((p) => {
      const avgPrice     = parseFloat(p.avgPrice ?? 0);
      const curPrice     = parseFloat(p.curPrice ?? 0);
      const size         = parseFloat(p.size ?? 0);
      const initialValue = size * avgPrice;
      const currentValue = size * curPrice;
      const pnl          = currentValue - initialValue;
      const pnlPct       = initialValue > 0 ? (pnl / initialValue) * 100 : 0;

      const rawOutcome = p.outcome ?? '';
      const direction  = /^(yes|up)/i.test(rawOutcome) ? 'YES' : 'NO';

      return {
        title:         (p.title ?? p.market?.title ?? 'Unknown market').slice(0, 80),
        direction,
        avgCents:      (avgPrice * 100).toFixed(1),
        curCents:      (curPrice * 100).toFixed(1),
        curPrice,
        shares:        size,
        sharesDisplay: fmtShares(size),
        initialValue,
        currentValue,
        currentValueDisplay: fmtUsdc(currentValue),
        pnl,
        pnlDisplay:    fmtPnl(pnl),
        pnlPct:        `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
        positive:      pnl >= 0,
        redeemable:    p.redeemable === true,
        won:           p.cashPnl != null ? parseFloat(p.cashPnl) > 0 : pnl > 0,
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

function PnlChart({ totalPnl }) {
  const trend  = totalPnl >= 0 ? 1 : -1;
  const points = Array.from({ length: 30 }, (_, i) => {
    const t     = i / 29;
    const noise = Math.sin(i * 2.3) * 0.12 + Math.cos(i * 1.7) * 0.08;
    return 0.5 + trend * t * 0.38 + noise * (1 - t * 0.4);
  });

  const minV  = Math.min(...points);
  const maxV  = Math.max(...points);
  const range = maxV - minV || 1;
  const pad   = 6;

  const pts = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (CHART_W - pad * 2),
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
  const pnlColor = pos.positive ? '#00c896' : '#ff5555';
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
          <Text style={[styles.pnlChipText, { color: pnlColor }]}>
            {pos.pnlDisplay} ({pos.pnlPct})
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Closed position row ───────────────────────────────────────────────────────

function ClosedRow({ pos, isLast }) {
  const won      = pos.won;
  const pnlColor = won ? '#00c896' : '#ff5555';
  const exitCents = pos.redeemable
    ? '100.0'
    : parseFloat(pos.curCents) < 10 ? pos.curCents : pos.curCents;

  return (
    <View style={[styles.posRow, isLast && styles.posRowLast]}>
      <View style={styles.closedTopRow}>
        <Text style={styles.posTitle} numberOfLines={2}>{pos.title}</Text>
        <View style={[styles.outcomeChip, { backgroundColor: won ? '#0a2a1a' : '#2a0a0a' }]}>
          <Text style={[styles.outcomeText, { color: pnlColor }]}>{won ? 'WON' : 'LOST'}</Text>
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
          <Text style={[styles.posDetailVal, { color: pnlColor }]}>{exitCents}¢</Text>
        </View>
        <View style={[styles.pnlChip, { backgroundColor: won ? '#0a2a1a' : '#2a0a0a', marginLeft: 'auto' }]}>
          <Text style={[styles.pnlChipText, { color: pnlColor }]}>
            {pos.pnlDisplay} ({pos.pnlPct})
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function WhaleProfileScreen({ route, navigation }) {
  const [activePositions, setActivePositions] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [activeLoading,   setActiveLoading]   = useState(true);
  const [closedLoading,   setClosedLoading]   = useState(false);
  const [closedFetched,   setClosedFetched]   = useState(false);
  const [error,           setError]           = useState(null);
  const [posTab,          setPosTab]          = useState('active');
  const [timeTab,         setTimeTab]         = useState('ALL');
  const [lastRefresh,     setLastRefresh]     = useState(null);
  const intervalRef = useRef(null);

  // ── Fetch active positions (also used by 30s refresh) ──────────────────────
  const loadActive = useCallback(async () => {
    try {
      const res  = await fetch(ACTIVE_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw  = Array.isArray(data) ? data : data.data ?? data.positions ?? [];
      setActivePositions(processPositions(raw));
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setActiveLoading(false);
    }
  }, []);

  // ── Fetch closed positions (once, on tab switch) ──────────────────────────
  const loadClosed = useCallback(async () => {
    if (closedFetched) return;
    setClosedLoading(true);
    try {
      const res  = await fetch(CLOSED_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw  = Array.isArray(data) ? data : data.data ?? data.positions ?? [];
      setClosedPositions(processPositions(raw));
    } catch {
      // silently fall back to empty — closed endpoint may not be supported
    } finally {
      setClosedLoading(false);
      setClosedFetched(true);
    }
  }, [closedFetched]);

  // Initial load + 30s auto-refresh for active
  useEffect(() => {
    loadActive();
    intervalRef.current = setInterval(loadActive, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [loadActive]);

  // Load closed when tab switches
  useEffect(() => {
    if (posTab === 'closed') loadClosed();
  }, [posTab, loadClosed]);

  // ── Aggregate stats (active + closed combined) ────────────────────────────
  const allPositions   = [...activePositions, ...closedPositions];
  const totalValue     = activePositions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl       = allPositions.reduce((s, p) => s + p.pnl, 0);
  const biggestWin     = allPositions.reduce((best, p) => p.pnl > best ? p.pnl : best, 0);
  const pnlColor       = totalPnl >= 0 ? '#00c896' : '#ff5555';

  const displayList = posTab === 'active' ? activePositions : closedPositions;
  const isLoading   = posTab === 'active' ? activeLoading : closedLoading;

  const secsAgo = lastRefresh ? Math.round((Date.now() - lastRefresh) / 1000) : null;
  const refreshLabel = secsAgo === null ? '' : secsAgo < 5 ? '● just now' : `● ${secsAgo}s ago`;

  const shortAddr = `${WALLET.slice(0, 6)}…${WALLET.slice(-4)}`;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Nav */}
        <View style={styles.nav}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarLetter}>A</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.handle}>anoin123</Text>
            <Text style={styles.addr}>{shortAddr}</Text>
          </View>
          {refreshLabel ? (
            <Text style={styles.liveLabel}>{refreshLabel}</Text>
          ) : null}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{fmtUsdc(totalValue)}</Text>
            <Text style={styles.statLabel}>Positions Value</Text>
          </View>
          <View style={[styles.statBox, { borderLeftWidth: 0.5, borderLeftColor: '#1e1e1e' }]}>
            <Text style={[styles.statVal, { color: '#00c896' }]}>
              {biggestWin > 0 ? fmtUsdc(biggestWin) : '—'}
            </Text>
            <Text style={styles.statLabel}>Biggest Win</Text>
          </View>
          <View style={[styles.statBox, { borderLeftWidth: 0.5, borderLeftColor: '#1e1e1e' }]}>
            <Text style={styles.statVal}>
              {activePositions.length + closedPositions.length || '—'}
            </Text>
            <Text style={styles.statLabel}>Predictions</Text>
          </View>
        </View>

        {/* PnL + time tabs */}
        <View style={styles.pnlSection}>
          <Text style={[styles.pnlBig, { color: pnlColor }]}>{fmtPnl(totalPnl)}</Text>
          <Text style={styles.pnlSub}>Profit / Loss</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.timeTabs}
          >
            {TIME_TABS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.timeTab, timeTab === t && styles.timeTabActive]}
                onPress={() => setTimeTab(t)}
              >
                <Text style={[styles.timeTabText, timeTab === t && styles.timeTabTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Chart */}
        <View style={styles.chartWrap}>
          <PnlChart totalPnl={totalPnl} />
        </View>

        {/* Active / Closed tab switcher */}
        <View style={styles.posTabRow}>
          <TouchableOpacity
            style={[styles.posTab, posTab === 'active' && styles.posTabActive]}
            onPress={() => setPosTab('active')}
          >
            <Text style={[styles.posTabText, posTab === 'active' && styles.posTabTextActive]}>
              Active{activePositions.length > 0 ? ` (${activePositions.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.posTab, posTab === 'closed' && styles.posTabActive]}
            onPress={() => setPosTab('closed')}
          >
            <Text style={[styles.posTabText, posTab === 'closed' && styles.posTabTextActive]}>
              Closed{closedPositions.length > 0 ? ` (${closedPositions.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Positions list */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00c896" />
            <Text style={styles.loadingText}>
              {posTab === 'active' ? 'Fetching live positions…' : 'Loading closed positions…'}
            </Text>
          </View>
        ) : error && posTab === 'active' ? (
          <View style={styles.center}>
            <Text style={styles.errorEmoji}>📡</Text>
            <Text style={styles.errorText}>Could not load positions.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadActive}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : displayList.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.errorEmoji}>📭</Text>
            <Text style={styles.errorText}>
              {posTab === 'active' ? 'No active positions.' : 'No closed positions found.'}
            </Text>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.positionsBox}>
              {displayList.map((pos, i) =>
                posTab === 'active' ? (
                  <ActiveRow key={i} pos={pos} isLast={i === displayList.length - 1} />
                ) : (
                  <ClosedRow key={i} pos={pos} isLast={i === displayList.length - 1} />
                )
              )}
            </View>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#080808' },

  nav:            { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 },
  back:           { fontSize: 14, color: '#00c896' },

  identity:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  avatarRing:     { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0a2a1a', borderWidth: 1.5, borderColor: '#00c89666', alignItems: 'center', justifyContent: 'center' },
  avatarLetter:   { fontSize: 18, fontWeight: '800', color: '#00c896' },
  handle:         { fontSize: 18, fontWeight: '800', color: '#fff' },
  addr:           { fontSize: 11, color: '#444', marginTop: 2, fontFamily: 'monospace' },
  liveLabel:      { fontSize: 10, color: '#444', marginLeft: 'auto' },

  statsRow:       { flexDirection: 'row', marginHorizontal: 16, marginBottom: 20, backgroundColor: '#111', borderRadius: 14, borderWidth: 0.5, borderColor: '#1e1e1e' },
  statBox:        { flex: 1, padding: 14 },
  statVal:        { fontSize: 15, fontWeight: '800', color: '#fff' },
  statLabel:      { fontSize: 9, color: '#444', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },

  pnlSection:     { paddingHorizontal: 16, marginBottom: 14 },
  pnlBig:         { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  pnlSub:         { fontSize: 11, color: '#444', marginTop: 2, marginBottom: 12 },
  timeTabs:       { flexDirection: 'row', gap: 6 },
  timeTab:        { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: '#222' },
  timeTabActive:  { backgroundColor: '#1c1c1c', borderColor: '#444' },
  timeTabText:    { fontSize: 12, fontWeight: '600', color: '#444' },
  timeTabTextActive: { color: '#fff' },

  chartWrap:      { paddingHorizontal: 16, marginBottom: 20 },

  // Active / Closed tabs
  posTabRow:      { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 4 },
  posTab:         { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: '#222' },
  posTabActive:   { backgroundColor: '#151515', borderColor: '#555' },
  posTabText:     { fontSize: 13, fontWeight: '600', color: '#444' },
  posTabTextActive: { color: '#fff' },

  section:        { paddingHorizontal: 16, marginBottom: 16 },
  positionsBox:   { backgroundColor: '#111', borderRadius: 14, borderWidth: 0.5, borderColor: '#1e1e1e', overflow: 'hidden' },

  // Shared row
  posRow:         { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#181818', gap: 7 },
  posRowLast:     { borderBottomWidth: 0 },
  posTitle:       { fontSize: 13, color: '#ddd', fontWeight: '600', lineHeight: 18, flex: 1 },

  // Closed top row
  closedTopRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  outcomeChip:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start', flexShrink: 0 },
  outcomeText:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  posMeta:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirChip:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  dirText:        { fontSize: 10, fontWeight: '800' },
  posShares:      { fontSize: 11, color: '#555' },

  posDetail:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  posDetailItem:  { alignItems: 'flex-start', gap: 1 },
  posDetailLabel: { fontSize: 9, color: '#444', textTransform: 'uppercase' },
  posDetailVal:   { fontSize: 12, color: '#aaa', fontWeight: '600' },
  posDot:         { fontSize: 12, color: '#333' },
  posArrow:       { fontSize: 12, color: '#555' },

  pnlChip:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pnlChipText:    { fontSize: 12, fontWeight: '800' },

  center:         { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  loadingText:    { fontSize: 13, color: '#444' },
  errorEmoji:     { fontSize: 30 },
  errorText:      { fontSize: 13, color: '#666' },
  retryBtn:       { marginTop: 4, paddingHorizontal: 20, paddingVertical: 7, borderRadius: 8, borderWidth: 0.5, borderColor: '#00c896' },
  retryText:      { color: '#00c896', fontSize: 13, fontWeight: '600' },
});
