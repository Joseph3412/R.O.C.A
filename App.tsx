import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Appearance,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  createPlantingWindow,
  getMonthLabel,
  rankCrops,
  suggestCrops,
  suggestCropCycles,
  PlantingWindow,
} from "./src/domain/cropPlanner";
import WeatherMap, { weatherLabel } from "./src/components/WeatherMap";
import SoilProfileCard from "./src/components/SoilProfileCard";
import {
  fetchClimate,
  fetchCropCatalog,
  fetchLocalWeather,
  fetchSatelliteObservation,
  fetchSoilNutrientClass,
  fetchSoilProfile,
  fetchUsdaSoilMapUnit,
  getSoilMapUrl,
  reverseGeocodeLocation,
  searchLocations,
} from "./src/services/dataSources";
import { getThemeColors, ThemeColors } from "./src/theme";
import {
  ClimateSummary,
  Coordinates,
  CropCatalogItem,
  CropCycleSolution,
  CropSuggestion,
  CustomCropCycle,
  FarmLocation,
  LocalWeather,
  LocationScope,
  LocationSearchResult,
  SatelliteObservation,
  SoilNutrientClass,
  SoilProfile,
  UsdaSoilMapUnit,
  UserPreferences,
} from "./src/types";

const PREFERENCES_KEY = "roca.preferences.v1";
const DEFAULT_CYCLE_ID = "balanced";
const DEMO_LOCATION: FarmLocation = {
  id: "sample:nairobi",
  name: "Nairobi",
  description: "Sample location · Kenya",
  scope: "city",
  coordinates: { latitude: -1.2921, longitude: 36.8219 },
  city: "Nairobi",
  country: "Kenya",
};

type AppTab = "dashboard" | "weather" | "crops" | "options";

const scopeLabels: Record<LocationScope, string> = {
  city: "City",
  region: "Region",
  country: "Country",
};

function isCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const coordinates = value as Coordinates;
  return (
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

function parsePreferences(value: string | null): UserPreferences {
  if (!value) {
    return { darkMode: false, location: null, selectedCycleId: DEFAULT_CYCLE_ID, customCycles: [] };
  }
  const parsed = JSON.parse(value) as Partial<UserPreferences>;
  const location = parsed.location;
  const validLocation =
    location &&
    typeof location.id === "string" &&
    typeof location.name === "string" &&
    isCoordinates(location.coordinates) &&
    (location.accuracyMeters === undefined ||
      (Number.isFinite(location.accuracyMeters) && location.accuracyMeters >= 0))
      ? location
      : null;

  return {
    darkMode: parsed.darkMode === true,
    location: validLocation,
    selectedCycleId:
      typeof parsed.selectedCycleId === "string" ? parsed.selectedCycleId : DEFAULT_CYCLE_ID,
    customCycles: Array.isArray(parsed.customCycles)
      ? parsed.customCycles.flatMap((cycle) => {
          if (
            !cycle ||
            typeof cycle.id !== "string" ||
            typeof cycle.title !== "string" ||
            !Array.isArray(cycle.cropSlugs) ||
            !cycle.cropSlugs.every((slug) => typeof slug === "string")
          ) {
            return [];
          }
          return [{ id: cycle.id, title: cycle.title, cropSlugs: cycle.cropSlugs }];
        })
      : [],
  };
}

function formatCoordinates(coordinates: Coordinates): string {
  const latitudeHemisphere = coordinates.latitude < 0 ? "S" : "N";
  const longitudeHemisphere = coordinates.longitude < 0 ? "W" : "E";
  return `${Math.abs(coordinates.latitude).toFixed(3)}°${latitudeHemisphere}, ${Math.abs(
    coordinates.longitude,
  ).toFixed(3)}°${longitudeHemisphere}`;
}

function formatLocationName(location: FarmLocation): string {
  if (location.scope === "country") return location.name;
  const city = location.city ?? location.name;
  if (!location.country || city === location.country) return city;
  return `${city}, ${location.country}`;
}

function catalogSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cropFamily(category: string): string {
  return category
    .split(/[-_ ]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function locationFromSearchResult(result: LocationSearchResult): FarmLocation {
  return result;
}

function getSeasonMonths(window: PlantingWindow): string {
  return `${getMonthLabel(window.months[0].month)} – ${getMonthLabel(
    window.months[window.months.length - 1].month,
  )}`;
}

function getWeatherIcon(code: number): string {
  if (code === 0 || code === 1) return "☼";
  if ([2, 3, 45, 48].includes(code)) return "◌";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "⌁";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
  if ([95, 96, 99].includes(code)) return "⚡";
  return "·";
}

function SectionTitle({
  eyebrow,
  title,
  colors,
  trailing,
  styles,
}: {
  eyebrow: string;
  title: string;
  colors: ThemeColors;
  trailing?: React.ReactNode;
  styles: AppStyles;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {trailing}
    </View>
  );
}

type AppStyles = ReturnType<typeof createStyles>;

function CropCard({
  crop,
  rank,
  styles,
}: {
  crop: CropSuggestion;
  rank: number;
  styles: AppStyles;
}) {
  return (
    <View style={styles.cropCard}>
      <View style={styles.cropRank}>
        <Text style={styles.cropRankText}>{String(rank).padStart(2, "0")}</Text>
      </View>
      <View style={styles.cropCopy}>
        <View style={styles.cropTitleRow}>
          <Text style={styles.cropName}>{crop.name}</Text>
          <Text style={styles.cropScore}>{crop.score}/100</Text>
        </View>
        <Text style={styles.cropMeta}>{crop.family.toUpperCase()} · CLIMATE MATCH</Text>
        <Text style={styles.bodyText}>{crop.reason}</Text>
        <Text style={styles.cropBenefit}>{crop.soilBenefit}</Text>
      </View>
    </View>
  );
}

function CycleCard({
  cycle,
  selected,
  onPress,
  styles,
}: {
  cycle: CropCycleSolution;
  selected: boolean;
  onPress: () => void;
  styles: AppStyles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.cycleChoice, selected && styles.cycleChoiceSelected]}
    >
      <View style={styles.cycleChoiceHeader}>
        <Text style={[styles.cycleChoiceTitle, selected && styles.cycleChoiceTitleSelected]}>
          {cycle.title}
        </Text>
        {cycle.averageScore > 0 ? (
          <Text style={[styles.cycleScore, selected && styles.cycleChoiceTitleSelected]}>
            {cycle.averageScore}/100
          </Text>
        ) : null}
      </View>
      <Text style={[styles.cycleChoiceDescription, selected && styles.cycleChoiceDescriptionSelected]}>
        {cycle.focus}
      </Text>
      <Text style={[styles.cycleCropList, selected && styles.cycleChoiceDescriptionSelected]}>
        {cycle.crops.map((crop) => crop.name).join("  →  ")}
      </Text>
    </Pressable>
  );
}

function LocationPicker({
  activeLocation,
  searchQuery,
  setSearchQuery,
  scope,
  setScope,
  results,
  searching,
  searchError,
  onSelect,
  onUseCurrentLocation,
  locationLoading,
  styles,
  colors,
  narrow,
}: {
  activeLocation: FarmLocation;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  scope: LocationScope;
  setScope: (value: LocationScope) => void;
  results: LocationSearchResult[];
  searching: boolean;
  searchError: string;
  onSelect: (location: FarmLocation) => void;
  onUseCurrentLocation: () => void;
  locationLoading: boolean;
  styles: AppStyles;
  colors: ThemeColors;
  narrow: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.locationTopRow}>
        <View style={styles.locationCopy}>
          <Text style={styles.eyebrow}>FARM LOCATION</Text>
          <Text style={styles.locationTitle}>{formatLocationName(activeLocation)}</Text>
          <Text style={styles.bodyText}>{activeLocation.description}</Text>
          <Text style={styles.locationCoordinates}>
            {formatCoordinates(activeLocation.coordinates)}
            {activeLocation.accuracyMeters !== undefined
              ? ` · GPS ±${Math.round(activeLocation.accuracyMeters)} m`
              : ""}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onUseCurrentLocation}
          style={({ pressed }) => [styles.gpsButton, pressed && styles.pressed]}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color={colors.greenText} />
          ) : (
            <Text style={styles.gpsButtonText}>USE GPS</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.scopeSelector, narrow && styles.scopeSelectorNarrow]}>
        {(["city", "region", "country"] as const).map((option) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: scope === option }}
            key={option}
            onPress={() => setScope(option)}
            style={[styles.scopeOption, scope === option && styles.scopeOptionSelected]}
          >
            <Text style={[styles.scopeText, scope === option && styles.scopeTextSelected]}>
              {scopeLabels[option]}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        accessibilityLabel={`Search for a ${scope}`}
        autoCapitalize="words"
        autoCorrect={false}
        onChangeText={setSearchQuery}
        placeholder={
          scope === "city" ? "Search city or town" : scope === "region" ? "Search region" : "Search country"
        }
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        style={styles.searchInput}
        value={searchQuery}
      />
      {searching ? (
        <View style={styles.searchStatus}>
          <ActivityIndicator size="small" color={colors.greenText} />
          <Text style={styles.bodyText}>Finding matching places…</Text>
        </View>
      ) : null}
      {searchError ? <Text accessibilityRole="alert" style={styles.errorText}>{searchError}</Text> : null}
      {searchQuery.trim().length >= 2 && !searching && results.length === 0 && !searchError ? (
        <Text style={styles.emptySearchText}>No matching {scope} found. Try a nearby place name.</Text>
      ) : null}
      {results.length > 0 ? (
        <View style={styles.resultList}>
          {results.map((result) => (
            <Pressable
              accessibilityRole="button"
              key={result.id}
              onPress={() => onSelect(locationFromSearchResult(result))}
              style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
            >
              <View style={styles.resultIcon}><Text style={styles.resultIconText}>⌖</Text></View>
              <View style={styles.resultCopy}>
                <Text numberOfLines={1} style={styles.resultName}>{result.name}</Text>
                <Text numberOfLines={1} style={styles.bodyText}>{result.description}</Text>
              </View>
              <Text style={styles.resultArrow}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.locationHint}>
        Search a city, administrative region, or country. Current location is resolved to the nearest city.
      </Text>
    </View>
  );
}

function AppContent() {
  const { width } = useWindowDimensions();
  const narrow = width < 380;
  const [preferences, setPreferences] = useState<UserPreferences>({
    darkMode: false,
    location: null,
    selectedCycleId: DEFAULT_CYCLE_ID,
    customCycles: [],
  });
  const colors = useMemo(() => getThemeColors(preferences.darkMode), [preferences.darkMode]);
  const styles = useMemo(() => createStyles(colors, width), [colors, width]);
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [cropCatalog, setCropCatalog] = useState<CropCatalogItem[]>([]);
  const [cropCatalogLoading, setCropCatalogLoading] = useState(false);
  const [cropCatalogError, setCropCatalogError] = useState("");
  const [cropCatalogSearch, setCropCatalogSearch] = useState("");
  const [customCycleName, setCustomCycleName] = useState("");
  const [customCycleSlugs, setCustomCycleSlugs] = useState<string[]>([]);
  const [customCycleSaving, setCustomCycleSaving] = useState(false);
  const cropCatalogLoaded = useRef(false);
  const [activeLocation, setActiveLocation] = useState<FarmLocation>(DEMO_LOCATION);
  const [locationScope, setLocationScope] = useState<LocationScope>("city");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | "unknown">("unknown");
  const [climate, setClimate] = useState<ClimateSummary | null>(null);
  const [weather, setWeather] = useState<LocalWeather | null>(null);
  const [satellite, setSatellite] = useState<SatelliteObservation | null>(null);
  const [soilClass, setSoilClass] = useState<SoilNutrientClass | null>(null);
  const [soilProfile, setSoilProfile] = useState<SoilProfile | null>(null);
  const [usdaSoil, setUsdaSoil] = useState<UsdaSoilMapUnit | null>(null);
  const [dataErrors, setDataErrors] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [soilMapUnavailable, setSoilMapUnavailable] = useState(false);
  const requestId = useRef(0);

  const plantingWindow = useMemo(
    () => (climate ? createPlantingWindow(climate) : null),
    [climate],
  );
  const cropSuggestions = useMemo(
    () => (plantingWindow ? suggestCrops(plantingWindow) : []),
    [plantingWindow],
  );
  const cycleSolutions = useMemo(
    () => (plantingWindow ? suggestCropCycles(plantingWindow) : []),
    [plantingWindow],
  );
  const rankedCrops = useMemo(
    () => (plantingWindow ? rankCrops(plantingWindow) : []),
    [plantingWindow],
  );
  const allCropOptions = useMemo(() => {
    const options = new Map<string, CropCatalogItem>();
    cropCatalog.forEach((crop) => options.set(crop.slug, crop));
    rankedCrops.forEach((crop) => {
      const slug = catalogSlug(crop.name);
      if (!options.has(slug)) {
        options.set(slug, {
          slug,
          commonName: crop.name,
          scientificName: "",
          category: crop.family.toLowerCase(),
          lifecycle: "annual",
        });
      }
    });
    return [...options.values()].sort((first, second) =>
      first.commonName.localeCompare(second.commonName),
    );
  }, [cropCatalog, rankedCrops]);
  const cropScores = useMemo(
    () => new Map(rankedCrops.map((crop) => [catalogSlug(crop.name), crop])),
    [rankedCrops],
  );
  const customCycleSolutions = useMemo(
    () =>
      (preferences.customCycles ?? []).map((cycle) => ({
        id: cycle.id,
        title: cycle.title,
        focus: "Custom crop sequence saved on this device.",
        averageScore: 0,
        crops: cycle.cropSlugs.map((slug) => {
          const item = allCropOptions.find((option) => option.slug === slug);
          const climateCrop = cropScores.get(slug);
          return (
            climateCrop ?? {
              name: item?.commonName ?? slug.replace(/-/g, " "),
              family: item ? cropFamily(item.category) : "Crop",
              score: 0,
              reason: "Added to a custom cycle; verify local suitability before planting.",
              soilBenefit: "Check local rotation guidance and soil needs.",
              nitrogenFixer: false,
            }
          );
        }),
      })),
    [allCropOptions, cropScores, preferences.customCycles],
  );
  const availableCycles = useMemo(
    () => [...cycleSolutions, ...customCycleSolutions],
    [cycleSolutions, customCycleSolutions],
  );
  const selectedCycle =
    availableCycles.find((cycle) => cycle.id === preferences.selectedCycleId) ?? cycleSolutions[0];
  const soilMapUrl = useMemo(() => getSoilMapUrl(activeLocation.coordinates), [activeLocation]);
  const todayLabel = new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });

  async function loadLocationData(location: FarmLocation) {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setActiveLocation(location);
    setClimate(null);
    setWeather(null);
    setSatellite(null);
    setSoilClass(null);
    setSoilProfile(null);
    setUsdaSoil(null);
    setDataErrors([]);
    setDataLoading(true);
    setSoilMapUnavailable(false);

    const results = await Promise.allSettled([
      fetchClimate(location.coordinates),
      fetchLocalWeather(location.coordinates),
      fetchSatelliteObservation(location.coordinates),
      fetchSoilNutrientClass(location.coordinates),
      fetchSoilProfile(location.coordinates),
      location.country === "United States"
        ? fetchUsdaSoilMapUnit(location.coordinates)
        : Promise.resolve(null),
    ]);

    if (requestId.current !== currentRequestId) return;
    const errors: string[] = [];
    if (results[0].status === "fulfilled") {
      setClimate(results[0].value);
    } else {
      errors.push(results[0].reason instanceof Error ? results[0].reason.message : "NASA climate data is unavailable.");
    }
    if (results[1].status === "fulfilled") {
      setWeather(results[1].value);
    } else {
      errors.push(results[1].reason instanceof Error ? results[1].reason.message : "Weather data is unavailable.");
    }
    if (results[2].status === "fulfilled") {
      setSatellite(results[2].value);
    } else {
      errors.push(results[2].reason instanceof Error ? results[2].reason.message : "Satellite data is unavailable.");
    }
    if (results[3].status === "fulfilled") {
      setSoilClass(results[3].value);
    } else {
      errors.push(results[3].reason instanceof Error ? results[3].reason.message : "FAO soil data is unavailable.");
    }
    if (results[4].status === "fulfilled") {
      setSoilProfile(results[4].value);
    } else {
      errors.push(results[4].reason instanceof Error ? results[4].reason.message : "Soil profile data is unavailable.");
    }
    if (results[5].status === "fulfilled") {
      setUsdaSoil(results[5].value);
    } else {
      errors.push(results[5].reason instanceof Error ? results[5].reason.message : "USDA soil data is unavailable.");
    }
    setDataErrors(errors);
    setDataLoading(false);
  }

  async function savePreferences(nextPreferences: UserPreferences) {
    setPreferences(nextPreferences);
    try {
      await SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(nextPreferences));
    } catch (reason) {
      setDataErrors((current) => [
        ...current,
        reason instanceof Error ? `Could not securely save preferences: ${reason.message}` : "Could not securely save preferences.",
      ]);
    }
  }

  useEffect(() => {
    Appearance.setColorScheme(preferences.darkMode ? "dark" : "light");
  }, [preferences.darkMode]);

  useEffect(() => {
    if (tab !== "crops" || cropCatalogLoaded.current) return;
    cropCatalogLoaded.current = true;
    setCropCatalogLoading(true);
    void fetchCropCatalog()
      .then((catalog) => {
        setCropCatalog(catalog);
        setCropCatalogError("");
      })
      .catch((reason: unknown) => {
        setCropCatalogError(
          reason instanceof Error ? reason.message : "The crop catalog could not be loaded.",
        );
      })
      .finally(() => setCropCatalogLoading(false));
  }, [tab]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const stored = await SecureStore.getItemAsync(PREFERENCES_KEY);
        const restored = parsePreferences(stored);
        if (!active) return;
        setPreferences(restored);
        const location = restored.location ?? DEMO_LOCATION;
        await loadLocationData(location);
      } catch (reason) {
        if (!active) return;
        setDataErrors([
          reason instanceof Error
            ? `Could not restore saved settings: ${reason.message}`
            : "Could not restore saved settings.",
        ]);
        await loadLocationData(DEMO_LOCATION);
      } finally {
        if (active) setPreferencesLoading(false);
      }
    }
    void restore();
    void Location.getForegroundPermissionsAsync().then((permission) => {
      if (active) setLocationPermission(permission.status);
    }).catch((reason: unknown) => {
      if (active) {
        setDataErrors((current) => [
          ...current,
          reason instanceof Error ? `Could not check location permission: ${reason.message}` : "Could not check location permission.",
        ]);
      }
    });
    return () => {
      active = false;
      requestId.current += 1;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void Location.getForegroundPermissionsAsync().then((permission) => {
          setLocationPermission(permission.status);
        }).catch((reason: unknown) => {
          setDataErrors((current) => [
            ...current,
            reason instanceof Error ? `Could not check location permission: ${reason.message}` : "Could not check location permission.",
          ]);
        });
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }

    let current = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchLocations(query, locationScope).then((results) => {
        if (current) {
          setSearchResults(results);
          setSearchError("");
        }
      }).catch((reason: unknown) => {
        if (current) {
          setSearchResults([]);
          setSearchError(reason instanceof Error ? reason.message : "Place search is unavailable.");
        }
      }).finally(() => {
        if (current) setSearching(false);
      });
    }, 550);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [searchQuery, locationScope]);

  async function handleSelectLocation(location: FarmLocation) {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    await savePreferences({ ...preferences, location });
    await loadLocationData(location);
  }

  async function getCurrentLocation() {
    setLocationLoading(true);
    setSearchError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(permission.status);
      if (permission.status !== "granted") {
        setSearchError("Location access was not granted. Choose a city or enter a region instead.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const resolved = await reverseGeocodeLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      await handleSelectLocation({
        ...resolved,
        accuracyMeters: position.coords.accuracy ?? undefined,
      });
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : "Could not resolve your current city.");
    } finally {
      setLocationLoading(false);
    }
  }

  function confirmCurrentLocation() {
    Alert.alert(
      "Use current location?",
      "R.O.C.A. uses your location only while the app is open to find the nearest city and create local crop and weather guidance. Coordinates are sent over HTTPS to Photon, NASA POWER, Microsoft Planetary Computer, FAO, ISRIC SoilGrids, Open-Meteo, and OpenStreetMap as needed; the EveryFarm crop catalog receives no location. USDA receives a lookup only for U.S. locations. If configured, a private weather-provider proxy also receives the coordinates. R.O.C.A. does not track location in the background.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => void getCurrentLocation() },
      ],
    );
  }

  async function handlePermissionAction() {
    if (locationPermission === "granted" || locationPermission === "denied") {
      try {
        await Linking.openSettings();
      } catch (reason) {
        setDataErrors((current) => [
          ...current,
          reason instanceof Error ? `Could not open system settings: ${reason.message}` : "Could not open system settings.",
        ]);
      }
      return;
    }
    confirmCurrentLocation();
  }

  async function selectCycle(id: string) {
    await savePreferences({ ...preferences, selectedCycleId: id });
  }

  function toggleCustomCrop(slug: string) {
    setCustomCycleSlugs((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : current.length < 12
          ? [...current, slug]
          : current,
    );
  }

  function moveCustomCrop(index: number, direction: -1 | 1) {
    setCustomCycleSlugs((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  }

  async function saveCustomCycle() {
    const title = customCycleName.trim();
    if (!title) {
      Alert.alert("Name your cycle", "Add a name before saving this crop sequence.");
      return;
    }
    if (customCycleSlugs.length < 2) {
      Alert.alert("Add more crops", "A custom cycle needs at least two different crops.");
      return;
    }
    const cycle: CustomCropCycle = {
      id: `custom:${Date.now()}`,
      title,
      cropSlugs: customCycleSlugs,
    };
    setCustomCycleSaving(true);
    await savePreferences({
      ...preferences,
      customCycles: [...(preferences.customCycles ?? []), cycle],
      selectedCycleId: cycle.id,
    });
    setCustomCycleName("");
    setCustomCycleSlugs([]);
    setCustomCycleSaving(false);
  }

  async function removeCustomCycle(id: string) {
    const customCycles = (preferences.customCycles ?? []).filter((cycle) => cycle.id !== id);
    await savePreferences({
      ...preferences,
      customCycles,
      selectedCycleId: preferences.selectedCycleId === id ? DEFAULT_CYCLE_ID : preferences.selectedCycleId,
    });
  }

  async function toggleDarkMode(value: boolean) {
    await savePreferences({ ...preferences, darkMode: value });
  }

  function openExternal(url: string) {
    void Linking.openURL(url).catch((reason: unknown) => {
      setDataErrors((current) => [
        ...current,
        reason instanceof Error ? `Could not open link: ${reason.message}` : "Could not open link.",
      ]);
    });
  }

  function confirmClearSavedData() {
    Alert.alert(
      "Clear saved data?",
      "This deletes R.O.C.A.'s saved farm location and preferences from this device. It does not delete your Android location permission.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear saved data",
          style: "destructive",
          onPress: () => {
            void SecureStore.deleteItemAsync(PREFERENCES_KEY).then(() => {
              const cleared = {
                darkMode: false,
                location: null,
                selectedCycleId: DEFAULT_CYCLE_ID,
                customCycles: [],
              };
              setPreferences(cleared);
              setCustomCycleName("");
              setCustomCycleSlugs([]);
              setActiveLocation(DEMO_LOCATION);
              void loadLocationData(DEMO_LOCATION);
            }).catch((reason: unknown) => {
              setDataErrors((current) => [
                ...current,
                reason instanceof Error ? `Could not delete saved data: ${reason.message}` : "Could not delete saved data.",
              ]);
            });
          },
        },
      ],
    );
  }

  const pageHeader = (
    <View style={styles.header}>
      <View style={styles.brandLockup}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View>
        <View style={styles.brandText}>
          <Text style={styles.brandName}>R.O.C.A.</Text>
          <Text style={styles.brandTagline}>Resilient crops · healthy soil</Text>
        </View>
      </View>
      <View style={styles.headerPill}><Text style={styles.headerPillText}>FIELD GUIDE</Text></View>
    </View>
  );

  function renderDashboard() {
    return (
      <>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{todayLabel.toUpperCase()} · FARM OUTLOOK</Text>
          <Text style={styles.heroTitle}>Grow with the{`\n`}land, not against it.</Text>
          <Text style={styles.heroBody}>
            Local weather, soil context, and crop rotations to help you plan the next season.
          </Text>
          <View style={styles.heroLocation}>
            <Text style={styles.heroLocationDot}>●</Text>
            <Text numberOfLines={1} style={styles.heroLocationText}>{formatLocationName(activeLocation)}</Text>
            {activeLocation.id === DEMO_LOCATION.id ? (
              <Text style={styles.sampleBadge}>SAMPLE</Text>
            ) : null}
          </View>
        </View>

        <LocationPicker
          activeLocation={activeLocation}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          scope={locationScope}
          setScope={(nextScope) => {
            setLocationScope(nextScope);
            setSearchResults([]);
            setSearchError("");
          }}
          results={searchResults}
          searching={searching}
          searchError={searchError}
          onSelect={(location) => void handleSelectLocation(location)}
          onUseCurrentLocation={confirmCurrentLocation}
          locationLoading={locationLoading}
          styles={styles}
          colors={colors}
          narrow={narrow}
        />

        {dataErrors.length > 0 ? (
          <View accessibilityRole="alert" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Some data could not be loaded</Text>
            {dataErrors.slice(0, 4).map((message) => (
              <Text key={message} style={styles.errorText}>• {message}</Text>
            ))}
          </View>
        ) : null}

        {dataLoading || preferencesLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.greenText} />
            <Text style={styles.bodyText}>Gathering local climate, weather, soil, and satellite data…</Text>
          </View>
        ) : null}

        {plantingWindow ? (
          <>
            <SectionTitle
              eyebrow="NEXT THREE MONTHS"
              title={plantingWindow.label}
              colors={colors}
              styles={styles}
              trailing={<Text style={styles.dateBadge}>{getSeasonMonths(plantingWindow).toUpperCase()}</Text>}
            />
            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.eyebrow}>CLIMATE RAINFALL</Text>
                <Text style={styles.metricValue}>{plantingWindow.averageRainMmPerDay.toFixed(1)}<Text style={styles.metricUnit}> mm/day</Text></Text>
                <Text style={styles.bodyText}>
                  {climate?.temperatureSources?.length === 2
                    ? "Blended NASA POWER + ERA5-Land 10-year average"
                    : `${climate?.temperatureSources?.[0] ?? "NASA POWER"} long-term average`}
                </Text>
                {plantingWindow.averageTemperatureSpreadC !== null &&
                plantingWindow.averageTemperatureSpreadC !== undefined ? (
                  <Text style={styles.caption}>
                    Source models differ by {plantingWindow.averageTemperatureSpreadC.toFixed(1)}°C on average for these months.
                  </Text>
                ) : null}
                {climate?.temperatureSources?.length === 1 ? (
                  <Text style={styles.caption}>
                    Using {climate.temperatureSources[0]} only ({climate.sourcePeriod}).
                  </Text>
                ) : null}
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.eyebrow}>CLIMATE TEMPERATURE</Text>
                <Text style={styles.metricValue}>{plantingWindow.averageTemperatureC.toFixed(1)}<Text style={styles.metricUnit}> °C</Text></Text>
                <Text style={styles.bodyText}>
                  Sources: {climate?.temperatureSources?.join(" + ") ?? "NASA POWER"} · 2 m monthly average
                </Text>
              </View>
            </View>

            {cycleSolutions.length > 0 ? (
              <>
                <SectionTitle
                  eyebrow="CHOOSE A ROTATION"
                  title="Three ways to build your cycle"
                  colors={colors}
                  styles={styles}
                  trailing={<Text style={styles.resultsCount}>{availableCycles.length} OPTIONS</Text>}
                />
                <View style={styles.cycleList}>
                  {availableCycles.map((cycle) => (
                    <CycleCard
                      key={cycle.id}
                      cycle={cycle}
                      selected={cycle.id === selectedCycle?.id}
                      onPress={() => void selectCycle(cycle.id)}
                      styles={styles}
                    />
                  ))}
                </View>
                {selectedCycle ? (
                  <View style={styles.selectedCycleCard}>
                    <View style={styles.selectedCycleHeading}>
                      <View style={styles.selectedCycleCopy}>
                        <Text style={styles.lightEyebrow}>YOUR SELECTED CYCLE</Text>
                        <Text style={styles.selectedCycleTitle}>{selectedCycle.title}</Text>
                      </View>
                      <Text style={styles.cycleLoop}>↻</Text>
                    </View>
                    {selectedCycle.crops.map((crop, index) => (
                      <View key={`${selectedCycle.id}:${index}`} style={styles.cycleStep}>
                        <View style={styles.stepMarker}><Text style={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</Text></View>
                        <View style={styles.stepCopy}>
                          <Text style={styles.stepTitle}>{crop.name}</Text>
                          <Text style={styles.stepNote}>
                            {crop.family} · {crop.nitrogenFixer ? "nitrogen-fixing phase" : crop.soilBenefit}
                          </Text>
                        </View>
                      </View>
                    ))}
                    <Text style={styles.cycleDisclaimer}>
                      Climate-screening suggestions only. Verify local varieties, planting windows, and rotation needs with an agronomist.
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}

            {cropSuggestions.length > 0 ? (
              <>
                <SectionTitle
                  eyebrow="THIS SEASON"
                  title="Crops to consider"
                  colors={colors}
                  styles={styles}
                  trailing={<Text style={styles.resultsCount}>TOP {cropSuggestions.length}</Text>}
                />
                <View style={styles.cropList}>
                  {cropSuggestions.map((crop, index) => (
                    <CropCard key={crop.name} crop={crop} rank={index + 1} styles={styles} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : !dataLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Climate data is not available</Text>
            <Text style={styles.bodyText}>Check your connection or select another farm location.</Text>
          </View>
        ) : null}

        <SectionTitle
          eyebrow="SOIL CONTEXT"
          title="Know the ground beneath you"
          colors={colors}
          styles={styles}
        />
        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.cardTitle}>FAO nutrient availability</Text>
              <Text style={styles.bodyText}>Regional soil-quality context · maize reference</Text>
            </View>
            <Text style={styles.sourcePill}>FAO · HWSD</Text>
          </View>
          {soilMapUnavailable ? (
            <View style={styles.mapFallback}>
              <Text style={styles.emptyTitle}>FAO map is temporarily unavailable</Text>
              <Text style={styles.bodyText}>The seasonal plan is available without the map layer.</Text>
            </View>
          ) : (
            <Image
              accessibilityLabel={`FAO soil nutrient availability map centered near ${formatLocationName(activeLocation)}`}
              onError={() => setSoilMapUnavailable(true)}
              resizeMode="cover"
              source={{ uri: soilMapUrl }}
              style={styles.soilMap}
            />
          )}
          <View style={[styles.soilClassPanel, soilClass && soilClass.value >= 3 && soilClass.value <= 4 && styles.soilClassWarning]}>
            <Text style={styles.eyebrow}>FAO POINT SAMPLE</Text>
            <Text style={styles.cardTitle}>{soilClass?.label ?? "No mapped class returned"}</Text>
            <Text style={styles.bodyText}>
              {soilClass
                ? `Class ${soilClass.value} of 7 · qualitative regional assessment; not a field soil test.`
                : "This regional soil layer may not have a value for this location."}
            </Text>
          </View>
          <Text style={styles.caption}>
            FAO/IIASA/ISRIC/ISSCAS/JRC (2012), Harmonized World Soil Database v1.2. Classes are not quantitative soil tests.
          </Text>
        </View>

        <SoilProfileCard profile={soilProfile} loading={dataLoading} colors={colors} />

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.cardTitle}>USDA soil survey</Text>
              <Text style={styles.bodyText}>Soil Data Access map unit at this point</Text>
            </View>
            <Text style={styles.sourcePill}>USDA · US ONLY</Text>
          </View>
          {usdaSoil ? (
            <Text style={styles.soilMapUnit}>{usdaSoil.name} · map unit {usdaSoil.mapUnitKey}</Text>
          ) : (
            <Text style={styles.bodyText}>
              {activeLocation.country === "United States"
                ? "No USDA map unit returned for this point."
                : "USDA Web Soil Survey data is available for locations in the United States."}
            </Text>
          )}
          <Pressable
            accessibilityRole="link"
            onPress={() => openExternal("https://websoilsurvey.nrcs.usda.gov/app/")}
            style={styles.textLinkButton}
          >
            <Text style={styles.textLink}>Open USDA Web Soil Survey ↗</Text>
          </Pressable>
          <Text style={styles.caption}>The USDA map-unit lookup is contextual and does not replace a site-specific soil survey or laboratory test.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.cardTitle}>Vegetation satellite coverage</Text>
              <Text style={styles.bodyText}>NASA MODIS via Microsoft Planetary Computer</Text>
            </View>
            <Text style={styles.sourcePill}>NASA · MODIS</Text>
          </View>
          <Text style={styles.satelliteTitle}>
            {satellite ? "Recent vegetation scene found" : "No recent scene found"}
          </Text>
          <Text style={styles.bodyText}>
            {satellite
              ? `${new Date(satellite.observedAt).toLocaleDateString("en", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })} · ${satellite.itemId}`
              : "Scene coverage depends on location and collection availability."}
          </Text>
          <View style={styles.linkRow}>
            <Pressable onPress={() => openExternal("https://planetarycomputer.microsoft.com/catalog")} style={styles.textLinkButton}>
              <Text style={styles.textLink}>Data catalog ↗</Text>
            </Pressable>
            <Pressable onPress={() => openExternal("https://planetarycomputer.microsoft.com/applications")} style={styles.textLinkButton}>
              <Text style={styles.textLink}>Applications ↗</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  function renderWeather() {
    return (
      <>
        <View style={styles.screenIntro}>
          <Text style={styles.eyebrow}>WEATHER & SOIL LAYERS FOR</Text>
          <Text style={styles.screenTitle}>{formatLocationName(activeLocation)}</Text>
          <Text style={styles.bodyText}>{activeLocation.description} · {formatCoordinates(activeLocation.coordinates)}</Text>
        </View>
        {weather ? (
          <>
            <WeatherMap
              coordinates={activeLocation.coordinates}
              weather={weather}
              locationName={formatLocationName(activeLocation)}
              colors={colors}
              soilProfile={soilProfile}
              soilClass={soilClass}
            />
            <SectionTitle eyebrow="SEVEN-DAY OUTLOOK" title="Plan around the forecast" colors={colors} styles={styles} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.forecastRow}
            >
              {weather.forecast.map((day) => (
                <View key={day.date} style={styles.forecastCard}>
                  <Text style={styles.forecastDay}>
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString("en", { weekday: "short" })}
                  </Text>
                  <Text style={styles.forecastIcon}>{getWeatherIcon(day.weatherCode)}</Text>
                  <Text style={styles.forecastHigh}>{Math.round(day.maximumC)}°</Text>
                  <Text style={styles.forecastLow}>{Math.round(day.minimumC)}°</Text>
                  <Text style={styles.forecastRain}>{day.precipitationMm.toFixed(1)} mm</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Forecast notes</Text>
              <Text style={styles.bodyText}>
                Short-range forecast data helps with near-term field planning; it is different from the multi-decade climate averages used for crop screening.
              </Text>
              <Text style={styles.caption}>Source: {weather.source} · Time zone: {weather.timezone} · Forecast may change as models update.</Text>
            </View>
          </>
        ) : (
          <View style={styles.loadingCard}>
            {dataLoading ? <ActivityIndicator color={colors.greenText} /> : null}
            <Text style={styles.emptyTitle}>{dataLoading ? "Loading local forecast…" : "Weather is unavailable"}</Text>
            {!dataLoading ? <Text style={styles.bodyText}>Select a location on the dashboard or try again later.</Text> : null}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("dashboard")}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Change farm location</Text>
        </Pressable>
      </>
    );
  }

  function renderCrops() {
    const visibleCrops = allCropOptions.filter((crop) =>
      `${crop.commonName} ${crop.scientificName} ${crop.category}`
        .toLowerCase()
        .includes(cropCatalogSearch.trim().toLowerCase()),
    );

    return (
      <>
        <View style={styles.screenIntro}>
          <Text style={styles.eyebrow}>CROP CATALOG & ROTATIONS</Text>
          <Text style={styles.screenTitle}>Choose your crops</Text>
          <Text style={styles.bodyText}>
            Browse the crop catalog, then build and save a cycle in your preferred order.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Build a custom cycle</Text>
          <Text style={styles.bodyText}>
            Select at least two crops and order the phases. R.O.C.A. saves your cycle on this device.
            A custom sequence is your plan, not an agronomic suitability check.
          </Text>
          <TextInput
            accessibilityLabel="Custom cycle name"
            onChangeText={setCustomCycleName}
            placeholder="Cycle name"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={customCycleName}
          />
          {customCycleSlugs.length ? (
            <View style={styles.customCycleList}>
              {customCycleSlugs.map((slug, index) => {
                const item = allCropOptions.find((crop) => crop.slug === slug);
                return (
                  <View key={slug} style={styles.customCropRow}>
                    <View style={styles.customCropIndex}>
                      <Text style={styles.customCropIndexText}>{String(index + 1).padStart(2, "0")}</Text>
                    </View>
                    <View style={styles.customCropCopy}>
                      <Text style={styles.customCropName}>{item?.commonName ?? slug}</Text>
                      <Text style={styles.caption}>{item ? cropFamily(item.category) : "Crop phase"}</Text>
                    </View>
                    <Pressable
                      accessibilityLabel={`Move ${item?.commonName ?? slug} earlier`}
                      accessibilityRole="button"
                      disabled={index === 0}
                      onPress={() => moveCustomCrop(index, -1)}
                      style={styles.orderButton}
                    >
                      <Text style={styles.orderButtonText}>↑</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Move ${item?.commonName ?? slug} later`}
                      accessibilityRole="button"
                      disabled={index === customCycleSlugs.length - 1}
                      onPress={() => moveCustomCrop(index, 1)}
                      style={styles.orderButton}
                    >
                      <Text style={styles.orderButtonText}>↓</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Remove ${item?.commonName ?? slug} from custom cycle`}
                      accessibilityRole="button"
                      onPress={() => toggleCustomCrop(slug)}
                      style={styles.removeCropButton}
                    >
                      <Text style={styles.removeCropText}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.caption}>No crop phases selected yet.</Text>
          )}
          <Text style={styles.caption}>Add up to 12 crop phases; use the arrows to set their order.</Text>
          <Pressable
            accessibilityRole="button"
            disabled={customCycleSaving || customCycleSlugs.length < 2}
            onPress={() => void saveCustomCycle()}
            style={[
              styles.primaryButton,
              (customCycleSaving || customCycleSlugs.length < 2) && styles.disabledButton,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {customCycleSaving ? "Saving cycle…" : "Save and use this cycle"}
            </Text>
          </Pressable>
        </View>

        {customCycleSolutions.length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Saved custom cycles</Text>
            {customCycleSolutions.map((cycle) => (
              <View key={cycle.id} style={styles.savedCycleRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void selectCycle(cycle.id)}
                  style={styles.savedCycleCopy}
                >
                  <Text style={styles.savedCycleTitle}>{cycle.title}</Text>
                  <Text style={styles.bodyText}>{cycle.crops.map((crop) => crop.name).join(" → ")}</Text>
                  <Text style={styles.textLink}>{cycle.id === preferences.selectedCycleId ? "Currently selected" : "Tap to use this cycle"}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Delete ${cycle.title}`}
                  accessibilityRole="button"
                  onPress={() => void removeCustomCycle(cycle.id)}
                  style={styles.removeCropButton}
                >
                  <Text style={styles.removeCropText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {dataErrors.length ? (
          <View accessibilityRole="alert" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Some saved data could not be updated</Text>
            {dataErrors.slice(0, 3).map((message) => (
              <Text key={message} style={styles.errorText}>• {message}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.cardTitle}>All crop options</Text>
              <Text style={styles.bodyText}>
                {cropCatalog.length ? `${cropCatalog.length} catalog entries` : "Local crop options"}
                {plantingWindow ? " · climate screening for locally modeled crops" : ""}
              </Text>
            </View>
            {cropCatalogLoading ? <ActivityIndicator color={colors.greenText} /> : null}
          </View>
          <TextInput
            accessibilityLabel="Search crop options"
            onChangeText={setCropCatalogSearch}
            placeholder="Search crops, categories, or scientific names"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={cropCatalogSearch}
          />
          {cropCatalogError ? (
            <View accessibilityRole="alert" style={styles.catalogWarning}>
              <Text style={styles.errorText}>{cropCatalogError} Showing the built-in climate-screened options where available.</Text>
            </View>
          ) : null}
          {visibleCrops.map((crop) => {
            const selected = customCycleSlugs.includes(crop.slug);
            const score = cropScores.get(crop.slug);
            return (
              <View key={crop.slug} style={styles.cropOptionRow}>
                <View style={styles.cropOptionCopy}>
                  <View style={styles.cropOptionHeading}>
                    <Text style={styles.cropOptionName}>{crop.commonName}</Text>
                    {score ? <Text style={styles.cropScore}>{score.score}/100</Text> : null}
                  </View>
                  <Text style={styles.cropMeta}>
                    {cropFamily(crop.category).toUpperCase()} · {crop.lifecycle.toUpperCase()}
                  </Text>
                  {crop.scientificName ? (
                    <Text style={styles.cropScientific}>{crop.scientificName}</Text>
                  ) : null}
                  {score ? (
                    <Text style={styles.bodyText}>{score.reason}</Text>
                  ) : (
                    <Text style={styles.caption}>
                      Catalog option only; verify local climate and rotation suitability before planting.
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={!selected && customCycleSlugs.length >= 12}
                  onPress={() => toggleCustomCrop(crop.slug)}
                  style={[styles.addCropButton, selected && styles.addCropButtonSelected]}
                >
                  <Text style={[styles.addCropButtonText, selected && styles.addCropButtonTextSelected]}>
                    {selected ? "Added" : "Add"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {!cropCatalogLoading && !visibleCrops.length ? (
            <Text style={styles.emptySearchText}>No crops match this search.</Text>
          ) : null}
          <Text style={styles.caption}>
            Catalog: EveryFarm Crops API (read-only catalog). Its entries are not local planting
            recommendations; climate scores are shown only for R.O.C.A.’s locally screened crops.
          </Text>
        </View>
      </>
    );
  }

  function renderOptions() {
    return (
      <>
        <View style={styles.screenIntro}>
          <Text style={styles.eyebrow}>PERSONALIZE YOUR FIELD GUIDE</Text>
          <Text style={styles.screenTitle}>Options</Text>
          <Text style={styles.bodyText}>Your preferences stay on this device.</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.cardTitle}>Dark mode</Text>
              <Text style={styles.bodyText}>Use a low-light version of the same field palette.</Text>
            </View>
            <Switch
              accessibilityLabel="Dark mode"
              onValueChange={(value) => void toggleDarkMode(value)}
              thumbColor={preferences.darkMode ? colors.lime : "#F4F4F4"}
              trackColor={{ false: colors.border, true: colors.green }}
              value={preferences.darkMode}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location permission</Text>
          <Text style={styles.bodyText}>
            R.O.C.A. uses one-time foreground location only when you choose “Use GPS.” It does not request background location.
          </Text>
          <View style={styles.permissionStatus}>
            <View style={[styles.permissionDot, locationPermission === "granted" && styles.permissionGranted]} />
            <Text style={styles.permissionText}>
              {locationPermission === "granted"
                ? "Location allowed while using the app"
                : locationPermission === "denied"
                  ? "Location not allowed"
                  : locationPermission === "undetermined"
                    ? "Permission has not been requested"
                    : "Checking Android permission"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handlePermissionAction()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {locationPermission === "granted" ? "Manage in Android settings" : "Review location permission"}
            </Text>
          </Pressable>
          <Text style={styles.caption}>No contacts, camera, microphone, or background-location permissions are used.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Privacy and data use</Text>
          <Text style={styles.bodyText}>
            Saved farm coordinates and settings are stored in Android encrypted secure storage. When you select a location, its coordinates are sent over HTTPS to NASA POWER, Open-Meteo, Microsoft Planetary Computer, FAO, ISRIC SoilGrids, and Photon for the features you use. The EveryFarm crop catalog receives no location. USDA Soil Data Access receives a coordinate lookup only for U.S. locations. OpenStreetMap receives map-tile requests when you open the weather map. If configured, a private weather proxy also receives forecast coordinates.
          </Text>
          <Text style={styles.bodyText}>
            R.O.C.A. does not include ads, an account system, analytics, or location tracking in the background. Providers may process request logs under their own privacy terms. Clear saved data below to remove R.O.C.A.'s local farm and preference record.
          </Text>
          <Text style={styles.caption}>
            Before publishing on Google Play, host the full privacy policy at a public URL and accurately complete the Play Console Data safety form.
          </Text>
          <Pressable onPress={() => openExternal("https://reactnative.dev/docs/security")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>React Native security guidance ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://play.google/developer-content-policy/")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>Google Play developer policies ↗</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Data providers</Text>
          <View style={styles.providerRow}>
            <Text style={styles.providerName}>Weather forecast</Text>
            <Text style={styles.providerValue}>{weather?.source ?? "Open-Meteo"}</Text>
          </View>
          <Text style={styles.bodyText}>
            Meteomatics requires paid credentials. R.O.C.A. never stores API passwords in the app. Add a private HTTPS server proxy as EXPO_PUBLIC_METEOMATICS_PROXY_URL to enable the optional Meteomatics forecast adapter; without a proxy, forecasts use Open-Meteo.
          </Text>
          <Text style={styles.bodyText}>
            Crop climate averages blend NASA POWER with a 10-year Open-Meteo ERA5-Land archive when both are available. The weather forecast uses Open-Meteo; source-model spread is shown when available. OpenWeatherMap, WeatherAPI, and Weatherstack require provider credentials, so they are supported only through an optional private HTTPS proxy that keeps those keys server-side.
          </Text>
          <Pressable onPress={() => openExternal("https://openweathermap.org/api")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>OpenWeatherMap API ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://www.weatherapi.com/docs/")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>WeatherAPI ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://weatherstack.com/documentation")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>Weatherstack API ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://crops.every.farm/docs/crop-picker-platform/crops-api/")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>EveryFarm crop catalog ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://apifarmer.com/")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>APIFarmer ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://developers.google.com/agricultural-understanding/api")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>Google Agricultural Understanding ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://api.cropsense.africa")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>CropSense Africa ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://www.meteomatics.com/en/api/getting-started/")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>Meteomatics API setup ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://websoilsurvey.nrcs.usda.gov/app/")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>USDA Web Soil Survey ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://soilgrids.org/")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>ISRIC SoilGrids ↗</Text>
          </Pressable>
          <Pressable onPress={() => openExternal("https://data.apps.fao.org/catalog/dataset/e00c65cd-7577-4ebe-a888-5eaf7930acf5")} style={styles.textLinkButton}>
            <Text style={styles.textLink}>FAO soil data ↗</Text>
          </Pressable>
        </View>

        <View style={[styles.card, styles.deleteCard]}>
          <Text style={styles.cardTitle}>Remove saved data</Text>
          <Text style={styles.bodyText}>Delete the farm location, theme, and selected crop-cycle preference stored by R.O.C.A. on this device.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={confirmClearSavedData}
            style={styles.dangerButton}
          >
            <Text style={styles.dangerButtonText}>Clear saved data</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const tabs: Array<{ key: AppTab; label: string; glyph: string }> = [
    { key: "dashboard", label: "Dashboard", glyph: "⌂" },
    { key: "weather", label: "Weather map", glyph: "◉" },
    { key: "crops", label: "Crops", glyph: "♧" },
    { key: "options", label: "Options", glyph: "⋯" },
  ];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <StatusBar style={preferences.darkMode ? "light" : "dark"} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          {pageHeader}
          {tab === "dashboard" ? renderDashboard() : null}
          {tab === "weather" ? renderWeather() : null}
          {tab === "crops" ? renderCrops() : null}
          {tab === "options" ? renderOptions() : null}
          <View style={styles.footer}>
            <Text style={styles.footerBrand}>R.O.C.A.</Text>
            <Text style={styles.footerText}>Local seasonal guidance · not a substitute for field testing or local agronomy</Text>
          </View>
        </View>
      </ScrollView>
      <View style={styles.tabBar}>
        {tabs.map((item) => {
          const selected = tab === item.key;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item.key}
              onPress={() => setTab(item.key)}
              style={styles.tabButton}
            >
              <Text style={[styles.tabGlyph, selected && styles.tabSelected]}>{item.glyph}</Text>
              <Text style={[styles.tabLabel, selected && styles.tabSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number) {
  const horizontalPadding = screenWidth < 380 ? 14 : screenWidth >= 700 ? 28 : 20;
  const contentWidth = Math.min(screenWidth, 820);
  return StyleSheet.create({
    safeArea: {
      backgroundColor: colors.paper,
      flex: 1,
    },
    scrollContent: {
      alignItems: "center",
      paddingBottom: 16,
    },
    page: {
      alignSelf: "center",
      maxWidth: 820,
      paddingHorizontal: horizontalPadding,
      paddingTop: 10,
      width: "100%",
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
      minHeight: 44,
    },
    brandLockup: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      gap: 10,
    },
    brandMark: {
      alignItems: "center",
      backgroundColor: colors.green,
      borderRadius: 13,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    brandMarkText: {
      color: colors.lime,
      fontSize: 20,
      fontWeight: "800",
    },
    brandText: {
      flexShrink: 1,
    },
    brandName: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    brandTagline: {
      color: colors.muted,
      fontSize: 10,
      marginTop: 2,
    },
    headerPill: {
      backgroundColor: colors.paleGreen,
      borderRadius: 20,
      marginLeft: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    headerPillText: {
      color: colors.greenText,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    hero: {
      backgroundColor: colors.green,
      borderRadius: 23,
      marginBottom: 14,
      padding: screenWidth < 380 ? 17 : 22,
    },
    heroEyebrow: {
      color: colors.lime,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    heroTitle: {
      color: "#FFFFFF",
      fontSize: screenWidth < 360 ? 26 : screenWidth >= 700 ? 36 : 31,
      fontWeight: "700",
      letterSpacing: -0.8,
      lineHeight: screenWidth < 360 ? 32 : screenWidth >= 700 ? 42 : 37,
      marginTop: 12,
    },
    heroBody: {
      color: colors.onGreen,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 9,
      maxWidth: 460,
    },
    heroLocation: {
      alignItems: "center",
      flexDirection: "row",
      marginTop: 15,
    },
    heroLocationDot: {
      color: colors.lime,
      fontSize: 9,
      marginRight: 7,
    },
    heroLocationText: {
      color: colors.onGreen,
      flexShrink: 1,
      fontSize: 11,
      fontWeight: "700",
    },
    sampleBadge: {
      backgroundColor: "#FFFFFF1C",
      borderRadius: 6,
      color: colors.lime,
      fontSize: 8,
      fontWeight: "800",
      marginLeft: 8,
      overflow: "hidden",
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    card: {
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 17,
      borderWidth: 1,
      marginBottom: 13,
      padding: screenWidth < 380 ? 13 : 16,
    },
    locationTopRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    locationCopy: {
      flex: 1,
      marginRight: 9,
      minWidth: 0,
    },
    eyebrow: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    locationTitle: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "700",
      marginTop: 4,
    },
    locationCoordinates: {
      color: colors.muted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 3,
    },
    gpsButton: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 9,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 38,
      minWidth: 64,
      paddingHorizontal: 9,
    },
    gpsButtonText: {
      color: colors.greenText,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    scopeSelector: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
      flexDirection: "row",
      marginTop: 14,
      padding: 3,
    },
    scopeSelectorNarrow: {
      marginTop: 11,
    },
    scopeOption: {
      alignItems: "center",
      borderRadius: 8,
      flex: 1,
      justifyContent: "center",
      minHeight: 37,
      paddingHorizontal: 6,
    },
    scopeOptionSelected: {
      backgroundColor: colors.white,
      elevation: 1,
    },
    scopeText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "600",
    },
    scopeTextSelected: {
      color: colors.greenText,
      fontWeight: "800",
    },
    searchInput: {
      backgroundColor: colors.paper,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 14,
      marginTop: 10,
      minHeight: 47,
      paddingHorizontal: 12,
    },
    searchStatus: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      paddingTop: 10,
    },
    resultList: {
      borderColor: colors.border,
      borderRadius: 11,
      borderWidth: 1,
      marginTop: 8,
      overflow: "hidden",
    },
    resultRow: {
      alignItems: "center",
      backgroundColor: colors.white,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      minHeight: 57,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    resultIcon: {
      alignItems: "center",
      backgroundColor: colors.paleGreen,
      borderRadius: 9,
      height: 32,
      justifyContent: "center",
      marginRight: 9,
      width: 32,
    },
    resultIconText: {
      color: colors.greenText,
      fontSize: 18,
    },
    resultCopy: {
      flex: 1,
      minWidth: 0,
    },
    resultName: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "700",
    },
    resultArrow: {
      color: colors.muted,
      fontSize: 22,
      paddingLeft: 8,
    },
    locationHint: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 10,
    },
    emptySearchText: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      paddingTop: 9,
    },
    errorText: {
      color: colors.red,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 5,
    },
    errorCard: {
      backgroundColor: colors.warning,
      borderRadius: 12,
      marginBottom: 14,
      padding: 13,
    },
    errorTitle: {
      color: colors.red,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 3,
    },
    loadingCard: {
      alignItems: "center",
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: 9,
      marginBottom: 15,
      padding: 20,
    },
    sectionTitleRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 11,
      marginTop: 15,
    },
    sectionTitleCopy: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: screenWidth < 360 ? 18 : 20,
      fontWeight: "700",
      letterSpacing: -0.35,
      marginTop: 4,
    },
    dateBadge: {
      backgroundColor: colors.paleGreen,
      borderRadius: 7,
      color: colors.greenText,
      fontSize: 8,
      fontWeight: "800",
      marginBottom: 2,
      marginLeft: 8,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 7,
    },
    resultsCount: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: "800",
      marginBottom: 4,
      marginLeft: 8,
    },
    metricGrid: {
      flexDirection: contentWidth >= 540 ? "row" : "column",
      gap: 9,
      marginBottom: 12,
    },
    metricCard: {
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      minWidth: 0,
      padding: 14,
    },
    metricValue: {
      color: colors.ink,
      fontSize: 23,
      fontWeight: "800",
      letterSpacing: -0.6,
      marginTop: 7,
    },
    metricUnit: {
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0,
    },
    bodyText: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 4,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.green,
      borderRadius: 10,
      justifyContent: "center",
      marginTop: 12,
      minHeight: 45,
      paddingHorizontal: 14,
    },
    primaryButtonText: {
      color: colors.onGreen,
      fontSize: 12,
      fontWeight: "800",
    },
    disabledButton: {
      opacity: 0.45,
    },
    customCycleList: {
      marginTop: 10,
    },
    customCropRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      minHeight: 54,
      paddingVertical: 6,
    },
    customCropIndex: {
      alignItems: "center",
      backgroundColor: colors.paleGreen,
      borderRadius: 8,
      height: 29,
      justifyContent: "center",
      marginRight: 8,
      width: 29,
    },
    customCropIndexText: {
      color: colors.greenText,
      fontSize: 9,
      fontWeight: "800",
    },
    customCropCopy: {
      flex: 1,
      minWidth: 0,
    },
    customCropName: {
      color: colors.ink,
      fontSize: 11,
      fontWeight: "700",
    },
    orderButton: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 7,
      borderWidth: 1,
      height: 29,
      justifyContent: "center",
      marginLeft: 4,
      width: 29,
    },
    orderButtonText: {
      color: colors.greenText,
      fontSize: 15,
      fontWeight: "700",
    },
    removeCropButton: {
      alignItems: "center",
      backgroundColor: colors.warning,
      borderRadius: 15,
      height: 29,
      justifyContent: "center",
      marginLeft: 5,
      width: 29,
    },
    removeCropText: {
      color: colors.red,
      fontSize: 20,
      lineHeight: 24,
    },
    savedCycleRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingVertical: 8,
    },
    savedCycleCopy: {
      flex: 1,
      minWidth: 0,
    },
    savedCycleTitle: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "700",
    },
    cropOptionRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingVertical: 10,
    },
    cropOptionCopy: {
      flex: 1,
      marginRight: 8,
      minWidth: 0,
    },
    cropOptionHeading: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cropOptionName: {
      color: colors.ink,
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
    },
    cropScientific: {
      color: colors.muted,
      fontSize: 9,
      fontStyle: "italic",
      marginTop: 3,
    },
    addCropButton: {
      alignItems: "center",
      backgroundColor: colors.paleGreen,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 34,
      minWidth: 56,
      paddingHorizontal: 8,
    },
    addCropButtonSelected: {
      backgroundColor: colors.green,
    },
    addCropButtonText: {
      color: colors.greenText,
      fontSize: 10,
      fontWeight: "800",
    },
    addCropButtonTextSelected: {
      color: colors.onGreen,
    },
    catalogWarning: {
      backgroundColor: colors.warning,
      borderRadius: 8,
      marginTop: 8,
      padding: 8,
    },
    cycleList: {
      gap: 9,
      marginBottom: 12,
    },
    cycleChoice: {
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      padding: 13,
    },
    cycleChoiceSelected: {
      backgroundColor: colors.green,
      borderColor: colors.green,
    },
    cycleChoiceHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cycleChoiceTitle: {
      color: colors.ink,
      flex: 1,
      fontSize: 14,
      fontWeight: "800",
      marginRight: 7,
    },
    cycleChoiceTitleSelected: {
      color: "#FFFFFF",
    },
    cycleScore: {
      color: colors.greenText,
      fontSize: 11,
      fontWeight: "800",
    },
    cycleChoiceDescription: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 5,
    },
    cycleChoiceDescriptionSelected: {
      color: colors.onGreen,
    },
    cycleCropList: {
      color: colors.greenText,
      fontSize: 10,
      fontWeight: "700",
      lineHeight: 16,
      marginTop: 8,
    },
    selectedCycleCard: {
      backgroundColor: colors.green,
      borderRadius: 17,
      marginBottom: 12,
      padding: 16,
    },
    selectedCycleHeading: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 7,
    },
    selectedCycleCopy: {
      flex: 1,
    },
    lightEyebrow: {
      color: colors.lime,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1,
    },
    selectedCycleTitle: {
      color: "#FFFFFF",
      fontSize: 19,
      fontWeight: "700",
      marginTop: 4,
    },
    cycleLoop: {
      color: colors.lime,
      fontSize: 30,
    },
    cycleStep: {
      alignItems: "flex-start",
      flexDirection: "row",
      paddingVertical: 9,
    },
    stepMarker: {
      alignItems: "center",
      borderColor: "#6F8C77",
      borderRadius: 14,
      borderWidth: 1,
      height: 29,
      justifyContent: "center",
      marginRight: 10,
      width: 29,
    },
    stepNumber: {
      color: colors.lime,
      fontSize: 9,
      fontWeight: "800",
    },
    stepCopy: {
      flex: 1,
      paddingTop: 2,
    },
    stepTitle: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    stepNote: {
      color: colors.onGreen,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 3,
    },
    cycleDisclaimer: {
      color: colors.onGreen,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 8,
    },
    cropList: {
      gap: 8,
      marginBottom: 9,
    },
    cropCard: {
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      padding: 12,
    },
    cropRank: {
      alignItems: "center",
      backgroundColor: colors.paleGreen,
      borderRadius: 9,
      height: 33,
      justifyContent: "center",
      marginRight: 10,
      width: 33,
    },
    cropRankText: {
      color: colors.greenText,
      fontSize: 10,
      fontWeight: "800",
    },
    cropCopy: {
      flex: 1,
      minWidth: 0,
    },
    cropTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cropName: {
      color: colors.ink,
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
    },
    cropScore: {
      color: colors.greenText,
      fontSize: 12,
      fontWeight: "800",
      marginLeft: 5,
    },
    cropMeta: {
      color: colors.muted,
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginTop: 3,
    },
    cropBenefit: {
      color: colors.greenText,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 3,
    },
    soilMap: {
      backgroundColor: colors.paper,
      borderRadius: 10,
      height: Math.min(230, Math.max(150, (contentWidth - horizontalPadding * 2) * 0.48)),
      marginTop: 12,
      width: "100%",
    },
    cardHeadingRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cardHeadingCopy: {
      flex: 1,
      marginRight: 8,
      minWidth: 0,
    },
    cardTitle: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 19,
      marginTop: 3,
    },
    sourcePill: {
      backgroundColor: colors.amber,
      borderRadius: 7,
      color: colors.greenText,
      fontSize: 8,
      fontWeight: "800",
      overflow: "hidden",
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    soilClassPanel: {
      backgroundColor: colors.paleGreen,
      borderRadius: 10,
      marginTop: 10,
      padding: 11,
    },
    soilClassWarning: {
      backgroundColor: colors.warning,
    },
    caption: {
      color: colors.muted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 9,
    },
    mapFallback: {
      alignItems: "center",
      backgroundColor: colors.paper,
      borderRadius: 10,
      justifyContent: "center",
      marginTop: 12,
      minHeight: 120,
      padding: 14,
    },
    soilMapUnit: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 18,
      marginTop: 12,
    },
    textLinkButton: {
      alignSelf: "flex-start",
      minHeight: 35,
      justifyContent: "center",
      marginTop: 4,
      paddingRight: 9,
    },
    textLink: {
      color: colors.greenText,
      fontSize: 11,
      fontWeight: "700",
      textDecorationLine: "underline",
    },
    satelliteTitle: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 12,
    },
    linkRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 4,
    },
    emptyCard: {
      alignItems: "center",
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 15,
      borderWidth: 1,
      marginVertical: 16,
      padding: 22,
    },
    emptyTitle: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 19,
      marginTop: 4,
    },
    screenIntro: {
      marginBottom: 13,
      marginTop: 6,
    },
    screenTitle: {
      color: colors.ink,
      fontSize: screenWidth < 360 ? 24 : 28,
      fontWeight: "700",
      letterSpacing: -0.6,
      marginTop: 4,
    },
    forecastRow: {
      gap: 8,
      paddingBottom: 4,
      paddingRight: 4,
    },
    forecastCard: {
      alignItems: "center",
      backgroundColor: colors.white,
      borderColor: colors.border,
      borderRadius: 13,
      borderWidth: 1,
      minWidth: 78,
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    forecastDay: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
    },
    forecastIcon: {
      color: colors.greenText,
      fontSize: 22,
      height: 30,
      marginTop: 7,
      textAlign: "center",
    },
    forecastHigh: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "800",
      marginTop: 4,
    },
    forecastLow: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 2,
    },
    forecastRain: {
      color: colors.greenText,
      fontSize: 9,
      fontWeight: "700",
      marginTop: 7,
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: colors.paleGreen,
      borderRadius: 10,
      justifyContent: "center",
      marginTop: 10,
      minHeight: 45,
      paddingHorizontal: 14,
    },
    secondaryButtonText: {
      color: colors.greenText,
      fontSize: 12,
      fontWeight: "700",
    },
    settingRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    settingCopy: {
      flex: 1,
      marginRight: 12,
    },
    permissionStatus: {
      alignItems: "center",
      flexDirection: "row",
      marginTop: 13,
    },
    permissionDot: {
      backgroundColor: colors.muted,
      borderRadius: 4,
      height: 8,
      marginRight: 8,
      width: 8,
    },
    permissionGranted: {
      backgroundColor: colors.greenText,
    },
    permissionText: {
      color: colors.ink,
      flex: 1,
      fontSize: 11,
      fontWeight: "600",
    },
    providerRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 8,
      paddingBottom: 10,
    },
    providerName: {
      color: colors.ink,
      fontSize: 11,
      fontWeight: "700",
    },
    providerValue: {
      color: colors.greenText,
      fontSize: 11,
      fontWeight: "700",
    },
    deleteCard: {
      borderColor: colors.warning,
    },
    dangerButton: {
      alignItems: "center",
      borderColor: colors.red,
      borderRadius: 9,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 12,
      minHeight: 42,
    },
    dangerButtonText: {
      color: colors.red,
      fontSize: 11,
      fontWeight: "700",
    },
    footer: {
      alignItems: "center",
      paddingBottom: 8,
      paddingTop: 18,
    },
    footerBrand: {
      color: colors.greenText,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    footerText: {
      color: colors.muted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: 4,
      maxWidth: 500,
      textAlign: "center",
    },
    tabBar: {
      alignItems: "stretch",
      backgroundColor: colors.white,
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "center",
      paddingBottom: 2,
      paddingHorizontal: Math.max(4, horizontalPadding - 4),
      paddingTop: 5,
    },
    tabButton: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 2,
    },
    tabGlyph: {
      color: colors.muted,
      fontSize: 19,
      lineHeight: 22,
    },
    tabLabel: {
      color: colors.muted,
      fontSize: screenWidth < 360 ? 9 : 10,
      fontWeight: "600",
      marginTop: 2,
    },
    tabSelected: {
      color: colors.greenText,
      fontWeight: "800",
    },
    pressed: {
      opacity: 0.8,
    },
  });
}
