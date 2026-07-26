package com.ultracast.webview

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.ultracast.webview.databinding.ActivityMainBinding

/**
 * Single-activity host for the Ultra Cast web app.
 *
 * Layout: FrameLayout with a full-screen WebView underneath and a
 * SurfaceView on top (GONE by default). The SurfaceView becomes VISIBLE
 * when the JS bridge calls setFullscreen(true), giving LibVLC / ExoPlayer
 * a dedicated rendering surface while the WebView remains alive for the UI.
 *
 * The production URL is baked in via BuildConfig.APP_URL so it can be
 * changed in app/build.gradle without touching Kotlin source.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var playerBridge: NativePlayerBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep the screen on while the app is in the foreground.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        hideSystemUi()
        setupWebView()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val webView     = binding.webView
        val surfaceView = binding.videoSurface

        with(webView.settings) {
            javaScriptEnabled            = true
            domStorageEnabled            = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode         = true
            useWideViewPort              = true
            builtInZoomControls          = false
            setSupportZoom(false)
            // Allow the HTTPS page to load HTTP IPTV streams.
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // Register the native player bridge under window.UltraCastPlayer.
        playerBridge = NativePlayerBridge(this, webView, surfaceView)
        webView.addJavascriptInterface(playerBridge, "UltraCastPlayer")

        webView.webViewClient = object : WebViewClient() {

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                // Inject the detection flag before any app JS runs.
                // evaluateJavascript is safe to call from onPageStarted.
                view.evaluateJavascript("window.__ULTRACAST_WEBVIEW__ = true;", null)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                // Re-inject in case the page replaced window during initialisation.
                view.evaluateJavascript(
                    "if (!window.__ULTRACAST_WEBVIEW__) window.__ULTRACAST_WEBVIEW__ = true;",
                    null
                )
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // Keep all navigation inside the WebView — do not open external apps.
                return false
            }
        }

        // Handle HTML5 fullscreen requests (e.g. <video> fullscreen API).
        webView.webChromeClient = object : WebChromeClient() {
            private var customView: View? = null
            private var customViewCallback: CustomViewCallback? = null

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                // A video element requested fullscreen — just hide system UI.
                customView         = view
                customViewCallback = callback
                hideSystemUi()
            }

            override fun onHideCustomView() {
                customViewCallback?.onCustomViewHidden()
                customView         = null
                customViewCallback = null
                hideSystemUi()
            }
        }

        webView.loadUrl(BuildConfig.APP_URL)
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    override fun onPause() {
        super.onPause()
        binding.webView.onPause()
        playerBridge.onPause()
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        playerBridge.onResume()
        hideSystemUi()
    }

    override fun onDestroy() {
        super.onDestroy()
        playerBridge.onDestroy()
        binding.webView.destroy()
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        // If the native video surface is visible, exit fullscreen first.
        if (binding.videoSurface.visibility == View.VISIBLE) {
            playerBridge.setFullscreen(false)
            binding.webView.evaluateJavascript(
                "window.__ucPlayerEvent && window.__ucPlayerEvent('stopped',{});", null
            )
            return
        }
        // Let the web page handle back navigation before exiting.
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    // ── System UI helpers ─────────────────────────────────────────────────

    private fun hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { ctrl ->
                ctrl.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                ctrl.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }
    }
}
