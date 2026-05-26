import React, { useEffect, useState, useCallback, useRef } from "react";
import { StyleSheet, AppState, AppStateStatus } from "react-native";
import { consumeReplayIntroFlag } from "@/lib/intro-flag";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef<any>();
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
import { MessageProvider } from "@/contexts/MessageContext";
import { VpnProvider } from "@/contexts/VpnContext";
import { CategoryOrderProvider } from "@/contexts/CategoryOrderContext";
import { UISettingsProvider } from "@/contexts/UISettingsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { MusicProvider } from "@/contexts/MusicContext";
import MusicHost from "@/components/MusicHost";
import MessagePopup from "@/components/MessagePopup";
import IntroOverlay from "@/components/IntroOverlay";
import { Colors } from "@/constants/theme";

export default function App() {
  // Keep the device awake the whole time the app is in the foreground.
  // Fire TV / Android TV otherwise trip their system screensaver/sleep
  // after ~10 min of no remote input — which previously looked like the
  // VLC player "crashing" mid-playback, and also caused the menus to
  // appear to hang/black-out when left idle. expo-video already requests
  // a wake lock during active playback, but menus and any future
  // engine swap (VLC, react-native-video) need this app-level lock too.
  useKeepAwake();

  const [introComplete, setIntroComplete] = useState(false);

  // NOTE: orientation is no longer globally locked here. The intro locks
  // landscape while it plays, the Player screen locks landscape via its
  // navigator option, and everything else can rotate freely so users on
  // mobile can use the app in portrait OR landscape from the start.

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
                        <MessageProvider>
                          <VpnProvider>
                          <MusicProvider>
                          <KeyboardProvider>
                            <NavigationContainer ref={navigationRef}>
                              <RootStackNavigator />
                              <MusicHost />
                            </NavigationContainer>
                            <StatusBar style="light" hidden={false} />
                            <MessagePopup />
                          </KeyboardProvider>
                          </MusicProvider>
                          </VpnProvider>
                        </MessageProvider>
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
