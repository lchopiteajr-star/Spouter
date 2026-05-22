import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Animated,
  RefreshControl,
  Share,
  ScrollView,
} from 'react-native';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LiveTracker } from '../services/liveTracker';

const FILTERS = [
  { label: 'All',    min: 0         },
  { label: '$100K+', min: 100_000   },
  { label: '$250K+', min: 250_000   },
  { label: '$500K+', min: 500_000   },
  { label: '$1M+',   min: 1_000_000 },
];

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard({ opacity }) {
  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={[styles.skBox, { width: '85%', height: 16, marginBottom: 10 }]} />
      <View style={[styles.skBox, { width: '60%', height: 14, marginBottom: 14 }]} />
      <View style={[styles.skBox, { width: 100, height: 32, marginBottom: 12 }]} />
      <View style={[styles.skBox, { width: '55%', height: 13 }]} />
    </Animated.View>
  );
}

function SkeletonList() {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <View>
      <SkeletonCard opacity={anim} />
      <SkeletonCard opacity={anim} />
      <SkeletonCard opacity={anim} />
    </View>
  );
}

// ─── Live indicator ───────────────────────────────────────────────────────────

function LiveIndicator({ uniqueWhales }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  return (
    <View style={styles.liveWrap}>
      <View style={styles.liveRow}>
        <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
        <Text style={styles.liveLabel}>LIVE</Text>
      </View>
      <Text style={styles.whaleCount}>
        {'● '}{uniqueWhales} whale{uniqueWhales !== 1 ? 's' : ''} spotted
      </Text>
    </View>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({ activeFilter, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterBar}
    >
      {FILTERS.map((f) => {
        const active = f.min === activeFilter;
        return (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => onSelect(f.min)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Trade card ───────────────────────────────────────────────────────────────

function TradeCard({ item, onPress }) {
  const isYes = item.direction === 'YES';
  const betColor = isYes ? '#00c896' : '#ff4d4d';
  const betLine = `Bet ${item.direction} — ${item.outcome}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🐋 Whale alert on @Spouter!\n${item.pseudonym} just bet ${item.usdcDisplay} on "${item.title}" — ${item.outcome}\nTrack live $100K+ trades on Polymarket 👉 https://spouter.app\n#Polymarket #Spouter #WhaleAlert`,
      });
    } catch (_) {}
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.8}>
      {/* Market name */}
      <Text style={styles.cardTitle}>{item.title || 'Unknown Market'}</Text>

      {/* Plain-English outcome */}
      <Text style={[styles.betLine, { color: betColor }]} numberOfLines={2}>
        {betLine}
      </Text>

      {/* Amount */}
      <Text style={[styles.amount, { color: betColor }]}>{item.usdcDisplay}</Text>

      {/* Footer: pseudonym · time ago + share */}
      <View style={styles.cardFooter}>
        <Text style={styles.footerLeft}>
          <Text style={styles.pseudonym}>{item.pseudonym}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.timeAgo}>{item.timeAgo}</Text>
        </Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.shareBtnText}>Share 🔗</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Empty / Error state ──────────────────────────────────────────────────────

function EmptyState({ loading, isError, onRetry }) {
  if (loading) return <SkeletonList />;
  if (isError) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📡</Text>
        <Text style={styles.emptyText}>Lost connection.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🐋</Text>
      <Text style={styles.emptyText}>No $100K+ trades yet.</Text>
      <Text style={styles.emptySubtext}>Check back soon.</Text>
    </View>
  );
}

// ─── FeedScreen ───────────────────────────────────────────────────────────────

export default function FeedScreen({ navigation }) {
  const [trades, setTrades] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(100_000);
  const trackerRef = useRef(null);
  const autoRefreshRef = useRef(null);

  const effectiveMin = activeFilter === 0 ? 100_000 : activeFilter;

  const filteredTrades = useMemo(
    () => trades.filter((t) => t.usdc >= effectiveMin).sort((a, b) => b.timestamp - a.timestamp),
    [trades, effectiveMin]
  );

  const uniqueWhales = useMemo(
    () => new Set(trades.map((t) => t.wallet).filter(Boolean)).size,
    [trades]
  );

  const handleTrade = useCallback((trade) => {
    setTrades((prev) => {
      const next = [trade, ...prev];
      return next.length > 200 ? next.slice(0, 200) : next;
    });
    setLoading(false);
  }, []);

  const handleStatus = useCallback((s) => {
    setStatus(s);
    if (s !== 'connecting') setLoading(false);
  }, []);

  useEffect(() => {
    const tracker = new LiveTracker({ onTrade: handleTrade, onStatus: handleStatus });
    trackerRef.current = tracker;
    tracker.start();
    autoRefreshRef.current = setInterval(() => {
      if (trackerRef.current) trackerRef.current.refresh();
    }, 60_000);
    return () => {
      tracker.stop();
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [handleTrade, handleStatus]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (trackerRef.current) trackerRef.current.refresh();
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const handleCardPress = useCallback(
    (item) => navigation.navigate('WhaleProfile', { whale: item }),
    [navigation]
  );

  const isError = status === 'error';

  const renderItem = useCallback(
    ({ item }) => <TradeCard item={item} onPress={handleCardPress} />,
    [handleCardPress]
  );

  const listEmpty = useCallback(
    () => (
      <EmptyState
        loading={loading}
        isError={isError}
        onRetry={() => {
          setLoading(true);
          if (trackerRef.current) trackerRef.current.refresh();
        }}
      />
    ),
    [loading, isError]
  );

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>
          spout<Text style={styles.logoAccent}>er</Text>
        </Text>
        <LiveIndicator uniqueWhales={uniqueWhales} />
      </View>

      {/* Filter bar */}
      <FilterBar activeFilter={activeFilter} onSelect={setActiveFilter} />

      {/* Feed */}
      <FlatList
        data={filteredTrades}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c896" />
        }
        ListEmptyComponent={listEmpty}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={10}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },

  // Header
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  logo: { fontSize: 26, fontWeight: '800', color: '#fff' },
  logoAccent: { color: '#ff69b4' },
  liveWrap: { marginTop: 6, gap: 2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00c896' },
  liveLabel: { fontSize: 12, fontWeight: '700', color: '#00c896', letterSpacing: 0.8 },
  whaleCount: { fontSize: 11, color: '#444', marginTop: 1 },

  // Filter bar
  filterScroll: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  filterBar: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterChipActive: { backgroundColor: '#0a2a1a', borderColor: '#00c896' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#666' },
  filterChipTextActive: { color: '#00c896' },

  // Card
  listContent: { padding: 12, paddingBottom: 40 },
  card: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
    marginBottom: 6,
  },
  betLine: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 12,
  },
  amount: {
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: { flex: 1 },
  pseudonym: { fontSize: 13, color: '#ccc', fontWeight: '600' },
  dot: { color: '#333' },
  timeAgo: { fontSize: 12, color: '#555' },
  shareBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  },
  shareBtnText: { fontSize: 12, color: '#888' },

  // Skeleton
  skBox: { backgroundColor: '#1e1e1e', borderRadius: 6 },

  // Empty / Error
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: '#555', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#333' },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#1a1a1a', borderRadius: 10, borderWidth: 1, borderColor: '#333',
  },
  retryText: { fontSize: 14, color: '#00c896', fontWeight: '600' },
});
