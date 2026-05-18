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

  const pnlValue = profile?.totalCashPnl ?? null;
  const pnlPositive = pnlValue?.startsWith('+');

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
          {pnlValue && (
            <View style={[styles.pnlBadge, { backgroundColor: pnlPositive ? '#0a2a1a' : '#2a0a0a' }]}>
              <Text style={styles.pnlBadgeLabel}>Unrealized PnL</Text>
              <Text style={[styles.pnlBadgeValue, { color: pnlPositive ? '#00c896' : '#ff5555' }]}>{pnlValue}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={accentColor} />
            <Text style={styles.loadingText}>Loading positions…</Text>
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
                <Text style={[styles.statVal, { color: accentColor }]}>{profile?.positions?.length ?? profile?.totalTrades ?? '—'}</Text>
                <Text style={styles.statLabel}>Positions</Text>
              </View>
            </View>

            {whale.market && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Latest trade</Text>
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

            {profile?.positions?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Positions ({profile.positions.length})</Text>
                <View style={styles.historyBox}>
                  {profile.positions.map((p, i) => {
                    const isLast = i === profile.positions.length - 1;
                    const pnlPos = p.cashPnlRaw >= 0;

                    return (
                      <View key={i} style={[styles.posRow, isLast && styles.posRowLast]}>
                        <View style={styles.posLeft}>
                          <Text style={styles.posTitle} numberOfLines={2}>{p.title}</Text>
                          <View style={styles.posMetaRow}>
                            <Text style={styles.posOutcome}>{p.outcome}</Text>
                            {p.initialValue && <Text style={styles.posInitial}> · {p.initialValue} in</Text>}
                          </View>
                        </View>
                        <View style={styles.posRight}>
                          {p.status === 'WON' ? (
                            <>
                              <Text style={styles.statusWon}>WON</Text>
                              <Text style={[styles.posPnl, { color: '#00c896' }]}>{p.cashPnl}</Text>
                            </>
                          ) : p.status === 'LOST' ? (
                            <Text style={styles.statusLost}>LOST</Text>
                          ) : p.status === 'OPEN' ? (
                            <>
                              <Text style={styles.statusOpen}>OPEN</Text>
                              {p.currentValue && <Text style={styles.posCurrentVal}>{p.currentValue}</Text>}
                            </>
                          ) : (
                            <>
                              <Text style={[styles.posPnl, { color: pnlPos ? '#00c896' : '#ff5555' }]}>{p.cashPnl}</Text>
                              <Text style={[styles.posPct, { color: pnlPos ? '#00c896' : '#ff5555' }]}>{p.pctDisplay}</Text>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
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
  pnlBadge: { borderRadius: 10, padding: 10, alignItems: 'flex-end' },
  pnlBadgeLabel: { fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  pnlBadgeValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
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
  posRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a', gap: 8 },
  posRowLast: { borderBottomWidth: 0 },
  posLeft: { flex: 1 },
  posTitle: { fontSize: 11, color: '#ccc', lineHeight: 15 },
  posMetaRow: { flexDirection: 'row', marginTop: 3 },
  posOutcome: { fontSize: 10, color: '#00c896', fontWeight: '600' },
  posInitial: { fontSize: 10, color: '#444' },
  posRight: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 60 },
  posPnl: { fontSize: 12, fontWeight: '700' },
  posPct: { fontSize: 10, marginTop: 2 },
  statusWon: { fontSize: 11, fontWeight: '800', color: '#00c896' },
  statusLost: { fontSize: 11, fontWeight: '800', color: '#ff5555' },
  statusOpen: { fontSize: 11, fontWeight: '700', color: '#555' },
  posCurrentVal: { fontSize: 10, color: '#444', marginTop: 2 },
});
