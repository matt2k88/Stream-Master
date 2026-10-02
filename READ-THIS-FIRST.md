# Focus + Back fixes — exact files (app version stays 3.0.3)

Copy these in, overwriting. Do not re-implement or adjust anything. No new dependencies.

The version in app.json is unchanged at **3.0.3** — deliberately, so do not bump it.

Includes the font fix from the previous one-file package, so this supersedes it.

## 1. Focus was lost when a panel closed

React Native's `hasTVPreferredFocus` requests focus the instant the prop is set — which, for a control
that appears mid-session, is BEFORE the view has been laid out. Android refuses focus on a view with no
position yet, silently, so focus ended up nowhere and the remote did nothing until the controls timed out.

Fix: the tv-remote native module gained a `requestFocus(tag)` function that posts the request to the
view's own handler, so it runs after the next layout pass. `client/lib/tv-event-handler.ts` exposes it as
`requestTvFocus(tag)`, and both VOD players call it when a panel closes.

`ControlButton` gained a `viewRef` prop purely so the screens can get at the play button's node.

## 2. Back with the Guide open exited fullscreen

`LivePreviewScreen`'s back handler went straight to leaving fullscreen. It now closes the Guide first,
matching what both VOD players already do with their panels.

## 3. Fonts (carried over)

`client/lib/player-fonts.ts` imports per-weight subpaths rather than the package index — the index
requires every weight in the family and put 3.7MB of unused .ttf in the APK.
