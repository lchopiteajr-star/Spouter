import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { fetchWhaleActivity } from '../services/polymarket';

const typeColors = {
  active: '#00c896',
  ghost: '#00aaff',
  dormant: '#a07fff',
  consensus: '#7fff9b',
};

const typeBackground = {
  active: '#0b1612',
  ghost: '#0b1220',
  dormant: '#0c0a18',
  consensus: '#0a1408',
};

const FILTERS = ['All', 'Sports', 'Crypto', 'Politics', 'Entertainment'];

const categoryToFilter = {
  sports: 'Sports',
  ufc: 'Sports',
  crypto: 'Crypto',
  politics: 'Politics',
  entertainment: 'Entertainment',
};

export default function FeedScreen({ navigation }) {
  const [whales, setWhales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  const load = useCallback(async () => {
    const data = await fetchWhaleActivity();
    setWhales(data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = activeFilter === 'All'
    ? whales
    : whales.filter((w) => categoryToFilter[w.raw?.category] === activeFilter);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>spout<Text style={styles.logoGreen}>er</Text></Text>
          <Text style={styles.headerSub}>● live · {whales.length} active markets</Text>
        </View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filter, f === activeFilter && styles.filterActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, f === activeFilter && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#00c896" />
          <Text style={styles.loadingText}>Scanning whale activity…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.feed}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c896" />}
        >
          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>No whale activity in this category right now.</Text>
          ) : (
            filtered.map((whale) => (
              <TouchableOpacity
                key={whale.id}
                style={[styles.card, { backgroundColor: typeBackground[whale.type], borderColor: typeColors[whale.type] + '44' }]}
                onPress={() => navigation.navigate('WhaleProfile', { whale })}
                activeOpacity={0.75}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.whaleName}>{whale.name}</Text>
                  <View style={[styles.badge, { backgroundColor: typeColors[whale.type] + '22' }]}>
                    <Text style={[styles.badgeText, { color: typeColors[whale.type] }]}>{whale.badge}</Text>
                  </View>
                </View>
                <View style={styles.cardMid}>
                  <Text style={styles.amount}>{whale.amount}</Text>
                  <Text style={styles.market} numberOfLines={1}> · {whale.market}</Text>
                </View>
                <View style={styles.cardBet}>
                  <View style={[styles.direction, { backgroundColor: whale.direction === 'YES' ? '#0a2a1a' : '#2a0a0a' }]}>
                    <Text style={[styles.directionText, { color: whale.direction === 'YES' ? '#00c896' : '#ff5555' }]}>
                      Bet: {whale.bet ?? whale.direction}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.time}>
                    {whale.time}{whale.eventDate ? <Text style={styles.eventDate}> · {whale.eventDate}</Text> : null}
                  </Text>
                  <Text style={[styles.stat, { color: typeColors[whale.type] }]}>{whale.stat}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 8 },
  logo: { fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  logoGreen: { color: '#00c896' },
  headerSub: { fontSize: 11, color: '#555', marginTop: 2 },
  filters: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filter: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: '#333' },
  filterActive: { backgroundColor: '#0a2a1a', borderColor: '#00c896' },
  filterText: { fontSize: 12, color: '#555' },
  filterTextActive: { color: '#00c896' },
  feed: { flex: 1, paddingHorizontal: 12 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 12, color: '#444' },
  emptyText: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 40 },
  card: { borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 0.5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  whaleName: { fontSize: 13, fontWeight: '700', color: '#fff' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  cardMid: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardBet: { flexDirection: 'row', marginBottom: 6 },
  amount: { fontSize: 13, fontWeight: '700', color: '#fff' },
  market: { fontSize: 12, color: '#888', flex: 1 },
  direction: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  directionText: { fontSize: 10, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 10, color: '#444' },
  eventDate: { fontSize: 10, color: '#666' },
  stat: { fontSize: 10 },
});
