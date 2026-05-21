import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';

import FeedScreen from './screens/FeedScreen';
import WhaleProfileScreen from './screens/WhaleProfileScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ComingSoonScreen({ route }) {
  const name = route.name ?? 'Screen';
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 32 }}>🚧</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{name}</Text>
      <Text style={{ fontSize: 13, color: '#555' }}>Coming soon</Text>
    </View>
  );
}

function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="WhaleProfile" component={WhaleProfileScreen} />
    </Stack.Navigator>
  );
}

function LeaderboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Board" component={LeaderboardScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0a0a0a',
            borderTopColor: '#1a1a1a',
          },
          tabBarActiveTintColor: '#00c896',
          tabBarInactiveTintColor: '#555',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name="FeedTab"
          component={FeedStack}
          options={{ tabBarLabel: 'Feed', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📊</Text> }}
        />
        <Tab.Screen
          name="BoardTab"
          component={LeaderboardStack}
          options={{ tabBarLabel: 'Board', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🏆</Text> }}
        />
        <Tab.Screen
          name="Mine"
          component={ComingSoonScreen}
          options={{ tabBarLabel: 'Mine', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>💼</Text> }}
        />
        <Tab.Screen
          name="Markets"
          component={ComingSoonScreen}
          options={{ tabBarLabel: 'Markets', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🔍</Text> }}
        />
        <Tab.Screen
          name="Me"
          component={ComingSoonScreen}
          options={{ tabBarLabel: 'Me', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>👤</Text> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
