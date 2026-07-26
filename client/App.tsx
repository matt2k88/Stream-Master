import React, { useEffect, useState, useCallback, useRef } from "react";
import { StyleSheet, AppState, AppStateStatus, Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { consumeReplayIntroFlag } from "@/lib/intro-flag";
import { NavigationContainer } from "@react-navigation/native";
import { navigationRef } from "@/lib/navigation-ref";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useKeepAwake } from "expo-keep-awake";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { FavouritesProvider } from "@/contexts/FavouritesContext";
import { WatchHistoryProvider } from "@/contexts/WatchHistoryContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { GroupsProvider } from "@/contexts/GroupsContext";
import { FootballProvider } from "@/contexts/FootballContext";
import { MatchReminderProvider } from "@/contexts/MatchReminderContext";
import { MessageProvider } from "@/contexts/MessageContext";
import { VpnProvider } from "@/contexts/VpnContext";
import { CategoryOrderProvider } from "@/contexts/CategoryOrderContext";
import { UISettingsProvider } from "@/contexts/UISettingsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import MessagePopup from "@/components/MessagePopup";
import MatchReminderOverlay from "@/components/MatchReminderOverlay";
import IntroOverlay from "@/components/IntroOverlay";
import SideMenuDrawer from "@/components/SideMenuDrawer";
import { SideMenuProvider } from "@/contexts/SideMenuContext";
import { PortalProvider } from "@/contexts/PortalContext";
import { Colors } from "@/constants/theme";

export default function App() {
  // Keep the device awake the whole time the app is in the foreground.
  useKeepAwake();

  // Force landscape throughout the entire app.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  // Skip the video intro entirely on web — it requires native video playback
  const [introComplete, setIntroComplete] = useState(Platform.OS === "web");

  const handleIntroDone = useCallback(() => {
    setIntroComplete(true);
  }, []);

  // Cold-start check: if the user pressed "Exit App" last session, force
  // the intro to play this launch even if the JS state somehow survived
  // (e.g. Android kept the process warm).
  useEffect(() => {
    (async () => {
      const replay = await consumeReplayIntroFlag();
      if (replay) setIntroComplete(false);
    })();
  }, []);

  // Warm-resume check: when the OS brings the app back to the foreground
  // (e.g. after the user pressed "Exit App" on iOS where we cannot truly
  // terminate, or Android decided not to kill the process), re-check the
  // flag and replay the intro from the start.
  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev !== "active" && next === "active") {
        const replay = await consumeReplayIntroFlag();
        if (replay) setIntroComplete(false);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            {!introComplete ? (
              <IntroOverlay onDone={handleIntroDone} />
            ) : (
              <ThemeProvider>
              <AuthProvider>
                <DataProvider>
                  <ProfileProvider>
                    <UISettingsProvider>
                    <CategoryOrderProvider>
                    <FavouritesProvider>
                      <WatchHistoryProvider>
                        <WatchlistProvider>
                        <GroupsProvider>
                        <FootballProvider>
                        <MatchReminderProvider>
                        <MessageProvider>
                          <VpnProvider>
                          <KeyboardProvider>
                            <PortalProvider>
                            <SideMenuProvider>
                              <NavigationContainer ref={navigationRef}>
                                <RootStackNavigator />
                              </NavigationContainer>
                              <StatusBar style="light" hidden={false} />
                              <MessagePopup />
                              <MatchReminderOverlay />
                              <SideMenuDrawer />
                            </SideMenuProvider>
                            </PortalProvider>
                          </KeyboardProvider>
                          </VpnProvider>
                        </MessageProvider>
                        </MatchReminderProvider>
                        </FootballProvider>
                        </GroupsProvider>
                        </WatchlistProvider>
                      </WatchHistoryProvider>
                    </FavouritesProvider>
                    </CategoryOrderProvider>
                    </UISettingsProvider>
                  </ProfileProvider>
                </DataProvider>
              </AuthProvider>
              </ThemeProvider>
            )}
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
