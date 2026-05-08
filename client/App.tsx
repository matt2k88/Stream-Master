import React, { useEffect, useState, useCallback } from "react";
import { StyleSheet } from "react-native";
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

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            {!introComplete ? (
              <IntroOverlay onDone={handleIntroDone} />
            ) : (
              <AuthProvider>
                <DataProvider>
                  <ProfileProvider>
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
                  </ProfileProvider>
                </DataProvider>
              </AuthProvider>
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
