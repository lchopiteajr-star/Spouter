import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { fetchWhaleProfile, scoreColor } from '../services/polymarket';

// ── Direction chip ────────────────────────────────────────────────────────────

function DirChip({ direction }) {
  const yes = direction === 'YES';
  return (
    <View style={[styles.dirChip, { backgroundColor: yes ? '#0a2a1a' : '#2a0a0a' }]}>
      <Text style={[styles.dirText, { color: yes ? '#00c896' : '#ff5555' }]}>
        {yes ? '↑ YES' : '↓ NO'}
      </Text>
    </View>
  );
}

// ── Position card (polymarket.com style) ──────────────────────────────────────

function PositionRow({ pos, isLast }) {
  const isOpen   = pos.status === 'OPEN' || pos.status === null;
  const isWon    = pos.status === 'WON';
  const isLost   = pos.status === 'LOST';
  const positive = pos.cashPnlRaw >= 0;
  const pnlColor = positive ? '#00c896' : '#ff5555';

  return (
    <View style={[styles.posRow, isLast && styles.posRowLast]}>

      {/* Market title */}
      <Text style={styles.posTitle} numberOfLines={2}>{pos.title}</Text>

      {/* Direction + price line */}
      <View style={styles.posPriceRow}>
        <DirChip direction={pos.direction} />
        {pos.avgPriceCents != null && (
          <Text style={styles.priceDetail}>Avg: {pos.avgPriceCents}¢</Text>
        )}
        {pos.curPriceCents != null && (
          <Text style={styles.priceDetail}>Now: {pos.curPriceCents}¢</Text>
        )}
        {pos.currentValue && (
          <Text style={styles.priceValue}>{pos.currentValue}</Text>
        )}
      </View>

      {/* PnL line */}
      <View style={styles.posPnlRow}>
        {isOpen && pos.cashPnlRaw !== 0 && (
          <Text style={[styles.posPnl, { color: pnlColor }]}>
            {pos.cashPnl} ({pos.pctDisplay})
          </Text>
        )}
        {isWon && (
          <>
            <Text style={styles.statusWon}>WON</Text>
            {pos.cashPnlRaw !== 0 && (
              <Text style={[styles.posPnl, { color: pnlColor, marginLeft: 6 }]}>{pos.cashPnl}</Text>
            )}
          </>
        )}
        {isLost && (
          <>
            <Text style={styles.statusLost}>LOST</Text>
            {pos.cashPnlRaw !== 0 && (
              <Text style={[styles.posPnl, { color: pnlColor, marginLeft: 6 }]}>{pos.cashPnl}</Text>
            )}
          </>
        )}
        {isOpen && pos.cashPnlRaw === 0 && (
          <Text style={styles.statusOpen}>OPEN · no change</Text>
        )}
      </View>
    </View>
  );
}

// ── Header stat box ───────────────────────────────────────────────────────────

function StatBox({ label, value, color = '#fff', small = false }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal, { color, fontSize: small ? 14 : 18 }]} numberOfLines={1}>
        {value ?? '—'}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
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

  const score    = profile?.score ?? whale.score ?? null;
  const sc       = scoreColor(score ?? 1);
  const pnlValue = profile?.totalCashPnl ?? null;
  const pnlPos   = pnlValue?.startsWith('+');

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Back */}
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
              {whale.time ? `Last bet ${whale.time}` : 'Polymarket whale'}
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
          </View>
        </Animated.View>

        {/* Latest trade from feed */}
        {whale.market && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest trade</Text>
            <View style={[styles.latestBox, { borderColor: accentColor + '33' }]}>
              <Text style={styles.latestMarket}>{whale.market}</Text>
              <View style={styles.latestRow}>
                <DirChip direction={whale.direction} />
                <Text style={[styles.latestAmount, { color: accentColor }]}>{whale.amount}</Text>
                {whale.eventDate && <Text style={styles.latestDate}>{whale.eventDate}</Text>}
              </View>
            </View>
          </View>
        )}

        {/* Profile data */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={accentColor} />
            <Text style={styles.loadingText}>Loading positions…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateEmoji}>📡</Text>
            <Text style={styles.stateText}>Could not load profile.</Text>
          </View>
        ) : !profile ? null : (
          <>
            {/* Stats: total open value · biggest win · predictions · all-time PnL */}
            <View style={styles.statsGrid}>
              <StatBox
                label="Open positions value"
                value={profile.totalOpenValue ?? '—'}
                color={accentColor}
              />
              <StatBox
                label="Biggest win"
                value={profile.biggestWin ?? '—'}
                color="#00c896"
              />
              <StatBox
                label="Total predictions"
                value={profile.totalPredictions != null ? String(profile.totalPredictions) : '—'}
                color={accentColor}
              />
              <StatBox
                label="All-time PnL"
                value={pnlValue ?? '—'}
                color={pnlValue ? (pnlPos ? '#00c896' : '#ff5555') : '#555'}
              />
            </View>

            {/* W/L/O summary bar */}
            {(profile.wins > 0 || profile.losses > 0) && (
              <View style={styles.wlBar}>
                <Text style={styles.wlWin}>{profile.wins}W</Text>
                <Text style={styles.wlSep}> · </Text>
                <Text style={styles.wlLoss}>{profile.losses}L</Text>
                {profile.opens > 0 && (
                  <>
                    <Text style={styles.wlSep}> · </Text>
                    <Text style={styles.wlOpen}>{profile.opens} open</Text>
                  </>
                )}
              </View>
            )}

            {/* Positions list */}
            {profile.positions?.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Positions ({profile.positions.length})
                </Text>
                <View style={styles.positionsBox}>
                  {profile.positions.map((p, i) => (
                    <PositionRow
                      key={i}
                      pos={p}
                      isLast={i === profile.positions.length - 1}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.stateWrap}>
                <Text style={styles.stateEmoji}>📭</Text>
                <Text style={styles.stateText}>No positions found.</Text>
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

  section:         { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle:    { fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  latestBox:    { backgroundColor: '#131313', borderRadius: 12, padding: 12, borderWidth: 0.5 },
  latestMarket: { fontSize: 13, color: '#ccc', marginBottom: 8 },
  latestRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  latestAmount: { fontSize: 16, fontWeight: '800' },
  latestDate:   { fontSize: 11, color: '#555', marginLeft: 'auto' },

  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  statBox:      { backgroundColor: '#131313', borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: '#1e1e1e', width: '47%' },
  statVal:      { fontWeight: '800' },
  statLabel:    { fontSize: 10, color: '#444', marginTop: 2 },

  wlBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  wlWin:        { fontSize: 13, fontWeight: '800', color: '#00c896' },
  wlLoss:       { fontSize: 13, fontWeight: '800', color: '#ff5555' },
  wlOpen:       { fontSize: 13, color: '#555' },
  wlSep:        { fontSize: 13, color: '#333' },

  positionsBox: { backgroundColor: '#131313', borderRadius: 12, borderWidth: 0.5, borderColor: '#1e1e1e', overflow: 'hidden' },

  posRow:       { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#1a1a1a', gap: 5 },
  posRowLast:   { borderBottomWidth: 0 },
  posTitle:     { fontSize: 12, color: '#ccc', lineHeight: 16 },

  posPriceRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dirChip:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  dirText:      { fontSize: 10, fontWeight: '800' },
  priceDetail:  { fontSize: 10, color: '#666' },
  priceValue:   { fontSize: 11, color: '#aaa', fontWeight: '700', marginLeft: 'auto' },

  posPnlRow:    { flexDirection: 'row', alignItems: 'center' },
  posPnl:       { fontSize: 12, fontWeight: '700' },
  statusWon:    { fontSize: 11, fontWeight: '800', color: '#00c896' },
  statusLost:   { fontSize: 11, fontWeight: '800', color: '#ff5555' },
  statusOpen:   { fontSize: 10, color: '#444' },

  loadingWrap:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  loadingText:  { fontSize: 12, color: '#444' },
  stateWrap:    { alignItems: 'center', paddingVertical: 32, gap: 8 },
  stateEmoji:   { fontSize: 28 },
  stateText:    { fontSize: 12, color: '#555' },
});
