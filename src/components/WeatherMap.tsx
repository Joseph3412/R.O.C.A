import React, { useEffect, useMemo, useState } from "react";
import { Image, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { getSoilMapLegendUrl, getSoilMapUrl, SoilMapLayer } from "../services/dataSources";
import { Coordinates, LocalWeather, SoilNutrientClass, SoilProfile } from "../types";
import { ThemeColors } from "../theme";

type WeatherMapProps = {
  coordinates: Coordinates;
  weather: LocalWeather;
  locationName: string;
  colors: ThemeColors;
  soilProfile: SoilProfile | null;
  soilClass: SoilNutrientClass | null;
};

type MapTile = {
  key: string;
  url: string;
  left: number;
  top: number;
};

const TILE_SIZE = 256;
const MAP_TILE_URL = "https://tile.openstreetmap.org";
type MapLayerId = "weather" | "profile" | "water" | "clay" | "sand" | "silt" | "quality";

const mapLayerOptions: Array<{ id: MapLayerId; label: string; soilLayer?: SoilMapLayer }> = [
  { id: "weather", label: "Weather" },
  { id: "profile", label: "Soil profile" },
  { id: "water", label: "Water retention" },
  { id: "clay", label: "Topsoil clay", soilLayer: "T_CLAY" },
  { id: "sand", label: "Topsoil sand", soilLayer: "T_SAND" },
  { id: "silt", label: "Topsoil silt", soilLayer: "T_SILT" },
  { id: "quality", label: "Soil quality", soilLayer: "sq1" },
];

function getTileGrid(
  coordinates: Coordinates,
  zoom: number,
  markerCoordinates: Coordinates = coordinates,
): {
  tiles: MapTile[];
  markerLeft: number;
  markerTop: number;
  offsetX: number;
  offsetY: number;
} {
  const scale = 2 ** zoom;
  const latitude = Math.max(-85.0511, Math.min(85.0511, coordinates.latitude));
  const x = ((coordinates.longitude + 180) / 360) * scale;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) *
    scale;
  const centerTileX = Math.floor(x);
  const centerTileY = Math.floor(y);
  const markerX = ((markerCoordinates.longitude + 180) / 360) * scale;
  const markerLatitude = Math.max(-85.0511, Math.min(85.0511, markerCoordinates.latitude));
  const markerLatitudeRadians = (markerLatitude * Math.PI) / 180;
  const markerY =
    ((1 - Math.log(Math.tan(markerLatitudeRadians) + 1 / Math.cos(markerLatitudeRadians)) / Math.PI) / 2) *
    scale;
  let markerDeltaX = markerX - x;
  if (markerDeltaX > scale / 2) markerDeltaX -= scale;
  if (markerDeltaX < -scale / 2) markerDeltaX += scale;
  const tiles: MapTile[] = [];

  for (let row = -1; row <= 1; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      const tileX = ((centerTileX + column) % scale + scale) % scale;
      const tileY = centerTileY + row;
      if (tileY < 0 || tileY >= scale) continue;
      tiles.push({
        key: `${zoom}:${tileX}:${tileY}`,
        url: `${MAP_TILE_URL}/${zoom}/${tileX}/${tileY}.png`,
        left: (column + 1) * TILE_SIZE,
        top: (row + 1) * TILE_SIZE,
      });
    }
  }

  return {
    tiles,
    markerLeft:
      TILE_SIZE * 1.5 +
      (markerDeltaX + x - centerTileX - 0.5) * TILE_SIZE,
    markerTop: TILE_SIZE * 1.5 + (markerY - centerTileY - 0.5) * TILE_SIZE,
    offsetX: (0.5 - (x - centerTileX)) * TILE_SIZE,
    offsetY: (0.5 - (y - centerTileY)) * TILE_SIZE,
  };
}

function toWebMercator(coordinates: Coordinates): { x: number; y: number } {
  const earthRadius = 6378137;
  const latitude = Math.max(-85.0511, Math.min(85.0511, coordinates.latitude));
  const latitudeRadians = (latitude * Math.PI) / 180;
  return {
    x: (coordinates.longitude * earthRadius * Math.PI) / 180,
    y: earthRadius * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
  };
}

function panMapCenter(
  coordinates: Coordinates,
  deltaX: number,
  deltaY: number,
  zoom: number,
): Coordinates {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((coordinates.longitude + 180) / 360) * scale - deltaX;
  const latitude = Math.max(-85.0511, Math.min(85.0511, coordinates.latitude));
  const latitudeRadians = (latitude * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) *
      scale -
    deltaY;
  const longitude = (x / scale) * 360 - 180;
  const latitudeFromY = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI;
  return {
    longitude: Math.max(-180, Math.min(180, longitude)),
    latitude: Math.max(-85.0511, Math.min(85.0511, latitudeFromY)),
  };
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Local conditions";
}

export { weatherLabel };

export default function WeatherMap({
  coordinates,
  weather,
  locationName,
  colors,
  soilProfile,
  soilClass,
}: WeatherMapProps) {
  const [zoom, setZoom] = useState(10);
  const [mapCenter, setMapCenter] = useState(coordinates);
  const [mapLayer, setMapLayer] = useState<MapLayerId>("weather");
  const [failedSoilLayer, setFailedSoilLayer] = useState<MapLayerId | null>(null);
  const grid = useMemo(() => getTileGrid(mapCenter, zoom, coordinates), [coordinates, mapCenter, zoom]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const selectedLayer = mapLayerOptions.find((option) => option.id === mapLayer);
  const soilMapUrl = selectedLayer?.soilLayer
    ? getSoilMapUrl(mapCenter, selectedLayer.soilLayer, zoom, 25_000)
    : null;
  const soilMapLegendUrl = selectedLayer?.soilLayer
    ? getSoilMapLegendUrl(selectedLayer.soilLayer)
    : null;
  const topLayer = soilProfile?.layers[0];
  const useStreetMap = mapLayer === "weather" || mapLayer === "profile" || mapLayer === "water";
  const soilLayerUnavailable = failedSoilLayer === mapLayer;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 8,
        onPanResponderRelease: (_event, gesture) => {
          setMapCenter((current) => panMapCenter(current, gesture.dx, gesture.dy, zoom));
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [zoom],
  );
  const selectedPointPosition = useMemo(() => {
    const radius = 25_000 * 2 ** (10 - zoom);
    const mapCoordinates = toWebMercator(mapCenter);
    const pointCoordinates = toWebMercator(coordinates);
    const xPercent = 50 + ((pointCoordinates.x - mapCoordinates.x) / (radius * 2)) * 100;
    const yPercent = 50 - ((pointCoordinates.y - mapCoordinates.y) / (radius * 2)) * 100;
    return {
      xPercent,
      yPercent,
      visible: xPercent >= 0 && xPercent <= 100 && yPercent >= 0 && yPercent <= 100,
    };
  }, [coordinates, mapCenter, zoom]);

  useEffect(() => {
    setMapCenter(coordinates);
  }, [coordinates.latitude, coordinates.longitude]);

  return (
    <View style={styles.card}>
      <View style={styles.mapHeader}>
        <View style={styles.locationCopy}>
          <Text style={styles.eyebrow}>WEATHER & SOIL MAP</Text>
          <Text numberOfLines={1} style={styles.mapTitle}>{locationName}</Text>
        </View>
        <View style={styles.zoomControls}>
          <Pressable
            accessibilityLabel="Zoom out"
            accessibilityRole="button"
            disabled={zoom <= 3}
            onPress={() => setZoom((value) => Math.max(3, value - 1))}
            style={styles.zoomButton}
          >
            <Text style={styles.zoomText}>−</Text>
          </Pressable>
          <Text style={styles.zoomLevel}>Z{zoom}</Text>
          <Pressable
            accessibilityLabel="Zoom in"
            accessibilityRole="button"
            disabled={zoom >= 16}
            onPress={() => setZoom((value) => Math.min(16, value + 1))}
            style={styles.zoomButton}
          >
            <Text style={styles.zoomText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.layerHeading}>MAP LAYERS</Text>
      <View style={styles.layerChoices}>
        {mapLayerOptions.map((option) => {
          const selected = mapLayer === option.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.id}
              onPress={() => {
                setMapLayer(option.id);
                setFailedSoilLayer(null);
              }}
              style={[styles.layerChoice, selected && styles.layerChoiceSelected]}
            >
              <Text style={[styles.layerChoiceText, selected && styles.layerChoiceTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View {...panResponder.panHandlers} style={[styles.mapFrame, !useStreetMap && styles.soilMapFrame]}>
        {useStreetMap ? (
          <View style={styles.mapCanvas}>
            <View style={[styles.tileCanvas, { transform: [{ translateX: grid.offsetX }, { translateY: grid.offsetY }] }]}>
              {grid.tiles.map((tile) => (
              <Image
                key={tile.key}
                accessibilityIgnoresInvertColors
                resizeMode="stretch"
                source={{
                  uri: tile.url,
                  headers: { "User-Agent": "R.O.C.A.-Android/1.0" },
                }}
                style={[styles.tile, { left: tile.left, top: tile.top }]}
              />
              ))}
              <View
                accessibilityLabel={
                  mapLayer === "weather"
                    ? `${Math.round(weather.currentTemperatureC)} degrees at farm location`
                    : `${mapLayer === "water" ? "Water retention" : "Soil profile"} point at ${locationName}`
                }
                style={[
                  styles.weatherPin,
                  {
                    left: grid.markerLeft - 42,
                    top: grid.markerTop - 50,
                  },
                ]}
              >
                {mapLayer === "weather" ? (
                  <>
                    <Text style={styles.pinTemperature}>{Math.round(weather.currentTemperatureC)}°</Text>
                    <Text style={styles.pinWeather}>{weatherLabel(weather.weatherCode)}</Text>
                  </>
                ) : mapLayer === "water" ? (
                  <>
                    <Text style={styles.pinTemperature}>
                      {topLayer?.availableWaterMmPerM !== null && topLayer?.availableWaterMmPerM !== undefined
                        ? `${topLayer.availableWaterMmPerM} mm/m`
                        : "Water data"}
                    </Text>
                    <Text style={styles.pinWeather}>Available water</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.pinTemperature}>{topLayer?.textureClass ?? "Soil point"}</Text>
                    <Text style={styles.pinWeather}>
                      {topLayer?.availableWaterMmPerM !== null && topLayer?.availableWaterMmPerM !== undefined
                        ? `${topLayer.availableWaterMmPerM} mm/m available`
                        : "Modeled profile"}
                    </Text>
                  </>
                )}
                <View style={styles.pinPointer} />
              </View>
            </View>
          </View>
        ) : soilLayerUnavailable ? (
          <View style={styles.layerFallback}>
            <Text style={styles.layerFallbackText}>This FAO soil map layer could not be loaded.</Text>
          </View>
        ) : soilMapUrl ? (
          <>
            <Image
              accessibilityIgnoresInvertColors
              onError={() => setFailedSoilLayer(mapLayer)}
              resizeMode="stretch"
              source={{ uri: soilMapUrl }}
              style={styles.soilMapLayer}
            />
            {selectedPointPosition.visible ? (
              <View
                pointerEvents="none"
                style={[
                  styles.soilMapMarker,
                  { left: `${selectedPointPosition.xPercent}%`, top: `${selectedPointPosition.yPercent}%` },
                ]}
              >
              <Text style={styles.soilMapMarkerLabel}>Selected location</Text>
              <View style={styles.soilMapMarkerDot} />
              </View>
            ) : null}
            <View style={styles.mapAttribution}>
              <Text style={styles.attributionText}>FAO · HWSD</Text>
            </View>
          </>
        ) : null}
        {useStreetMap ? (
          <View style={styles.mapAttribution}>
            <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
          </View>
        ) : null}
      </View>
      {mapLayer !== "weather" && mapLayer !== "profile" && mapLayer !== "water" ? (
        <View style={styles.mapLegend}>
          <Text style={styles.legendTitle}>
            {mapLayer === "quality" ? "SOIL QUALITY CLASS · HWSD" : `${selectedLayer?.label.toUpperCase()} · HWSD`}
          </Text>
          {mapLayer === "quality" ? (
            <Image
              accessibilityLabel="FAO soil quality legend: No or slight limitations, Moderate limitations, Severe limitations, Very severe limitations, Mainly non-soil, Permafrost area, Water bodies."
              resizeMode="contain"
              source={{ uri: soilMapLegendUrl ?? "" }}
              style={styles.qualityLegendImage}
            />
          ) : (
            <>
              <View style={styles.textureLegendBar}>
                {["#F3F3F3", "#CFCFCF", "#A8A8A8", "#777777", "#333333"].map((color) => (
                  <View key={color} style={[styles.textureLegendSegment, { backgroundColor: color }]} />
                ))}
              </View>
              <View style={styles.textureLegendLabels}>
                <Text style={styles.textureLegendText}>0% · lower mapped fraction</Text>
                <Text style={styles.textureLegendText}>100% · higher</Text>
              </View>
            </>
          )}
        </View>
      ) : null}
      <Text style={styles.mapGestureHint}>Drag to pan · use + / − to zoom · selected farm point is marked</Text>
      <Text style={styles.layerCaption}>
        {mapLayer === "weather"
          ? `Weather marker · ${weather.source} forecast`
          : mapLayer === "profile"
            ? "SoilGrids point estimate shown over the OpenStreetMap base; the shaded profile is in Soil Context."
            : mapLayer === "water"
              ? "Modeled plant-available water at this point, shown over the OpenStreetMap base; depth details are in Soil Context."
              : `${selectedLayer?.label} · FAO HWSD topsoil map layer.${mapLayer === "quality" && soilClass ? ` Selected point: class ${soilClass.value} of 7.` : ""} Regional context, not a field test.`}
      </Text>

      <View style={styles.mapConditions}>
        <View>
          <Text style={styles.eyebrow}>RIGHT NOW</Text>
          <Text style={styles.temperature}>{Math.round(weather.currentTemperatureC)}°C</Text>
          <Text style={styles.bodyText}>{weatherLabel(weather.weatherCode)}</Text>
          {weather.temperatureModelCount && weather.temperatureModelCount > 1 ? (
            <Text style={styles.modelSpreadText}>
              {weather.temperatureModelCount} models · {weather.temperatureSpreadC?.toFixed(1)}°C spread
            </Text>
          ) : null}
        </View>
        <View style={styles.conditionsDivider} />
        <View style={styles.weatherDetails}>
          <Text style={styles.bodyText}>Feels like {Math.round(weather.apparentTemperatureC)}°C</Text>
          <Text style={styles.bodyText}>Rain {weather.precipitationMm.toFixed(1)} mm</Text>
          <Text style={styles.bodyText}>Wind {Math.round(weather.windSpeedKmh)} km/h</Text>
        </View>
      </View>
      <Text style={styles.sourceText}>Map layers: FAO HWSD · Soil profile: ISRIC SoilGrids · Forecast: {weather.source}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      marginBottom: 16,
      overflow: "hidden",
      padding: 14,
    },
    mapHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    layerHeading: {
      color: colors.muted,
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 0.9,
      marginBottom: 6,
    },
    layerChoices: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 10,
    },
    layerChoice: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 30,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    layerChoiceSelected: {
      backgroundColor: colors.green,
      borderColor: colors.green,
    },
    layerChoiceText: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: "700",
    },
    layerChoiceTextSelected: {
      color: colors.onGreen,
    },
    locationCopy: {
      flex: 1,
      marginRight: 8,
      minWidth: 0,
    },
    eyebrow: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    mapTitle: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "700",
      marginTop: 4,
    },
    zoomControls: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    zoomButton: {
      alignItems: "center",
      backgroundColor: colors.paleGreen,
      borderRadius: 8,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    zoomText: {
      color: colors.greenText,
      fontSize: 20,
      fontWeight: "700",
      lineHeight: 24,
    },
    zoomLevel: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: "700",
    },
    mapFrame: {
      alignSelf: "center",
      aspectRatio: 1.2,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      maxHeight: 440,
      overflow: "hidden",
      width: "100%",
    },
    soilMapFrame: {
      aspectRatio: 600 / 360,
    },
    soilMapLayer: {
      height: "100%",
      width: "100%",
    },
    soilMapMarker: {
      alignItems: "center",
      marginLeft: -38,
      marginTop: -7,
      position: "absolute",
    },
    soilMapMarkerLabel: {
      backgroundColor: "#FFFFFFE8",
      borderRadius: 5,
      color: "#18352B",
      fontSize: 8,
      fontWeight: "700",
      marginBottom: 3,
      paddingHorizontal: 5,
      paddingVertical: 3,
    },
    soilMapMarkerDot: {
      backgroundColor: colors.green,
      borderColor: "#FFFFFF",
      borderRadius: 6,
      borderWidth: 2,
      height: 12,
      width: 12,
    },
    layerFallback: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 18,
    },
    layerFallbackText: {
      color: colors.muted,
      fontSize: 11,
      textAlign: "center",
    },
    layerCaption: {
      color: colors.muted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 6,
    },
    mapLegend: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 9,
      marginTop: 8,
      padding: 9,
    },
    legendTitle: {
      color: colors.ink,
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    qualityLegendImage: {
      height: 245,
      width: 167,
    },
    textureLegendBar: {
      borderColor: colors.border,
      borderRadius: 3,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      height: 10,
      overflow: "hidden",
    },
    textureLegendSegment: {
      flex: 1,
    },
    textureLegendLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    textureLegendText: {
      color: colors.muted,
      fontSize: 8,
    },
    mapGestureHint: {
      color: colors.muted,
      fontSize: 8,
      marginTop: 5,
      textAlign: "right",
    },
    mapCanvas: {
      height: TILE_SIZE * 3,
      left: "50%",
      marginLeft: -(TILE_SIZE * 1.5),
      position: "absolute",
      top: "50%",
      marginTop: -(TILE_SIZE * 1.5),
      width: TILE_SIZE * 3,
    },
    tileCanvas: {
      height: TILE_SIZE * 3,
      position: "absolute",
      width: TILE_SIZE * 3,
    },
    tile: {
      height: TILE_SIZE,
      position: "absolute",
      width: TILE_SIZE,
    },
    weatherPin: {
      alignItems: "center",
      backgroundColor: colors.green,
      borderColor: colors.white,
      borderRadius: 12,
      borderWidth: 2,
      minWidth: 66,
      paddingHorizontal: 8,
      paddingVertical: 6,
      position: "absolute",
      zIndex: 2,
    },
    pinTemperature: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },
    pinWeather: {
      color: colors.onGreen,
      fontSize: 8,
      fontWeight: "700",
      marginTop: 1,
    },
    pinPointer: {
      backgroundColor: colors.green,
      bottom: -5,
      height: 9,
      position: "absolute",
      transform: [{ rotate: "45deg" }],
      width: 9,
      zIndex: -1,
    },
    mapAttribution: {
      backgroundColor: "#FFFFFFE8",
      borderRadius: 5,
      bottom: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      position: "absolute",
      right: 6,
    },
    attributionText: {
      color: "#18352B",
      fontSize: 8,
    },
    mapConditions: {
      alignItems: "center",
      flexDirection: "row",
      marginTop: 14,
    },
    eyebrowLabel: {
      color: colors.muted,
    },
    temperature: {
      color: colors.ink,
      fontSize: 25,
      fontWeight: "800",
      marginTop: 4,
    },
    bodyText: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 18,
    },
    modelSpreadText: {
      color: colors.muted,
      fontSize: 8,
      lineHeight: 12,
      marginTop: 4,
      maxWidth: 105,
    },
    conditionsDivider: {
      backgroundColor: colors.border,
      height: 46,
      marginHorizontal: 18,
      width: 1,
    },
    weatherDetails: {
      flex: 1,
    },
    sourceText: {
      color: colors.muted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 12,
    },
  });
}
