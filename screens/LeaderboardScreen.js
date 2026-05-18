import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { fetchWhaleActivity, getCachedWhales, fetchWhalePnl } from '../services/polymarket';

const ACCENT = { active: '#00c896', ghost: '#00aaff', dormant: '#a07fff', consensus: '#7fff9b' };
const ACCENT_BG = { active: '#0a2a1a', ghost: '#0b1220', dormant: '#0c0a18', consensus: '#0a1408' };

export default function LeaderboardScreen({ navigation }) {
  const [ranked, setRanked] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const cached = getCachedWhales();
      const whales = cached?.length ? cached : await fetchWhaleActivity();

      // Fetch PnL for all whales in parallel, then sort by cashPnl desc
      const pnlResults = await Promise.all(
        whales.map((w) => fetchWhalePnl(w.raw?.addr ?? ''))
      );

      const withPnl = whales.map((w, i) => ({
        ...w,
        pnl: pnlResults[i],
      })).sort((a, b) => (b.pnl?.totalCashPnl ?? -Infinity) - (a.pnl?.totalCashPnl ?? -Infinity));

      setRanked(withPnl);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Whale board</Text>
        {!loading && <Text style={styles.subtitle}>{ranked.length} whales · by unrealized PnL</Text>}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#00c896" />
          <Text style={styles.loadingText}>Ranking by profit…</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {ranked.map((whale, i) => {
            const accent = ACCENT[whale.type] ?? '#00c896';
            const avatarBg = ACCENT_BG[whale.type] ?? '#0a2a1a';
            const shortAddr = whale.raw?.addr?.length >= 10
              ? `${whale.raw.addr.slice(0, 6)}…${whale.raw.addr.slice(-4)}`
              : whale.raw?.addr ?? '';
            const pnlStr = whale.pnl?.formatted ?? null;
            const pnlPos = pnlStr?.startsWith('+');

            return (
              <TouchableOpacity
                key={whale.id}
                style={styles.row}
                onPress={() => navigation.navigate('WhaleProfile', { whale })}
                activeOpacity={0.75}
              >
                <Text style={[styles.rank, { color: i < 3 ? '#00c896' : '#555' }]}>#{i + 1}</Text>
                <View style={[styles.avatar, { backgroundColor: avatarBg, borderColor: accent + '44', borderWidth: 1 }]}>
                  <Text style={[styles.avatarText, { color: accent }]}>
                    {(whale.type?.[0] ?? 'W').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.whaleName}>{whale.name}</Text>
                  {shortAddr ? <Text style={styles.walletAddr}>{shortAddr}</Text> : null}
                  <Text style={styles.badge}>{whale.badge}</Text>
                </View>
                <View style={styles.stats}>
                  {pnlStr ? (
                    <>
                      <Text style={[styles.pnl, { color: pnlPos ? '#00c896' : '#ff5555' }]}>{pnlStr}</Text>
                      <Text style={styles.pnlLabel}>unrealized PnL</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.pnl, { color: accent }]}>{whale.amount}</Text>
                      <Text style={styles.pnlLabel}>volume</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 11, color: '#555', marginTop: 3 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 12, color: '#444' },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#141414' },
  rank: { fontSize: 13, fontWeight: '800', width: 30 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { fontSize: 10, fontWeight: '800' },
  info: { flex: 1, gap: 2 },
  whaleName: { fontSize: 13, fontWeight: '700', color: '#fff' },
  walletAddr: { fontSize: 9, color: '#444', fontFamily: 'monospace' },
  badge: { fontSize: 9, color: '#555' },
  stats: { alignItems: 'flex-end' },
  pnl: { fontSize: 14, fontWeight: '800' },
  pnlLabel: { fontSize: 9, color: '#444', marginTop: 2 },
});
