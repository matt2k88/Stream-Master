import React from "react";
import { View, StyleSheet, BackHandler, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Colors } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MUSIC_TEST_URL = "https://youtube-music-player-ax3a.bolt.host/";

export default function MusicTestScreen() {
  const navigation = useNavigation<NavigationProp>();

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== "android") return;
      const handler = BackHandler.addEventListener("hardwareBackPress", () => {
        navigation.goBack();
        return true;
      });
      return () => handler.remove();
    }, [navigation]),
  );

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: MUSIC_TEST_URL }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        mediaPlaybackRequiresUserGesture={false}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
