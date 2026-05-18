import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

const isPro = true;

// Fallback profile data shown when a card doesn't carry full stats
const DEFAULT_PROFILE = {
  overallWinRate: '—',
  totalProfit: '$???',
  avgROI: '+??%',
  totalBets: '—',
  sports: [
    { name: 'Soccer', pct: 71, color: '#00c896' },
    { name: 'Politics', pct: 58, color: '#a07fff' },
    { name: 'UFC', pct: 52, color: '#ffaa44' },
    { name: 'Crypto', pct: 47, color: '#444' },
  ],
  recentBets: [
    { market: 'Loading bet history…', result: 'Open', win: null },
    { market: '———', result: '???', win: true },
    { market: '———', result: '???', win: true },
    { market: '———', result: '???', win: false },
    { market: '———', result: '???', win: true },
  ],
};

export default function WhaleProfileScreen({ route, navigation }) {
  const whale = route?.params?.whale ?? {};

  const name = whale.name ?? 'Unknown Whale';
  const status = whale.time ? `Active · Last bet ${whale.time}` : 'Status unknown';
  const profile = DEFAULT_PROFILE;

  // Derive a rank-like display from the whale type
  const rankLabel = { active: 'A', ghost: 'G', dormant: 'D', consensus: 'C' }[whale.type] ?? 'W';
  const accentColor = { active: '#00c896', ghost: '#00aaff', dormant: '#a07fff', consensus: '#7fff9b' }[whale.type] ?? '#00c896';
  const avatarBg = { active: '#0a2a1a', ghost: '#0b1220', dormant: '#0c0a18', consensus: '#0a1408' }[whale.type] ?? '#0a2a1a';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={[styles.backText, { color: accentColor }]}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.profileTop}>
          <View style={[styles.avatar, { backgroundColor: avatarBg, borderColor: accentColor + '44', borderWidth: 1 }]}>
            <Text style={[styles.avatarText, { color: accentColor }]}>{rankLabel}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.whaleName}>{name}</Text>
            <Text style={styles.whaleStatus}>{status}</Text>
            {whale.amount && (
              <Text style={[styles.whaleLatest, { color: accentColor }]}>
                Latest: {whale.amount} · {whale.direction}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: accentColor }]}>{profile.overallWinRate}</Text>
            <Text style={styles.statLabel}>Overall win rate</Text>
          </View>
          <View style={styles.statBox}>
            {isPro ? (
              <>
                <Text style={[styles.statVal, { color: accentColor }]}>{profile.totalProfit}</Text>
                <Text style={styles.statLabel}>Total profit</Text>
              </>
            ) : (
              <>
                <Text style={styles.statValLocked}>????</Text>
                <Text style={styles.statLabel}>Total profit 🔒</Text>
              </>
            )}
          </View>
          <View style={styles.statBox}>
            {isPro ? (
              <>
                <Text style={[styles.statVal, { color: accentColor }]}>{profile.avgROI}</Text>
                <Text style={styles.statLabel}>Avg ROI</Text>
              </>
            ) : (
              <>
                <Text style={styles.statValLocked}>????</Text>
                <Text style={styles.statLabel}>Avg ROI 🔒</Text>
              </>
            )}
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: accentColor }]}>{profile.totalBets}</Text>
            <Text style={styles.statLabel}>Total bets</Text>
          </View>
        </View>

        {whale.market && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current position</Text>
            <View style={[styles.positionBox, { borderColor: accentColor + '33' }]}>
              <Text style={styles.positionMarket}>{whale.market}</Text>
              <View style={styles.positionRow}>
                <View style={[styles.dirChip, { backgroundColor: whale.direction === 'YES' ? '#0a2a1a' : '#2a0a0a' }]}>
                  <Text style={[styles.dirText, { color: whale.direction === 'YES' ? '#00c896' : '#ff5555' }]}>{whale.direction}</Text>
                </View>
                <Text style={[styles.positionAmount, { color: accentColor }]}>{whale.amount}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Win rate by category</Text>
          {profile.sports.map((sport) => (
            <View key={sport.name} style={styles.sportRow}>
              <Text style={styles.sportName}>{sport.name}</Text>
              <View style={styles.barTrack}>
                {isPro ? (
                  <View style={[styles.barFill, { width: `${sport.pct}%`, backgroundColor: sport.color }]} />
                ) : (
                  <View style={[styles.barFill, { width: `${sport.pct}%`, backgroundColor: '#1a1a1a' }]} />
                )}
              </View>
              {isPro ? (
                <Text style={[styles.sportPct, { color: sport.color }]}>{sport.pct}%</Text>
              ) : (
                <Text style={styles.sportPctLocked}>🔒</Text>
              )}
            </View>
          ))}
          {!isPro && (
            <Text style={styles.unlockHint}>Unlock sport breakdown with Pro</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bet history</Text>
          <View style={styles.historyBox}>
            <View style={styles.historyItem}>
              <Text style={styles.historyMarket}>{profile.recentBets[0].market}</Text>
              <Text style={styles.historyOpen}>Open</Text>
            </View>

            {isPro ? (
              profile.recentBets.slice(1).map((bet, i) => (
                <View key={i} style={styles.historyItem}>
                  <Text style={styles.historyMarket}>{bet.market}</Text>
                  <Text style={[styles.historyResult, { color: bet.win ? '#00c896' : '#ff5555' }]}>{bet.result}</Text>
                </View>
              ))
            ) : (
              <View style={styles.lockedHistory}>
                <View style={styles.blurredRows}>
                  {profile.recentBets.slice(1).map((bet, i) => (
                    <View key={i} style={styles.historyItemBlurred}>
                      <Text style={styles.historyMarketBlurred}>{bet.market}</Text>
                      <Text style={styles.historyResultBlurred}>{bet.result}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.lockOverlay}>
                  <Text style={styles.lockOverlayText}>🔒 Full history · Pro $9.99</Text>
                </View>
              </View>
            )}
          </View>
        </View>


        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { alignSelf: 'flex-start' },
  backText: { fontSize: 14 },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  whaleName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  whaleStatus: { fontSize: 11, color: '#555', marginTop: 2 },
  whaleLatest: { fontSize: 11, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  statBox: { backgroundColor: '#131313', borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: '#1e1e1e', width: '47%' },
  statVal: { fontSize: 18, fontWeight: '800' },
  statValLocked: { fontSize: 18, fontWeight: '800', color: '#1e1e1e', backgroundColor: '#1e1e1e', borderRadius: 4 },
  statLabel: { fontSize: 10, color: '#444', marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  positionBox: { backgroundColor: '#131313', borderRadius: 12, padding: 12, borderWidth: 0.5 },
  positionMarket: { fontSize: 13, color: '#ccc', marginBottom: 8 },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dirText: { fontSize: 11, fontWeight: '700' },
  positionAmount: { fontSize: 16, fontWeight: '800' },
  sportRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sportName: { fontSize: 11, color: '#666', width: 52 },
  barTrack: { flex: 1, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  sportPct: { fontSize: 11, width: 28, textAlign: 'right' },
  sportPctLocked: { fontSize: 11, width: 28, textAlign: 'right' },
  unlockHint: { fontSize: 11, color: '#555', marginTop: 6 },
  historyBox: { backgroundColor: '#131313', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#1e1e1e' },
  historyItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#161616' },
  historyMarket: { fontSize: 11, color: '#ccc', flex: 1 },
  historyOpen: { fontSize: 11, color: '#888' },
  historyResult: { fontSize: 11, fontWeight: '700' },
  lockedHistory: { position: 'relative', marginTop: 4 },
  blurredRows: { opacity: 0.15 },
  historyItemBlurred: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#161616' },
  historyMarketBlurred: { fontSize: 11, color: '#ccc' },
  historyResultBlurred: { fontSize: 11, color: '#00c896' },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,10,10,0.7)', borderRadius: 8 },
  lockOverlayText: { fontSize: 12, fontWeight: '700', color: '#00c896' },
  upgradeBox: { margin: 16, backgroundColor: '#0d1a0d', borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: '#00c896' },
  upgradeTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 4 },
  upgradeSub: { fontSize: 12, color: '#555', marginBottom: 12 },
  upgradeBtn: { backgroundColor: '#00c896', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  upgradeBtnText: { fontSize: 13, fontWeight: '700', color: '#0a0a0a' },
});
