import type { TrendTopic } from "../types/pipeline.ts";

export const FALLBACK_TOPICS: TrendTopic[] = [
  {
    title: "Best USB-C Chargers for Travel in 2026",
    source: "PassivePress Evergreen",
    url: "https://passivepress.qzz.io",
    score: 20,
    suggestedCategory: "tech",
    sourceTier: "community",
    niche: "tech",
    contentType: "buyer-guide",
    productHints: ["Anker USB-C charger", "UGREEN Nexode charger", "Baseus USB-C charger"],
    searchVolume: 2400,
    sourceUrls: [],
  },
  {
    title: "Best Robot Vacuums Under $300 in 2026",
    source: "PassivePress Evergreen",
    url: "https://passivepress.qzz.io",
    score: 20,
    suggestedCategory: "home-appliances",
    sourceTier: "community",
    niche: "home-appliances",
    contentType: "buyer-guide",
    productHints: ["Eufy robot vacuum", "Shark robot vacuum", "Roborock robot vacuum"],
    searchVolume: 4600,
    sourceUrls: [],
  },
  {
    title: "Best Fitness Trackers for Battery Life in 2026",
    source: "PassivePress Evergreen",
    url: "https://passivepress.qzz.io",
    score: 20,
    suggestedCategory: "fitness",
    sourceTier: "community",
    niche: "fitness",
    contentType: "top-n-list",
    productHints: ["Garmin Vivosmart", "Fitbit Charge", "Amazfit Band"],
    searchVolume: 2800,
    sourceUrls: [],
  },
  {
    title: "Best Air Fryers for Small Kitchens in 2026",
    source: "PassivePress Evergreen",
    url: "https://passivepress.qzz.io",
    score: 20,
    suggestedCategory: "kitchen",
    sourceTier: "community",
    niche: "kitchen",
    contentType: "buyer-guide",
    productHints: ["Ninja air fryer", "Instant Vortex air fryer", "Cosori air fryer"],
    searchVolume: 3300,
    sourceUrls: [],
  },
  {
    title: "Best Camping Coolers for Weekend Trips in 2026",
    source: "PassivePress Evergreen",
    url: "https://passivepress.qzz.io",
    score: 20,
    suggestedCategory: "outdoors",
    sourceTier: "community",
    niche: "outdoors",
    contentType: "comparison",
    productHints: ["YETI Roadie", "RTIC cooler", "Igloo BMX cooler"],
    searchVolume: 1900,
    sourceUrls: [],
  },
];

export function getAvailableFallbackTopics(existingTitles: string[] = []): TrendTopic[] {
  const normalizedExisting = new Set(existingTitles.map((title) => title.toLowerCase().trim()));
  return FALLBACK_TOPICS.filter((topic) => !normalizedExisting.has(topic.title.toLowerCase().trim()));
}
