import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import Svg, { Polygon, Text as SvgText } from "react-native-svg";

type Shape = "triangle" | "circle" | "rounded-rect";

interface CertConfig {
  bg: string;
  border: string;
  textColor: string;
  shape: Shape;
  label: string;
}

function getConfig(raw: string): CertConfig {
  const u = raw.trim().toUpperCase();

  if (u === "U" || u === "G" || u === "TV-G" || u === "TV-Y" || u === "ALL" || u === "E")
    return { bg: "#3CB914", border: "#1E7A0A", textColor: "#fff", shape: "triangle", label: u === "G" ? "G" : "U" };

  if (u === "PG" || u === "TV-PG")
    return { bg: "#F0A800", border: "#A86E00", textColor: "#fff", shape: "triangle", label: "PG" };

  if (u === "12A")
    return { bg: "#F07000", border: "#A04800", textColor: "#fff", shape: "circle", label: "12A" };

  if (u === "12" || u === "13" || u === "14")
    return { bg: "#F07000", border: "#A04800", textColor: "#fff", shape: "circle", label: "12" };

  if (u === "PG-13")
    return { bg: "#F07000", border: "#A04800", textColor: "#fff", shape: "circle", label: "PG-13" };

  if (u === "15")
    return { bg: "#E0408A", border: "#9C1A5C", textColor: "#fff", shape: "circle", label: "15" };

  if (u === "18" || u === "TV-MA")
    return { bg: "#CC1515", border: "#880000", textColor: "#fff", shape: "circle", label: "18" };

  if (u === "R" || u === "17")
    return { bg: "#CC1515", border: "#880000", textColor: "#fff", shape: "circle", label: "R" };

  if (u === "R18" || u === "NC-17" || u === "X")
    return { bg: "#1060C0", border: "#083890", textColor: "#fff", shape: "rounded-rect", label: u };

  return {
    bg: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.3)",
    textColor: "#ccc",
    shape: "rounded-rect",
    label: raw.trim(),
  };
}

interface Props {
  certification: string | null | undefined;
  size?: "sm" | "md";
}

export default function AgeRatingBadge({ certification, size = "md" }: Props) {
  if (!certification) return null;
  const cert = certification.trim();
  if (!cert) return null;

  const cfg = getConfig(cert);
  const sm = size === "sm";

  if (cfg.shape === "triangle") {
    const W = sm ? 34 : 46;
    const H = sm ? 30 : 40;
    const pad = 1.5;
    const pts = `${W / 2},${pad} ${W - pad},${H - pad} ${pad},${H - pad}`;
    const fz = sm ? (cfg.label.length > 1 ? 9 : 11) : (cfg.label.length > 1 ? 12 : 15);
    const ty = H * 0.76;
    return (
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Polygon points={pts} fill={cfg.bg} stroke={cfg.border} strokeWidth={2} />
        <SvgText
          x={W / 2}
          y={ty}
          textAnchor="middle"
          fontSize={fz}
          fontWeight="bold"
          fill={cfg.textColor}
        >
          {cfg.label}
        </SvgText>
      </Svg>
    );
  }

  if (cfg.shape === "circle") {
    const D = sm
      ? cfg.label.length >= 3 ? 32 : 28
      : cfg.label.length >= 3 ? 42 : 36;
    const fz = sm
      ? cfg.label.length >= 4 ? 8 : cfg.label.length >= 3 ? 9 : 11
      : cfg.label.length >= 4 ? 11 : cfg.label.length >= 3 ? 12 : 15;
    return (
      <View
        style={[
          styles.circle,
          { width: D, height: D, borderRadius: D / 2, backgroundColor: cfg.bg, borderColor: cfg.border },
        ]}
      >
        <ThemedText style={[styles.circleText, { color: cfg.textColor, fontSize: fz }]}>
          {cfg.label}
        </ThemedText>
      </View>
    );
  }

  const rw = sm ? (cfg.label.length >= 3 ? 40 : 32) : (cfg.label.length >= 3 ? 54 : 42);
  const rh = sm ? 22 : 30;
  const fz = sm ? (cfg.label.length >= 4 ? 8 : 9) : (cfg.label.length >= 4 ? 11 : 13);
  const br = sm ? 5 : 7;
  return (
    <View
      style={[
        styles.rect,
        { width: rw, height: rh, borderRadius: br, backgroundColor: cfg.bg, borderColor: cfg.border },
      ]}
    >
      <ThemedText style={[styles.rectText, { color: cfg.textColor, fontSize: fz }]}>
        {cfg.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  circleText: {
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: undefined,
  },
  rect: {
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  rectText: {
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
