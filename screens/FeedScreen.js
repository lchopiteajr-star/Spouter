import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWhaleActivity, getCacheAge, scoreColor } from '../services/polymarket';

const FILTER_KEY = 'spouter_active_filter';

const typeColors = {
  active:    '#00c896',
  ghost:     '#00aaff',
  dormant:   '#a07fff',
  consensus: '#7fff9b',
};

const typeBackground = {
  active:    '#0b1612',
  ghost:     '#0b1220',
  dormant:   '#0c0a18',
  consensus: '#0a1408',
};

const FILTERS = ['All', 'Sports', 'Crypto', 'Politics', 'Entertainment'];

const categoryToFilter = {
  sports:        'Sports',
  crypto:        'Crypto',
  politics:      'Politics',
  entertainment: 'Entertainment',
};

// ── Animated feed card ────────────────────────────────────────────────────────

function WhaleCard({ whale, index, onPress }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const cardColor = typeColors[whale.type]      ?? '#00c896';
  const cardBg    = typeBackground[whale.type]  ?? '#0b1612';
  const sc        = scoreColor(whale.score ?? 0);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: cardBg, borderColor: cardColor + '44' }]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {/* Row 1: score badge · name · wallet · category */}
        <View style={styles.cardTop}>
          <View style={[styles.scoreBadge, { backgroundColor: sc + '22', borderColor: sc + '55' }]}>
            <Text style={[styles.scoreText, { color: sc }]}>{whale.score ?? '—'}</Text>
          </View>
          <Text style={styles.whaleName} numberOfLines={1}>{whale.name}</Text>
          {whale.raw?.addr ? (
            <Text style={styles.walletAddr}>
              {`${whale.raw.addr.slice(0, 5)}…${whale.raw.addr.slice(-3)}`}
            </Text>
          ) : null}
          <View style={[styles.badge, { backgroundColor: cardColor + '22' }]}>
            <Text style={[styles.badgeText, { color: cardColor }]}>{whale.badge ?? '📊 Other'}</Text>
          </View>
        </View>

        {/* Row 2: bet outcome · market title */}
        <View style={styles.cardBetRow}>
          <View style={[styles.direction, { backgroundColor: whale.direction === 'YES' ? '#0a2a1a' : '#2a0a0a' }]}>
            <Text style={[styles.directionText, { color: whale.direction === 'YES' ? '#00c896' : '#ff5555' }]}>
              {whale.direction === 'YES' ? '↑' : '↓'} {whale.bet ?? whale.direction}
            </Text>
          </View>
          <Text style={styles.market} numberOfLines={1}>{whale.market}</Text>
        </View>

        {/* Row 3: amount large */}
        <Text style={[styles.amount, { color: cardColor }]}>{whale.amount}</Text>

        {/* Row 4: date+time · stat */}
        <View style={styles.cardBottom}>
          <Text style={styles.time}>
            {whale.eventDate ? `${whale.eventDate} · ${whale.time}` : whale.time}
          </Text>
          <Text style={[styles.stat, { color: cardColor }]}>{whale.stat}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FeedScreen({ navigation }) {
  const [whales,       setWhales]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [error,        setError]        = useState(null);
  const [cacheAge,     setCacheAge]     = useState(null);

  // Persist filter choice
  useEffect(() => {
    AsyncStorage.getItem(FILTER_KEY).then((v) => { if (v) setActiveFilter(v); });
  }, []);

  const handleFilterChange = useCallback((f) => {
    setActiveFilter(f);
    AsyncStorage.setItem(FILTER_KEY, f);
  }, []);

  const load = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const data = await fetchWhaleActivity(forceRefresh);
      setWhales(data);
      setCacheAge(getCacheAge());
    } catch {
      setError('fetch');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const filtered = activeFilter === 'All'
    ? whales
    : whales.filter((w) => categoryToFilter[w.raw?.category] === activeFilter);

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>spout<Text style={styles.logoGreen}>er</Text></Text>
          <Text style={styles.headerSub}>
            {cacheAge !== null && cacheAge > 0
              ? `● ${whales.length} markets · updated ${cacheAge}m ago`
              : `● live · ${whales.length} active markets`}
          </Text>
        </View>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filter, f === activeFilter && styles.filterActive]}
            onPress={() => handleFilterChange(f)}
          >
            <Text style={[styles.filterText, f === activeFilter && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Body */}
      {loading ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>🐋</Text>
          <ActivityIndicator color="#00c896" style={{ marginBottom: 8 }} />
          <Text style={styles.stateText}>Scanning whale activity…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateEmoji}>📡</Text>
          <Text style={styles.stateTitle}>The whales are hiding.</Text>
          <Text style={styles.stateText}>Pull down to retry.</Text>
          <TouchableOpacity
            onPress={() => { setLoading(true); load(true); }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.feed}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c896" />
          }
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.stateEmoji}>🔍</Text>
              <Text style={styles.stateTitle}>No whales spotted here.</Text>
              <Text style={styles.stateText}>Try a different category or pull to refresh.</Text>
            </View>
          ) : (
            filtered.map((whale, i) => (
              <WhaleCard
                key={whale.id ?? whale.name}
                whale={whale}
                index={i}
                onPress={() => navigation.navigate('WhaleProfile', { whale })}
              />
            ))
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0a0a0a' },
  header:       { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 6 },
  logo:         { fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  logoGreen:    { color: '#00c896' },
  headerSub:    { fontSize: 11, color: '#555', marginTop: 2 },

  filtersScroll: { flexGrow: 0 },
  filters:      { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  filter:       { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: '#333' },
  filterActive: { backgroundColor: '#0a2a1a', borderColor: '#00c896' },
  filterText:   { fontSize: 12, color: '#555' },
  filterTextActive: { color: '#00c896' },

  feed:         { flex: 1, paddingHorizontal: 12 },

  stateWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  stateEmoji:   { fontSize: 36, marginBottom: 4 },
  stateTitle:   { fontSize: 15, fontWeight: '700', color: '#ccc', textAlign: 'center' },
  stateText:    { fontSize: 12, color: '#555', textAlign: 'center' },
  emptyWrap:    { alignItems: 'center', paddingTop: 60, gap: 8 },
  retryBtn:     { marginTop: 8, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, borderColor: '#00c896' },
  retryText:    { color: '#00c896', fontSize: 12, fontWeight: '600' },

  card:         { borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 0.5 },

  cardTop:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  scoreBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5 },
  scoreText:    { fontSize: 10, fontWeight: '800' },
  whaleName:    { fontSize: 13, fontWeight: '700', color: '#fff', flex: 1 },
  walletAddr:   { fontSize: 9, color: '#444', fontFamily: 'monospace' },
  badge:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText:    { fontSize: 10, fontWeight: '600' },

  cardBetRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  direction:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  directionText:{ fontSize: 11, fontWeight: '700' },
  market:       { fontSize: 11, color: '#666', flex: 1 },

  amount:       { fontSize: 22, fontWeight: '800', marginBottom: 6 },

  cardBottom:   { flexDirection: 'row', justifyContent: 'space-between' },
  time:         { fontSize: 10, color: '#555' },
  stat:         { fontSize: 10 },
});
