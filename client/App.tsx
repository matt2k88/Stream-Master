import React, { useEffect, useState, useCallback, useRef } from "react";
import { StyleSheet, AppState, AppStateStatus } from "react-native";
import { consumeReplayIntroFlag } from "@/lib/intro-flag";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { FavouritesProvider } from "@/contexts/FavouritesContext";
import { WatchHistoryProvider } from "@/contexts/WatchHistoryContext";
import { MessageProvider } from "@/contexts/MessageContext";
import { VpnProvider } from "@/contexts/VpnContext";
import { CategoryOrderProvider } from "@/contexts/CategoryOrderContext";
import { UISettingsProvider } from "@/contexts/UISettingsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PlayerEngineProvider } from "@/contexts/PlayerEngineContext";
import MessagePopup from "@/components/MessagePopup";
import IntroOverlay from "@/components/IntroOverlay";
import { Colors } from "@/constants/theme";

export default function App() {
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
                    <PlayerEngineProvider>
                    <CategoryOrderProvider>
                    <FavouritesProvider>
                      <WatchHistoryProvider>
                        <MessageProvider>
                          <VpnProvider>
                          <KeyboardProvider>
                            <NavigationContainer>
                              <RootStackNavigator />
                            </NavigationContainer>
                            <StatusBar style="light" hidden={false} />
                            <MessagePopup />
                          </KeyboardProvider>
                          </VpnProvider>
                        </MessageProvider>
                      </WatchHistoryProvider>
                    </FavouritesProvider>
                    </CategoryOrderProvider>
                    </PlayerEngineProvider>
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
