import {
  ClimateSummary,
  Coordinates,
  CropCatalogItem,
  FarmLocation,
  LocalWeather,
  LocationScope,
  LocationSearchResult,
  MonthlyClimate,
  SatelliteObservation,
  SoilNutrientClass,
  SoilProfile,
  SoilProfileLayer,
  UsdaSoilMapUnit,
  WeatherDay,
} from "../types";
import { classifySoilTexture } from "../domain/soil";

const NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point";
const PLANETARY_COMPUTER_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const SOIL_WMS_URL = "https://data.apps.fao.org/map/gsrv/gsrv1/gsoc/wms";
const PHOTON_URL = "https://photon.komoot.io";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const EVERY_FARM_CROPS_URL = "https://crops.every.farm/api/v1/crops";
const USDA_SOIL_DATA_ACCESS_URL = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";
const SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const soilNutrientLabels: Record<number, string> = {
  1: "No or slight limitations",
  2: "Moderate limitations",
  3: "Severe limitations",
  4: "Very severe limitations",
  5: "Mainly non-soil",
  6: "Permafrost area",
  7: "Water bodies",
};
const soilProfileDepths = [
  { label: "0-5cm", topCm: 0, bottomCm: 5 },
  { label: "5-15cm", topCm: 5, bottomCm: 15 },
  { label: "15-30cm", topCm: 15, bottomCm: 30 },
  { label: "30-60cm", topCm: 30, bottomCm: 60 },
  { label: "60-100cm", topCm: 60, bottomCm: 100 },
] as const;

type NasaPowerResponse = {
  properties?: {
    parameter?: {
      PRECTOTCORR?: Record<string, number>;
      T2M?: Record<string, number>;
    };
  };
  header?: {
    range?: string;
  };
};

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    city?: string;
    locality?: string;
    district?: string;
    state?: string;
    county?: string;
    country?: string;
    countrycode?: string;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    precipitation_sum?: number[];
    weather_code?: number[];
  };
  timezone?: string;
};

type OpenMeteoArchiveResponse = {
  daily?: {
    time?: string[];
    temperature_2m_mean?: number[];
    precipitation_sum?: number[];
  };
};

type WeatherEnsembleProxyResponse = {
  providers?: Array<{
    provider?: string;
    temperatureC?: number;
    apparentTemperatureC?: number;
  }>;
};

type EveryFarmCropsResponse = {
  data?: Array<{
    slug?: string;
    common_name?: string;
    scientific_name?: string;
    category?: string;
    lifecycle?: string;
  }>;
};

type SoilGridsDepth = {
  label?: string;
  values?: { mean?: number | null };
};

type SoilGridsLayer = {
  name?: string;
  depths?: SoilGridsDepth[];
};

type SoilGridsResponse = {
  properties?: { layers?: SoilGridsLayer[] };
};

type MeteomaticsProxyResponse = {
  current: {
    temperatureC: number;
    apparentTemperatureC: number;
    humidityPercent: number;
    precipitationMm: number;
    windSpeedKmh: number;
    weatherCode: number;
  };
  timezone: string;
  forecast: WeatherDay[];
};

type UsdaResponse = {
  Table?: string[][];
  Error?: string;
};

type StacSearchResponse = {
  features?: Array<{
    id?: string;
    properties?: {
      datetime?: string | null;
      start_datetime?: string;
      end_datetime?: string;
    };
  }>;
};

const monthKeys = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function validateCoordinates(coordinates: Coordinates): void {
  if (
    !Number.isFinite(coordinates.latitude) ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    throw new Error("Location coordinates are outside the valid range.");
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function makeSearchResult(feature: PhotonFeature, scope: LocationScope): LocationSearchResult | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties;
  if (!coordinates || coordinates.length < 2 || !properties?.name) {
    return null;
  }

  const [longitude, latitude] = coordinates;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const locationName = properties.name.trim();
  const admin = properties.state ?? properties.county ?? properties.district;
  const country = properties.country;
  const description =
    scope === "country"
      ? "Country-level representative location"
      : [admin, country].filter(Boolean).join(" · ");

  return {
    id: `${scope}:${properties.osm_key ?? "place"}:${properties.osm_id ?? `${latitude},${longitude}`}`,
    name: locationName,
    description: description || scope,
    scope,
    coordinates: { latitude, longitude },
    city: properties.city ?? properties.locality,
    country,
  };
}

function matchesScope(feature: PhotonFeature, scope: LocationScope): boolean {
  const properties = feature.properties;
  if (!properties) return false;
  const key = properties.osm_key;
  const value = properties.osm_value;
  const type = properties.type;

  if (scope === "country") {
    return (key === "place" && value === "country") || type === "country";
  }
  if (scope === "region") {
    return (
      type === "state" ||
      type === "district" ||
      (key === "place" && ["state", "region", "province"].includes(value ?? "")) ||
      (key === "boundary" && value === "administrative")
    );
  }
  return (
    key === "place" &&
    ["city", "town", "village", "hamlet", "municipality", "locality"].includes(value ?? "")
  );
}

export async function searchLocations(
  query: string,
  scope: LocationScope,
): Promise<LocationSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const url = new URL(`${PHOTON_URL}/api/`);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", "20");
  url.searchParams.set("lang", "en");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "R.O.C.A.-Android/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Place search is unavailable (${response.status}).`);
  }
  const payload = (await response.json()) as PhotonResponse;
  const unique = new Map<string, LocationSearchResult>();
  for (const feature of payload.features ?? []) {
    if (!matchesScope(feature, scope)) continue;
    const result = makeSearchResult(feature, scope);
    if (result && !unique.has(result.id)) unique.set(result.id, result);
  }
  return Array.from(unique.values()).slice(0, 8);
}

export async function reverseGeocodeLocation(coordinates: Coordinates): Promise<FarmLocation> {
  validateCoordinates(coordinates);
  const url = new URL(`${PHOTON_URL}/reverse`);
  url.searchParams.set("lat", String(coordinates.latitude));
  url.searchParams.set("lon", String(coordinates.longitude));
  url.searchParams.set("lang", "en");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "R.O.C.A.-Android/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Nearby city lookup is unavailable (${response.status}).`);
  }
  const payload = (await response.json()) as PhotonResponse;
  const feature = payload.features?.[0];
  const properties = feature?.properties;
  const city = properties?.city ?? properties?.locality ?? properties?.district;
  const country = properties?.country;
  if (!city && !country) {
    throw new Error("No nearby city or country could be identified for this location.");
  }
  const name = city ?? properties?.state ?? country ?? "Current location";

  return {
    id: `current:${coordinates.latitude.toFixed(5)}:${coordinates.longitude.toFixed(5)}`,
    name,
    description: [properties?.state, country].filter(Boolean).join(" · "),
    scope: "current",
    coordinates,
    city,
    country,
  };
}

function validateWeatherResponse(
  response: OpenMeteoResponse,
  source: LocalWeather["source"],
): LocalWeather {
  const current = response.current;
  const daily = response.daily;
  if (
    !current ||
    !daily ||
    !isFiniteNumber(current.temperature_2m) ||
    !isFiniteNumber(current.apparent_temperature) ||
    !isFiniteNumber(current.relative_humidity_2m) ||
    !isFiniteNumber(current.precipitation) ||
    !isFiniteNumber(current.wind_speed_10m) ||
    !isFiniteNumber(current.weather_code) ||
    current.relative_humidity_2m < 0 ||
    current.relative_humidity_2m > 100 ||
    current.precipitation < 0 ||
    current.wind_speed_10m < 0 ||
    !daily.time ||
    !daily.temperature_2m_min ||
    !daily.temperature_2m_max ||
    !daily.precipitation_sum ||
    !daily.weather_code
  ) {
    throw new Error("Weather service returned incomplete forecast data.");
  }

  const forecast = daily.time.map((date, index) => {
    const minimumC = daily.temperature_2m_min?.[index];
    const maximumC = daily.temperature_2m_max?.[index];
    const precipitationMm = daily.precipitation_sum?.[index];
    const weatherCode = daily.weather_code?.[index];
    if (
      !isFiniteNumber(minimumC) ||
      !isFiniteNumber(maximumC) ||
      !isFiniteNumber(precipitationMm) ||
      !isFiniteNumber(weatherCode) ||
      minimumC > maximumC ||
      precipitationMm < 0
    ) {
      throw new Error("Weather service returned an invalid daily forecast.");
    }
    return { date, minimumC, maximumC, precipitationMm, weatherCode };
  });

  return {
    currentTemperatureC: current.temperature_2m,
    apparentTemperatureC: current.apparent_temperature,
    humidityPercent: current.relative_humidity_2m,
    precipitationMm: current.precipitation,
    windSpeedKmh: current.wind_speed_10m,
    weatherCode: current.weather_code,
    timezone: response.timezone ?? "UTC",
    forecast,
    source,
  };
}

function validateMeteomaticsProxyResponse(response: MeteomaticsProxyResponse): LocalWeather {
  const current = response.current;
  if (
    !current ||
    !isFiniteNumber(current.temperatureC) ||
    !isFiniteNumber(current.apparentTemperatureC) ||
    !isFiniteNumber(current.humidityPercent) ||
    !isFiniteNumber(current.precipitationMm) ||
    !isFiniteNumber(current.windSpeedKmh) ||
    !isFiniteNumber(current.weatherCode) ||
    !Array.isArray(response.forecast)
  ) {
    throw new Error("Weather proxy returned incomplete Meteomatics forecast data.");
  }

  for (const day of response.forecast) {
    if (
      !day.date ||
      !Number.isFinite(Date.parse(day.date)) ||
      !isFiniteNumber(day.minimumC) ||
      !isFiniteNumber(day.maximumC) ||
      !isFiniteNumber(day.precipitationMm) ||
      !isFiniteNumber(day.weatherCode) ||
      day.minimumC > day.maximumC ||
      day.precipitationMm < 0
    ) {
      throw new Error("Weather proxy returned an invalid Meteomatics daily forecast.");
    }
  }

  return {
    currentTemperatureC: current.temperatureC,
    apparentTemperatureC: current.apparentTemperatureC,
    humidityPercent: current.humidityPercent,
    precipitationMm: current.precipitationMm,
    windSpeedKmh: current.windSpeedKmh,
    weatherCode: current.weatherCode,
    timezone: response.timezone || "UTC",
    forecast: response.forecast,
    source: "Meteomatics",
  };
}

export async function fetchLocalWeather(coordinates: Coordinates): Promise<LocalWeather> {
  validateCoordinates(coordinates);
  const configuredProxy = process.env.EXPO_PUBLIC_METEOMATICS_PROXY_URL?.trim();
  if (configuredProxy) {
    const url = new URL(configuredProxy);
    if (url.protocol !== "https:") {
      throw new Error("The Meteomatics proxy must use HTTPS.");
    }
    url.searchParams.set("latitude", String(coordinates.latitude));
    url.searchParams.set("longitude", String(coordinates.longitude));
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Meteomatics weather service is unavailable (${response.status}).`);
    }
    return validateMeteomaticsProxyResponse(
      (await response.json()) as MeteomaticsProxyResponse,
    );
  }

  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("longitude", String(coordinates.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
  );
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo weather service is unavailable (${response.status}).`);
  }
  const openMeteoWeather = validateWeatherResponse(
    (await response.json()) as OpenMeteoResponse,
    "Open-Meteo",
  );
  const ensembleProxy = process.env.EXPO_PUBLIC_WEATHER_ENSEMBLE_PROXY_URL?.trim();
  if (!ensembleProxy) {
    return { ...openMeteoWeather, temperatureModelCount: 1, temperatureSpreadC: 0 };
  }

  const proxyUrl = new URL(ensembleProxy);
  if (proxyUrl.protocol !== "https:") {
    throw new Error("The weather-provider proxy must use HTTPS.");
  }
  proxyUrl.searchParams.set("latitude", String(coordinates.latitude));
  proxyUrl.searchParams.set("longitude", String(coordinates.longitude));
  const proxyResponse = await fetch(proxyUrl.toString());
  if (!proxyResponse.ok) {
    throw new Error(`Weather-provider proxy is unavailable (${proxyResponse.status}).`);
  }
  const proxyPayload = (await proxyResponse.json()) as WeatherEnsembleProxyResponse;
  const allowedProviders = new Set(["OpenWeatherMap", "WeatherAPI", "Weatherstack"]);
  const providerTemperatures = (proxyPayload.providers ?? []).reduce<
    Array<{ provider: string; temperatureC: number; apparentTemperatureC?: number }>
  >((validProviders, provider) => {
    if (
      typeof provider.provider !== "string" ||
      !allowedProviders.has(provider.provider) ||
      !isFiniteNumber(provider.temperatureC) ||
      validProviders.some((item) => item.provider === provider.provider)
    ) {
      return validProviders;
    }
    validProviders.push({
      provider: provider.provider,
      temperatureC: provider.temperatureC,
      ...(isFiniteNumber(provider.apparentTemperatureC)
        ? { apparentTemperatureC: provider.apparentTemperatureC }
        : {}),
    });
    return validProviders;
  }, []);
  if (!providerTemperatures.length) {
    throw new Error("Weather-provider proxy returned no valid provider temperatures.");
  }
  const temperatures = [
    openMeteoWeather.currentTemperatureC,
    ...providerTemperatures.map((provider) => provider.temperatureC),
  ].sort((first, second) => first - second);
  const middle = Math.floor(temperatures.length / 2);
  const medianTemperature =
    temperatures.length % 2 === 0
      ? (temperatures[middle - 1] + temperatures[middle]) / 2
      : temperatures[middle];
  const providerApparentTemperatures = providerTemperatures
    .map((provider) => provider.apparentTemperatureC)
    .filter(isFiniteNumber);
  const apparentTemperatures = [
    openMeteoWeather.apparentTemperatureC,
    ...providerApparentTemperatures,
  ].sort((first, second) => first - second);
  const apparentMiddle = Math.floor(apparentTemperatures.length / 2);
  const medianApparentTemperature =
    apparentTemperatures.length % 2 === 0
      ? (apparentTemperatures[apparentMiddle - 1] + apparentTemperatures[apparentMiddle]) / 2
      : apparentTemperatures[apparentMiddle];

  return {
    ...openMeteoWeather,
    currentTemperatureC: Math.round(medianTemperature * 10) / 10,
    apparentTemperatureC: Math.round(medianApparentTemperature * 10) / 10,
    source: "Weather API ensemble",
    temperatureModelCount: temperatures.length,
    temperatureSpreadC:
      Math.round((temperatures[temperatures.length - 1] - temperatures[0]) * 10) / 10,
  };
}

export async function fetchUsdaSoilMapUnit(
  coordinates: Coordinates,
): Promise<UsdaSoilMapUnit | null> {
  validateCoordinates(coordinates);
  const longitude = coordinates.longitude.toFixed(6);
  const latitude = coordinates.latitude.toFixed(6);
  const query = `SELECT TOP 1 mukey, muname FROM mapunit WHERE mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT (${longitude} ${latitude})'))`;
  const form = new URLSearchParams({ query, format: "JSON" });

  const response = await fetch(USDA_SOIL_DATA_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) {
    throw new Error(`USDA Soil Data Access is unavailable (${response.status}).`);
  }

  const payload = (await response.json()) as UsdaResponse;
  if (payload.Error) {
    throw new Error("USDA Soil Data Access returned an error for this location.");
  }
  const [mapUnitKey, name] = payload.Table?.[0] ?? [];
  if (!mapUnitKey || !name) {
    return null;
  }
  return { mapUnitKey, name };
}

export async function fetchSoilProfile(coordinates: Coordinates): Promise<SoilProfile | null> {
  validateCoordinates(coordinates);
  const url = new URL(SOILGRIDS_URL);
  url.searchParams.set("lon", String(coordinates.longitude));
  url.searchParams.set("lat", String(coordinates.latitude));
  ["clay", "sand", "silt", "wv0033", "wv1500"].forEach((property) => {
    url.searchParams.append("property", property);
  });
  soilProfileDepths.forEach((depth) => url.searchParams.append("depth", depth.label));
  url.searchParams.set("value", "mean");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`ISRIC SoilGrids is unavailable (${response.status}).`);
  }

  const payload = (await response.json()) as SoilGridsResponse;
  const layers = payload.properties?.layers;
  if (!Array.isArray(layers)) {
    throw new Error("ISRIC SoilGrids returned an unexpected soil profile.");
  }
  const readValue = (property: string, depth: string): number | null => {
    const raw = layers
      .find((layer) => layer.name === property)
      ?.depths?.find((item) => item.label === depth)?.values?.mean;
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
  };

  const profileLayers: SoilProfileLayer[] = soilProfileDepths.map((depth) => {
    const sandRaw = readValue("sand", depth.label);
    const siltRaw = readValue("silt", depth.label);
    const clayRaw = readValue("clay", depth.label);
    const compositionTotal =
      sandRaw !== null && siltRaw !== null && clayRaw !== null
        ? sandRaw + siltRaw + clayRaw
        : 0;
    const hasComposition = compositionTotal > 0;
    const toPercent = (value: number | null) =>
      value === null || !hasComposition ? null : Math.round((value / compositionTotal) * 1000) / 10;
    const sandPercent = toPercent(sandRaw);
    const siltPercent = toPercent(siltRaw);
    const clayPercent = toPercent(clayRaw);
    const fieldCapacityRaw = readValue("wv0033", depth.label);
    const wiltingPointRaw = readValue("wv1500", depth.label);

    return {
      depth: depth.label.replace("cm", " cm"),
      topCm: depth.topCm,
      bottomCm: depth.bottomCm,
      sandPercent,
      siltPercent,
      clayPercent,
      textureClass:
        sandPercent !== null && siltPercent !== null && clayPercent !== null
          ? classifySoilTexture(sandPercent, siltPercent, clayPercent)
          : null,
      fieldCapacityPercent:
        fieldCapacityRaw === null ? null : Math.round(fieldCapacityRaw) / 10,
      wiltingPointPercent:
        wiltingPointRaw === null ? null : Math.round(wiltingPointRaw) / 10,
      availableWaterMmPerM:
        fieldCapacityRaw === null || wiltingPointRaw === null
          ? null
          : Math.max(0, Math.round(fieldCapacityRaw - wiltingPointRaw)),
    };
  });

  if (
    !profileLayers.some(
      (layer) =>
        layer.textureClass !== null ||
        layer.fieldCapacityPercent !== null ||
        layer.availableWaterMmPerM !== null,
    )
  ) {
    return null;
  }
  return { layers: profileLayers, source: "ISRIC SoilGrids" };
}

function isValidValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== -999;
}

export async function fetchClimate(coordinates: Coordinates): Promise<ClimateSummary> {
  validateCoordinates(coordinates);
  const [nasaResult, historicalResult] = await Promise.allSettled([
    fetchNasaClimate(coordinates),
    fetchOpenMeteoHistoricalClimate(coordinates),
  ]);
  const nasaClimate = nasaResult.status === "fulfilled" ? nasaResult.value : null;
  const historicalClimate =
    historicalResult.status === "fulfilled" ? historicalResult.value : null;

  if (nasaClimate && historicalClimate) {
    const monthly: MonthlyClimate[] = nasaClimate.monthly.map((month, index) => {
      const historicalMonth = historicalClimate.monthly[index];
      return {
        month: month.month,
        precipitationMmPerDay:
          (month.precipitationMmPerDay + historicalMonth.precipitationMmPerDay) / 2,
        temperatureC: (month.temperatureC + historicalMonth.temperatureC) / 2,
        temperatureSpreadC: Math.abs(month.temperatureC - historicalMonth.temperatureC),
      };
    });
    return {
      monthly,
      sourcePeriod: `${nasaClimate.sourcePeriod} + ERA5-Land ${historicalClimate.sourcePeriod}`,
      temperatureSources: ["NASA POWER", "Open-Meteo ERA5-Land"],
    };
  }
  if (nasaClimate) {
    return {
      ...nasaClimate,
      sourcePeriod: `${nasaClimate.sourcePeriod}; Open-Meteo historical data unavailable${
        historicalResult.status === "rejected" && historicalResult.reason instanceof Error
          ? ` (${historicalResult.reason.message})`
          : ""
      }`,
      temperatureSources: ["NASA POWER"],
    };
  }
  if (historicalClimate) {
    const nasaFailure =
      nasaResult.status === "rejected" && nasaResult.reason instanceof Error
        ? ` (${nasaResult.reason.message})`
        : "";
    return {
      ...historicalClimate,
      sourcePeriod: `NASA POWER unavailable${nasaFailure}; ERA5-Land ${historicalClimate.sourcePeriod}`,
      temperatureSources: ["Open-Meteo ERA5-Land"],
    };
  }
  const nasaError =
    nasaResult.status === "rejected" && nasaResult.reason instanceof Error
      ? nasaResult.reason.message
      : "NASA POWER failed";
  const archiveError =
    historicalResult.status === "rejected" && historicalResult.reason instanceof Error
      ? historicalResult.reason.message
      : "Open-Meteo archive failed";
  throw new Error(`No climate source is available. ${nasaError} ${archiveError}`);
}

async function fetchNasaClimate(coordinates: Coordinates): Promise<ClimateSummary> {
  const url = new URL(NASA_POWER_URL);
  url.searchParams.set("parameters", "PRECTOTCORR,T2M");
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", String(coordinates.longitude));
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("format", "JSON");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`NASA POWER could not load climate data (${response.status}).`);
  }

  const payload = (await response.json()) as NasaPowerResponse;
  const precipitation = payload.properties?.parameter?.PRECTOTCORR;
  const temperature = payload.properties?.parameter?.T2M;
  if (!precipitation || !temperature) {
    throw new Error("NASA POWER returned climate data in an unexpected format.");
  }

  const monthly: MonthlyClimate[] = monthKeys.map((key, index) => {
    const precipitationMmPerDay = precipitation[key];
    const temperatureC = temperature[key];
    if (!isValidValue(precipitationMmPerDay) || !isValidValue(temperatureC)) {
      throw new Error(`NASA POWER has no usable climate values for ${key}.`);
    }

    return {
      month: index + 1,
      precipitationMmPerDay,
      temperatureC,
    };
  });

  return {
    monthly,
    sourcePeriod: payload.header?.range ?? "NASA POWER long-term climatology",
    temperatureSources: ["NASA POWER"],
  };
}

async function fetchOpenMeteoHistoricalClimate(
  coordinates: Coordinates,
): Promise<ClimateSummary> {
  const previousYear = new Date().getFullYear() - 1;
  const startYear = previousYear - 9;
  const url = new URL(OPEN_METEO_ARCHIVE_URL);
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("longitude", String(coordinates.longitude));
  url.searchParams.set("start_date", `${startYear}-01-01`);
  url.searchParams.set("end_date", `${previousYear}-12-31`);
  url.searchParams.set("daily", "temperature_2m_mean,precipitation_sum");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("models", "era5_land");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo historical archive is unavailable (${response.status}).`);
  }
  const payload = (await response.json()) as OpenMeteoArchiveResponse;
  const days = payload.daily?.time;
  const temperatures = payload.daily?.temperature_2m_mean;
  const precipitation = payload.daily?.precipitation_sum;
  if (
    !days?.length ||
    !temperatures ||
    !precipitation ||
    days.length !== temperatures.length ||
    days.length !== precipitation.length
  ) {
    throw new Error("Open-Meteo returned incomplete historical climate data.");
  }

  const monthlySums = Array.from({ length: 12 }, () => ({
    temperature: 0,
    precipitation: 0,
    days: 0,
  }));
  days.forEach((date, index) => {
    const monthIndex = Number(date.slice(5, 7)) - 1;
    const temperature = temperatures[index];
    const precipitationMm = precipitation[index];
    if (
      monthIndex < 0 ||
      monthIndex > 11 ||
      !isFiniteNumber(temperature) ||
      !isFiniteNumber(precipitationMm)
    ) {
      return;
    }
    monthlySums[monthIndex].temperature += temperature;
    monthlySums[monthIndex].precipitation += precipitationMm;
    monthlySums[monthIndex].days += 1;
  });

  const monthly = monthlySums.map((totals, index) => {
    if (!totals.days) {
      throw new Error(`Open-Meteo has no historical records for month ${index + 1}.`);
    }
    return {
      month: index + 1,
      temperatureC: totals.temperature / totals.days,
      precipitationMmPerDay: totals.precipitation / totals.days,
    };
  });
  return {
    monthly,
    sourcePeriod: `${startYear}-${previousYear}`,
    temperatureSources: ["Open-Meteo ERA5-Land"],
  };
}

export async function fetchCropCatalog(): Promise<CropCatalogItem[]> {
  const url = new URL(EVERY_FARM_CROPS_URL);
  url.searchParams.set("limit", "100");
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`EveryFarm crop catalog is unavailable (${response.status}).`);
  }
  const payload = (await response.json()) as EveryFarmCropsResponse;
  if (!Array.isArray(payload.data)) {
    throw new Error("EveryFarm returned an unexpected crop catalog.");
  }
  return payload.data.flatMap((crop) => {
    const lifecycle = crop.lifecycle;
    if (
      typeof crop.slug !== "string" ||
      typeof crop.common_name !== "string" ||
      typeof crop.category !== "string" ||
      (lifecycle !== "annual" && lifecycle !== "biennial" && lifecycle !== "perennial")
    ) {
      return [];
    }
    return [{
      slug: crop.slug,
      commonName: crop.common_name,
      scientificName: typeof crop.scientific_name === "string" ? crop.scientific_name : "",
      category: crop.category,
      lifecycle,
    }];
  });
}

export async function fetchSatelliteObservation(
  coordinates: Coordinates,
): Promise<SatelliteObservation | null> {
  validateCoordinates(coordinates);
  const latitudeOffset = 0.1;
  const longitudeOffset = 0.1;
  const response = await fetch(PLANETARY_COMPUTER_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: ["modis-13Q1-061"],
      bbox: [
        Math.max(-180, coordinates.longitude - longitudeOffset),
        Math.max(-90, coordinates.latitude - latitudeOffset),
        Math.min(180, coordinates.longitude + longitudeOffset),
        Math.min(90, coordinates.latitude + latitudeOffset),
      ],
      limit: 1,
      sortby: [{ field: "properties.end_datetime", direction: "desc" }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Planetary Computer could not search satellite scenes (${response.status}).`);
  }

  const payload = (await response.json()) as StacSearchResponse;
  const scene = payload.features?.[0];
  const observedAt =
    scene?.properties?.end_datetime ??
    scene?.properties?.datetime ??
    scene?.properties?.start_datetime;
  if (!scene?.id || !observedAt) {
    return null;
  }

  return {
    itemId: scene.id,
    observedAt,
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

function getSoilQueryBounds(coordinates: Coordinates): { x: number; y: number; span: number } {
  const { x, y } = toWebMercator(coordinates);
  return { x, y, span: 80000 };
}

export async function fetchSoilNutrientClass(
  coordinates: Coordinates,
): Promise<SoilNutrientClass | null> {
  validateCoordinates(coordinates);
  const { x, y, span } = getSoilQueryBounds(coordinates);
  const url = new URL(SOIL_WMS_URL);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.1.1");
  url.searchParams.set("request", "GetFeatureInfo");
  url.searchParams.set("layers", "gsoc:sq1");
  url.searchParams.set("query_layers", "gsoc:sq1");
  url.searchParams.set("styles", "");
  url.searchParams.set("srs", "EPSG:3857");
  url.searchParams.set("bbox", `${x - span},${y - span},${x + span},${y + span}`);
  url.searchParams.set("width", "600");
  url.searchParams.set("height", "360");
  url.searchParams.set("format", "image/png");
  url.searchParams.set("info_format", "text/plain");
  url.searchParams.set("x", "300");
  url.searchParams.set("y", "180");
  url.searchParams.set("feature_count", "1");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`FAO could not load soil data (${response.status}).`);
  }

  const result = await response.text();
  if (/exception/i.test(result)) {
    throw new Error("FAO returned an error while querying the soil layer.");
  }

  const valueMatch = result.match(/Soil_Nutrient_Availability\s*=\s*(\d+(?:\.\d+)?)/);
  if (!valueMatch) {
    if (!result.trim() || /no (?:features?|data|results)/i.test(result)) {
      return null;
    }
    throw new Error("FAO returned soil data in an unexpected format.");
  }

  const value = Number(valueMatch[1]);
  const label = soilNutrientLabels[value];
  if (!Number.isInteger(value) || !label) {
    throw new Error("FAO returned an unrecognized soil nutrient class.");
  }

  return { value, label };
}

export type SoilMapLayer = "sq1" | "T_CLAY" | "T_SAND" | "T_SILT";

export function getSoilMapLegendUrl(layer: SoilMapLayer): string {
  const url = new URL(SOIL_WMS_URL);
  url.searchParams.set("request", "GetLegendGraphic");
  url.searchParams.set("version", "1.1.1");
  url.searchParams.set("format", "image/png");
  url.searchParams.set("width", "20");
  url.searchParams.set("height", "20");
  url.searchParams.set("layer", layer);
  return url.toString();
}

export function getSoilMapUrl(
  coordinates: Coordinates,
  layer: SoilMapLayer = "sq1",
  zoom = 10,
  mapRadiusMetersAtZoom10 = 80_000,
): string {
  const { x, y } = toWebMercator(coordinates);
  const mapSpan = mapRadiusMetersAtZoom10 * 2 ** (10 - Math.max(3, Math.min(16, zoom)));
  const url = new URL(SOIL_WMS_URL);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.1.1");
  url.searchParams.set("request", "GetMap");
  url.searchParams.set("layers", `gsoc:${layer}`);
  url.searchParams.set("styles", "");
  url.searchParams.set("srs", "EPSG:3857");
  url.searchParams.set("bbox", `${x - mapSpan},${y - mapSpan},${x + mapSpan},${y + mapSpan}`);
  url.searchParams.set("width", "600");
  url.searchParams.set("height", "360");
  url.searchParams.set("format", "image/png");
  url.searchParams.set("transparent", "true");
  return url.toString();
}
