import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import Svg, { Polyline, Line, Defs, LinearGradient, Stop, Path } from 'react-native-svg';

const WALLET = '0x8a791620dd6260079bf849dc5567adc3f2fdc318';
const API    = `https://data-api.polymarket.com/positions?user=${WALLET}&sizeThreshold=.01&limit=200`;

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 32;
const CHART_H = 140;

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUsdc(n) {
  const abs = Math.abs(n);
  const s   = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M`
             : abs >= 1_000    ? `$${(abs / 1_000).toFixed(1)}K`
             : `$${Math.round(abs)}`;
  return s;
}

function fmtPnl(n) {
  const abs = Math.abs(n);
  const s   = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M`
             : abs >= 1_000    ? `$${(abs / 1_000).toFixed(1)}K`
             : `$${Math.round(abs)}`;
  return n >= 0 ? `+${s}` : `-${s}`;
}

function fmtShares(n) {
  return n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toFixed(1);
}

// ── Process raw API positions ─────────────────────────────────────────────────

function processRaw(raw) {
  return raw.map((p) => {
    const avgPrice = parseFloat(p.avgPrice ?? 0);
    const curPrice = parseFloat(p.curPrice ?? 0);
    const size     = parseFloat(p.size ?? 0);

    const initialValue  = size * avgPrice;
    const currentValue  = size * curPrice;
    const pnl           = currentValue - initialValue;
    const pnlPct        = initialValue > 0 ? (pnl / initialValue) * 100 : 0;

    const outcome  = (p.outcome ?? '').toLowerCase();
    const direction = /^(yes|up)/i.test(outcome) ? 'YES' : 'NO';

    return {
      title:         (p.title ?? p.market?.title ?? 'Unknown market').slice(0, 80),
      direction,
      avgCents:      (avgPrice * 100).toFixed(1),
      curCents:      (curPrice * 100).toFixed(1),
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
    };
  }).sort((a, b) => b.currentValue - a.currentValue);
}

// ── Simple SVG line chart ─────────────────────────────────────────────────────
// Plots portfolio value snapshots. If no time-series data is available from the
// API, we render a synthetic curve shaped by current overall PnL direction.

function PnlChart({ totalPnl }) {
  // Generate 30 synthetic points ending at the current PnL direction.
  // A real implementation would replace this with a /portfolio/value API call.
  const trend  = totalPnl >= 0 ? 1 : -1;
  const points = Array.from({ length: 30 }, (_, i) => {
    const t     = i / 29;
    const noise = (Math.sin(i * 2.3) * 0.15 + Math.cos(i * 1.7) * 0.1);
    return 0.5 + trend * t * 0.35 + noise * (1 - t * 0.5);
  });

  const minV  = Math.min(...points);
  const maxV  = Math.max(...points);
  const range = maxV - minV || 1;
  const pad   = 8;

  const coords = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (CHART_W - pad * 2);
    const y = CHART_H - pad - ((v - minV) / range) * (CHART_H - pad * 2);
    return `${x},${y}`;
  });

  const polyStr = coords.join(' ');
  const color   = totalPnl >= 0 ? '#00c896' : '#ff5555';

  // Filled area path: trace the line then go back along bottom
  const firstPt = coords[0].split(',');
  const lastPt  = coords[coords.length - 1].split(',');
  const areaD   = `M ${polyStr.replace(/,/g, ' ').replace(/ (?=\d)/g, ' L ')} L ${lastPt[0]} ${CHART_H - pad} L ${firstPt[0]} ${CHART_H - pad} Z`;

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaD} fill="url(#grad)" />
      <Polyline points={polyStr} fill="none" stroke={color} strokeWidth="1.5" />
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

// ── Position row ──────────────────────────────────────────────────────────────

function PositionRow({ pos, isLast }) {
  const pnlColor = pos.positive ? '#00c896' : '#ff5555';

  return (
    <View style={[styles.posRow, isLast && styles.posRowLast]}>

      {/* Market title */}
      <Text style={styles.posTitle} numberOfLines={2}>{pos.title}</Text>

      {/* Direction + shares */}
      <View style={styles.posMeta}>
        <DirChip direction={pos.direction} />
        <Text style={styles.posShares}>{pos.sharesDisplay} shares</Text>
      </View>

      {/* Price / value / PnL detail row */}
      <View style={styles.posDetail}>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Avg</Text>
          <Text style={styles.posDetailVal}>{pos.avgCents}¢</Text>
        </View>
        <Text style={styles.posDivider}>·</Text>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Now</Text>
          <Text style={styles.posDetailVal}>{pos.curCents}¢</Text>
        </View>
        <Text style={styles.posDivider}>·</Text>
        <View style={styles.posDetailItem}>
          <Text style={styles.posDetailLabel}>Value</Text>
          <Text style={styles.posDetailVal}>{pos.currentValueDisplay}</Text>
        </View>
        <View style={[styles.pnlChip, { backgroundColor: pos.positive ? '#0a2a1a' : '#2a0a0a' }]}>
          <Text style={[styles.pnlChipText, { color: pnlColor }]}>
            {pos.pnlDisplay} ({pos.pnlPct})
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

const TIME_TABS = ['1D', '1W', '1M', '1Y', 'YTD', 'ALL'];

export default function WhaleProfileScreen({ route, navigation }) {
  const [positions,  setPositions]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activeTab,  setActiveTab]  = useState('ALL');

  const load = useCallback(async () => {
    try {
      setError(null);
      const res  = await fetch(API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw  = Array.isArray(data) ? data : data.data ?? data.positions ?? [];
      setPositions(processRaw(raw));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const totalValue  = positions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl    = positions.reduce((s, p) => s + p.pnl, 0);
  const biggestWin  = positions.reduce((best, p) => p.pnl > best ? p.pnl : best, 0);
  const pnlPositive = totalPnl >= 0;
  const pnlColor    = pnlPositive ? '#00c896' : '#ff5555';

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

        {/* Profile identity */}
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarLetter}>A</Text>
          </View>
          <View>
            <Text style={styles.handle}>anoin123</Text>
            <Text style={styles.addr}>{shortAddr}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00c896" size="large" />
            <Text style={styles.loadingText}>Fetching positions…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorEmoji}>📡</Text>
            <Text style={styles.errorText}>Could not load positions.</Text>
            <Text style={styles.errorSub}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── 4-stat header ─────────────────────────────────────────── */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{fmtUsdc(totalValue)}</Text>
                <Text style={styles.statLabel}>Positions Value</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxMid]}>
                <Text style={[styles.statVal, { color: '#00c896' }]}>
                  {biggestWin > 0 ? fmtUsdc(biggestWin) : '—'}
                </Text>
                <Text style={styles.statLabel}>Biggest Win</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{positions.length}</Text>
                <Text style={styles.statLabel}>Predictions</Text>
              </View>
            </View>

            {/* ── PnL + time filter ─────────────────────────────────────── */}
            <View style={styles.pnlSection}>
              <Text style={[styles.pnlBig, { color: pnlColor }]}>{fmtPnl(totalPnl)}</Text>
              <Text style={styles.pnlSub}>Profit / Loss</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsScroll}
                contentContainerStyle={styles.tabsRow}
              >
                {TIME_TABS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeTab, activeTab === t && styles.timeTabActive]}
                    onPress={() => setActiveTab(t)}
                  >
                    <Text style={[styles.timeTabText, activeTab === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* ── Chart ────────────────────────────────────────────────── */}
            <View style={styles.chartWrap}>
              <PnlChart totalPnl={totalPnl} />
            </View>

            {/* ── Positions list ────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Positions · {positions.length}
              </Text>
              <View style={styles.positionsBox}>
                {positions.map((pos, i) => (
                  <PositionRow
                    key={i}
                    pos={pos}
                    isLast={i === positions.length - 1}
                  />
                ))}
              </View>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#080808' },

  nav:           { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 },
  back:          { fontSize: 14, color: '#00c896' },

  identity:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 24 },
  avatarRing:    { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0a2a1a', borderWidth: 1.5, borderColor: '#00c89688', alignItems: 'center', justifyContent: 'center' },
  avatarLetter:  { fontSize: 18, fontWeight: '800', color: '#00c896' },
  handle:        { fontSize: 18, fontWeight: '800', color: '#fff' },
  addr:          { fontSize: 11, color: '#444', marginTop: 2, fontFamily: 'monospace' },

  // Stats
  statsRow:      { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 24, gap: 8 },
  statBox:       { flex: 1, backgroundColor: '#111', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#1e1e1e' },
  statBoxMid:    { flex: 1 },
  statVal:       { fontSize: 16, fontWeight: '800', color: '#fff' },
  statLabel:     { fontSize: 10, color: '#444', marginTop: 3 },

  // PnL
  pnlSection:    { paddingHorizontal: 16, marginBottom: 12 },
  pnlBig:        { fontSize: 34, fontWeight: '800' },
  pnlSub:        { fontSize: 11, color: '#444', marginTop: 2, marginBottom: 12 },
  tabsScroll:    { flexGrow: 0 },
  tabsRow:       { flexDirection: 'row', gap: 6 },
  timeTab:       { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: '#333' },
  timeTabActive: { backgroundColor: '#1a1a1a', borderColor: '#555' },
  timeTabText:   { fontSize: 12, fontWeight: '600', color: '#555' },

  // Chart
  chartWrap:     { paddingHorizontal: 16, marginBottom: 24 },

  // Positions
  section:       { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle:  { fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  positionsBox:  { backgroundColor: '#111', borderRadius: 14, borderWidth: 0.5, borderColor: '#1e1e1e', overflow: 'hidden' },

  posRow:        { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a', gap: 6 },
  posRowLast:    { borderBottomWidth: 0 },
  posTitle:      { fontSize: 13, color: '#ddd', fontWeight: '600', lineHeight: 18 },

  posMeta:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirChip:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  dirText:       { fontSize: 11, fontWeight: '800' },
  posShares:     { fontSize: 11, color: '#555' },

  posDetail:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  posDetailItem: { alignItems: 'flex-start' },
  posDetailLabel:{ fontSize: 9, color: '#444', textTransform: 'uppercase' },
  posDetailVal:  { fontSize: 12, color: '#aaa', fontWeight: '600' },
  posDivider:    { fontSize: 12, color: '#333' },

  pnlChip:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 'auto' },
  pnlChipText:   { fontSize: 12, fontWeight: '800' },

  // States
  center:        { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },
  loadingText:   { fontSize: 13, color: '#444', marginTop: 8 },
  errorEmoji:    { fontSize: 32 },
  errorText:     { fontSize: 14, color: '#ccc', fontWeight: '700' },
  errorSub:      { fontSize: 11, color: '#444' },
  retryBtn:      { marginTop: 8, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, borderColor: '#00c896' },
  retryText:     { color: '#00c896', fontSize: 13, fontWeight: '600' },
});
