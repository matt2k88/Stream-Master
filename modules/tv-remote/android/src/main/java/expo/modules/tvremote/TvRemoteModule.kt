package expo.modules.tvremote

import android.util.Log
import android.view.KeyEvent
import android.view.View
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

  // A held OK/select button. Android does not turn this into a touch, so
  // React Native's onLongPress (which rides the touch responder) can never fire
  // from a remote — which is why "hold to favourite" worked on a phone and in
  // BlueStacks but not on a Fire TV.
  //
  // Key repeat starts after ~400ms and then repeats; firing on repeatCount == 1
  // gives a natural "hold" feel. The matching key-up is then swallowed so the
  // normal click does not ALSO open the item.
  private val SELECT_KEYS = setOf(
    KeyEvent.KEYCODE_DPAD_CENTER,
    KeyEvent.KEYCODE_ENTER,
    KeyEvent.KEYCODE_NUMPAD_ENTER,
    KeyEvent.KEYCODE_BUTTON_A,
  )
  private var swallowNextSelectUp = false
  private var selectDownAt = 0L
  private const val LONG_PRESS_MS = 600L

  /**
   * Handles select-key holds. Returns true when the event was consumed.
   *
   * Measures how long the button was held rather than waiting for key REPEATS.
   * Repeat behaviour varies by remote — some Fire TV and HDMI-CEC remotes send a
   * single ACTION_DOWN and nothing else until ACTION_UP — so a repeat-based
   * check silently never fires on those. Timing the press works everywhere.
   */
  fun dispatchSelect(event: KeyEvent): Boolean {
    if (event.keyCode !in SELECT_KEYS) return false

    when (event.action) {
      KeyEvent.ACTION_DOWN -> {
        if (event.repeatCount == 0) {
          selectDownAt = event.eventTime
          swallowNextSelectUp = false
        } else if (
          !swallowNextSelectUp &&
          selectDownAt > 0L &&
          event.eventTime - selectDownAt >= LONG_PRESS_MS
        ) {
          // Repeats are available on this remote: fire as soon as the threshold
          // passes, so the hold feels responsive rather than waiting for release.
          val current = listener
          if (current != null) {
            swallowNextSelectUp = true
            Log.d(TAG, "longSelect (held " + (event.eventTime - selectDownAt) + "ms)")
            current("longSelect")
            return true
          }
        }
        return false
      }

      KeyEvent.ACTION_UP -> {
        val held = if (selectDownAt > 0L) event.eventTime - selectDownAt else 0L
        selectDownAt = 0L
        if (swallowNextSelectUp) {
          swallowNextSelectUp = false
          Log.d(TAG, "select up swallowed after long press")
          return true
        }
        // No repeats came through, but the button was clearly held: fire now and
        // consume the release so the item does not also open.
        if (held >= LONG_PRESS_MS) {
          val current = listener
          if (current != null) {
            Log.d(TAG, "longSelect on release (held " + held + "ms)")
            current("longSelect")
            return true
          }
        }
        return false
      }
    }
    return false
  }

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

private const val TAG_MODULE = "TvRemote"

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

    // Move TV focus to a specific view.
    //
    // React Native's own `hasTVPreferredFocus` calls requestFocus() the moment
    // the prop is set, which is BEFORE the view has been laid out — Android
    // refuses focus on a view with no position yet, silently. That is fine for
    // something present when a screen opens, but useless for a control that
    // appears mid-session (closing a panel, for instance), which is why focus
    // was simply lost there.
    //
    // Posting to the view's own handler runs the request after the next layout
    // pass, when the view can actually take focus.
    AsyncFunction("requestFocus") { tag: Int, promise: expo.modules.kotlin.Promise ->
      // appContext.findView resolves the tag through whichever UIManager owns
      // it (Fabric or legacy) without this module needing React Native's
      // UIManager classes on its own compile classpath.
      val view: View? = try {
        appContext.findView<View>(tag)
      } catch (e: Exception) {
        null
      }
      if (view == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      view.post {
        view.isFocusable = true
        view.isFocusableInTouchMode = true
        val ok = view.requestFocus()
        Log.d(TAG_MODULE, "requestFocus tag=" + tag + " ok=" + ok)
        promise.resolve(ok)
      }
    }
  }
}
