import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';

function timeAgo(timestamp) {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
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

function directionFromTrade(raw) {
  const test = `${raw.outcome ?? ''} ${raw.side ?? ''}`.toLowerCase();
  return /^(yes|up|buy)/.test(test) ? 'YES' : 'NO';
}

export default function WhaleProfileScreen({ navigation, route }) {
  const { whale } = route.params ?? {};
  const wallet = whale?.wallet ?? '';
  const pseudonym = whale?.pseudonym ?? 'Unknown';

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    fetch(`https://data-api.polymarket.com/trades?user=${wallet}&limit=10`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setTrades(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [wallet]);

  const direction = (raw) => directionFromTrade(raw);

  return (
    <View style={styles.screen}>
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Name */}
        <Text style={styles.name}>{pseudonym}</Text>

        {/* Wallet */}
        <Text style={styles.wallet}>{wallet || 'No wallet address'}</Text>

        {/* Trades section */}
        <Text style={styles.sectionTitle}>Last 10 Trades</Text>

        {loading && (
          <ActivityIndicator color="#00c896" style={{ marginTop: 32 }} />
        )}

        {!loading && error && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.emptyText}>Failed to load trades.</Text>
          </View>
        )}

        {!loading && !error && trades.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🐋</Text>
            <Text style={styles.emptyText}>No trades found.</Text>
          </View>
        )}

        {!loading && !error && trades.map((raw, idx) => {
          const dir = direction(raw);
          const isYes = dir === 'YES';
          const title = (raw.title ?? '').length > 50
            ? (raw.title ?? '').slice(0, 47) + '…'
            : (raw.title ?? '');
          const amount = formatUsdc(raw.size, raw.price);
          const ago = timeAgo(Number(raw.timestamp ?? 0));

          return (
            <View key={raw.transactionHash ?? raw.id ?? idx} style={styles.tradeRow}>
              <View style={styles.tradeInfo}>
                <Text style={styles.tradeTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.tradeMeta}>{amount} · {ago}</Text>
              </View>
              <View style={[styles.dirChip, isYes ? styles.chipYes : styles.chipNo]}>
                <Text style={[styles.dirText, isYes ? styles.textYes : styles.textNo]}>
                  {dir}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  backBtn: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backText: {
    fontSize: 15,
    color: '#00c896',
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  wallet: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'monospace',
    marginBottom: 28,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#aaa',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tradeRow: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tradeInfo: {
    flex: 1,
  },
  tradeTitle: {
    fontSize: 13,
    color: '#ddd',
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18,
  },
  tradeMeta: {
    fontSize: 12,
    color: '#555',
  },
  dirChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  chipYes: {
    backgroundColor: '#0a2a1a',
  },
  chipNo: {
    backgroundColor: '#2a0a0a',
  },
  dirText: {
    fontSize: 12,
    fontWeight: '700',
  },
  textYes: {
    color: '#00c896',
  },
  textNo: {
    color: '#ff4d4d',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 15,
    color: '#555',
  },
});
