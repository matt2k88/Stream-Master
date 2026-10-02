import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PlayerUI } from "./playerTheme";
import { PlayerLabels } from "./playerLabels";
import { Colors } from "@/constants/theme";

export type TrackLike = { id: number; label: string; language?: string };

export type TrackPanelProps = {
  title: string;
  icon: string;
  tracks: TrackLike[];
  /** The track the PLAYER reports, not what the UI last asked for. */
  selected: TrackLike | null;
  onSelect: (track: TrackLike | null) => void;
  onClose: () => void;
  onActivity?: () => void;
  /** Subtitles get an Off row; audio cannot be switched off. */
  showOff?: boolean;
  /**
   * Shown as the selected row when `selected` is null and there is no Off row —
   * the engine is playing the stream's own default and nothing has been chosen.
   * Naming a specific track here would be a guess, and guessing is what made the
   * old panel claim subtitles were off while they were on screen.
   */
  defaultLabel?: string;
  /**
   * True when the engine has not told us what is playing. VLC reports the
   * track LISTS on load but never which one is active, and exposes no getter —
   * so claiming "Off" there was a guess, and the guess was what made the panel
   * disagree with the picture. We say "Stream default" instead and let the
   * choice make it certain.
   */
  unknownSelection?: boolean;
};

export function TrackPanel({
  title,
  icon,
  tracks,
  selected,
  onSelect,
  onClose,
  onActivity,
  showOff = false,
  defaultLabel,
  unknownSelection = false,
}: TrackPanelProps) {
  // VLC reports its own "Disable" entry (usually id -1) alongside the real
  // tracks. With our own Off row that shows up as two ways to say the same
  // thing, so drop the engine's version and keep one.
  const visible = showOff
    ? tracks.filter((t) => t.id >= 0 && !/^(disable|disabled|off|none)$/i.test(t.label.trim()))
    : tracks;

  const selectedIsOff =
    !unknownSelection && showOff &&
    (selected == null || selected.id < 0 ||
      /^(disable|disabled|off|none)$/i.test(selected.label.trim()));
  const subtitle = selected
    ? selected.label
    : unknownSelection
      ? "Stream default"
      : selectedIsOff
        ? PlayerLabels.off
        : defaultLabel ?? "Default";

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Feather name={icon as never} size={16} color={Colors.dark.accent} />
        <View style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          {/* States the live selection in the header, so it is readable without
              opening anything and obvious if it disagrees with the picture. */}
          <Text style={styles.current} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Pressable
          onPress={() => { onActivity?.(); onClose(); }}
          onFocus={onActivity}
          focusable
          accessibilityLabel="Close"
          style={({ pressed }) => [styles.close, pressed && styles.closeLit]}
        >
          <Feather name="x" size={16} color="#fff" />
        </Pressable>
      </View>

      {visible.length === 0 && !showOff ? (
        <Text style={styles.empty}>No tracks available</Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
          {showOff ? (
            <TrackRow
              label={PlayerLabels.off}
              selected={selectedIsOff}
              preferFocus={selectedIsOff}
              onPress={() => onSelect(null)}
              onActivity={onActivity}
            />
          ) : selected === null ? (
            <TrackRow
              label={defaultLabel ?? "Default"}
              meta="as provided by the stream"
              selected
              onPress={() => undefined}
              onActivity={onActivity}
            />
          ) : null}

          {visible.map((track, index) => (
            <TrackRow
              key={track.id}
              label={track.label}
              meta={track.language}
              selected={selected?.id === track.id}
              // Open on the active track; if nothing is active and there is no
              // Off row, open on the first one. Previously the list opened at
              // the bottom and had to be scrolled all the way back up.
              preferFocus={
                selected?.id === track.id ||
                (selected == null && !showOff && index === 0)
              }
              onPress={() => onSelect(track)}
              onActivity={onActivity}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function TrackRow({
  label,
  meta,
  selected,
  preferFocus,
  onPress,
  onActivity,
}: {
  label: string;
  meta?: string;
  selected: boolean;
  preferFocus?: boolean;
  onPress: () => void;
  onActivity?: () => void;
}) {
  const [lit, setLit] = useState(false);

  return (
    <Pressable
      onPress={() => { onActivity?.(); onPress(); }}
      onFocus={() => { setLit(true); onActivity?.(); }}
      onBlur={() => setLit(false)}
      onPressIn={() => setLit(true)}
      onPressOut={() => setLit(false)}
      focusable
      hasTVPreferredFocus={preferFocus}
      style={[
        styles.row,
        selected && styles.rowSelected,
        lit && styles.rowLit,
      ]}
    >
      <View style={styles.check}>
        {selected ? (
          <Feather name="check" size={16} color={lit ? "#0B0B11" : Colors.dark.accent} />
        ) : null}
      </View>
      <Text style={[styles.rowLabel, lit && styles.rowLabelLit]} numberOfLines={1}>
        {label}
      </Text>
      {meta ? (
        <Text style={[styles.rowMeta, lit && styles.rowMetaLit]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: PlayerUI.panel.bg,
    borderColor: PlayerUI.panel.border,
    borderWidth: 1,
    borderRadius: PlayerUI.panel.radius,
    overflow: "hidden",
    maxWidth: 460,
    width: "100%",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headText: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 15, fontFamily: PlayerUI.font.display, letterSpacing: -0.1 },
  current: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: PlayerUI.font.uiRegular, marginTop: 2 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  closeLit: { backgroundColor: "rgba(255,255,255,0.22)" },
  list: { maxHeight: 220 },
  listInner: { paddingVertical: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  rowSelected: { backgroundColor: "rgba(255,102,0,0.12)" },
  rowLit: { backgroundColor: "#fff" },
  check: { width: 18, alignItems: "center" },
  rowLabel: { flex: 1, minWidth: 0, color: "#fff", fontSize: 14, fontFamily: PlayerUI.font.uiRegular },
  rowLabelLit: { color: "#0B0B11", fontFamily: PlayerUI.font.ui },
  rowMeta: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: PlayerUI.font.uiRegular, letterSpacing: 0.3 },
  rowMetaLit: { color: "rgba(0,0,0,0.55)" },
  empty: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontFamily: PlayerUI.font.uiRegular,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
});
