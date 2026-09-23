import { TopTabs } from 'expo-router/js-top-tabs';
import { useTheme } from '../../../../context/ThemeContext';

export default function GraphsTopTabsLayout() {
  const { colors, isDark } = useTheme();
  const tabBarBg = isDark ? '#1C1C1E' : colors.surface;

  return (
    <TopTabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIndicatorStyle: { backgroundColor: colors.primary, height: 3 },
        tabBarStyle: { backgroundColor: tabBarBg, elevation: 0, shadowOpacity: 0 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700', textTransform: 'none' },
      }}
    >
      <TopTabs.Screen name="load" options={{ title: 'Load' }} />
      <TopTabs.Screen name="strength" options={{ title: 'Strength' }} />
      <TopTabs.Screen name="running" options={{ title: 'Running' }} />
      <TopTabs.Screen name="races" options={{ title: 'Races' }} />
      <TopTabs.Screen name="pillars" options={{ title: 'Pillars' }} />
    </TopTabs>
  );
}
