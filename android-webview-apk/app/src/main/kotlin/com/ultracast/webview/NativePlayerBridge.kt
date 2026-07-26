package com.ultracast.webview

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.SurfaceView
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import org.json.JSONObject
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer as VLCMediaPlayer

/**
 * Kotlin object registered as window.UltraCastPlayer in the WebView.
 *
 * JavaScript calls these @JavascriptInterface methods to drive playback.
 * Native callbacks (state changes, position updates) are fired back to JS
 * via webView.evaluateJavascript("window.__ucPlayerEvent(name, data)").
 *
 * Engine routing:
 *   HLS (.m3u8) / DASH (.mpd) / MP4 → ExoPlayer (Media 3)
 *   Raw MPEG-TS, RTSP, Xtream, unknown → LibVLC (widest codec support)
 */
class NativePlayerBridge(
    private val context: Context,
    private val webView: WebView,
    private val surfaceView: SurfaceView,
) {

    private val TAG = "UltraCastBridge"
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── LibVLC ────────────────────────────────────────────────────────────
    private var libVlc: LibVLC? = null
    private var vlcPlayer: VLCMediaPlayer? = null

    // ── ExoPlayer (Media 3) ───────────────────────────────────────────────
    private var exoPlayer: ExoPlayer? = null
    private var exoTimeHandler: Handler? = null
    private var exoTimeRunnable: Runnable? = null

    // ── Active state ──────────────────────────────────────────────────────
    @Volatile private var activeEngine: Engine = Engine.NONE

    enum class Engine { NONE, VLC, EXO }

    // ═════════════════════════════════════════════════════════════════════
    //  JS → Native   (called on a background thread by the WebView)
    // ═════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun play(url: String, mimeHint: String, title: String) {
        Log.d(TAG, "play() url=$url mimeHint=$mimeHint")
        mainHandler.post {
            val engine = resolveEngine(url, mimeHint)
            stopAll()
            activeEngine = engine
            when (engine) {
                Engine.EXO -> playWithExo(url, mimeHint)
                Engine.VLC -> playWithVlc(url)
                Engine.NONE -> {}
            }
        }
    }

    @JavascriptInterface
    fun pause() {
        mainHandler.post {
            when (activeEngine) {
                Engine.EXO -> exoPlayer?.pause()
                Engine.VLC -> vlcPlayer?.pause()
                Engine.NONE -> {}
            }
        }
    }

    @JavascriptInterface
    fun resume() {
        mainHandler.post {
            when (activeEngine) {
                Engine.EXO -> exoPlayer?.play()
                Engine.VLC -> vlcPlayer?.play()
                Engine.NONE -> {}
            }
        }
    }

    @JavascriptInterface
    fun stop() {
        mainHandler.post { stopAll() }
    }

    @JavascriptInterface
    fun seekTo(ms: Long) {
        mainHandler.post {
            when (activeEngine) {
                Engine.EXO -> exoPlayer?.seekTo(ms)
                Engine.VLC -> {
                    val dur = vlcPlayer?.length ?: 0L
                    if (dur > 0) {
                        vlcPlayer?.position = (ms.toFloat() / dur.toFloat()).coerceIn(0f, 1f)
                    }
                }
                Engine.NONE -> {}
            }
        }
    }

    /**
     * Volume level 0–100 (JS sends integer).
     * ExoPlayer uses 0.0–1.0 float; LibVLC uses 0–200 (100 = 100%).
     */
    @JavascriptInterface
    fun setVolume(level: Int) {
        val clamped = level.coerceIn(0, 100)
        mainHandler.post {
            when (activeEngine) {
                Engine.EXO -> exoPlayer?.volume = clamped / 100f
                Engine.VLC -> vlcPlayer?.volume = clamped
                Engine.NONE -> {}
            }
        }
    }

    /**
     * Show (on=true) or hide (on=false) the native video surface.
     * The SurfaceView sits on top of the WebView in the FrameLayout; making
     * it VISIBLE gives the native player a full-screen rendering surface while
     * the WebView (and its JS UI) remain alive in the background.
     */
    @JavascriptInterface
    fun setFullscreen(on: Boolean) {
        mainHandler.post {
            surfaceView.visibility = if (on) View.VISIBLE else View.GONE
            if (on) surfaceView.bringToFront()
        }
    }

    /**
     * ratio: "16:9", "4:3", "FILL", "BEST_FIT", etc.
     * Only LibVLC has a direct aspectRatio setter; ExoPlayer handles aspect
     * via its PlayerView layout (not needed in our surface-only setup).
     */
    @JavascriptInterface
    fun setAspectRatio(ratio: String) {
        mainHandler.post {
            if (activeEngine == Engine.VLC) {
                vlcPlayer?.aspectRatio = ratio
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Engine routing
    // ═════════════════════════════════════════════════════════════════════

    private fun resolveEngine(url: String, mimeHint: String): Engine {
        val hint = mimeHint.lowercase()
        return when {
            hint == "hls"  -> Engine.EXO
            hint == "dash" -> Engine.EXO
            hint == "mp4"  -> Engine.EXO
            url.contains(".m3u8", ignoreCase = true) -> Engine.EXO
            url.contains(".mpd",  ignoreCase = true) -> Engine.EXO
            url.endsWith(".mp4",  ignoreCase = true) -> Engine.EXO
            url.endsWith(".webm", ignoreCase = true) -> Engine.EXO
            // Raw MPEG-TS, RTSP, Xtream Codes URLs, unknown containers → VLC
            else -> Engine.VLC
        }
    }

    private fun stopAll() {
        try {
            exoPlayer?.stop()
            exoPlayer?.setVideoSurface(null)
        } catch (_: Exception) {}
        try {
            vlcPlayer?.stop()
            vlcPlayer?.vlcVout?.detachViews()
        } catch (_: Exception) {}
        activeEngine = Engine.NONE
    }

    // ═════════════════════════════════════════════════════════════════════
    //  LibVLC playback
    // ═════════════════════════════════════════════════════════════════════

    private fun playWithVlc(url: String) {
        // Detach ExoPlayer from the surface first.
        try { exoPlayer?.setVideoSurface(null) } catch (_: Exception) {}

        val vlc    = getOrCreateLibVlc()
        val player = getOrCreateVlcPlayer(vlc)

        // Wire VLC output to the SurfaceView.
        val vout = player.vlcVout
        vout.setVideoSurface(surfaceView.holder.surface, surfaceView.holder)
        vout.attachViews()

        val media = Media(vlc, Uri.parse(url)).apply {
            addOption(":network-caching=3000")
            addOption(":file-caching=3000")
            addOption(":http-reconnect")
        }
        player.media = media
        media.release()
        player.play()
    }

    private fun getOrCreateLibVlc(): LibVLC {
        return libVlc ?: LibVLC(context, ArrayList<String>().apply {
            add("--http-reconnect")
            add("--network-caching=3000")
            add("--file-caching=3000")
        }).also { libVlc = it }
    }

    private fun getOrCreateVlcPlayer(vlc: LibVLC): VLCMediaPlayer {
        vlcPlayer?.let { return it }
        val player = VLCMediaPlayer(vlc)
        player.setEventListener { event ->
            when (event.type) {
                VLCMediaPlayer.Event.Playing        -> sendEvent("playing", "{}")
                VLCMediaPlayer.Event.Paused         -> sendEvent("paused", "{}")
                VLCMediaPlayer.Event.Stopped        -> sendEvent("stopped", "{}")
                VLCMediaPlayer.Event.EncounteredError ->
                    sendEvent("error", """{"message":"LibVLC playback error"}""")
                VLCMediaPlayer.Event.Buffering      ->
                    sendEvent("buffering", """{"percent":${event.buffering}}""")
                VLCMediaPlayer.Event.TimeChanged    ->
                    sendEvent("timeUpdate", """{"positionMs":${event.timeChanged}}""")
                VLCMediaPlayer.Event.LengthChanged  ->
                    sendEvent("durationChange", """{"durationMs":${event.lengthChanged}}""")
            }
        }
        vlcPlayer = player
        return player
    }

    // ═════════════════════════════════════════════════════════════════════
    //  ExoPlayer (Media 3) playback
    // ═════════════════════════════════════════════════════════════════════

    private fun playWithExo(url: String, mimeHint: String) {
        // Detach VLC from the surface first.
        try { vlcPlayer?.vlcVout?.detachViews() } catch (_: Exception) {}

        val player = getOrCreateExoPlayer()

        // Give ExoPlayer the SurfaceView's surface.
        player.setVideoSurface(surfaceView.holder.surface)

        val mimeType = when {
            mimeHint.equals("dash", ignoreCase = true)          -> MimeTypes.APPLICATION_MPD
            url.contains(".mpd", ignoreCase = true)             -> MimeTypes.APPLICATION_MPD
            mimeHint.equals("hls", ignoreCase = true)           -> MimeTypes.APPLICATION_M3U8
            url.contains(".m3u8", ignoreCase = true)            -> MimeTypes.APPLICATION_M3U8
            else -> MimeTypes.APPLICATION_M3U8 // ExoPlayer auto-detects MP4 from container
        }

        val mediaItem = MediaItem.Builder()
            .setUri(url)
            .setMimeType(mimeType)
            .build()

        player.setMediaItem(mediaItem)
        player.prepare()
        player.play()
    }

    private fun getOrCreateExoPlayer(): ExoPlayer {
        exoPlayer?.let { return it }

        val player = ExoPlayer.Builder(context).build()

        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) sendEvent("playing", "{}") else sendEvent("paused", "{}")
            }

            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_ENDED     -> sendEvent("stopped", "{}")
                    Player.STATE_BUFFERING -> sendEvent("buffering", "{}")
                    Player.STATE_READY     -> {
                        val dur = player.duration
                        if (dur > 0) sendEvent("durationChange", """{"durationMs":$dur}""")
                    }
                    else -> {}
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                val msg = JSONObject.quote(error.message ?: "ExoPlayer error")
                sendEvent("error", """{"message":$msg}""")
            }
        })

        // Periodic timeUpdate ticker (ExoPlayer has no built-in 500ms callback).
        val handler = Handler(Looper.getMainLooper())
        val runnable = object : Runnable {
            override fun run() {
                if (activeEngine == Engine.EXO) {
                    val pos = try { player.currentPosition } catch (_: Exception) { 0L }
                    sendEvent("timeUpdate", """{"positionMs":$pos}""")
                }
                handler.postDelayed(this, 500L)
            }
        }
        handler.post(runnable)
        exoTimeHandler  = handler
        exoTimeRunnable = runnable

        exoPlayer = player
        return player
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Event dispatch  (Native → JS)
    // ═════════════════════════════════════════════════════════════════════

    fun sendEvent(name: String, json: String) {
        val js = "window.__ucPlayerEvent && window.__ucPlayerEvent('$name',$json);"
        mainHandler.post { webView.evaluateJavascript(js, null) }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Lifecycle hooks  (called by MainActivity)
    // ═════════════════════════════════════════════════════════════════════

    fun onPause() {
        when (activeEngine) {
            Engine.EXO -> exoPlayer?.pause()
            Engine.VLC -> vlcPlayer?.pause()
            Engine.NONE -> {}
        }
    }

    fun onResume() {
        // Do not auto-resume — let the JS/web UI drive playback state on return.
    }

    fun onDestroy() {
        exoTimeRunnable?.let { exoTimeHandler?.removeCallbacks(it) }
        try { exoPlayer?.release() } catch (_: Exception) {}
        try { vlcPlayer?.release() } catch (_: Exception) {}
        try { libVlc?.release()   } catch (_: Exception) {}
        exoPlayer = null
        vlcPlayer = null
        libVlc    = null
    }
}
