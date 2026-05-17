import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import FeedScreen from './screens/FeedScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import WhaleProfileScreen from './screens/WhaleProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FeedMain" component={FeedScreen} />
      <Stack.Screen name="WhaleProfile" component={WhaleProfileScreen} />
    </Stack.Navigator>
  );
}

function LeaderboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LeaderboardMain" component={LeaderboardScreen} />
      <Stack.Screen name="WhaleProfile" component={WhaleProfileScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0a0a0a',
            borderTopColor: '#161616',
            borderTopWidth: 0.5,
            paddingBottom: 8,
            paddingTop: 6,
            height: 60,
          },
          tabBarActiveTintColor: '#00c896',
          tabBarInactiveTintColor: '#333',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
          },
        }}
      >
        <Tab.Screen
          name="Feed"
          component={FeedStack}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>📊</Text>,
          }}
        />
        <Tab.Screen
          name="Board"
          component={LeaderboardStack}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>🏆</Text>,
          }}
        />
        <Tab.Screen
          name="Mine"
          component={FeedStack}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>💼</Text>,
          }}
        />
        <Tab.Screen
          name="Markets"
          component={FeedStack}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>🔍</Text>,
          }}
        />
        <Tab.Screen
          name="Me"
          component={FeedStack}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>👤</Text>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
