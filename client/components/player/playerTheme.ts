import { Colors, BorderRadius, Spacing } from "@/constants/theme";
import { PlayerFonts } from "@/lib/player-fonts";

// Shared look for every player control.
//
// The three player screens each grew their own CtrlBtn / TrackPanel / SeekBar,
// which is why they drifted apart — two different Audio icons, two different
// accelerating-skip tables, opposite focus models on the seek bar. Everything
// visual now comes from here so a change lands on all of them at once.
//
// Designed for a remote first. On a Fire TV there is no cursor and no touch, so
// the focused control has to be the brightest thing on screen: focus fills the
// button solid white with an accent ring, rather than tinting an edge. That
// reads from across a room, which a subtle outline does not.
export const PlayerUI = {
  // Sizing is generous on purpose — these are pressed from the sofa.
  btnHeight: 48,
  btnMinWidth: 48,
  btnPadX: Spacing.md,
  btnGap: Spacing.sm,
  iconSize: 20,
  primaryIconSize: 26,
  radius: BorderRadius.sm,

  // Resting state: barely-there chrome so the picture stays the subject.
  rest: {
    bg: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.14)",
    fg: "rgba(255,255,255,0.92)",
  },
  // Focused: the inversion that makes it findable.
  focus: {
    bg: "#FFFFFF",
    border: Colors.dark.accent,
    fg: "#0B0B11",
  },
  // Primary action (play/pause) carries the brand colour at rest.
  primary: {
    bg: Colors.dark.accent,
    border: "transparent",
    fg: "#1A0A00",
  },
  // A control that is "on" (subtitles active, football showing) without focus.
  active: {
    bg: "rgba(255,102,0,0.22)",
    border: Colors.dark.accent,
    fg: Colors.dark.accent,
  },

  label: {
    size: 13,
    weight: "600" as const,
    spacing: 0.2,
  },

  font: PlayerFonts,

  panel: {
    bg: "rgba(12,12,19,0.96)",
    border: "rgba(255,255,255,0.12)",
    radius: BorderRadius.md,
  },

  scrim: "rgba(0,0,0,0.72)",
} as const;

export type ControlTone = "default" | "primary" | "active";
