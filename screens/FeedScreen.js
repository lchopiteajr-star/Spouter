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
import { LiveTracker, CATEGORY_BADGE, CATEGORY_COLOR } from '../services/liveTracker';

const FILTERS = [
  { label: 'All',    min: 0,           proOnly: false },
  { label: '$50K+',  min: 50_000,      proOnly: true  },
  { label: '$100K+', min: 100_000,     proOnly: false },
  { label: '$250K+', min: 250_000,     proOnly: false },
  { label: '$500K+', min: 500_000,     proOnly: false },
  { label: '$1M+',   min: 1_000_000,   proOnly: false },
];

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
    <View style={styles.liveIndicatorWrap}>
      <View style={styles.liveRow}>
        <Animated.View style={[styles.livePulseDot, { opacity: pulse }]} />
        <Text style={styles.liveLabel}>LIVE</Text>
      </View>
      <Text style={styles.whaleSpotted}>
        {'● '}{uniqueWhales} whale{uniqueWhales !== 1 ? 's' : ''} spotted
      </Text>
    </View>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard({ opacity }) {
  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.skRow}>
        <View style={[styles.skBox, { width: 80, height: 18 }]} />
        <View style={[styles.skBox, { width: 50, height: 14 }]} />
      </View>
      <View style={[styles.skBox, { width: '100%', height: 16, marginTop: 10 }]} />
      <View style={[styles.skBox, { width: '70%', height: 16, marginTop: 6 }]} />
      <View style={styles.skRow2}>
        <View style={[styles.skBox, { width: 60, height: 22 }]} />
        <View style={[styles.skBox, { width: 120, height: 14 }]} />
      </View>
      <View style={[styles.skBox, { width: 100, height: 34, marginTop: 10 }]} />
      <View style={[styles.skBox, { width: '60%', height: 14, marginTop: 10 }]} />
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

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({ activeFilter, onSelect, isPro }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterBar}
    >
      {FILTERS.map((f) => {
        const locked = f.proOnly && !isPro;
        const active = f.min === activeFilter;
        return (
          <TouchableOpacity
            key={f.label}
            style={[
              styles.filterChip,
              active && styles.filterChipActive,
              locked && styles.filterChipLocked,
            ]}
            onPress={() => !locked && onSelect(f.min)}
            activeOpacity={locked ? 1 : 0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                active && styles.filterChipTextActive,
                locked && styles.filterChipTextLocked,
              ]}
            >
              {f.label}
            </Text>
            {locked && <Text style={styles.proTag}> PRO</Text>}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── WhaleTrade card ──────────────────────────────────────────────────────────

function WhaleTrade({ item, onPress }) {
  const badgeLabel = CATEGORY_BADGE[item.category] ?? CATEGORY_BADGE.other;
  const badgeColor = CATEGORY_COLOR[item.category] ?? CATEGORY_COLOR.other;
  const isYes = item.direction === 'YES';
  const amountColor = isYes ? '#00c896' : '#ff4d4d';
  const outcomeText =
    item.outcome.length > 60 ? item.outcome.slice(0, 57) + '…' : item.outcome;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🐋 Whale alert on @Spouter: ${item.pseudonym} just bet ${item.usdcDisplay} on "${item.title}" — ${item.outcome}\nTrack live whale trades on Polymarket 👉 https://spouter.app\n#Polymarket #Spouter #WhaleAlert`,
      });
    } catch (_) {}
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress && onPress(item)} activeOpacity={0.8}>
      {/* Row 1 */}
      <View style={styles.cardRow}>
        <View style={[styles.badge, { borderColor: badgeColor }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
        <Text style={styles.timeAgo}>{item.timeAgo}</Text>
      </View>

      {/* Row 2 */}
      <Text style={styles.cardTitle}>{item.title}</Text>

      {/* Row 3 */}
      <View style={styles.cardRow}>
        <View style={[styles.chip, isYes ? styles.chipYes : styles.chipNo]}>
          <Text style={[styles.chipText, isYes ? styles.chipTextYes : styles.chipTextNo]}>
            BET {item.direction}
          </Text>
        </View>
        <Text style={styles.outcomeText} numberOfLines={1}>{outcomeText}</Text>
      </View>

      {/* Row 4 */}
      <Text style={[styles.amount, { color: amountColor }]}>{item.usdcDisplay}</Text>

      {/* Row 5 */}
      <View style={styles.cardRow}>
        <Text style={styles.walletLine}>
          <Text style={styles.pseudonym}>{item.pseudonym}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.walletShort}>{item.walletShort}</Text>
        </Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>Share 🔗</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Empty / Error state ─────────────────────────────────────────────────────
// Defined outside FeedScreen so FlatList doesn't remount it on every render.

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
      <Text style={styles.emptyText}>No trades matched this filter.</Text>
      <Text style={styles.emptySubtext}>Check back soon or try a lower threshold.</Text>
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
  const isPro = false;
  const trackerRef = useRef(null);
  const autoRefreshRef = useRef(null);

  const tierMin = isPro ? 50_000 : 100_000;
  const effectiveMin = activeFilter === 0 ? tierMin : activeFilter;

  const filteredTrades = useMemo(
    () =>
      trades
        .filter((t) => t.usdc >= effectiveMin)
        .sort((a, b) => b.timestamp - a.timestamp),
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
    const tracker = new LiveTracker({
      onTrade: handleTrade,
      onStatus: handleStatus,
    });
    trackerRef.current = tracker;
    tracker.start();

    // Auto-refresh every 60s for empty/error states
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
    (item) => {
      navigation.navigate('WhaleProfile', { whale: item });
    },
    [navigation]
  );

  const isError = status === 'error';

  const renderItem = useCallback(
    ({ item }) => <WhaleTrade item={item} onPress={handleCardPress} />,
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
      <FilterBar activeFilter={activeFilter} onSelect={setActiveFilter} isPro={isPro} />

      {/* Feed */}
      <FlatList
        data={filteredTrades}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00c896"
          />
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
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  logoAccent: {
    color: '#ff69b4',
  },
  // Live indicator
  liveIndicatorWrap: {
    marginTop: 8,
    gap: 3,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#00c896',
  },
  liveLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00c896',
    letterSpacing: 0.8,
  },
  whaleSpotted: {
    fontSize: 12,
    color: '#444',
    marginTop: 1,
  },
  // Filter bar
  filterBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterChipActive: {
    backgroundColor: '#0a2a1a',
    borderColor: '#00c896',
  },
  filterChipLocked: {
    opacity: 0.45,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#777',
  },
  filterChipTextActive: {
    color: '#00c896',
  },
  filterChipTextLocked: {
    color: '#555',
  },
  proTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ff69b4',
    letterSpacing: 0.5,
  },
  listContent: {
    padding: 12,
    paddingBottom: 40,
  },
  // Card
  card: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeAgo: {
    fontSize: 11,
    color: '#555',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginVertical: 8,
    lineHeight: 20,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  chipYes: {
    backgroundColor: '#0a2a1a',
  },
  chipNo: {
    backgroundColor: '#2a0a0a',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextYes: {
    color: '#00c896',
  },
  chipTextNo: {
    color: '#ff4d4d',
  },
  outcomeText: {
    fontSize: 12,
    color: '#888',
    flex: 1,
  },
  amount: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
  },
  walletLine: {
    flex: 1,
  },
  pseudonym: {
    fontSize: 13,
    color: '#ccc',
    fontWeight: '600',
  },
  dot: {
    color: '#444',
  },
  walletShort: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'monospace',
  },
  shareBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  },
  shareBtnText: {
    fontSize: 12,
    color: '#aaa',
  },
  // Skeleton
  skRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  skRow2: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  skBox: {
    backgroundColor: '#222',
    borderRadius: 6,
  },
  // Empty / Error
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#444',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  retryText: {
    fontSize: 14,
    color: '#00c896',
    fontWeight: '600',
  },
});
