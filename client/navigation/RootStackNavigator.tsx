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
import MovieInfoScreen from "@/screens/MovieInfoScreen";
import PlayerScreen from "@/screens/PlayerScreen";
import VlcPlayerScreen from "@/screens/VlcPlayerScreen";
import { usePlayerEngine } from "@/contexts/PlayerEngineContext";
import { useRoute, RouteProp } from "@react-navigation/native";
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
  MovieInfo: {
    streamId: number;
    name: string;
    streamIcon?: string;
    containerExtension?: string;
    categoryId?: string;
  };
  Player: { streamUrl: string; title: string; type: "live" | "vod" | "series"; thumbnail?: string; streamId?: string; seriesId?: string; seriesName?: string; resumeTime?: number; seasonNum?: number; episodeNum?: number };
  LivePreview: { streamId: number; name: string; streamUrl: string; thumbnail?: string; streamIcon?: string; categoryId?: string; initialFullscreen?: boolean };
  AccountInfo: undefined;
  OrganiseTypePicker: undefined;
  OrganiseCategories: { type: "live" | "movies" | "series" };
  ContentRequests: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ── Engine routers — keep route names stable, switch implementation
//    based on the user's selected player engine (Account → Video Player).
function PlayerRouter() {
  const { engine } = usePlayerEngine();
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  if (engine === "vlc") {
    return (
      <VlcPlayerScreen
        streamUrl={route.params.streamUrl}
        title={route.params.title}
        type={route.params.type}
        thumbnail={route.params.thumbnail}
        streamId={route.params.streamId}
        seriesId={route.params.seriesId}
        seriesName={route.params.seriesName}
        seasonNum={route.params.seasonNum}
        episodeNum={route.params.episodeNum}
        resumeTime={route.params.resumeTime}
      />
    );
  }
  return <PlayerScreen />;
}

function LivePreviewRouter() {
  const { engine } = usePlayerEngine();
  const route = useRoute<RouteProp<RootStackParamList, "LivePreview">>();
  // VLC engine has no preview UX — go straight into the VLC fullscreen player.
  if (engine === "vlc") {
    return (
      <VlcPlayerScreen
        streamUrl={route.params.streamUrl}
        title={route.params.name}
        type="live"
        thumbnail={route.params.streamIcon ?? route.params.thumbnail}
        streamId={String(route.params.streamId)}
      />
    );
  }
  return <LivePreviewScreen />;
}

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
              component={PlayerRouter}
              options={{ animation: "fade", orientation: "landscape" }}
            />
            <Stack.Screen
              name="LivePreview"
              component={LivePreviewRouter}
              options={{ animation: "fade" }}
            />
            <Stack.Screen name="TvGuide" component={TvGuideScreen} />
            <Stack.Screen name="CatchUp" component={CatchUpScreen} />
            <Stack.Screen name="AccountInfo" component={AccountInfoScreen} />
            <Stack.Screen name="OrganiseTypePicker" component={OrganiseTypePickerScreen} />
            <Stack.Screen name="OrganiseCategories" component={OrganiseCategoriesScreen} />
            <Stack.Screen name="ContentRequests" component={ContentRequestsScreen} />
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
