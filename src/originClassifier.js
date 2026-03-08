import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg
  ? dirname(process.execPath)
  : join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Origin labels ---
export const AlertOrigin = {
  HAMAS_GAZA: 'Hamas (Gaza)',
  HEZBOLLAH_LEBANON: 'Hezbollah (Lebanon)',
  IRAN: 'Iran',
  HOUTHIS_YEMEN: 'Houthis (Yemen)',
  LONG_RANGE: 'Long Range (Yemen/Iran)',
  FALSE_ALERT: 'False Alert',
  UNKNOWN: 'Unknown'
};

// --- Region definitions ---
const REGIONS_SOUTH = [
  'Gaza Envelope',
  'Western Negev',
  'Southern Negev',
  'Central Negev',
  'Shfelat Yehuda',
  'Shfela (Lowlands)',
  'Lakhish',
  'Western Lakhish',
];

const REGIONS_NORTH = [
  'Judea',
  'Confrontation Line',
  'Northern Golan',
  'Southern Golan',
  'Upper Galilee',
  'Center Galilee',
  'Lower Galilee',
  'Wadi Ara',
  'Menashe',
  'HaAmakim',
  'Samaria',
  'HaMifratz',
  'HaCarmel',
  "Beit Sha'an Valley",
  'Dead Sea',
  'Eilat',
  'Arabah',
  "Bika'a",
  'Jerusalem',
  'Yarkon',
  'Dan',
  'Sharon',
];

// --- Timeframe data (loaded from JSON files) ---
let timeframes = {
  yemen: [],
  iran: [],
  falseAlerts: []
};

/**
 * Parse a timeframe JSON file into an array of [startMs, endMs] pairs.
 * All timestamps in the files are Israel local time.
 */
function parseTimeframeFile(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const pairs = JSON.parse(raw);
    return pairs.map(([start, end]) => [
      new Date(start + '+03:00').getTime(),
      new Date(end + '+03:00').getTime()
    ]);
  } catch (err) {
    log.warn(`Failed to load timeframe file ${filePath}: ${err.message}`);
    return [];
  }
}

/**
 * Load all timeframe data from the data/ directory.
 */
export function loadTimeframes() {
  const dataDir = join(appDir, 'data');
  timeframes.yemen = parseTimeframeFile(join(dataDir, 'yemen_alerts.json'));
  timeframes.iran = parseTimeframeFile(join(dataDir, 'iran_alerts.json'));
  timeframes.falseAlerts = parseTimeframeFile(join(dataDir, 'false_alerts.json'));
  log.info(`Origin classifier loaded: ${timeframes.yemen.length} Yemen, ${timeframes.iran.length} Iran, ${timeframes.falseAlerts.length} false-alert timeframes`);
}

/**
 * Check if a timestamp (ms) falls inside any timeframe window.
 */
function isInsideTimeframe(timestampMs, windows) {
  return windows.some(([start, end]) => timestampMs >= start && timestampMs <= end);
}

/**
 * Classify the origin of an alert based on the priority chain:
 * 1. False alert timeframe → FALSE_ALERT
 * 2. Iran timeframe → IRAN
 * 3. Yemen timeframe → HOUTHIS_YEMEN
 * 4. cat == 13 → LONG_RANGE
 * 5. Region south → HAMAS_GAZA
 * 6. Region north → HEZBOLLAH_LEBANON
 * 7. Otherwise → UNKNOWN
 *
 * @param {object} alert - The raw Pikud HaOref alert object
 * @param {string[]} [enrichedRegions] - Optional areaNameEn values for region-based classification
 * @returns {string} One of the AlertOrigin values
 */
export function classifyOrigin(alert, enrichedRegions) {
  const now = Date.now();

  // 1. False alert check
  if (isInsideTimeframe(now, timeframes.falseAlerts)) {
    return AlertOrigin.FALSE_ALERT;
  }

  // 2. Iran timeframe check
  if (isInsideTimeframe(now, timeframes.iran)) {
    return AlertOrigin.IRAN;
  }

  // 3. Yemen timeframe check
  if (isInsideTimeframe(now, timeframes.yemen)) {
    return AlertOrigin.HOUTHIS_YEMEN;
  }

  // 4. Cat 13 = advance notice / early warning (long-range, likely Yemen or Iran)
  if (String(alert.cat) === '13') {
    return AlertOrigin.LONG_RANGE;
  }

  // 5-6. Region-based classification (only if enriched region data is available)
  if (enrichedRegions && enrichedRegions.length > 0) {
    const hasSouth = enrichedRegions.some(r => REGIONS_SOUTH.includes(r));
    const hasNorth = enrichedRegions.some(r => REGIONS_NORTH.includes(r));

    if (hasSouth && !hasNorth) return AlertOrigin.HAMAS_GAZA;
    if (hasNorth && !hasSouth) return AlertOrigin.HEZBOLLAH_LEBANON;
    if (hasSouth && hasNorth) return AlertOrigin.LONG_RANGE; // wide spread = likely long range
  }

  // 7. Fallback: use city-to-region heuristic from alert.data if no enriched data
  if (alert.data && Array.isArray(alert.data)) {
    const origin = classifyByAlertCities(alert.data);
    if (origin) return origin;
  }

  return AlertOrigin.UNKNOWN;
}

// --- City-name-based heuristic (Hebrew area patterns) ---
// These Hebrew substrings help classify by geography when no enriched areaNameEn is available

const SOUTH_PATTERNS = [
  'עוטף עזה', 'שער הנגב', 'אשקלון', 'שדרות', 'נתיבות', 'אופקים',
  'נגב מערבי', 'נגב', 'לכיש', 'שפלה', 'קריית גת', 'באר שבע',
  'ניר עם', 'כיסופים', 'נחל עוז', 'סעד', 'ארז', 'כרם שלום',
  'מפלסים', 'זיקים', 'כרמיה', 'יד מרדכי'
];

const NORTH_PATTERNS = [
  'גליל עליון', 'גליל', 'גולן', 'חיפה', 'עכו', 'נהריה', 'צפת',
  'קרית שמונה', 'מטולה', 'שלומי', 'חניתה', 'מנרה', 'דן',
  'העמקים', 'עמק יזרעאל', 'כרמל', 'שומרון', 'שרון',
  'ירושלים', 'תל אביב', 'גוש דן', 'ירקון', 'מפרץ'
];

function classifyByAlertCities(cities) {
  let southScore = 0;
  let northScore = 0;

  for (const city of cities) {
    if (SOUTH_PATTERNS.some(p => city.includes(p))) southScore++;
    if (NORTH_PATTERNS.some(p => city.includes(p))) northScore++;
  }

  if (southScore > 0 && northScore === 0) return AlertOrigin.HAMAS_GAZA;
  if (northScore > 0 && southScore === 0) return AlertOrigin.HEZBOLLAH_LEBANON;
  if (northScore > 0 && southScore > 0) return AlertOrigin.LONG_RANGE;

  return null;
}

/**
 * Returns geographic coordinates for the origin, used by the globe visualization.
 */
export function getOriginCoordinates(origin) {
  const coords = {
    [AlertOrigin.HAMAS_GAZA]: { lat: 31.4, lon: 34.4, label: 'Gaza' },
    [AlertOrigin.HEZBOLLAH_LEBANON]: { lat: 33.9, lon: 35.5, label: 'Lebanon' },
    [AlertOrigin.IRAN]: { lat: 35.7, lon: 51.4, label: 'Iran' },
    [AlertOrigin.HOUTHIS_YEMEN]: { lat: 15.4, lon: 44.2, label: 'Yemen' },
    [AlertOrigin.LONG_RANGE]: { lat: 25.0, lon: 47.0, label: 'Long Range' },
  };
  return coords[origin] || null;
}

/**
 * Returns the color associated with an origin (for UI display).
 */
export function getOriginColor(origin) {
  const colors = {
    [AlertOrigin.HAMAS_GAZA]: '#008000',
    [AlertOrigin.HEZBOLLAH_LEBANON]: '#F7E210',
    [AlertOrigin.IRAN]: '#DA0000',
    [AlertOrigin.HOUTHIS_YEMEN]: '#000000',
    [AlertOrigin.LONG_RANGE]: '#DA0000',
    [AlertOrigin.FALSE_ALERT]: '#888888',
    [AlertOrigin.UNKNOWN]: '#888888',
  };
  return colors[origin] || '#888888';
}
