import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '../../../constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textOnSurfaceFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Workout',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="rehab"
        options={{
          title: 'Rehab',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="fitness" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="integrations"
        options={{
          title: 'Integrations',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="link" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
