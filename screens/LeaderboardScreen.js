import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

const whales = [
  { rank: 1, name: 'The Oracle', sport: 'Multi-market', bets: 198, profit: '+$2.1M', winRate: '74%', top: true },
  { rank: 2, name: 'BTC Caller', sport: 'Crypto', bets: 312, profit: '+$1.8M', winRate: '71%', top: true },
  { rank: 3, name: 'Soccer Ghost', sport: 'Soccer', bets: 140, profit: '+$1.4M', winRate: '71%', top: true },
  { rank: 4, name: 'Fight Prophet', sport: 'UFC/Boxing', bets: 89, profit: '+$980K', winRate: '68%', top: true },
  { rank: 5, name: 'Macro Mind', sport: 'Politics', bets: 67, profit: '+$760K', winRate: '66%', top: true },
  { rank: 6, name: 'Locked Whale', sport: '???', bets: null, profit: '???', winRate: '???', top: false },
  { rank: 7, name: 'Locked Whale', sport: '???', bets: null, profit: '???', winRate: '???', top: false },
  { rank: 8, name: 'Locked Whale', sport: '???', bets: null, profit: '???', winRate: '???', top: false },
];

const filters = ['All', 'Soccer', 'UFC', 'Crypto', 'Politics'];

export default function LeaderboardScreen() {
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
          whale.top ? (
            <TouchableOpacity key={whale.rank} style={styles.row}>
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
          ) : (
            <View key={whale.rank} style={styles.lockedRow}>
              <Text style={styles.lockedRank}>#{whale.rank}</Text>
              <View style={styles.lockedContent}>
                <View style={styles.lockedBar} />
                <View style={[styles.lockedBar, { width: 80 }]} />
              </View>
              <View style={styles.lockBadge}>
                <Text style={styles.lockText}>Pro</Text>
              </View>
            </View>
          )
        ))}

        <View style={styles.upgradeBox}>
          <Text style={styles.upgradeTitle}>Unlock all 50 whales</Text>
          <Text style={styles.upgradeSub}>Full stats · Sport breakdown · Real-time alerts</Text>
          <TouchableOpacity style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>Start 7-day free trial · $9.99/mo</Text>
          </TouchableOpacity>
        </View>
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
  lockedRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#0d0d0d', opacity: 0.4 },
  lockedRank: { fontSize: 13, fontWeight: '800', color: '#333', width: 28 },
  lockedContent: { flex: 1, gap: 6 },
  lockedBar: { height: 8, backgroundColor: '#1a1a1a', borderRadius: 4, width: 120 },
  lockBadge: { backgroundColor: '#0a2a1a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  lockText: { fontSize: 10, color: '#00c896', fontWeight: '600' },
  upgradeBox: { margin: 16, backgroundColor: '#0d1a0d', borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: '#00c896' },
  upgradeTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 4 },
  upgradeSub: { fontSize: 12, color: '#555', marginBottom: 12 },
  upgradeBtn: { backgroundColor: '#00c896', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  upgradeBtnText: { fontSize: 13, fontWeight: '700', color: '#0a0a0a' },
});