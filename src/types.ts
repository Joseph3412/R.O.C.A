export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type LocationScope = "city" | "region" | "country";

export type FarmLocation = {
  id: string;
  name: string;
  description: string;
  scope: LocationScope | "current";
  coordinates: Coordinates;
  city?: string;
  country?: string;
  accuracyMeters?: number;
};

export type LocationSearchResult = FarmLocation;

export type WeatherDay = {
  date: string;
  minimumC: number;
  maximumC: number;
  precipitationMm: number;
  weatherCode: number;
};

export type LocalWeather = {
  currentTemperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  precipitationMm: number;
  windSpeedKmh: number;
  weatherCode: number;
  timezone: string;
  forecast: WeatherDay[];
  source: "Open-Meteo" | "Meteomatics" | "Weather API ensemble";
  temperatureModelCount?: number;
  temperatureSpreadC?: number;
};

export type MonthlyClimate = {
  month: number;
  precipitationMmPerDay: number;
  temperatureC: number;
  temperatureSpreadC?: number;
};

export type ClimateSummary = {
  monthly: MonthlyClimate[];
  sourcePeriod: string;
  temperatureSources?: string[];
};

export type SatelliteObservation = {
  itemId: string;
  observedAt: string;
};

export type SoilNutrientClass = {
  value: number;
  label: string;
};

export type SoilProfileLayer = {
  depth: string;
  topCm: number;
  bottomCm: number;
  sandPercent: number | null;
  siltPercent: number | null;
  clayPercent: number | null;
  textureClass: string | null;
  fieldCapacityPercent: number | null;
  wiltingPointPercent: number | null;
  availableWaterMmPerM: number | null;
};

export type SoilProfile = {
  layers: SoilProfileLayer[];
  source: "ISRIC SoilGrids";
};

export type CropSuggestion = {
  name: string;
  family: string;
  score: number;
  reason: string;
  soilBenefit: string;
  nitrogenFixer: boolean;
};

export type CropCycleSolution = {
  id: string;
  title: string;
  focus: string;
  crops: CropSuggestion[];
  averageScore: number;
};

export type CustomCropCycle = {
  id: string;
  title: string;
  cropSlugs: string[];
};

export type CropCatalogItem = {
  slug: string;
  commonName: string;
  scientificName: string;
  category: string;
  lifecycle: "annual" | "biennial" | "perennial";
};

export type UserPreferences = {
  darkMode: boolean;
  location: FarmLocation | null;
  selectedCycleId: string;
  customCycles?: CustomCropCycle[];
};

export type UsdaSoilMapUnit = {
  mapUnitKey: string;
  name: string;
};
