package expo.modules.tvremote

import android.util.Log
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Delivers hardware media keys (play/pause, rewind, fast-forward) to JS.
 *
 * Standard React Native has no TVEventHandler — that only ships in the
 * react-native-tvos fork — so the media-key handling the player screens
 * already contained could never fire on a Fire TV remote.
 *
 * MainActivity.dispatchKeyEvent (patched by plugins/withTvRemoteKeys.js) hands
 * keys to the bus below; this module forwards them to JS. Splitting capture
 * from delivery keeps the Activity patch to three lines and avoids reaching
 * for a ReactContext from the Activity, which is awkward under the new
 * architecture's bridgeless mode.
 */
object TvRemoteKeyBus {
  private const val TAG = "TvRemote"

  var listener: ((String) -> Unit)? = null

  // D-pad keys are reported but never consumed: focus traversal must keep
  // working exactly as before. The seek bar traps horizontal focus on itself
  // (nextFocusLeft/Right), so when it is focused these arrive without moving
  // focus anywhere, which is what lets left/right scrub.
  private val PASS_THROUGH = setOf(
    KeyEvent.KEYCODE_DPAD_LEFT,
    KeyEvent.KEYCODE_DPAD_RIGHT,
    KeyEvent.KEYCODE_DPAD_UP,
    KeyEvent.KEYCODE_DPAD_DOWN,
  )

  /** Returns true when the key was consumed, so the system does not also act on it. */
  fun dispatch(keyCode: Int): Boolean {
    val eventType = when (keyCode) {
      KeyEvent.KEYCODE_DPAD_LEFT -> "left"
      KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
      KeyEvent.KEYCODE_DPAD_UP -> "up"
      KeyEvent.KEYCODE_DPAD_DOWN -> "down"
      KeyEvent.KEYCODE_CHANNEL_UP -> "channelUp"
      KeyEvent.KEYCODE_CHANNEL_DOWN -> "channelDown"
      KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "playPause"
      KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
      KeyEvent.KEYCODE_MEDIA_PAUSE -> "pause"
      KeyEvent.KEYCODE_MEDIA_REWIND -> "rewind"
      KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "fastForward"
      KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
      KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "previous"
      KeyEvent.KEYCODE_MEDIA_STOP -> "stop"
      else -> return false
    }
    val current = listener
    // Deliberately kept in release: `adb logcat -s TvRemote` is the quickest way
    // to tell "the remote key never reached the app" apart from "it reached the
    // app but no player screen was listening".
    Log.d(TAG, "key=" + keyCode + " -> " + eventType + " listener=" + (current != null))
    if (current == null) return false
    current(eventType)
    return keyCode !in PASS_THROUGH
  }
}

class TvRemoteModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TvRemote")

    Events("onTvRemoteKey")

    OnCreate {
      TvRemoteKeyBus.listener = { eventType ->
        sendEvent("onTvRemoteKey", mapOf("eventType" to eventType))
      }
    }

    OnDestroy {
      TvRemoteKeyBus.listener = null
    }
  }
}
