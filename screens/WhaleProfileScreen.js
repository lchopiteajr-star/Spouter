import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useRef, useMemo } from 'react';
import { computeGrade } from '../services/gradeCache';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(timestamp) {
  const diff = Date.now() / 1000 - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatUsdc(size, price) {
  const usdc = Number(size ?? 0) * Number(price ?? 0);
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${Math.round(usdc / 1_000)}K`;
  return `$${Math.round(usdc)}`;
}

function formatPnl(pnl) {
  const abs = Math.abs(pnl);
  const prefix = pnl >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${Math.round(abs / 1_000)}K`;
  return `${prefix}$${Math.round(abs)}`;
}

function directionFromActivity(raw) {
  const side = (raw.side ?? '').toUpperCase();
  if (side === 'BUY') return 'YES';
  if (side === 'SELL') return 'NO';
  return /^yes/i.test(raw.outcome ?? '') ? 'YES' : 'NO';
}

// ─── Grade scorecard ─────────────────────────────────────────────────────────

const GRADE_COLORS = {
  'A+': { bg: '#0a2a1a', border: '#00c896', text: '#00c896' },
  'A':  { bg: '#0a2a1a', border: '#00c896', text: '#00c896' },
  'B':  { bg: '#0a1527', border: '#00aaff', text: '#00aaff' },
  'C':  { bg: '#2a1500', border: '#f7931a', text: '#f7931a' },
  'D':  { bg: '#2a0a0a', border: '#ff4d4d', text: '#ff4d4d' },
};

function Scorecard({ grade }) {
  if (!grade) return null;
  const colors = GRADE_COLORS[grade.letter] ?? GRADE_COLORS['C'];
  const pnlColor = grade.totalPnl >= 0 ? '#00c896' : '#ff4d4d';
  const avgColor = grade.avgPnl >= 0 ? '#00c896' : '#ff4d4d';

  return (
    <View style={[styles.scorecard, { borderColor: colors.border }]}>
      {/* Grade circle */}
      <View style={[styles.gradeCircle, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <Text style={[styles.gradeLetter, { color: colors.text }]}>{grade.letter}</Text>
      </View>

      {/* Stats */}
      <View style={styles.scoreStats}>
        <View style={styles.scoreStat}>
          <Text style={styles.scoreLabel}>TOTAL PnL</Text>
          <Text style={[styles.scoreValue, { color: pnlColor }]}>
            {formatPnl(grade.totalPnl)}
          </Text>
        </View>
        <View style={styles.scoreDivider} />
        <View style={styles.scoreStat}>
          <Text style={styles.scoreLabel}>WIN RATE</Text>
          <Text style={styles.scoreValue}>
            {(grade.winRate * 100).toFixed(0)}%
          </Text>
        </View>
        <View style={styles.scoreDivider} />
        <View style={styles.scoreStat}>
          <Text style={styles.scoreLabel}>AVG / TRADE</Text>
          <Text style={[styles.scoreValue, { color: avgColor }]}>
            {formatPnl(grade.avgPnl)}
          </Text>
        </View>
      </View>
      <Text style={styles.scoreSub}>Last {grade.resolvedCount} resolved trades</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WhaleProfileScreen({ navigation, route }) {
  const { whale } = route.params ?? {};
  const wallet = whale?.wallet ?? '';
  const pseudonym = whale?.pseudonym ?? 'Unknown';

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const resolvedConditions = useRef(new Set());

  // Fetch activity
  useEffect(() => {
    if (!wallet) { setLoading(false); setError(true); return; }
    setLoading(true);
    setError(false);
    fetch(`https://data-api.polymarket.com/activity?user=${wallet}&limit=100`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setTrades(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [wallet]);

  // Back-fill missing market titles from gamma-api
  useEffect(() => {
    if (!trades.length) return;
    const missing = trades.filter(
      (t) => !t.title && t.conditionId && !resolvedConditions.current.has(t.conditionId)
    );
    if (!missing.length) return;

    missing.forEach((t) => resolvedConditions.current.add(t.conditionId));

    Promise.allSettled(
      missing.slice(0, 30).map((t) =>
        fetch(`https://gamma-api.polymarket.com/markets/${t.conditionId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => ({ conditionId: t.conditionId, title: data?.question ?? null }))
          .catch(() => ({ conditionId: t.conditionId, title: null }))
      )
    ).then((results) => {
      const titleMap = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.title) {
          titleMap[r.value.conditionId] = r.value.title;
        }
      });
      if (Object.keys(titleMap).length === 0) return;
      setTrades((prev) =>
        prev.map((t) =>
          t.conditionId && titleMap[t.conditionId]
            ? { ...t, title: titleMap[t.conditionId] }
            : t
        )
      );
    });
  }, [trades.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = useMemo(() => computeGrade(trades), [trades]);

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.name}>{pseudonym}</Text>
        <Text style={styles.wallet}>{wallet || 'No wallet address'}</Text>

        {/* Grade scorecard */}
        {!loading && !error && <Scorecard grade={grade} />}

        <Text style={styles.sectionTitle}>
          Trade History{trades.length > 0 ? ` (${trades.length})` : ''}
        </Text>

        {loading && <ActivityIndicator color="#00c896" style={{ marginTop: 32 }} />}

        {!loading && error && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.emptyText}>Failed to load activity.</Text>
          </View>
        )}

        {!loading && !error && trades.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🐋</Text>
            <Text style={styles.emptyText}>No activity found.</Text>
          </View>
        )}

        {!loading && !error && trades.map((raw, idx) => {
          const dir = directionFromActivity(raw);
          const isYes = dir === 'YES';
          const rawTitle = raw.title ?? raw.market ?? '';
          const title = rawTitle.length > 55
            ? rawTitle.slice(0, 52) + '…'
            : (rawTitle || 'Unknown Market');
          const amount = formatUsdc(raw.size, raw.price);
          const ago = timeAgo(Number(raw.timestamp ?? 0));
          const outcome = raw.outcome ?? '';
          const pnl = raw.cashPnl != null ? Number(raw.cashPnl) : null;

          return (
            <View key={raw.transactionHash ?? raw.id ?? idx} style={styles.tradeRow}>
              <View style={styles.tradeInfo}>
                <Text style={styles.tradeTitle} numberOfLines={2}>{title}</Text>
                {!!outcome && <Text style={styles.tradeOutcome} numberOfLines={1}>{outcome}</Text>}
                <View style={styles.tradeMeta}>
                  <Text style={styles.tradeMetaText}>{amount} · {ago}</Text>
                  {pnl != null && (
                    <Text style={[styles.tradePnl, { color: pnl >= 0 ? '#00c896' : '#ff4d4d' }]}>
                      {formatPnl(pnl)}
                    </Text>
                  )}
                </View>
              </View>
              <View style={[styles.dirChip, isYes ? styles.chipYes : styles.chipNo]}>
                <Text style={[styles.dirText, isYes ? styles.textYes : styles.textNo]}>{dir}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  backBtn: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 },
  backText: { fontSize: 15, color: '#00c896', fontWeight: '600' },
  content: { padding: 16, paddingBottom: 60 },
  name: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 6 },
  wallet: {
    fontSize: 11, color: '#444', fontFamily: 'monospace', marginBottom: 20, lineHeight: 16,
  },
  // Scorecard
  scorecard: {
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  gradeCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  gradeLetter: { fontSize: 22, fontWeight: '900' },
  scoreStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  scoreStat: { flex: 1, alignItems: 'center' },
  scoreDivider: { width: 1, height: 32, backgroundColor: '#222' },
  scoreLabel: {
    fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 0.6, marginBottom: 4,
  },
  scoreValue: { fontSize: 15, fontWeight: '800', color: '#fff' },
  scoreSub: { fontSize: 10, color: '#333', textAlign: 'center' },
  // Section
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  // Trade rows
  tradeRow: {
    backgroundColor: '#111', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#1e1e1e', flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  tradeInfo: { flex: 1 },
  tradeTitle: { fontSize: 13, color: '#ddd', fontWeight: '600', marginBottom: 3, lineHeight: 18 },
  tradeOutcome: { fontSize: 11, color: '#555', marginBottom: 4 },
  tradeMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tradeMetaText: { fontSize: 11, color: '#444' },
  tradePnl: { fontSize: 11, fontWeight: '700' },
  dirChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, minWidth: 44, alignItems: 'center',
  },
  chipYes: { backgroundColor: '#0a2a1a' },
  chipNo: { backgroundColor: '#2a0a0a' },
  dirText: { fontSize: 12, fontWeight: '700' },
  textYes: { color: '#00c896' },
  textNo: { color: '#ff4d4d' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15, color: '#555' },
});
