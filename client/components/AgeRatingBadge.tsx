import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { BorderRadius } from "@/constants/theme";

// Age certificate colour table — matches UK BBFC visual language broadly.
// age_int values: 0=U/G, 8=PG, 12-13=12/PG-13, 15=15, 17-18=R/18.
function certColor(certification: string): { bg: string; border: string; text: string } {
  const upper = certification.toUpperCase();
  // Under-18 / adult-only
  if (["18", "R18", "NC-17", "TV-MA"].includes(upper) || upper === "R") {
    return { bg: "rgba(180,20,20,0.18)", border: "#CC2222", text: "#FF5555" };
  }
  // 15
  if (["15"].includes(upper)) {
    return { bg: "rgba(200,80,0,0.18)", border: "#CC5500", text: "#FF8833" };
  }
  // 12 / PG-13 / 13 / 14
  if (["12", "12A", "PG-13", "13", "14"].includes(upper)) {
    return { bg: "rgba(180,120,0,0.18)", border: "#CC9900", text: "#FFD000" };
  }
  // PG
  if (["PG", "TV-PG"].includes(upper)) {
    return { bg: "rgba(0,140,40,0.15)", border: "#008C28", text: "#44CC66" };
  }
  // U / G / all-ages
  if (["U", "G", "TV-G", "TV-Y", "ALL", "E"].includes(upper)) {
    return { bg: "rgba(0,120,200,0.15)", border: "#0078C8", text: "#44AAFF" };
  }
  // Fallback — neutral white
  return { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.3)", text: "#CCCCCC" };
}

interface Props {
  certification: string | null | undefined;
  size?: "sm" | "md";
}

export default function AgeRatingBadge({ certification, size = "md" }: Props) {
  if (!certification) return null;

  const cert = certification.trim();
  if (!cert) return null;

  const colors = certColor(cert);
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          paddingHorizontal: isSmall ? 5 : 7,
          paddingVertical: isSmall ? 2 : 3,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.text,
          { color: colors.text, fontSize: isSmall ? 10 : 12 },
        ]}
      >
        {cert}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    alignSelf: "flex-start",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
