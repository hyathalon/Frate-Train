import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AthleteProvider } from '../../context/AthleteContext';
import { RaceProvider } from '../../context/RaceContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AthleteProvider>
        <RaceProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="light" />
        </RaceProvider>
      </AthleteProvider>
    </SafeAreaProvider>
  );
}
