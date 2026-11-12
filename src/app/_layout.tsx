// The frame around every screen: loads the fonts, provides the theme and sets up gestures.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ResultsProvider } from '../results/useResults';
import { SearchProvider } from '../search/SearchContext';
import { SelectionProvider } from '../selection/useSelection';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
import { FONTS } from '../theme/themes';

function Screens() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.panel },
          headerTintColor: t.text,
          headerTitleStyle: { fontFamily: FONTS.heading },
          contentStyle: { backgroundColor: t.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ title: 'Search flights' }} />
        <Stack.Screen name="results" options={{ title: 'Results' }} />
        <Stack.Screen name="destination" options={{ title: 'Flights' }} />
        <Stack.Screen name="planner" options={{ title: 'Planner' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="debug" options={{ title: 'Flight data (debug)' }} />
      </Stack>
      <StatusBar style="light" />
    </View>
  );
}

export default function RootLayout() {
  // The app shows as soon as the fonts are ready (or failed: it then falls back to the system font)
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, SpaceGrotesk_700Bold });
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: '#050505' }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SearchProvider>
            <SelectionProvider>
              <ResultsProvider>
                <Screens />
              </ResultsProvider>
            </SelectionProvider>
          </SearchProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
