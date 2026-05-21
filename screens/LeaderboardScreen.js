import { View, Text } from 'react-native';

export default function LeaderboardScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 32 }}>🏆</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>Leaderboard</Text>
      <Text style={{ fontSize: 13, color: '#555' }}>Coming soon</Text>
    </View>
  );
}
