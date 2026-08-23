import React from "react";
import { View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Profile } from "@/contexts/ProfileContext";
import { Colors } from "@/constants/theme";
import { SyncScreen } from "@/components/SyncScreen";
import PortraitBottomNav from "@/components/PortraitBottomNav";

import LoginScreen from "@/screens/LoginScreen";
import HomeScreen from "@/screens/HomeScreen";
import CategoryScreen from "@/screens/CategoryScreen";
import ContentListScreen from "@/screens/ContentListScreen";
import SeriesDetailScreen from "@/screens/SeriesDetailScreen";
import MovieInfoScreen from "@/screens/MovieInfoScreen";
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
import OrganiseTypePickerScreen from "@/screens/OrganiseTypePickerScreen";
import OrganiseCategoriesScreen from "@/screens/OrganiseCategoriesScreen";
import ContentRequestsScreen from "@/screens/ContentRequestsScreen";
import PlayerSettingsScreen from "@/screens/PlayerSettingsScreen";
import SpeedTestScreen from "@/screens/SpeedTestScreen";
import MultiScreenLayoutScreen, { type MultiLayout } from "@/screens/MultiScreenLayoutScreen";
import MultiScreenScreen from "@/screens/MultiScreenScreen";
import MultiScreenPickerScreen from "@/screens/MultiScreenPickerScreen";
import MyGroupsScreen from "@/screens/MyGroupsScreen";
import FootballSettingsScreen from "@/screens/FootballSettingsScreen";
import FootballCentreScreen from "@/screens/FootballCentreScreen";
import TopPicksScreen from "@/screens/TopPicksScreen";
import ReferralsScreen from "@/screens/ReferralsScreen";
import UltraTubeScreen from "@/screens/UltraTubeScreen";
import SportListingsScreen from "@/screens/SportListingsScreen";
import UltraMusicScreen from "@/screens/UltraMusicScreen";
import ParentalControlsScreen from "@/screens/ParentalControlsScreen";
import DownloadsScreen from "@/screens/DownloadsScreen";

export type RootStackParamList = {
  Login: undefined;
  ProfilePicker: { fromHome?: boolean } | undefined;
  CreateProfile: { profile?: Profile } | undefined;
  PinEntry: { profile: Profile; fromHome?: boolean };
  Home: undefined;
  Search: { initialQuery?: string } | undefined;
  Messages: undefined;
  TvGuide: { initialGroupId?: string } | undefined;
  CatchUp: undefined;
  Category: { type: "live" | "movies" | "series"; title: string };
  ContentList: { type: "live" | "movies" | "series"; categoryId: string; categoryName: string };
  SeriesDetail: { seriesId: number; seriesName: string; cover: string; initialSeason?: number };
  MovieInfo: {
    streamId: number;
    name: string;
    streamIcon?: string;
    containerExtension?: string;
    categoryId?: string;
  };
  Player: { streamUrl: string; title: string; type: "live" | "vod" | "series"; thumbnail?: string; streamId?: string; seriesId?: string; seriesName?: string; resumeTime?: number; seasonNum?: number; episodeNum?: number; forceEngine?: "expo" | "vlc"; offline?: boolean };
  LivePreview: { streamId: number; name: string; streamUrl: string; thumbnail?: string; streamIcon?: string; categoryId?: string; initialFullscreen?: boolean };
  AccountInfo: undefined;
  OrganiseTypePicker: undefined;
  OrganiseCategories: { type: "live" | "movies" | "series" };
  ContentRequests: undefined;
  PlayerSettings: undefined;
  SpeedTest: undefined;
  MultiScreenLayout: undefined;
  MultiScreen: { layout: MultiLayout };
  MultiScreenPicker: { slotIndex: number };
  MyGroups: { type: "live" | "movies" | "series" };
  FootballSettings: undefined;
  FootballCentre: undefined;
  TopPicks: undefined;
  Referrals: undefined;
  UltraTube: undefined;
  SportListings: undefined;
  ParentalControls: undefined;
  MusicPlayer: undefined;
  Downloads: undefined;
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
      <View style={styles.appColumn}>
        <View style={styles.navArea}>
      <Stack.Navigator
        screenOptions={{ ...screenOptions, headerShown: false, animation: "fade" }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="ProfilePicker" component={ProfilePickerScreen} />
            <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
            <Stack.Screen name="PinEntry" component={PinEntryScreen} options={{ presentation: "transparentModal", animation: "fade" }} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
            <Stack.Screen name="Category" component={CategoryScreen} />
            <Stack.Screen name="ContentList" component={ContentListScreen} />
            <Stack.Screen name="SeriesDetail" component={SeriesDetailScreen} />
            <Stack.Screen name="MovieInfo" component={MovieInfoScreen} />
            <Stack.Screen
              name="Player"
              component={PlayerScreen}
              options={{ animation: "fade" }}
            />
            <Stack.Screen
              name="LivePreview"
              component={LivePreviewScreen}
              options={{ animation: "fade" }}
            />
            <Stack.Screen name="TvGuide" component={TvGuideScreen} />
            <Stack.Screen name="CatchUp" component={CatchUpScreen} />
            <Stack.Screen name="AccountInfo" component={AccountInfoScreen} />
            <Stack.Screen name="OrganiseTypePicker" component={OrganiseTypePickerScreen} />
            <Stack.Screen name="OrganiseCategories" component={OrganiseCategoriesScreen} />
            <Stack.Screen name="ContentRequests" component={ContentRequestsScreen} />
            <Stack.Screen name="PlayerSettings" component={PlayerSettingsScreen} />
            <Stack.Screen name="SpeedTest" component={SpeedTestScreen} />
            <Stack.Screen
              name="MultiScreenLayout"
              component={MultiScreenLayoutScreen}
              options={{}}
            />
            <Stack.Screen
              name="MultiScreen"
              component={MultiScreenScreen}
              options={{ animation: "fade" }}
            />
            <Stack.Screen
              name="MultiScreenPicker"
              component={MultiScreenPickerScreen}
              options={{}}
            />
            <Stack.Screen name="MyGroups" component={MyGroupsScreen} />
            <Stack.Screen name="FootballSettings" component={FootballSettingsScreen} />
            <Stack.Screen name="FootballCentre" component={FootballCentreScreen} />
            <Stack.Screen name="TopPicks" component={TopPicksScreen} />
            <Stack.Screen name="Referrals" component={ReferralsScreen} />
            <Stack.Screen name="UltraTube" component={UltraTubeScreen} />
            <Stack.Screen name="SportListings" component={SportListingsScreen} />
            <Stack.Screen name="ParentalControls" component={ParentalControlsScreen} />
            <Stack.Screen name="MusicPlayer" component={UltraMusicScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Downloads" component={DownloadsScreen} />
          </>
        )}
      </Stack.Navigator>
        </View>
        {isAuthenticated ? <PortraitBottomNav /> : null}
      </View>

      {isSyncing ? <SyncScreen progress={syncProgress} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  appColumn: { flex: 1 },
  navArea: { flex: 1 },
});
