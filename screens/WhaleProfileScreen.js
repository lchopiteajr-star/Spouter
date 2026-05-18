import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { fetchWhaleProfile, scoreColor } from '../services/polymarket';

// ── Stat counter (counts up from 0 on mount) ──────────────────────────────────

function CountStat({ value, label, color, format = 'number' }) {
  const [display, setDisplay] = useState('—');

  useEffect(() => {
    if (!value || typeof value !== 'number') return;
    const steps    = 24;
    const duration = 700;
    let   step     = 0;
    const timer    = setInterval(() => {
      step++;
      const current = (value * step) / steps;
      if (format === 'usdc') {
        const n = current;
        setDisplay(n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
                 : n >= 1_000    ? `$${Math.round(n / 1_000)}K`
                 : `$${Math.round(n)}`);
      } else {
        setDisplay(String(Math.round(current)));
      }
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal, { color }]}>{display}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Progress bar for open positions ──────────────────────────────────────────

function ProgressBar({ initialValueRaw, curPriceRaw }) {
  if (!initialValueRaw || !curPriceRaw) return null;
  const pct      = Math.min(1, curPriceRaw / initialValueRaw);
  const winning  = curPriceRaw >= initialValueRaw;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, {
        width: `${Math.round(pct * 100)}%`,
        backgroundColor: winning ? '#00c896' : '#ff5555',
      }]} />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function WhaleProfileScreen({ route, navigation }) {
  const whale = route?.params?.whale ?? {};
  const addr  = whale.raw?.addr ?? '';

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!!addr);
  const [error,   setError]   = useState(null);

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (!addr) return;
    fetchWhaleProfile(addr)
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [addr]);

  const accentColor = { active: '#00c896', ghost: '#00aaff', dormant: '#a07fff', consensus: '#7fff9b' }[whale.type] ?? '#00c896';
  const avatarBg    = { active: '#0a2a1a', ghost: '#0b1220', dormant: '#0c0a18', consensus: '#0a1408' }[whale.type] ?? '#0a2a1a';
  const rankLabel   = { active: 'A', ghost: 'G', dormant: 'D', consensus: 'C' }[whale.type] ?? 'W';

  const displayName = profile?.pseudonym ?? whale.name ?? 'Unknown Whale';
  const shortAddr   = addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

  const score       = profile?.score ?? whale.score ?? null;
  const sc          = scoreColor(score ?? 0);
  const pnlValue    = profile?.totalCashPnl ?? null;
  const pnlPositive = pnlValue?.startsWith('+');

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Back button */}
        <View style={styles.headerNav}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={[styles.backText, { color: accentColor }]}>← Back</Text>
          </TouchableOpacity>
        </View>

        {/* Profile header */}
        <Animated.View style={[styles.profileTop, { opacity: headerAnim }]}>
          <View style={[styles.avatar, { backgroundColor: avatarBg, borderColor: accentColor + '44', borderWidth: 1 }]}>
            <Text style={[styles.avatarText, { color: accentColor }]}>{rankLabel}</Text>
          </View>

          <View style={styles.nameBlock}>
            <Text style={styles.whaleName}>{displayName}</Text>
            {shortAddr ? <Text style={styles.walletAddr}>{shortAddr}</Text> : null}
            <Text style={styles.whaleStatus}>
              {whale.time ? `Active · last bet ${whale.time}` : 'Status unknown'}
            </Text>
            {profile?.memberSince ? (
              <Text style={styles.memberSince}>Member since {profile.memberSince}</Text>
            ) : null}
          </View>

          <View style={styles.scoreBlock}>
            {score !== null && (
              <View style={[styles.scoreBadge, { backgroundColor: sc + '22', borderColor: sc + '55' }]}>
                <Text style={[styles.scoreNum, { color: sc }]}>{score}</Text>
                <Text style={[styles.scoreLabel, { color: sc }]}>score</Text>
              </View>
            )}
            {pnlValue && (
              <View style={[styles.pnlBadge, { backgroundColor: pnlPositive ? '#0a2a1a' : '#2a0a0a', marginTop: 6 }]}>
                <Text style={styles.pnlBadgeLabel}>Total PnL</Text>
                <Text style={[styles.pnlBadgeValue, { color: pnlPositive ? '#00c896' : '#ff5555' }]}>{pnlValue}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Latest trade — always shown from whale card data */}
        {whale.market && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest trade</Text>
            <View style={[styles.positionBox, { borderColor: accentColor + '33' }]}>
              <Text style={styles.positionMarket}>{whale.market}</Text>
              <View style={styles.positionRow}>
                <View style={[styles.dirChip, { backgroundColor: whale.direction === 'YES' ? '#0a2a1a' : '#2a0a0a' }]}>
                  <Text style={[styles.dirText, { color: whale.direction === 'YES' ? '#00c896' : '#ff5555' }]}>
                    {whale.direction === 'YES' ? '↑' : '↓'} {whale.bet ?? whale.direction}
                  </Text>
                </View>
                <Text style={[styles.positionAmount, { color: accentColor }]}>{whale.amount}</Text>
                {whale.eventDate && <Text style={styles.positionDate}>{whale.eventDate}</Text>}
              </View>
            </View>
          </View>
        )}

        {/* Profile content */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={accentColor} />
            <Text style={styles.loadingText}>Loading positions…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateEmoji}>📡</Text>
            <Text style={styles.stateText}>Could not load profile</Text>
          </View>
        ) : !profile ? null : (
          <>
            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <CountStat
                value={profile.totalVolumeRaw}
                label="Total volume"
                color={accentColor}
                format="usdc"
              />
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: accentColor }]}>{profile.biggestTrade ?? '—'}</Text>
                <Text style={styles.statLabel}>Biggest trade</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: accentColor, fontSize: 13 }]}>
                  {profile.topCategory ?? whale.badge ?? '—'}
                </Text>
                <Text style={styles.statLabel}>Top category</Text>
              </View>
              <CountStat
                value={profile.totalTrades}
                label="Markets traded"
                color={accentColor}
                format="number"
              />
            </View>

            {/* Positions */}
            {profile.positions?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Positions ({profile.positions.length})</Text>
                <View style={styles.historyBox}>
                  {profile.positions.map((p, i) => {
                    const isLast   = i === profile.positions.length - 1;
                    const s        = p.status;
                    const pnlColor = p.cashPnlRaw > 0 ? '#00c896' : p.cashPnlRaw < 0 ? '#ff5555' : '#555';

                    return (
                      <View key={i} style={[styles.posRow, isLast && styles.posRowLast]}>
                        <View style={styles.posLeft}>
                          <Text style={styles.posTitle} numberOfLines={2}>{p.title}</Text>
                          <View style={styles.posMetaRow}>
                            <Text style={styles.posOutcome}>{p.outcome}</Text>
                            {p.initialValue && <Text style={styles.posInitial}> · {p.initialValue} in</Text>}
                          </View>
                          {s === 'OPEN' && (
                            <ProgressBar
                              initialValueRaw={p.initialValueRaw}
                              curPriceRaw={p.curPriceRaw}
                            />
                          )}
                        </View>
                        <View style={styles.posRight}>
                          {s === 'WON'  && <Text style={styles.statusWon}>WON</Text>}
                          {s === 'LOST' && <Text style={styles.statusLost}>LOST</Text>}
                          {s === 'EVEN' && <Text style={styles.statusEven}>EVEN</Text>}
                          {s === 'OPEN' && <Text style={styles.statusOpen}>OPEN</Text>}

                          {s === 'OPEN' ? (
                            p.curPrice ? <Text style={styles.posCurrentVal}>{p.curPrice}</Text> : null
                          ) : p.cashPnlRaw !== 0 ? (
                            <Text style={[styles.posPnl, { color: pnlColor }]}>{p.cashPnl}</Text>
                          ) : null}

                          {(s === null || s === undefined) && (
                            <Text style={[styles.posPct, { color: pnlColor }]}>{p.pctDisplay}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {profile.positions?.length === 0 && (
              <View style={styles.stateWrap}>
                <Text style={styles.stateEmoji}>📭</Text>
                <Text style={styles.stateText}>No open positions found.</Text>
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
  container:    { flex: 1, backgroundColor: '#0a0a0a' },
  headerNav:    { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 },
  backBtn:      { alignSelf: 'flex-start' },
  backText:     { fontSize: 14 },

  profileTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  avatar:       { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarText:   { fontSize: 16, fontWeight: '800' },

  nameBlock:    { flex: 1 },
  whaleName:    { fontSize: 20, fontWeight: '800', color: '#fff' },
  walletAddr:   { fontSize: 10, color: '#444', marginTop: 2, fontFamily: 'monospace' },
  whaleStatus:  { fontSize: 11, color: '#555', marginTop: 4 },
  memberSince:  { fontSize: 10, color: '#444', marginTop: 2 },

  scoreBlock:   { alignItems: 'flex-end' },
  scoreBadge:   { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 0.5 },
  scoreNum:     { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  scoreLabel:   { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  pnlBadge:     { borderRadius: 10, padding: 8, alignItems: 'flex-end' },
  pnlBadgeLabel:{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  pnlBadgeValue:{ fontSize: 16, fontWeight: '800', marginTop: 2 },

  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  statBox:      { backgroundColor: '#131313', borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: '#1e1e1e', width: '47%' },
  statVal:      { fontSize: 18, fontWeight: '800' },
  statLabel:    { fontSize: 10, color: '#444', marginTop: 2 },

  section:      { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  positionBox:  { backgroundColor: '#131313', borderRadius: 12, padding: 12, borderWidth: 0.5 },
  positionMarket:{ fontSize: 13, color: '#ccc', marginBottom: 8 },
  positionRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirChip:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dirText:      { fontSize: 11, fontWeight: '700' },
  positionAmount:{ fontSize: 16, fontWeight: '800' },
  positionDate: { fontSize: 11, color: '#555', marginLeft: 'auto' },

  historyBox:   { backgroundColor: '#131313', borderRadius: 12, borderWidth: 0.5, borderColor: '#1e1e1e', overflow: 'hidden' },
  posRow:       { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a', gap: 8 },
  posRowLast:   { borderBottomWidth: 0 },
  posLeft:      { flex: 1 },
  posTitle:     { fontSize: 11, color: '#ccc', lineHeight: 15 },
  posMetaRow:   { flexDirection: 'row', marginTop: 3 },
  posOutcome:   { fontSize: 10, color: '#00c896', fontWeight: '600' },
  posInitial:   { fontSize: 10, color: '#444' },

  progressTrack:{ height: 3, backgroundColor: '#222', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },

  posRight:     { alignItems: 'flex-end', justifyContent: 'center', minWidth: 60 },
  posPnl:       { fontSize: 12, fontWeight: '700' },
  posPct:       { fontSize: 10, marginTop: 2 },
  statusWon:    { fontSize: 11, fontWeight: '800', color: '#00c896' },
  statusLost:   { fontSize: 11, fontWeight: '800', color: '#ff5555' },
  statusEven:   { fontSize: 11, fontWeight: '700', color: '#fff' },
  statusOpen:   { fontSize: 11, fontWeight: '700', color: '#555' },
  posCurrentVal:{ fontSize: 10, color: '#444', marginTop: 2 },

  loadingWrap:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  loadingText:  { fontSize: 12, color: '#444' },
  stateWrap:    { alignItems: 'center', paddingVertical: 32, gap: 8 },
  stateEmoji:   { fontSize: 28 },
  stateText:    { fontSize: 12, color: '#555' },
});
