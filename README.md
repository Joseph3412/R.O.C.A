# R.O.C.A.

R.O.C.A. is an Expo / React Native Android field guide that turns farm-location, local forecast, long-term climate, and regional soil context into three alternative crop rotations.

## Run on Android

1. Install Node.js and Android Studio with an Android SDK.
2. Run `npm install`.
3. Run `npm run android` to build and launch on an Android emulator or connected device. `npm start` can also open the Expo development server.

The app has four responsive main tabs: **Dashboard**, **Weather map**, **Crops**, and **Options**. Place search offers city, region, and country levels; the GPS action resolves the current device location to a nearby city. Preferences, saved location, and custom crop cycles are stored using Android encrypted secure storage. GPS is requested only after an in-app disclosure and user action.

The Android screen and bottom navigation honor system safe-area insets so the header and tab controls remain clear of the status and navigation bars.

## Build Android APK and AAB

The EAS profiles are configured separately: `apk` creates an installable internal-testing APK, while `aab` creates a Play Store Android App Bundle. Both builds run through Expo's cloud service and upload the project source.

1. Sign in to Expo with `npx eas-cli login` and configure the project with `npx eas-cli build:configure` if prompted.
2. Run `npm run build:apk` to build the APK.
3. Run `npm run build:aab` to build the AAB.
4. Download each artifact from the EAS build link printed by the command. Install the APK on a test device; an AAB is a Play distribution artifact and is not installed directly like an APK.

To build locally without uploading source, install Android Studio and its Android SDK, run `npx expo prebuild --platform android`, then run `cd android && ./gradlew assembleRelease bundleRelease`. Artifacts are written under `android/app/build/outputs/apk/release/` and `android/app/build/outputs/bundle/release/`. The generated native project signs local release builds with the debug key; configure a private production signing key before publishing or distributing release builds.

## Data sources and method

- **NASA POWER climatology API** supplies monthly mean precipitation (`PRECTOTCORR`, mm/day) and 2 m temperature (`T2M`) for the selected coordinates.
- **Open-Meteo ERA5-Land archive** supplies daily historical mean temperature and precipitation for the previous 10 complete years. Monthly NASA POWER and ERA5-Land values are averaged to make the planting-window climate screen less dependent on one gridded product; source spread is exposed in the UI when both are available. If one service is unavailable, the other is used and identified; the app reports an error if both fail. This is a multi-product comparison, not a guarantee of local station accuracy.
- **NASA MODIS MOD13Q1 16-day vegetation-index collection**, searched through the Microsoft Planetary Computer STAC API, is used to report whether a recent satellite scene covers the selected farm area. This prototype does not extract or interpret pixel-level NDVI.
- **FAO Soil Nutrient Availability (HWSD)** is rendered as a regional WMS map layer and queried at the farm coordinate for its qualitative soil-quality class. The assessment uses maize as its reference crop; it is not a field soil test.
- **FAO HWSD topsoil layers** provide selectable clay, sand, silt, and nutrient-availability map views.
- **ISRIC SoilGrids v2.0** supplies global modeled sand, silt, and clay fractions plus water content at 33 and 1500 kPa for five depth intervals down to 1 m. R.O.C.A. classifies the fractions using the USDA texture triangle and estimates plant-available water as the 33–1500 kPa difference, in mm per meter of soil. These approximately 250 m model estimates are regional context, not field measurements.
- **Open-Meteo** provides the seven-day forecast and map weather marker. An optional private weather-provider proxy can contribute OpenWeatherMap, WeatherAPI, and Weatherstack temperatures; R.O.C.A. takes the median with Open-Meteo and displays the model spread. These services are not called directly with embedded API keys. The map uses OpenStreetMap tiles and displays attribution; drag to pan and use the zoom controls to change map detail.
- **EveryFarm's public Crops API** supplies the searchable 81-entry crop catalog in the Crops tab. This is a catalog only, not a local suitability recommendation. Climate-ranked R.O.C.A. options remain separately identified. Custom crop cycles are ordered by the user and saved locally.
- **Photon** resolves city, region, and country search, and reverse-resolves foreground GPS coordinates to a city.
- **USDA Soil Data Access** returns a U.S. SSURGO soil map-unit name for coordinates in the United States. It does not return a laboratory soil test.
- **Meteomatics** has an optional proxy adapter. Meteomatics credentials must be held by a private server, never in the app. See the proxy setup below.

Crop suitability is a transparent, general screening based on the next three months' average rainfall and temperature compared with broad crop ranges. The three rotation alternatives and their scores are not yield forecasts or agronomic prescriptions. Use a field soil test and local extension advice before making planting or fertilizer decisions. The default Nairobi coordinates are sample data.

## Optional weather-provider ensemble proxy

OpenWeatherMap, WeatherAPI, and Weatherstack require provider credentials. To use them, set `EXPO_PUBLIC_WEATHER_ENSEMBLE_PROXY_URL` to a private HTTPS endpoint that accepts `latitude` and `longitude` query parameters and returns normalized current temperatures. Keep all provider keys on the server; do not put API keys in the Expo bundle. Without this proxy, the current-weather and forecast source remains Open-Meteo.

```json
{
  "providers": [
    { "provider": "OpenWeatherMap", "temperatureC": 24.2, "apparentTemperatureC": 25.1 },
    { "provider": "WeatherAPI", "temperatureC": 23.8, "apparentTemperatureC": 24.4 },
    { "provider": "Weatherstack", "temperatureC": 24.0 }
  ]
}
```

The `provider` value must be one of `OpenWeatherMap`, `WeatherAPI`, or `Weatherstack`. R.O.C.A. combines valid readings with Open-Meteo using the median, reports the spread between the lowest and highest reading, and continues to use Open-Meteo for daily forecast details. A configured proxy error is shown instead of silently ignoring the requested ensemble. Proxy URLs are public build configuration, not secrets.

The app sends place names and/or coordinates to the relevant public data providers over HTTPS. Details are in the in-app Options screen and [PRIVACY.md](./PRIVACY.md). Open-Meteo's free service is intended for non-commercial use; confirm its current terms or arrange appropriate service before commercial distribution.

### Optional Meteomatics proxy

Set `EXPO_PUBLIC_METEOMATICS_PROXY_URL` to a private HTTPS endpoint that accepts `latitude` and `longitude` query parameters and returns the normalized JSON shape below. The endpoint must call Meteomatics with credentials held server-side; do not put Meteomatics credentials in `.env`, Expo config, or the mobile bundle. The URL is included in the app build and is not a secret.

```json
{
  "current": {
    "temperatureC": 20,
    "apparentTemperatureC": 20,
    "humidityPercent": 55,
    "precipitationMm": 0,
    "windSpeedKmh": 8,
    "weatherCode": 2
  },
  "timezone": "Africa/Nairobi",
  "forecast": [
    {
      "date": "2026-11-16",
      "minimumC": 16,
      "maximumC": 25,
      "precipitationMm": 2,
      "weatherCode": 2
    }
  ]
}
```

`weatherCode` must be a WMO code so the app can label the forecast consistently.

## Data references and attribution

- [NASA POWER API](https://power.larc.nasa.gov/docs/services/api/), [NASA MODIS MOD13Q1 via Planetary Computer](https://planetarycomputer.microsoft.com/api/stac/v1/collections/modis-13Q1-061), and the [Planetary Computer data API quickstart](https://planetarycomputer-staging.microsoft.com/docs/quickstarts/using-the-data-api/).
- [FAO Soil Nutrient Availability (HWSD) dataset](https://data.apps.fao.org/catalog/dataset/e00c65cd-7577-4ebe-a888-5eaf7930acf5). Cite as: FAO/IIASA/ISRIC/ISSCAS/JRC, 2012. *Harmonized World Soil Database (version 1.2).* FAO, Rome, Italy and IIASA, Laxenburg, Austria.
- [ISRIC SoilGrids REST API](https://rest.isric.org/soilgrids/v2.0/docs), [SoilGrids documentation](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs.html), and [ISRIC data policy](https://isric.org/about/data-policy).
- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), [EveryFarm Crops API](https://crops.every.farm/docs/crop-picker-platform/crops-api/), [OpenWeatherMap](https://openweathermap.org/api), [WeatherAPI](https://www.weatherapi.com/docs/), [Weatherstack](https://weatherstack.com/documentation), [APIFarmer](https://apifarmer.com/), [Google Agricultural Understanding API](https://developers.google.com/agricultural-understanding/api), and [CropSense Africa](https://api.cropsense.africa).

The FAO dataset terms authorize educational and other non-commercial use with full source acknowledgment; obtain permission from the rights holders before using this data in a commercial service.

## Privacy and store readiness

Read [PRIVACY.md](./PRIVACY.md). Before a public Google Play release, replace the developer-contact placeholder, host the privacy policy at a stable public URL, complete the Play Console Data safety form accurately for the app and each provider, and review the current Play policies and data-provider terms. The current native release signing setup is for testing only; configure a private production signing key for publication.

The dependency audit currently reports 1 low and 11 moderate findings in the Expo SDK 54 build/configuration toolchain, with no high or critical findings after pinning patched `image-size` and PostCSS releases. The remaining findings are transitive Expo/Metro tooling dependencies; do not apply `npm audit fix --force`, which proposes an incompatible Expo downgrade. Re-evaluate the audit as part of the next compatible Expo SDK upgrade before public release.
