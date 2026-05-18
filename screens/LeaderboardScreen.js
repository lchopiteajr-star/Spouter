import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { fetchWhaleActivity, getCachedWhales, fetchWhalePnl, scoreColor } from '../services/polymarket';

const ACCENT    = { active: '#00c896', ghost: '#00aaff', dormant: '#a07fff', consensus: '#7fff9b' };
const ACCENT_BG = { active: '#0a2a1a', ghost: '#0b1220', dormant: '#0c0a18', consensus: '#0a1408' };

// ── Animated leaderboard row ──────────────────────────────────────────────────

function LeaderRow({ whale, rank, onPress, animDelay, showPnl }) {
  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 280, delay: animDelay, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, delay: animDelay, useNativeDriver: true }),
    ]).start();
  }, []);

  const accent   = ACCENT[whale.type]    ?? '#00c896';
  const avatarBg = ACCENT_BG[whale.type] ?? '#0a2a1a';
  const shortAddr = whale.raw?.addr?.length >= 10
    ? `${whale.raw.addr.slice(0, 6)}…${whale.raw.addr.slice(-4)}`
    : whale.raw?.addr ?? '';
  const pnlStr = whale.pnl?.formatted ?? null;
  const pnlPos = pnlStr?.startsWith('+');
  const sc     = scoreColor(whale.score ?? 1);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <Text style={[styles.rank, { color: rank < 3 ? '#00c896' : '#555' }]}>#{rank + 1}</Text>
        <View style={[styles.avatar, { backgroundColor: avatarBg, borderColor: accent + '44', borderWidth: 1 }]}>
          <Text style={[styles.avatarText, { color: accent }]}>
            {(whale.type?.[0] ?? 'W').toUpperCase()}
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.whaleName}>{whale.name}</Text>
          {shortAddr ? <Text style={styles.walletAddr}>{shortAddr}</Text> : null}
          <View style={styles.infoBottom}>
            <Text style={styles.badgeText}>{whale.badge ?? '📊 Other'}</Text>
            <View style={[styles.scoreChip, { backgroundColor: sc + '22' }]}>
              <Text style={[styles.scoreText, { color: sc }]}>{whale.score ?? '—'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.stats}>
          {showPnl && pnlStr ? (
            <>
              <Text style={[styles.pnl, { color: pnlPos ? '#00c896' : '#ff5555' }]}>{pnlStr}</Text>
              <Text style={styles.pnlLabel}>total PnL</Text>
            </>
          ) : (
            <>
              <Text style={[styles.pnl, { color: accent }]}>{whale.amount}</Text>
              <Text style={styles.pnlLabel}>biggest trade</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LeaderboardScreen({ navigation }) {
  const [withPnl,    setWithPnl]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activeTab,  setActiveTab]  = useState('pnl');

  const tabAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const cached = getCachedWhales();
        const whales = cached?.length ? cached : await fetchWhaleActivity();

        const pnlResults = await Promise.all(
          whales.map((w) => fetchWhalePnl(w.raw?.addr ?? ''))
        );

        const data = whales.map((w, i) => ({ ...w, pnl: pnlResults[i] }));
        setWithPnl(data);
      } catch {
        setError('Could not load leaderboard.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const switchTab = (tab) => {
    if (tab === activeTab) return;
    Animated.timing(tabAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setActiveTab(tab);
      Animated.timing(tabAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const display = activeTab === 'pnl'
    ? [...withPnl].sort((a, b) => (b.pnl?.totalCashPnl ?? -Infinity) - (a.pnl?.totalCashPnl ?? -Infinity))
    : [...withPnl].sort((a, b) => (b.raw?.usdc ?? 0) - (a.raw?.usdc ?? 0));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Whale board</Text>
        {!loading && <Text style={styles.subtitle}>{display.length} whales ranked</Text>}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[{ key: 'pnl', label: 'Top PnL' }, { key: 'volume', label: 'Top Volume' }].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => switchTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>🏆</Text>
          <ActivityIndicator color="#00c896" style={{ marginBottom: 8 }} />
          <Text style={styles.stateText}>Ranking by profit…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>📡</Text>
          <Text style={styles.stateTitle}>Rankings unavailable.</Text>
          <Text style={styles.stateText}>Check your connection and try again.</Text>
        </View>
      ) : display.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>🐋</Text>
          <Text style={styles.stateTitle}>No whale data yet.</Text>
          <Text style={styles.stateText}>Check the feed first to load whales.</Text>
        </View>
      ) : (
        <Animated.ScrollView
          style={[styles.list, { opacity: tabAnim }]}
          showsVerticalScrollIndicator={false}
        >
          {display.map((whale, i) => (
            <LeaderRow
              key={whale.id}
              whale={whale}
              rank={i}
              animDelay={i * 50}
              showPnl={activeTab === 'pnl'}
              onPress={() => navigation.navigate('WhaleProfile', { whale })}
            />
          ))}
          <View style={{ height: 20 }} />
        </Animated.ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0a0a0a' },
  header:       { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 8 },
  title:        { fontSize: 22, fontWeight: '700', color: '#fff' },
  subtitle:     { fontSize: 11, color: '#555', marginTop: 3 },

  tabs:         { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab:          { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: '#333' },
  tabActive:    { backgroundColor: '#0a2a1a', borderColor: '#00c896' },
  tabText:      { fontSize: 12, fontWeight: '600', color: '#555' },
  tabTextActive:{ color: '#00c896' },

  stateWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  stateEmoji:   { fontSize: 36, marginBottom: 4 },
  stateTitle:   { fontSize: 15, fontWeight: '700', color: '#ccc' },
  stateText:    { fontSize: 12, color: '#555' },

  list:         { flex: 1 },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#141414' },
  rank:         { fontSize: 13, fontWeight: '800', width: 30 },
  avatar:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText:   { fontSize: 10, fontWeight: '800' },
  info:         { flex: 1, gap: 2 },
  infoBottom:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whaleName:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  walletAddr:   { fontSize: 9, color: '#444', fontFamily: 'monospace' },
  badgeText:    { fontSize: 9, color: '#555' },
  scoreChip:    { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  scoreText:    { fontSize: 9, fontWeight: '800' },
  stats:        { alignItems: 'flex-end' },
  pnl:          { fontSize: 14, fontWeight: '800' },
  pnlLabel:     { fontSize: 9, color: '#444', marginTop: 2 },
});
