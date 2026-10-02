import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from "@expo-google-fonts/archivo";
import { Chivo_700Bold } from "@expo-google-fonts/chivo";

// The player's own typeface, matching the agreed design.
//
// Only the four weights referenced here are bundled (~440KB total), not the
// whole family. Loading is deliberately non-blocking: the app renders in the
// system font and swaps the moment the faces are ready, so a slow first frame
// is never traded for typography.
export const PlayerFonts = {
  /** Titles and anything that should feel like a heading. */
  display: "Chivo_700Bold",
  /** Button labels, track names, times. */
  ui: "Archivo_600SemiBold",
  uiBold: "Archivo_700Bold",
  uiRegular: "Archivo_400Regular",
} as const;

export function usePlayerFonts(): boolean {
  const [loaded] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Chivo_700Bold,
  });
  return loaded;
}
