# R.O.C.A. Privacy Notice

**Last updated: November 15, 2026**

R.O.C.A. provides location-based crop-cycle, climate, weather, soil, and map information. It does not require an account.

## Information used

- **Farm location:** a location selected in the app or the device's foreground location, if the user chooses “Use GPS.” For a GPS selection, the app requests a one-time location while in use and resolves it to a nearby city. R.O.C.A. does not request or collect background location.
- **Search text:** a place name entered into the location search is sent to the Photon geocoding service to find matching cities, regions, or countries.
- **Saved preferences:** the selected farm location, dark-mode setting, selected crop-cycle option, and custom crop cycles are stored on the device using Android encrypted secure storage. They remain until the user clears saved data in Options, clears the app's storage, or uninstalls R.O.C.A.

## When location is shared

After a user selects a location, its coordinates are sent over HTTPS to the services needed to provide the app's features:

- NASA POWER for long-term climate averages.
- Open-Meteo's ERA5-Land archive for 10-year historical temperature and precipitation averages, and Open-Meteo for current weather/forecasts.
- Microsoft Planetary Computer for NASA MODIS scene search.
- FAO for regional soil-quality and topsoil texture map layers.
- ISRIC SoilGrids for modeled soil texture composition and water-retention estimates by depth.
- Open-Meteo for short-range forecasts, unless a configured Meteomatics proxy is used instead.
- USDA Soil Data Access only for locations identified in the United States.
- OpenStreetMap tile servers when the user opens the weather map. Map tile requests can reveal an approximate map area to that service.
- Photon for place search and city-name lookup.
- EveryFarm's public crop catalog when the user opens the Crops menu. This request is not sent the farm location.

If a private Meteomatics or weather-provider proxy is configured, it receives the requested coordinates and is responsible for connecting to those providers. R.O.C.A. does not contain provider usernames, passwords, or API keys.

These services operate independently and may process request logs under their own privacy policies and retention practices. R.O.C.A. does not sell location data or use it for advertising.

OpenWeatherMap, WeatherAPI, and Weatherstack integrations are optional and require a private proxy to protect provider credentials. Without that proxy, R.O.C.A. uses the keyless Open-Meteo weather and historical endpoints.

SoilGrids values are predictions for a regional map pixel, not measurements from the user's field. Its water-retention values describe modeled soil-water content at specified pressure levels and do not replace a site-specific soil test.

## Permissions, security, and controls

- Location permission is optional. City, region, and country search can be used without granting device-location permission.
- The Android app requests foreground location only. It does not request contacts, camera, microphone, or background-location access.
- Location-based data requests use HTTPS.
- Saved preferences are stored in encrypted Android secure storage.
- The app includes no advertising SDK, analytics SDK, or account system.
- Choose **Options → Clear saved data** to delete R.O.C.A.'s stored location and preferences. This does not change Android's permission setting; manage that separately in Android Settings. Uninstalling the app also removes its local data.

## Children and contact

R.O.C.A. is a general farming utility and is not designed to collect information from children. This notice must be updated with the responsible developer's name and a monitored privacy-contact address before public distribution.

## Google Play publication

Before publishing, the developer must host this policy at a stable, public HTTPS URL, enter that URL in Google Play Console, provide accurate Data safety disclosures for this app and its third-party services, and verify that each provider's terms permit the intended use.
