import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/theme";

import LoginScreen from "@/screens/LoginScreen";
import HomeScreen from "@/screens/HomeScreen";
import CategoryScreen from "@/screens/CategoryScreen";
import ContentListScreen from "@/screens/ContentListScreen";
import SeriesDetailScreen from "@/screens/SeriesDetailScreen";
import PlayerScreen from "@/screens/PlayerScreen";
import AccountInfoScreen from "@/screens/AccountInfoScreen";

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Category: {
    type: "live" | "movies" | "series";
    title: string;
  };
  ContentList: {
    type: "live" | "movies" | "series";
    categoryId: string;
    categoryName: string;
  };
  SeriesDetail: {
    seriesId: number;
    seriesName: string;
    cover: string;
  };
  Player: {
    streamUrl: string;
    title: string;
    type: "live" | "vod" | "series";
  };
  AccountInfo: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={Colors.dark.accent} />
    </View>
  );
}

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        ...screenOptions,
        headerShown: false,
        animation: "fade",
      }}
    >
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Category" component={CategoryScreen} />
          <Stack.Screen name="ContentList" component={ContentListScreen} />
          <Stack.Screen name="SeriesDetail" component={SeriesDetailScreen} />
          <Stack.Screen
            name="Player"
            component={PlayerScreen}
            options={{
              animation: "fade",
              orientation: "landscape",
            }}
          />
          <Stack.Screen name="AccountInfo" component={AccountInfoScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
