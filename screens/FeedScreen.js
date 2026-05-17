import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

const whales = [
  {
    id: 1,
    name: 'Whale #3',
    type: 'active',
    badge: '71% soccer',
    market: 'Brazil World Cup',
    amount: '$280K',
    direction: 'YES',
    time: '2 min ago',
    stat: '$1.4M profit',
  },
  {
    id: 2,
    name: 'Ghost wallet',
    type: 'ghost',
    badge: 'New · 3 days old',
    market: 'Chimaev to win',
    amount: '$500K',
    direction: 'YES',
    time: '8 min ago',
    stat: 'First ever bet',
  },
  {
    id: 3,
    name: 'Whale #7',
    type: 'dormant',
    badge: 'Dormant 14mo',
    market: 'Trump 2026',
    amount: '$900K',
    direction: 'NO',
    time: '22 min ago',
    stat: 'Just woke up',
  },
  {
    id: 4,
    name: 'Consensus alert',
    type: 'consensus',
    badge: '3 whales · 90min',
    market: 'BTC higher 1hr',
    amount: '$1.8M combined',
    direction: 'YES',
    time: '1 hr ago',
    stat: 'Strong signal',
  },
];

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

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>spout<Text style={styles.logoGreen}>er</Text></Text>
          <Text style={styles.headerSub}>● live · 4 active markets</Text>
        </View>
      </View>

      <View style={styles.filters}>
        {['All', 'Sports', 'Crypto', 'Ghost'].map((f, i) => (
          <TouchableOpacity key={f} style={[styles.filter, i === 0 && styles.filterActive]}>
            <Text style={[styles.filterText, i === 0 && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.feed} showsVerticalScrollIndicator={false}>
        {whales.map((whale) => (
          <TouchableOpacity key={whale.id} style={[styles.card, { backgroundColor: typeBackground[whale.type], borderColor: typeColors[whale.type] + '44' }]}>
            <View style={styles.cardTop}>
              <Text style={styles.whaleName}>{whale.name}</Text>
              <View style={[styles.badge, { backgroundColor: typeColors[whale.type] + '22' }]}>
                <Text style={[styles.badgeText, { color: typeColors[whale.type] }]}>{whale.badge}</Text>
              </View>
            </View>
            <View style={styles.cardMid}>
              <Text style={styles.amount}>{whale.amount}</Text>
              <Text style={styles.market}> · {whale.market} · </Text>
              <View style={[styles.direction, { backgroundColor: whale.direction === 'YES' ? '#0a2a1a' : '#2a0a0a' }]}>
                <Text style={[styles.directionText, { color: whale.direction === 'YES' ? '#00c896' : '#ff5555' }]}>{whale.direction}</Text>
              </View>
            </View>
            <View style={styles.cardBottom}>
              <Text style={styles.time}>{whale.time}</Text>
              <Text style={[styles.stat, { color: typeColors[whale.type] }]}>{whale.stat}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  card: { borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 0.5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  whaleName: { fontSize: 13, fontWeight: '700', color: '#fff' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  cardMid: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  amount: { fontSize: 13, fontWeight: '700', color: '#fff' },
  market: { fontSize: 12, color: '#888' },
  direction: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  directionText: { fontSize: 10, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 10, color: '#444' },
  stat: { fontSize: 10 },
});