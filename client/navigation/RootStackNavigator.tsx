import React from "react";
import { View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
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
import SearchScreen from "@/screens/SearchScreen";
import MessagesScreen from "@/screens/MessagesScreen";
import LivePreviewScreen from "@/screens/LivePreviewScreen";
import TvGuideScreen from "@/screens/TvGuideScreen";
import CatchUpScreen from "@/screens/CatchUpScreen";

export type RootStackParamList = {
  Login: undefined;
  ProfilePicker: { fromHome?: boolean } | undefined;
  CreateProfile: { profile?: Profile } | undefined;
  PinEntry: { profile: Profile; fromHome?: boolean };
  Home: undefined;
  Search: undefined;
  Messages: undefined;
  TvGuide: undefined;
  CatchUp: undefined;
  Category: { type: "live" | "movies" | "series"; title: string };
  ContentList: { type: "live" | "movies" | "series"; categoryId: string; categoryName: string };
  SeriesDetail: { seriesId: number; seriesName: string; cover: string; initialSeason?: number };
  Player: { streamUrl: string; title: string; type: "live" | "vod" | "series"; thumbnail?: string; streamId?: string; seriesId?: string; seriesName?: string; resumeTime?: number; seasonNum?: number; episodeNum?: number };
  LivePreview: { streamId: number; name: string; streamUrl: string; thumbnail?: string; streamIcon?: string; categoryId?: string };
  AccountInfo: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });
  const { isAuthenticated, isLoading } = useAuth();
  const { isSyncing, syncProgress } = useData();

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
        ) : (
          <>
            <Stack.Screen name="ProfilePicker" component={ProfilePickerScreen} />
            <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
            <Stack.Screen name="PinEntry" component={PinEntryScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
            <Stack.Screen name="Category" component={CategoryScreen} />
            <Stack.Screen name="ContentList" component={ContentListScreen} />
            <Stack.Screen name="SeriesDetail" component={SeriesDetailScreen} />
            <Stack.Screen
              name="Player"
              component={PlayerScreen}
              options={{ animation: "fade", orientation: "landscape" }}
            />
            <Stack.Screen
              name="LivePreview"
              component={LivePreviewScreen}
              options={{ animation: "fade", orientation: "landscape" }}
            />
            <Stack.Screen name="TvGuide" component={TvGuideScreen} />
            <Stack.Screen name="CatchUp" component={CatchUpScreen} />
            <Stack.Screen name="AccountInfo" component={AccountInfoScreen} />
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
