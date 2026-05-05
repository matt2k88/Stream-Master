import React, { useEffect, useState, useCallback } from "react";
import { StyleSheet, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { FavouritesProvider } from "@/contexts/FavouritesContext";
import { MessageProvider } from "@/contexts/MessageContext";
import MessagePopup from "@/components/MessagePopup";
import IntroOverlay from "@/components/IntroOverlay";
import { Colors } from "@/constants/theme";

export default function App() {
  // Skip intro entirely on web — expo-video doesn't work in browsers
  const [introComplete, setIntroComplete] = useState(Platform.OS === "web");

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

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
                    <FavouritesProvider>
                      <MessageProvider>
                        <KeyboardProvider>
                          <NavigationContainer>
                            <RootStackNavigator />
                          </NavigationContainer>
                          <StatusBar style="light" hidden={false} />
                          <MessagePopup />
                        </KeyboardProvider>
                      </MessageProvider>
                    </FavouritesProvider>
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
