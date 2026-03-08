# Alert Origin Classifier — Implementation Instructions

## Purpose

Build a Python module that classifies the origin (source) of missile/rocket alerts in Israel based on Pikud HaOref (Home Front Command) alert data. The classifier determines whether an alert originated from **Gaza (Hamas)**, **Southern Lebanon (Hezbollah)**, **Yemen (Houthis)**, or **Iran (IRGC)**.

This module is designed to be integrated into an existing alert monitoring application that already consumes the Pikud HaOref API.

---

## Architecture Overview

```
Pikud HaOref API (alerts.json)
        │
        ▼
┌─────────────────────────┐
│  Alert Origin Classifier │
│                         │
│  1. False Alert Filter  │──► Discard confirmed false alerts
│  2. Iran Timeframe Check│──► Label: "Iran"
│  3. Yemen Timeframe Check──► Label: "Houthis (Yemen)"
│  4. HFC Early Warning   │──► Label: "Yemen" or "Iran" (cat=13)
│  5. Region Heuristic    │──► Label: "Hamas (Gaza)" or "Hezbollah (Lebanon)"
│                         │
└─────────────────────────┘
        │
        ▼
  origin: str  (per-alert classification)
```

The classification uses a **priority chain** — each alert is tested in order, and the first match wins.

---

## Data Sources

### 1. Pikud HaOref Real-Time Alert API

**Endpoint:** `https://www.oref.org.il/WarningMessages/alert/alerts.json`

**Important:** This API is geo-blocked to Israeli IPs only. Requires appropriate headers.

**Request Headers (required):**
```
X-Requested-With: XMLHttpRequest
Referer: https://www.oref.org.il/
```

**Response format (when alerts are active):**
```json
{
  "id": "134168709720000000",
  "cat": "1",
  "title": "ירי רקטות וטילים",
  "data": ["סדרות, שער הנגב", "ניר עם", "כרם אבו סאלם (קרני)"],
  "desc": "היכנסו למרחב המוגן ושהו בו 10 דקות"
}
```

**Key fields:**
- `cat` — Alert category number. `1` = rockets/missiles, `2` = hostile UAV, `13` = special update / advance notice
- `title` — Threat type in Hebrew (e.g., "ירי רקטות וטילים" for rocket/missile fire)
- `data` — Array of city/settlement names under alert
- `desc` — Instruction text (contains shelter time info)

**When no alerts are active, the response is an empty string or empty array.**

### 2. Pikud HaOref Alert History API

**Endpoint:** `https://www.oref.org.il/WarningMessages/History/AlertsHistory.json`

Returns recent alert history with timestamps.

### 3. Aggregated Alert API (rocketalert.live)

**Base URL:** `https://agg.rocketalert.live/api`

This third-party aggregation server enriches Pikud HaOref data with English names, coordinates, area/region classifications, and countdown timers. Useful endpoints:

- `GET /v1/alerts/details?from={ISO}&to={ISO}` — Detailed alerts with per-city data
- `GET /v2/alerts/real-time` — SSE stream of real-time alerts

**Enriched alert object structure:**
```json
{
  "name": "אשקלון - דרום",
  "englishName": "Ashkelon - South",
  "lat": 31.6457,
  "lon": 34.5567,
  "taCityId": 7,
  "countdownSec": 30,
  "areaNameHe": "נגב מערבי",
  "areaNameEn": "Western Negev",
  "timeStamp": "2025-03-20 03:59:42",
  "alertTypeId": 1
}
```

**Key enriched fields for classification:**
- `areaNameEn` — English name of the alert region (used for geographic classification)
- `countdownSec` — Seconds to reach shelter (used as distance proxy)
- `alertTypeId` — `1` = rockets, `2` = UAV
- `timeStamp` — Local Israel time of the alert

### 4. Manually Curated Timeframe Files

These JSON files contain `[start_datetime, end_datetime]` pairs for known Iran and Yemen attack windows, and confirmed false alerts. They must be maintained manually (updated when events occur).

**Source repository:** `https://github.com/ErezNagar/rocket-alert`

- `src/data/yemen_alerts.json` — Yemen/Houthi attack time windows (~93 entries)
- `src/data/iran-alerts.json` — Iran attack time windows (~9 entries)
- `src/data/confirmed_false_alerts.json` — Known false alarm time windows (~46 entries)

**Format (all three files share the same structure):**
```json
[
  ["2024-09-15 06:30:00", "2024-09-15 06:35:00"],
  ["2024-09-27 00:40:00", "2024-09-27 00:42:00"]
]
```

All timestamps are in **Israel local time**.

---

## Classification Algorithm

Implement the following function. The priority order is critical — it must be evaluated top to bottom, first match wins.

### Pseudocode

```
function classifyAlertOrigin(alert, timeframes):

    1. IF alert.timeStamp falls within any timeframes.false_alerts window:
         → RETURN "false_alert" (discard)

    2. IF alert.timeStamp falls within any timeframes.iran window:
         → RETURN "Iran"

    3. IF alert.timeStamp falls within any timeframes.yemen window:
         → RETURN "Houthis (Yemen)"

    4. IF alert.cat == 13 (advance notice / early warning):
         → RETURN "long_range" (likely Yemen or Iran — needs further context)

    5. IF alert.areaNameEn is in REGIONS_SOUTH:
         → RETURN "Hamas (Gaza)"

    6. IF alert.areaNameEn is in REGIONS_NORTH:
         → RETURN "Hezbollah (Lebanon)"

    7. ELSE:
         → RETURN "unknown"
```

### Region Definitions

These are the exact region name strings as they appear in the `areaNameEn` field from the enriched alert data.

**REGIONS_SOUTH** (alerts from these regions → classify as Hamas/Gaza):
```python
REGIONS_SOUTH = [
    "Gaza Envelope",
    "Western Negev",
    "Southern Negev",
    "Central Negev",
    "Shfelat Yehuda",
    "Shfela (Lowlands)",
    "Lakhish",
    "Western Lakhish",
]
```

**REGIONS_NORTH** (alerts from these regions → classify as Hezbollah/Lebanon):
```python
REGIONS_NORTH = [
    "Judea",
    "Confrontation Line",
    "Northern Golan",
    "Southern Golan",
    "Upper Galilee",
    "Center Galilee",
    "Lower Galilee",
    "Wadi Ara",
    "Menashe",
    "HaAmakim",
    "Samaria",
    "HaMifratz",
    "HaCarmel",
    "Beit Sha'an Valley",
    "Dead Sea",
    "Eilat",
    "Arabah",
    "Bika'a",
    "Jerusalem",
    "Yarkon",
    "Dan",
    "Sharon",
]
```

**Important:** Regions like "Dan", "Sharon", "Yarkon", and "Jerusalem" appear in REGIONS_NORTH because during the reference implementation period (Oct 2023 – Oct 2025), alerts reaching central Israel were predominantly from Hezbollah or long-range threats, not Gaza. However, this is context-dependent — if the security situation changes, this mapping may need adjustment.

### Timeframe Matching Logic

A timestamp matches a timeframe window if it falls between (inclusive) the start and end times:

```python
def is_inside_timeframe(timestamp: datetime, timeframes: list[tuple[datetime, datetime]]) -> bool:
    return any(start <= timestamp <= end for start, end in timeframes)
```

---

## Module Structure

Create the following file structure:

```
alert_origin_classifier/
├── __init__.py
├── classifier.py          # Core classification logic
├── regions.py             # Region name constants
├── timeframes.py          # Timeframe loading and management
├── models.py              # Data models / enums
├── data/
│   ├── yemen_alerts.json       # Copy from rocketalert repo
│   ├── iran_alerts.json        # Copy from rocketalert repo
│   └── false_alerts.json       # Copy from rocketalert repo
└── tests/
    ├── __init__.py
    └── test_classifier.py
```

---

## Detailed Implementation Specifications

### models.py

Define an enum for alert origins:

```python
from enum import Enum

class AlertOrigin(str, Enum):
    HAMAS_GAZA = "Hamas (Gaza)"
    HEZBOLLAH_LEBANON = "Hezbollah (Lebanon)"
    IRAN = "Iran"
    HOUTHIS_YEMEN = "Houthis (Yemen)"
    LONG_RANGE = "Long Range (Yemen/Iran)"  # For cat=13 advance notices
    FALSE_ALERT = "False Alert"
    UNKNOWN = "Unknown"
```

Define a dataclass for the enriched alert:

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class Alert:
    name: str                          # Hebrew city name
    english_name: Optional[str]        # English city name
    lat: float
    lon: float
    countdown_sec: int                 # Seconds to shelter
    area_name_he: str                  # Hebrew region name
    area_name_en: str                  # English region name (KEY for classification)
    timestamp: datetime                # Alert timestamp (Israel local time)
    alert_type_id: int                 # 1=rockets, 2=UAV
    cat: Optional[int] = None          # Category from raw API (1=rockets, 13=advance notice)
```

### regions.py

Define the region constants exactly as specified in the Region Definitions section above. Also include a helper:

```python
def classify_by_region(area_name_en: str) -> Optional[AlertOrigin]:
    """
    Returns AlertOrigin based on geographic region, or None if region is unrecognized.
    """
    if area_name_en in REGIONS_SOUTH:
        return AlertOrigin.HAMAS_GAZA
    if area_name_en in REGIONS_NORTH:
        return AlertOrigin.HEZBOLLAH_LEBANON
    return None
```

### timeframes.py

Implement loading of the JSON timeframe files. Support both:
1. Loading from local JSON files in the `data/` directory
2. Fetching latest versions from GitHub raw URLs (for auto-updates)

**GitHub raw URLs for latest data:**
```
https://raw.githubusercontent.com/ErezNagar/rocket-alert/refs/heads/master/src/data/yemen_alerts.json
https://raw.githubusercontent.com/ErezNagar/rocket-alert/refs/heads/master/src/data/iran-alerts.json
https://raw.githubusercontent.com/ErezNagar/rocket-alert/refs/heads/master/src/data/confirmed_false_alerts.json
```

**Implementation notes:**
- Parse the JSON arrays of `[start_string, end_string]` pairs
- Convert to `list[tuple[datetime, datetime]]`
- All timestamps in these files are Israel local time — parse accordingly
- Cache the loaded timeframes in memory; reload periodically (e.g., every hour) or on-demand

```python
@dataclass
class AlertTimeframes:
    yemen: list[tuple[datetime, datetime]]
    iran: list[tuple[datetime, datetime]]
    false_alerts: list[tuple[datetime, datetime]]
```

### classifier.py

This is the core module. Implement the `AlertOriginClassifier` class:

```python
class AlertOriginClassifier:
    def __init__(self, timeframes: AlertTimeframes):
        self.timeframes = timeframes

    def classify(self, alert: Alert) -> AlertOrigin:
        """
        Classify the origin of a single alert.
        Priority: false_alert > iran > yemen > advance_notice > region_south > region_north > unknown
        """
        # Step 1: Filter false alerts
        if is_inside_timeframe(alert.timestamp, self.timeframes.false_alerts):
            return AlertOrigin.FALSE_ALERT

        # Step 2: Check Iran timeframe
        if is_inside_timeframe(alert.timestamp, self.timeframes.iran):
            return AlertOrigin.IRAN

        # Step 3: Check Yemen timeframe
        if is_inside_timeframe(alert.timestamp, self.timeframes.yemen):
            return AlertOrigin.HOUTHIS_YEMEN

        # Step 4: Check for advance notice (cat=13) — long range
        if alert.cat == 13:
            return AlertOrigin.LONG_RANGE

        # Step 5: Geographic region classification
        region_result = classify_by_region(alert.area_name_en)
        if region_result:
            return region_result

        # Step 6: Unknown
        return AlertOrigin.UNKNOWN

    def classify_batch(self, alerts: list[Alert]) -> dict:
        """
        Classify a batch of alerts and return aggregated counts by origin.
        Returns:
            {
                "Hamas (Gaza)": 42,
                "Hezbollah (Lebanon)": 18,
                "Iran": 688,
                "Houthis (Yemen)": 3,
                "False Alert": 1,
                "Unknown": 0
            }
        """
        counts = {origin.value: 0 for origin in AlertOrigin}
        for alert in alerts:
            origin = self.classify(alert)
            counts[origin.value] += 1
        return counts

    def classify_wave(self, alerts: list[Alert]) -> AlertOrigin:
        """
        Classify a wave of alerts (multiple alerts within a short time window).
        Uses majority vote from the batch.
        Useful for determining the origin of an entire salvo.
        """
        counts = self.classify_batch(alerts)
        # Remove false alerts from consideration
        counts.pop(AlertOrigin.FALSE_ALERT.value, None)
        counts.pop(AlertOrigin.UNKNOWN.value, None)
        if not counts or all(v == 0 for v in counts.values()):
            return AlertOrigin.UNKNOWN
        return AlertOrigin(max(counts, key=counts.get))
```

---

## Advanced: Automatic Long-Range Detection

Beyond the manual timeframes, implement heuristic detection for **new** Yemen/Iran attacks that haven't been added to the timeframe files yet. This is based on the alert pattern:

### Heuristic: Wide Geographic Spread + Cat 13

When alerts simultaneously appear across **many distant regions** (e.g., Tel Aviv, Haifa, Beer Sheva, Jerusalem all at once), this strongly indicates a long-range ballistic missile, not Gaza/Lebanon rockets.

```python
def detect_probable_long_range(alerts: list[Alert], time_window_sec: int = 120) -> bool:
    """
    Detect if a group of alerts likely originates from a long-range source
    (Yemen or Iran) based on geographic spread patterns.

    Heuristic rules:
    1. Alerts span both NORTH and SOUTH regions simultaneously
    2. OR alerts include a cat=13 advance notice
    3. OR alerts cover 5+ distinct regions within the time window
    """
    if not alerts:
        return False

    regions = set(a.area_name_en for a in alerts)
    has_south = any(r in REGIONS_SOUTH for r in regions)
    has_north = any(r in REGIONS_NORTH for r in regions)
    has_advance_notice = any(a.cat == 13 for a in alerts)

    # Rule 1: Spans both north and south simultaneously
    if has_south and has_north:
        return True

    # Rule 2: Advance notice present
    if has_advance_notice:
        return True

    # Rule 3: Unusually wide spread (5+ distinct regions)
    if len(regions) >= 5:
        return True

    return False
```

### Heuristic: Shelter Time Analysis

Different origins have characteristic shelter times. Iranian/Yemeni missiles give more advance warning:

```python
def infer_origin_from_shelter_time(alert: Alert) -> Optional[str]:
    """
    Use shelter countdown as a supplementary signal.
    Not definitive on its own, but useful in combination with other signals.

    Reference shelter times by origin:
    - Gaza: 15-45 seconds (short range)
    - Lebanon: 15-60 seconds (short-medium range)
    - Yemen: ~10 minutes flight time (but sirens use local minimum, so 15-90 sec)
    - Iran: ~12 minutes flight time (but sirens use local minimum, so 15-90 sec)

    NOTE: As of May 2025, HFC issues cat=13 advance notices 3-5 minutes
    before sirens for Yemen/Iran attacks. This is the more reliable signal.
    """
    # This is supplementary only — shelter time alone is not deterministic
    # because sirens use the minimum time regardless of actual origin
    return None
```

---

## Integration Patterns

### Pattern A: Real-Time Classification (Event-Driven)

For integration with a real-time alert app that polls the Pikud HaOref API:

```python
import time
import requests

classifier = AlertOriginClassifier(load_timeframes())

def poll_and_classify():
    """Poll for alerts and classify each one."""
    url = "https://www.oref.org.il/WarningMessages/alert/alerts.json"
    headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.oref.org.il/",
    }

    while True:
        try:
            response = requests.get(url, headers=headers, timeout=5)
            if response.text.strip():
                raw_alert = response.json()
                # Convert raw alert to enriched Alert objects
                # (requires city-to-region lookup — see City Database section)
                alerts = enrich_alerts(raw_alert)
                for alert in alerts:
                    origin = classifier.classify(alert)
                    emit_alert_with_origin(alert, origin)
        except Exception as e:
            log.error(f"Poll failed: {e}")

        time.sleep(2)  # Poll every 2 seconds (same as HFC app)
```

### Pattern B: n8n Workflow Integration

For integration with an n8n pipeline:

1. **HTTP Request Node** — Poll Pikud HaOref API every 2 seconds
2. **Code Node (Python)** — Run the classifier on incoming alerts
3. **Switch Node** — Route by origin to different handling logic
4. **Webhook/Notification** — Send enriched alert with origin label

### Pattern C: Batch/Historical Analysis

For analyzing historical alert data:

```python
classifier = AlertOriginClassifier(load_timeframes())

# Fetch historical alerts from rocketalert.live API
response = requests.get(
    "https://agg.rocketalert.live/api/v1/alerts/details",
    params={"from": "2025-01-01", "to": "2025-10-10"}
)
data = response.json()

for day in data["payload"]:
    alerts = [parse_alert(a) for a in day["alerts"]]
    summary = classifier.classify_batch(alerts)
    print(f"{day['date']}: {summary}")
```

---

## City-to-Region Lookup (Required for Raw API)

The raw Pikud HaOref API returns city names in `data[]` but does NOT include the `areaNameEn` field needed for geographic classification. You need a lookup table.

### Option 1: Use the rocketalert.live aggregation API

This API already provides the enriched `areaNameEn` field. Use it instead of the raw API.

### Option 2: Build a local lookup from Pikud HaOref's city list

**City list endpoint:** `https://www.oref.org.il/Shared/Ajax/GetCitiesMix.aspx?lang=he`

This returns a JSON array of all cities with their area codes, labels, and countdown times. Build a mapping:

```python
# Structure: city_name -> { "area_name_en": "...", "countdown_sec": N }
CITY_TO_REGION = {
    "סדרות, שער הנגב": {"area_name_en": "Gaza Envelope", "countdown_sec": 15},
    "אשקלון - דרום": {"area_name_en": "Western Negev", "countdown_sec": 30},
    "קרית שמונה": {"area_name_en": "Upper Galilee", "countdown_sec": 15},
    # ... hundreds more entries
}
```

**The complete city list can be scraped from:**
- `https://www.oref.org.il/Shared/Ajax/GetCitiesMix.aspx?lang=he` (Hebrew)
- `https://www.oref.org.il/Shared/Ajax/GetCitiesMix.aspx?lang=en` (English)

The response includes `label` (city name), `value` (city code), `areaid` (area code), and `areaname` (area display name). The `areaid` maps to the area/region.

### Option 3: Use the HuggingFace dataset

A point-in-time export of all alerting zones is available at:
`https://huggingface.co/datasets/danielrosehill/Israel-Alerting-Zones`

---

## Timeframe File Maintenance

The Iran and Yemen timeframe JSON files must be kept updated. This is the weakest point of the system.

### Manual maintenance approach (current)

Monitor news for Iran/Yemen attacks and add entries. These events are major news and easy to identify. Format: `["YYYY-MM-DD HH:MM:SS", "YYYY-MM-DD HH:MM:SS"]` in Israel local time.

### Semi-automated maintenance approach (recommended)

Implement a detector that flags suspected new long-range events for human confirmation:

```python
def flag_suspected_new_timeframe(alerts: list[Alert]) -> Optional[dict]:
    """
    Detect alert patterns that suggest a new Iran/Yemen attack
    not yet in the timeframe files.

    Returns a suggested timeframe entry if detected, None otherwise.
    """
    if not detect_probable_long_range(alerts):
        return None

    timestamps = sorted(a.timestamp for a in alerts)
    return {
        "suggested_start": timestamps[0].strftime("%Y-%m-%d %H:%M:%S"),
        "suggested_end": timestamps[-1].strftime("%Y-%m-%d %H:%M:%S"),
        "alert_count": len(alerts),
        "regions_affected": list(set(a.area_name_en for a in alerts)),
        "confidence": "HIGH" if any(a.cat == 13 for a in alerts) else "MEDIUM",
        "requires_confirmation": True,
    }
```

### Fully automated approach (future enhancement)

Scrape IDF Telegram channel or news RSS feeds using crawl4ai to automatically detect when an attack is claimed from a specific origin. Cross-reference with the alert timestamp to auto-update timeframes.

---

## Testing

### Test Cases

Write tests for the following scenarios:

```python
def test_classify_false_alert():
    """Alert during a known false-alarm window → FALSE_ALERT"""

def test_classify_iran_attack():
    """Alert during April 2024 Iran attack window → IRAN"""

def test_classify_yemen_attack():
    """Alert during Sept 2024 Houthi attack window → HOUTHIS_YEMEN"""

def test_classify_gaza_by_region():
    """Alert in 'Gaza Envelope' region → HAMAS_GAZA"""

def test_classify_lebanon_by_region():
    """Alert in 'Upper Galilee' region → HEZBOLLAH_LEBANON"""

def test_classify_advance_notice():
    """Alert with cat=13 → LONG_RANGE"""

def test_classify_unknown_region():
    """Alert in unrecognized region → UNKNOWN"""

def test_priority_iran_over_region():
    """Alert in southern region BUT during Iran timeframe → IRAN (not HAMAS)"""

def test_priority_false_alert_over_everything():
    """Alert during false-alert window, even if also in Iran window → FALSE_ALERT"""

def test_classify_batch_counts():
    """Batch of mixed alerts returns correct counts per origin"""

def test_detect_long_range_wide_spread():
    """Alerts spanning north+south simultaneously → probable long range"""

def test_detect_long_range_many_regions():
    """Alerts in 5+ regions → probable long range"""
```

### Test Data

Use the actual timeframe data from the JSON files. Example test alerts:

```python
# Gaza alert
Alert(area_name_en="Gaza Envelope", timestamp=datetime(2025, 3, 20, 4, 0), alert_type_id=1, cat=1, ...)

# Lebanon alert
Alert(area_name_en="Upper Galilee", timestamp=datetime(2025, 3, 20, 4, 0), alert_type_id=1, cat=1, ...)

# Yemen alert (falls within known timeframe)
Alert(area_name_en="Dan", timestamp=datetime(2025, 3, 20, 4, 0), alert_type_id=1, cat=1, ...)

# Iran alert (April 14, 2024 attack)
Alert(area_name_en="Southern Negev", timestamp=datetime(2024, 4, 14, 1, 45), alert_type_id=1, cat=1, ...)
```

---

## Color Scheme for UI Display

If displaying origins visually (maps, charts), use these colors (matching rocketalert.live):

| Origin | Color | Hex |
|--------|-------|-----|
| Hamas (Gaza) | Green | `#008000` |
| Hezbollah (Lebanon) | Yellow | `#F7E210` |
| Iran | Red | `#DA0000` |
| Houthis (Yemen) | Black | `#000000` |

---

## Caveats and Limitations

1. **Source is estimation only.** The Pikud HaOref API does NOT provide launch origin. All classification is based on heuristics.

2. **Region mapping is imperfect.** Central Israel regions (Dan, Sharon, Yarkon) can be targeted from multiple directions. The classification assumes the most likely origin based on historical patterns.

3. **Iran and Yemen timeframes are manually maintained.** There is a delay between a new attack and the timeframe file being updated. The long-range heuristic detector helps bridge this gap.

4. **Islamic Jihad (Gaza) is grouped with Hamas.** The classifier doesn't distinguish between different groups operating from the same geographic area.

5. **Iraqi-origin attacks are not separately classified.** The rare attacks from Iraq-based Iranian proxies would fall into REGIONS_NORTH or UNKNOWN depending on where they hit.

6. **The `cat=13` advance notice** is a relatively new feature (May 2025). Not all apps or API consumers may receive this field.

7. **Simultaneous multi-source attacks** (e.g., Iran + Hezbollah coordinated attacks) will classify each individual alert correctly only if the Iran timeframe is set. Without the timeframe, the northern alerts would all be classified as Hezbollah.

---

## Dependencies

```
requests>=2.28.0
python-dateutil>=2.8.0
```

No external heavy dependencies required. The module should be lightweight and suitable for embedding in existing Python applications, n8n Code nodes, or serverless functions.
