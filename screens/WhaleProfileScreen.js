import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { fetchWhaleProfile } from '../services/polymarket';

export default function WhaleProfileScreen({ route, navigation }) {
  const whale = route?.params?.whale ?? {};
  const addr = whale.raw?.addr ?? '';

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!!addr);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!addr) return;
    fetchWhaleProfile(addr)
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [addr]);

  const accentColor = { active: '#00c896', ghost: '#00aaff', dormant: '#a07fff', consensus: '#7fff9b' }[whale.type] ?? '#00c896';
  const avatarBg = { active: '#0a2a1a', ghost: '#0b1220', dormant: '#0c0a18', consensus: '#0a1408' }[whale.type] ?? '#0a2a1a';
  const rankLabel = { active: 'A', ghost: 'G', dormant: 'D', consensus: 'C' }[whale.type] ?? 'W';

  const displayName = profile?.pseudonym ?? whale.name ?? 'Unknown Whale';
  const shortAddr = addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

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
            <Text style={styles.whaleName}>{displayName}</Text>
            {shortAddr ? <Text style={styles.walletAddr}>{shortAddr}</Text> : null}
            <Text style={styles.whaleStatus}>
              {whale.time ? `Active · Last bet ${whale.time}` : 'Status unknown'}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={accentColor} />
            <Text style={styles.loadingText}>Loading whale data…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>Could not load profile</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: accentColor }]}>{profile?.totalVolume ?? whale.amount ?? '—'}</Text>
                <Text style={styles.statLabel}>Total volume</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: accentColor }]}>{profile?.biggestTrade ?? '—'}</Text>
                <Text style={styles.statLabel}>Biggest trade</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: accentColor, fontSize: 13 }]}>{profile?.topCategory ?? whale.badge ?? '—'}</Text>
                <Text style={styles.statLabel}>Top category</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: accentColor }]}>{profile?.totalTrades ?? '—'}</Text>
                <Text style={styles.statLabel}>Trades fetched</Text>
              </View>
            </View>

            {whale.market && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Latest position</Text>
                <View style={[styles.positionBox, { borderColor: accentColor + '33' }]}>
                  <Text style={styles.positionMarket}>{whale.market}</Text>
                  <View style={styles.positionRow}>
                    <View style={[styles.dirChip, { backgroundColor: whale.direction === 'YES' ? '#0a2a1a' : '#2a0a0a' }]}>
                      <Text style={[styles.dirText, { color: whale.direction === 'YES' ? '#00c896' : '#ff5555' }]}>
                        {whale.bet ?? whale.direction}
                      </Text>
                    </View>
                    <Text style={[styles.positionAmount, { color: accentColor }]}>{whale.amount}</Text>
                    {whale.eventDate && <Text style={styles.positionDate}>{whale.eventDate}</Text>}
                  </View>
                </View>
              </View>
            )}

            {profile?.recentTrades?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent trades</Text>
                <View style={styles.historyBox}>
                  {profile.recentTrades.map((t, i) => (
                    <View key={i} style={[styles.tradeRow, i === profile.recentTrades.length - 1 && styles.tradeRowLast]}>
                      <View style={[styles.dirChipSmall, { backgroundColor: t.direction === 'YES' ? '#0a2a1a' : '#2a0a0a' }]}>
                        <Text style={[styles.dirChipText, { color: t.direction === 'YES' ? '#00c896' : '#ff5555' }]}>{t.outcome}</Text>
                      </View>
                      <Text style={styles.tradeMarket} numberOfLines={1}>{t.market}</Text>
                      <View style={styles.tradeRight}>
                        <Text style={[styles.tradeAmount, { color: accentColor }]}>{t.amount}</Text>
                        <Text style={styles.tradeTime}>{t.time}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

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
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  whaleName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  walletAddr: { fontSize: 10, color: '#444', marginTop: 2, fontFamily: 'monospace' },
  whaleStatus: { fontSize: 11, color: '#555', marginTop: 3 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  loadingText: { fontSize: 12, color: '#444' },
  errorWrap: { alignItems: 'center', paddingVertical: 40 },
  errorText: { fontSize: 12, color: '#555' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  statBox: { backgroundColor: '#131313', borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: '#1e1e1e', width: '47%' },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#444', marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  positionBox: { backgroundColor: '#131313', borderRadius: 12, padding: 12, borderWidth: 0.5 },
  positionMarket: { fontSize: 13, color: '#ccc', marginBottom: 8 },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dirText: { fontSize: 11, fontWeight: '700' },
  positionAmount: { fontSize: 16, fontWeight: '800' },
  positionDate: { fontSize: 11, color: '#555', marginLeft: 'auto' },
  historyBox: { backgroundColor: '#131313', borderRadius: 12, borderWidth: 0.5, borderColor: '#1e1e1e', overflow: 'hidden' },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a' },
  tradeRowLast: { borderBottomWidth: 0 },
  dirChipSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexShrink: 0 },
  dirChipText: { fontSize: 9, fontWeight: '700' },
  tradeMarket: { flex: 1, fontSize: 11, color: '#999' },
  tradeRight: { alignItems: 'flex-end', flexShrink: 0 },
  tradeAmount: { fontSize: 11, fontWeight: '700' },
  tradeTime: { fontSize: 9, color: '#444', marginTop: 1 },
});
