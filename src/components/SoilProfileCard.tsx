import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { getSoilTextureColor } from "../domain/soil";
import { ThemeColors } from "../theme";
import { SoilProfile, SoilProfileLayer } from "../types";

type SoilProfileCardProps = {
  profile: SoilProfile | null;
  loading: boolean;
  colors: ThemeColors;
};

function ProfileLayer({ layer, colors }: { layer: SoilProfileLayer; colors: ThemeColors }) {
  const compositionAvailable =
    layer.sandPercent !== null && layer.siltPercent !== null && layer.clayPercent !== null;

  return (
    <View style={[styles.layerRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.layerSwatch, { backgroundColor: getSoilTextureColor(layer.textureClass) }]} />
      <View style={styles.layerContent}>
        <View style={styles.layerHeading}>
          <Text style={[styles.depthLabel, { color: colors.ink }]}>{layer.depth}</Text>
          <Text style={[styles.textureLabel, { color: colors.greenText }]}>
            {layer.textureClass ?? "Texture unavailable"}
          </Text>
        </View>
        {compositionAvailable ? (
          <>
            <View style={styles.compositionBar}>
              <View style={[styles.sandSegment, { flex: layer.sandPercent ?? 0 }]} />
              <View style={[styles.siltSegment, { flex: layer.siltPercent ?? 0 }]} />
              <View style={[styles.claySegment, { flex: layer.clayPercent ?? 0 }]} />
            </View>
            <Text style={[styles.compositionText, { color: colors.muted }]}>
              Sand {layer.sandPercent}% · Silt {layer.siltPercent}% · Clay {layer.clayPercent}%
            </Text>
          </>
        ) : (
          <Text style={[styles.detailText, { color: colors.muted }]}>
            No mapped texture values for this depth.
          </Text>
        )}
        {layer.availableWaterMmPerM !== null ? (
          <Text style={[styles.waterText, { color: colors.ink }]}>
            Available water {layer.availableWaterMmPerM} mm/m
            {layer.fieldCapacityPercent !== null && layer.wiltingPointPercent !== null
              ? ` · 33 kPa ${layer.fieldCapacityPercent}% · 1500 kPa ${layer.wiltingPointPercent}%`
              : ""}
          </Text>
        ) : (
          <Text style={[styles.detailText, { color: colors.muted }]}>
            Water-retention estimate unavailable.
          </Text>
        )}
      </View>
    </View>
  );
}

export default function SoilProfileCard({ profile, loading, colors }: SoilProfileCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>GLOBAL SOIL PROFILE</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Texture & water retention</Text>
          <Text style={[styles.intro, { color: colors.muted }]}>
            Modeled soil layers by depth · SoilGrids
          </Text>
        </View>
        <Text style={[styles.sourcePill, { backgroundColor: colors.amber, color: colors.greenText }]}>
          ISRIC · 250 M
        </Text>
      </View>

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.greenText} />
          <Text style={[styles.detailText, { color: colors.muted }]}>Loading soil profile…</Text>
        </View>
      ) : profile ? (
        <>
          <View style={styles.legendRow}>
            <Text style={[styles.legendTitle, { color: colors.muted }]}>COMPOSITION</Text>
            <Text style={[styles.legendLabel, { color: colors.muted }]}>Sand</Text>
            <View style={[styles.legendDot, { backgroundColor: "#D8B77E" }]} />
            <Text style={[styles.legendLabel, { color: colors.muted }]}>Silt</Text>
            <View style={[styles.legendDot, { backgroundColor: "#A58C78" }]} />
            <Text style={[styles.legendLabel, { color: colors.muted }]}>Clay</Text>
            <View style={[styles.legendDot, { backgroundColor: "#6F5142" }]} />
          </View>
          {profile.layers.map((layer) => (
            <ProfileLayer key={layer.depth} layer={layer} colors={colors} />
          ))}
          <Text style={[styles.caption, { color: colors.muted }]}>
            Texture is classified from sand, silt, and clay fractions. Available water is the modeled
            difference between water content at 33 and 1500 kPa, shown per meter of soil. Estimates
            represent a regional 250 m model pixel, not a field test.
          </Text>
        </>
      ) : (
        <View style={[styles.emptyState, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>No profile returned for this point</Text>
          <Text style={[styles.detailText, { color: colors.muted }]}>
            SoilGrids has no modeled composition or retention estimate at these coordinates.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  headingRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headingCopy: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 3,
  },
  intro: {
    fontSize: 11,
    lineHeight: 18,
  },
  sourcePill: {
    borderRadius: 7,
    fontSize: 8,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  legendRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 3,
    marginTop: 15,
  },
  legendTitle: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginRight: 3,
  },
  legendLabel: {
    fontSize: 9,
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  layerRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingVertical: 11,
  },
  layerSwatch: {
    borderRadius: 4,
    marginRight: 10,
    width: 12,
  },
  layerContent: {
    flex: 1,
    minWidth: 0,
  },
  layerHeading: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  depthLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  textureLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  compositionBar: {
    borderRadius: 4,
    flexDirection: "row",
    height: 7,
    marginTop: 7,
    overflow: "hidden",
  },
  sandSegment: {
    backgroundColor: "#D8B77E",
  },
  siltSegment: {
    backgroundColor: "#A58C78",
  },
  claySegment: {
    backgroundColor: "#6F5142",
  },
  compositionText: {
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  waterText: {
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 15,
    marginTop: 3,
  },
  detailText: {
    fontSize: 10,
    lineHeight: 16,
  },
  caption: {
    fontSize: 9,
    lineHeight: 14,
    marginTop: 10,
  },
  status: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 18,
  },
  emptyState: {
    borderRadius: 10,
    marginTop: 12,
    padding: 12,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
  },
});
