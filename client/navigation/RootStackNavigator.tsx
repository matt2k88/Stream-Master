import React from "react";
import { View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { useProfile } from "@/contexts/ProfileContext";
import { Profile } from "@/contexts/ProfileContext";
import { Colors } from "@/constants/theme";
import { SyncScreen } from "@/components/SyncScreen";

import LoginScreen from "@/screens/LoginScreen";
import HomeScreen from "@/screens/HomeScreen";
import CategoryScreen from "@/screens/CategoryScreen";
import ContentListScreen from "@/screens/ContentListScreen";
import SeriesDetailScreen from "@/screens/SeriesDetailScreen";
import PlayerScreen from "@/screens/PlayerScreen";
import AccountInfoScreen from "@/screens/AccountInfoScreen";
import ProfilePickerScreen from "@/screens/ProfilePickerScreen";
import CreateProfileScreen from "@/screens/CreateProfileScreen";
import PinEntryScreen from "@/screens/PinEntryScreen";

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Category: { type: "live" | "movies" | "series"; title: string };
  ContentList: { type: "live" | "movies" | "series"; categoryId: string; categoryName: string };
  SeriesDetail: { seriesId: number; seriesName: string; cover: string };
  Player: { streamUrl: string; title: string; type: "live" | "vod" | "series" };
  AccountInfo: undefined;
  ProfilePicker: { fromHome?: boolean } | undefined;
  CreateProfile: { profile?: Profile } | undefined;
  PinEntry: { profile: Profile; fromHome?: boolean };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });
  const { isAuthenticated, isLoading } = useAuth();
  const { isSyncing, syncProgress } = useData();
  const { activeProfile } = useProfile();

  if (isLoading) {
    return <View style={styles.blank} />;
  }

  return (
    <>
      <Stack.Navigator
        screenOptions={{ ...screenOptions, headerShown: false, animation: "fade" }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !activeProfile ? (
          // Authenticated but no profile selected yet — must pick one
          <>
            <Stack.Screen name="ProfilePicker" component={ProfilePickerScreen} />
            <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
            <Stack.Screen name="PinEntry" component={PinEntryScreen} />
          </>
        ) : (
          // Fully authenticated with active profile
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Category" component={CategoryScreen} />
            <Stack.Screen name="ContentList" component={ContentListScreen} />
            <Stack.Screen name="SeriesDetail" component={SeriesDetailScreen} />
            <Stack.Screen
              name="Player"
              component={PlayerScreen}
              options={{ animation: "fade", orientation: "landscape" }}
            />
            <Stack.Screen name="AccountInfo" component={AccountInfoScreen} />
            <Stack.Screen name="ProfilePicker" component={ProfilePickerScreen} />
            <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
            <Stack.Screen name="PinEntry" component={PinEntryScreen} />
          </>
        )}
      </Stack.Navigator>

      {isSyncing ? <SyncScreen progress={syncProgress} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
});
