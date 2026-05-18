import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

const whales = [
  { rank: 1, name: 'The Oracle', sport: 'Multi-market', bets: 198, profit: '+$2.1M', winRate: '74%' },
  { rank: 2, name: 'BTC Caller', sport: 'Crypto', bets: 312, profit: '+$1.8M', winRate: '71%' },
  { rank: 3, name: 'Soccer Ghost', sport: 'Soccer', bets: 140, profit: '+$1.4M', winRate: '71%' },
  { rank: 4, name: 'Fight Prophet', sport: 'UFC/Boxing', bets: 89, profit: '+$980K', winRate: '68%' },
  { rank: 5, name: 'Macro Mind', sport: 'Politics', bets: 67, profit: '+$760K', winRate: '66%' },
  { rank: 6, name: 'Sharp Bettor', sport: 'Soccer', bets: 54, profit: '+$610K', winRate: '64%' },
  { rank: 7, name: 'Night Owl', sport: 'Crypto', bets: 201, profit: '+$540K', winRate: '63%' },
  { rank: 8, name: 'Silent Edge', sport: 'Politics', bets: 43, profit: '+$490K', winRate: '62%' },
];

const filters = ['All', 'Soccer', 'UFC', 'Crypto', 'Politics'];

export default function LeaderboardScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Whale board</Text>
      </View>

      <View style={styles.filters}>
        {filters.map((f, i) => (
          <TouchableOpacity key={f} style={[styles.filter, i === 0 && styles.filterActive]}>
            <Text style={[styles.filterText, i === 0 && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {whales.map((whale) => (
          <TouchableOpacity
            key={whale.rank}
            style={styles.row}
            onPress={() => navigation.navigate('WhaleProfile', {
              whale: {
                id: whale.rank,
                name: whale.name,
                type: 'active',
                badge: whale.sport,
                market: `${whale.sport} markets`,
                amount: whale.profit,
                direction: 'YES',
                time: 'recently',
                stat: `${whale.winRate} win rate`,
                raw: { category: whale.sport.toLowerCase() },
              },
            })}
          >
            <Text style={styles.rank}>#{whale.rank}</Text>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>W{whale.rank}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.whaleName}>{whale.name}</Text>
              <Text style={styles.whaleSport}>{whale.sport} · {whale.bets} bets</Text>
            </View>
            <View style={styles.stats}>
              <Text style={styles.profit}>{whale.profit}</Text>
              <Text style={styles.winRate}>{whale.winRate} win rate</Text>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  filters: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filter: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: '#333' },
  filterActive: { backgroundColor: '#0a2a1a', borderColor: '#00c896' },
  filterText: { fontSize: 12, color: '#555' },
  filterTextActive: { color: '#00c896' },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#141414' },
  rank: { fontSize: 13, fontWeight: '800', color: '#00c896', width: 28 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a2a1a', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { fontSize: 10, color: '#00c896', fontWeight: '700' },
  info: { flex: 1 },
  whaleName: { fontSize: 12, fontWeight: '700', color: '#fff' },
  whaleSport: { fontSize: 10, color: '#444', marginTop: 1 },
  stats: { alignItems: 'flex-end' },
  profit: { fontSize: 12, fontWeight: '700', color: '#00c896' },
  winRate: { fontSize: 10, color: '#444', marginTop: 1 },
});