import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AthleteProvider } from '../../context/AthleteContext';
import { RaceProvider } from '../../context/RaceContext';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AthleteProvider>
            <RaceProvider>
              <Stack screenOptions={{ headerShown: false }} />
              <ThemedStatusBar />
            </RaceProvider>
          </AthleteProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
