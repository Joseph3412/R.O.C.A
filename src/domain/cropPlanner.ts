import {
  ClimateSummary,
  CropCycleSolution,
  CropSuggestion,
  MonthlyClimate,
} from "../types";

type CropProfile = {
  name: string;
  family: string;
  minRainMmPerDay: number;
  maxRainMmPerDay: number;
  minTemperatureC: number;
  maxTemperatureC: number;
  soilBenefit: string;
  nitrogenFixer: boolean;
};

const cropProfiles: CropProfile[] = [
  {
    name: "Cowpea",
    family: "Legume",
    minRainMmPerDay: 0.7,
    maxRainMmPerDay: 4.2,
    minTemperatureC: 20,
    maxTemperatureC: 35,
    soilBenefit: "Fixes nitrogen and leaves useful crop residues.",
    nitrogenFixer: true,
  },
  {
    name: "Sorghum",
    family: "Cereal",
    minRainMmPerDay: 0.8,
    maxRainMmPerDay: 3.8,
    minTemperatureC: 20,
    maxTemperatureC: 36,
    soilBenefit: "A resilient cereal option for lower-rainfall windows.",
    nitrogenFixer: false,
  },
  {
    name: "Groundnut",
    family: "Legume",
    minRainMmPerDay: 1.4,
    maxRainMmPerDay: 4.3,
    minTemperatureC: 20,
    maxTemperatureC: 32,
    soilBenefit: "Adds a nitrogen-fixing legume phase to the rotation.",
    nitrogenFixer: true,
  },
  {
    name: "Maize",
    family: "Cereal",
    minRainMmPerDay: 2.4,
    maxRainMmPerDay: 6.2,
    minTemperatureC: 18,
    maxTemperatureC: 32,
    soilBenefit: "Rotate with a legume and return residues to the soil.",
    nitrogenFixer: false,
  },
  {
    name: "Pearl millet",
    family: "Cereal",
    minRainMmPerDay: 0.4,
    maxRainMmPerDay: 2.7,
    minTemperatureC: 22,
    maxTemperatureC: 38,
    soilBenefit: "Keeps production options open in hot, dry conditions.",
    nitrogenFixer: false,
  },
  {
    name: "Sweet potato",
    family: "Root crop",
    minRainMmPerDay: 1.3,
    maxRainMmPerDay: 4.1,
    minTemperatureC: 18,
    maxTemperatureC: 33,
    soilBenefit: "Breaks up repeated cereal cropping in the rotation.",
    nitrogenFixer: false,
  },
  {
    name: "Cassava",
    family: "Root crop",
    minRainMmPerDay: 1.1,
    maxRainMmPerDay: 5.2,
    minTemperatureC: 20,
    maxTemperatureC: 35,
    soilBenefit: "Provides a flexible root-crop phase; keep soil covered.",
    nitrogenFixer: false,
  },
  {
    name: "Soybean",
    family: "Legume",
    minRainMmPerDay: 1.6,
    maxRainMmPerDay: 5.2,
    minTemperatureC: 20,
    maxTemperatureC: 32,
    soilBenefit: "Adds a legume phase; return crop residues to the soil.",
    nitrogenFixer: true,
  },
  {
    name: "Chickpea",
    family: "Legume",
    minRainMmPerDay: 0.5,
    maxRainMmPerDay: 2.4,
    minTemperatureC: 15,
    maxTemperatureC: 30,
    soilBenefit: "A pulse option for relatively dry, mild planting windows.",
    nitrogenFixer: true,
  },
  {
    name: "Lentil",
    family: "Legume",
    minRainMmPerDay: 0.6,
    maxRainMmPerDay: 2.6,
    minTemperatureC: 10,
    maxTemperatureC: 28,
    soilBenefit: "Adds a nitrogen-fixing pulse and breaks up cereal phases.",
    nitrogenFixer: true,
  },
  {
    name: "Rice",
    family: "Cereal",
    minRainMmPerDay: 3.5,
    maxRainMmPerDay: 8,
    minTemperatureC: 20,
    maxTemperatureC: 35,
    soilBenefit: "Include only where water supply and local cultivation support it.",
    nitrogenFixer: false,
  },
  {
    name: "Wheat",
    family: "Cereal",
    minRainMmPerDay: 0.8,
    maxRainMmPerDay: 3.5,
    minTemperatureC: 8,
    maxTemperatureC: 25,
    soilBenefit: "Rotate with non-cereal crops and retain protective residues.",
    nitrogenFixer: false,
  },
  {
    name: "Barley",
    family: "Cereal",
    minRainMmPerDay: 0.6,
    maxRainMmPerDay: 2.8,
    minTemperatureC: 5,
    maxTemperatureC: 24,
    soilBenefit: "A relatively cool-season cereal option for rotation diversity.",
    nitrogenFixer: false,
  },
  {
    name: "Sunflower",
    family: "Oilseed",
    minRainMmPerDay: 0.9,
    maxRainMmPerDay: 3.5,
    minTemperatureC: 18,
    maxTemperatureC: 32,
    soilBenefit: "Adds an oilseed phase with a different rooting pattern.",
    nitrogenFixer: false,
  },
  {
    name: "Sesame",
    family: "Oilseed",
    minRainMmPerDay: 0.5,
    maxRainMmPerDay: 2.5,
    minTemperatureC: 22,
    maxTemperatureC: 35,
    soilBenefit: "A heat-tolerant oilseed option for lighter-rainfall windows.",
    nitrogenFixer: false,
  },
  {
    name: "Tomato",
    family: "Vegetable",
    minRainMmPerDay: 1,
    maxRainMmPerDay: 3.5,
    minTemperatureC: 18,
    maxTemperatureC: 30,
    soilBenefit: "Diversifies crop families; manage soil cover between crops.",
    nitrogenFixer: false,
  },
  {
    name: "Onion",
    family: "Vegetable",
    minRainMmPerDay: 0.7,
    maxRainMmPerDay: 2.5,
    minTemperatureC: 12,
    maxTemperatureC: 28,
    soilBenefit: "Adds a non-cereal phase with a distinct crop-family break.",
    nitrogenFixer: false,
  },
];

export type PlantingWindow = {
  months: MonthlyClimate[];
  averageRainMmPerDay: number;
  averageTemperatureC: number;
  averageTemperatureSpreadC: number | null;
  label: string;
};

function getNextMonths(monthly: MonthlyClimate[], startMonth: number, count: number): MonthlyClimate[] {
  return Array.from({ length: count }, (_, offset) => monthly[(startMonth + offset) % 12]);
}

function getSuitabilityScore(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (value >= minimum && value <= maximum) return 100;
  const distance = value < minimum ? minimum - value : value - maximum;
  return Math.max(0, 100 - distance * 18);
}

function describeRainfall(rainMmPerDay: number): string {
  if (rainMmPerDay >= 3) return "wetter";
  if (rainMmPerDay >= 1.5) return "moderate-rainfall";
  return "drier";
}

function makeReason(crop: CropProfile, window: PlantingWindow): string {
  const rainfallDescription = describeRainfall(window.averageRainMmPerDay);
  if (crop.nitrogenFixer) {
    return `A legume suited to this ${rainfallDescription} window; useful for breaking cereal cycles.`;
  }
  return `Its rainfall and temperature range fits this ${rainfallDescription} planting window.`;
}

export function createPlantingWindow(
  climate: ClimateSummary,
  now: Date = new Date(),
): PlantingWindow {
  const months = getNextMonths(climate.monthly, now.getMonth(), 3);
  const averageRainMmPerDay =
    months.reduce((total, month) => total + month.precipitationMmPerDay, 0) / months.length;
  const averageTemperatureC =
    months.reduce((total, month) => total + month.temperatureC, 0) / months.length;
  const temperatureSpreads = months
    .map((month) => month.temperatureSpreadC)
    .filter((spread): spread is number => spread !== undefined);
  const averageTemperatureSpreadC = temperatureSpreads.length
    ? temperatureSpreads.reduce((total, spread) => total + spread, 0) / temperatureSpreads.length
    : null;

  const label =
    averageRainMmPerDay >= 3
      ? "Wetter planting window"
      : averageRainMmPerDay >= 1.5
        ? "Transition planting window"
        : "Drier planting window";

  return { months, averageRainMmPerDay, averageTemperatureC, averageTemperatureSpreadC, label };
}

export function suggestCrops(window: PlantingWindow): CropSuggestion[] {
  return rankCrops(window).slice(0, 3);
}

export function rankCrops(window: PlantingWindow): CropSuggestion[] {
  return cropProfiles
    .map((crop) => {
      const rainfallScore = getSuitabilityScore(
        window.averageRainMmPerDay,
        crop.minRainMmPerDay,
        crop.maxRainMmPerDay,
      );
      const temperatureScore = getSuitabilityScore(
        window.averageTemperatureC,
        crop.minTemperatureC,
        crop.maxTemperatureC,
      );
      const score = Math.round(rainfallScore * 0.6 + temperatureScore * 0.4);

      return {
        name: crop.name,
        family: crop.family,
        score,
        reason: makeReason(crop, window),
        soilBenefit: crop.soilBenefit,
        nitrogenFixer: crop.nitrogenFixer,
      };
    })
    .sort((first, second) => second.score - first.score);
}

export function suggestCropCycles(window: PlantingWindow): CropCycleSolution[] {
  const ranked = rankCrops(window);
  const best = ranked[0];
  const bestLegume = ranked.find((crop) => crop.nitrogenFixer);
  const secondLegume = ranked.find(
    (crop) => crop.nitrogenFixer && crop.name !== bestLegume?.name,
  );
  const bestCereal = ranked.find((crop) => crop.family === "Cereal");
  const secondCereal = ranked.find(
    (crop) => crop.family === "Cereal" && crop.name !== bestCereal?.name,
  );
  const bestRoot = ranked.find((crop) => crop.family === "Root crop");
  const dryResilient = ranked
    .filter((crop) => ["Sorghum", "Pearl millet"].includes(crop.name))
    .sort((first, second) => second.score - first.score)[0];
  const balanced = [best].filter((crop): crop is CropSuggestion => crop !== undefined);
  while (balanced.length < 3) {
    const previous = balanced[balanced.length - 1];
    const next =
      ranked.find(
        (crop) =>
          !balanced.some((selected) => selected.name === crop.name) &&
          crop.family !== previous.family,
      ) ??
      ranked.find((crop) => !balanced.some((selected) => selected.name === crop.name));
    if (!next) break;
    balanced.push(next);
  }
  const firstBalancedFamily = balanced[0]?.family;
  const previousBalancedFamily = balanced[balanced.length - 1]?.family;
  const finalBalancedCrop = ranked.find(
    (crop) =>
      !balanced.some((selected) => selected.name === crop.name) &&
      crop.family !== previousBalancedFamily &&
      crop.family !== firstBalancedFamily,
  );
  if (finalBalancedCrop) balanced.push(finalBalancedCrop);

  if (!best || !bestLegume || !secondLegume || !bestCereal || !bestRoot || !dryResilient) {
    throw new Error("The crop rotation catalog does not have enough diversity to build alternatives.");
  }

  const recipes = [
    {
      id: "balanced",
      title: "Balanced season",
      focus: "Start with the strongest climate match, then rotate crop families.",
      crops: balanced,
    },
    {
      id: "soil-first",
      title: "Soil-first rotation",
      focus: "Lead with a nitrogen-fixing legume and alternate families.",
      crops: [bestLegume, bestCereal, secondLegume, bestRoot],
    },
    {
      id: "water-smart",
      title: "Water-smart rotation",
      focus: "Begin with a heat-tolerant cereal, then diversify and rebuild.",
      crops: [
        dryResilient,
        bestLegume,
        bestRoot,
        secondLegume,
      ],
    },
  ];

  return recipes.map((recipe) => ({
    ...recipe,
    averageScore: Math.round(
      recipe.crops.reduce((sum, crop) => sum + crop.score, 0) / recipe.crops.length,
    ),
  }));
}

export function getMonthLabel(month: number): string {
  return new Date(2025, month - 1, 1).toLocaleString("en", { month: "short" });
}
