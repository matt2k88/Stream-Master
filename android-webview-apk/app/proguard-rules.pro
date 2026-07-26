# LibVLC and ExoPlayer must not be obfuscated.
-keep class org.videolan.** { *; }
-keep class androidx.media3.** { *; }

# Keep JavaScript interface methods (called by name from JS).
-keepclassmembers class com.ultracast.webview.NativePlayerBridge {
    @android.webkit.JavascriptInterface <methods>;
}
