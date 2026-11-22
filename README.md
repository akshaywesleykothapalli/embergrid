
<div align="center">

# EMBERGRID

### Fire activity from orbit, explored across space and time.

An interactive satellite fire-activity archive for exploring **where thermal anomalies were detected**, **how patterns change across seasons**, and **how MODIS and VIIRS records can be compared responsibly**.

**[Launch EmberGrid](https://embergrid.onrender.com/)** · **[Explore the World](https://embergrid.onrender.com/global)** · **[India Fire Calendar](https://embergrid.onrender.com/calendar)** · **[Project & Methods](https://embergrid.onrender.com/about)**

![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![Docker](https://img.shields.io/badge/Deployment-Docker-2496ED?logo=docker&logoColor=white)
![NASA FIRMS](https://img.shields.io/badge/Data-NASA%20FIRMS-364A63)

*Built for the [NASA Space Apps Challenge 2026 — MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/).*

</div>

---

## Overview

**EmberGrid turns archived satellite hotspot observations into an explorable geographic and historical record.**

Instead of showing isolated detections, it lets users move between a global view, Indian states and districts, seasonal comparisons, and a focused study of Sangrur, Punjab.

MODIS and VIIRS do not observe the Earth in identical ways: their spatial resolution, sensitivity, and observation schedules differ. EmberGrid makes those differences explicit, and the India Fire Calendar uses a validated district-level adjustment to connect parts of the historical record without presenting estimates as observations.

> **Interpretation matters:** A satellite hotspot is a detected *thermal anomaly*. It is **not** automatically a unique fire, its cause, its burned area, or proof that an area was observed continuously. EmberGrid is an exploration and research tool, not a live wildfire warning or emergency-response system.

## Explore the application

| Experience | What it provides |
| :-- | :-- |
| **[World Explorer](https://embergrid.onrender.com/global)** | Interactive 3D globe; monthly hotspot summaries across countries and subdivisions; local map inspection; exports of monthly totals and displayed detections. |
| **[India Explorer](https://embergrid.onrender.com/explore)** | Search and filter the **2012–2025 NASA FIRMS archive** by state, district, month, and sensor; compare totals; inspect detection points and export CSVs. |
| **[Fire Calendar](https://embergrid.onrender.com/calendar)** | Compare the same month across years in **735 Indian districts**, using observed VIIRS values and clearly labeled historical MODIS-based estimates from the **2003–2025** calendar record. |
| **[Sangrur Study](https://embergrid.onrender.com/sangrur)** | Explore weekly and monthly activity in a Punjab study area; examine MODIS/VIIRS overlap with rainfall estimates and historical cloud imagery. |

### Archive at a glance

| Coverage | Scope |
| :-- | :-- |
| India satellite-detection archive | **6.69 million** detections reported by the public application |
| India detection timeline | **January 2012 – December 2025** (168 months) |
| Indian administrative coverage | **36** states and union territories; **735** districts in the Fire Calendar |
| Extended district calendar | **2003–2025**, including labeled estimates where validation criteria are met |

The original India detection archive and the extended Fire Calendar do **not** represent identical observation series. Values for some earlier years are model-based adjustments and are labeled accordingly.

## How the India Fire Calendar works

1. **Measure occupied cells.** Assign NASA FIRMS detections to Indian districts, then count a spatial grid cell only once per district, sensor, and month if that cell contains one or more detections. This is a cell-occupancy measure, not a count of individual fires.

2. **Evaluate sensor adjustments.** During overlapping MODIS/VIIRS years, compare unadjusted MODIS values with overall and seasonal adjustment methods. Select methods based on mean absolute error in the development period.

3. **Gate historical estimates.** Show earlier MODIS-based estimates only for districts with at least **12 paired, nonzero training months** and an adjustment that outperformed raw MODIS in **2023**. Observed VIIRS appears from **February 2012** onward; **January 2012** has partial Suomi NPP VIIRS coverage.

4. **Report holdout results.** Evaluate the selected approach on **2024–2025** data, including subgroup results that reveal where the adjustments do not help.

### Reported validation results

| 2024–2025 benchmark across 735 districts | Raw MODIS MAE | Adjusted MAE | Interpretation |
| :-- | --: | --: | :-- |
| All evaluated district-months | 17.22 | **10.92** | Approximately **37% lower** mean absolute error in occupied cells. |
| District-months at or below typical activity | **1.17** | 1.44 | The adjustment **increased** error for this lower-activity subgroup. |

These are **project-reported evaluation results**, not a claim of uniformly improved accuracy. The calendar also exposes comparisons by season and activity level and supports district-level export.

**Different global and India measurements:** The World Explorer uses monthly summaries on the published [Fire Harmony](https://huggingface.co/datasets/warrensaw530/fire-harmony) **NOAA-20 VIIRS scale**. The India calendar uses its own district-level occupied-cell method. India views group dates in **India Standard Time (IST)**; the World Explorer uses **UTC**.

## Technology and architecture

| Layer | Technologies | Responsibility |
| :-- | :-- | :-- |
| Web interface | HTML, CSS, vanilla JavaScript | Navigation, filters, charts, and archival exploration |
| 3D experience | Three.js, CesiumJS | Scroll-driven forest-valley hero and interactive world globe |
| Mapping | Leaflet | Geographic hotspot inspection and mapping |
| Application server | Python 3.13 | Serves the site and JSON archive endpoints |
| Data processing | DuckDB, Parquet, NumPy, Shapely, H3 | Archive queries and geospatial operations |
| Deployment | Docker, Render | Single-container hosted web service |

```text
Browser
├── Three.js animated forest-valley home page
├── CesiumJS World Explorer
├── Leaflet geographic maps
└── HTML / CSS / JavaScript exploration views
               │
               │ HTTP / JSON
               ▼
       Python backend/server.py
          ├── Bundled India data
          └── DuckDB / Parquet queries
                   ├── Local Fire Harmony archive (optional)
                   └── Published archive over HTTPS
```

### Repository layout

```text
embergrid/
├── backend/
│   ├── server.py
│   ├── prepare.py
│   ├── index_districts.py
│   ├── requirements-global.txt
│   └── data/
├── frontend/
│   ├── index.html
│   ├── global.html
│   ├── explorer.html
│   ├── calendar.html
│   ├── sangrur.html
│   └── assets/
├── Dockerfile
├── Start Embergrid.command
└── README.md
```

## Run locally

### Option 1 — Docker (recommended)

**Prerequisite:** Docker installed and running.

```bash
git clone https://github.com/akshaywesleykothapalli/embergrid.git
cd embergrid
docker build -t embergrid .
docker run --rm -p 127.0.0.1:8765:8765 embergrid
```

Open **http://localhost:8765/**.

The image includes India data, world boundaries, and Fire Harmony monthly summaries.

It fetches individual global hotspot partitions from the published archive over HTTPS, so some global queries require internet access. Online basemaps also need an internet connection; the 3D globe needs WebGL support.

### Option 2 — Python (development)

From the repository root, the bundled India tools can be served with:

```bash
python3 backend/server.py
```

On macOS, you can also double-click **`Start Embergrid.command`**, which uses `.venv/bin/python` when available.

For the World Explorer with local data-reader dependencies, use **Python 3.13**:

```bash
python3.13 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-global.txt
EMBERGRID_GLOBAL_ARCHIVE=/path/to/fire-harmony-v1 .venv/bin/python backend/server.py
```

Point `EMBERGRID_GLOBAL_ARCHIVE` to the directory containing:

- `area_monthly.parquet`
- `areas.json`
- `hotspots/`

On macOS, the application's default local archive path is `/Volumes/EMBERGRID/embergrid-data/fire-harmony-v1`.

Use `--port` to change the server port.

## Deployment and smoke checks

The public deployment runs as **one Docker web service on Render**.

The root `Dockerfile` uses Python 3.13, runs as the non-root user **UID 10001**, and starts `backend/server.py` on `0.0.0.0`, reading the hosting platform's `PORT` variable.

Configure **`/api/health`** as the health-check path and serve the site over HTTPS.

Free-tier services may incur cold-start delays after inactivity.

For a host with the full Fire Harmony archive, mount the archive's parent directory read-only at `/data`, make it readable by UID 10001, and use the default `/data/fire-harmony-v1` location or override `EMBERGRID_GLOBAL_ARCHIVE`.

### API smoke checks

After starting or deploying the service:

```text
/
/about
/api/health
/api/calendar/district/0
/api/global/series?area=WORLD
/api/global/points?area=LKA&year=2025&month=10
```

These are **suggested checks**, not a claim that an automated test suite has passed.

## The animated forest valley

The homepage features a **scroll-driven Three.js camera journey through a burning forest valley**.

The scene is procedural at load time apart from its forest-floor texture.

| Module | Responsibility |
| :-- | :-- |
| `frontend/assets/fire-valley.js` | Terrain, forest placement, fire, ground cover, scene lighting, and scroll-camera behavior. |
| `frontend/assets/valley-specimens.js` | Branching oak/fir models and simplified distant-tree variants. |
| `frontend/assets/valley-finish.js` | Bloom, tone mapping, color grading, vignette, and grain. |

### Vegetation

Oak leaf sprays use canvas-generated textured cards.

Crown lighting and distant model variants reduce unnecessary visual complexity.

Hand-placed trees switch to reduced detail at 70 scene units, while background trees use instanced near/far variants.

### Fire effects

Flame clusters, smoldering patches, ember beds, and drifting sparks build the visible burn areas.

Additive blending and camera-responsive lighting contribute to the fire appearance.

### Rendering

Where supported, the scene uses a half-float, 4×-MSAA render target, warm-pixel bloom, and an AgX-tonemapped finishing pass.

Browsers without half-float target support use a simpler direct-render fallback.

### Accessibility and performance

The renderer adapts pixel ratio when frame rates drop and respects `prefers-reduced-motion`.

Add **`?hero-fps`** to the homepage URL to record measured frame rate on the canvas as `data-fps`.

For visual tuning, edit `EXPOSURE` and `BLOOM` in `valley-finish.js`.

After changing scene modules, update their `?v=` cache-busting query strings in the importing files.

## Rebuilding selected India datasets

To reconstruct the Sangrur dataset from complete NASA FIRMS Aqua MODIS and Suomi NPP VIIRS CSV exports:

```bash
python3 backend/prepare.py \
  --modis /path/to/modis_*.csv \
  --viirs /path/to/viirs-snpp_*.csv \
  --years 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025
```

This writes **`backend/data/data.js`**.

To rebuild **`backend/data/district-cells.json`**, run:

```bash
.venv/bin/python backend/index_districts.py /path/to/archives
```

Provide the original **geoBoundaries ADM2** file named `districts.json` alongside the **2003–2011 India MODIS CSVs**.

The script uses bundled India Explorer data for overlapping sensor years.

## Data sources and attribution

| Source | How EmberGrid uses it |
| :-- | :-- |
| [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms) / [historical downloads](https://firms.modaps.eosdis.nasa.gov/download/) | Historical MODIS/VIIRS thermal-anomaly detections for India; includes detections assigned to a state without an ADM2 district match, reported separately. |
| [Fire Harmony v1.0](https://huggingface.co/datasets/warrensaw530/fire-harmony) (Warren Saw) | Global monthly summaries and hotspot partitions derived from NASA FIRMS; dataset published under **CC BY 4.0**. |
| [Natural Earth](https://www.naturalearthdata.com/) and [geoBoundaries](https://www.geoboundaries.org/) | Country and administrative boundaries. |
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) and [NASA GIBS](https://www.earthdata.nasa.gov/data/tools/gibs) | Map imagery and geographic context. |
| [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Rainfall estimates for the Sangrur study; 2023 cloud-fraction imagery is also used for historical visual review. |

The World Explorer limits displayed hotspot points to **8,000 per query** and reports matched counts and missing partitions.

Individual data providers retain their own terms, licensing, and attribution requirements.

## Known limitations

- **Thermal anomalies are not verified individual fires.** Distinct detections can arise from the same event; absence of detections does not prove absence of fire.
- **Sensor harmonization is approximate.** MODIS and VIIRS observe different characteristics, and calibration can make some subsets worse even when aggregate error improves.
- **Time grouping differs between tools.** India uses IST, while global views use UTC; month boundaries can differ.
- **Archive coverage is not real-time monitoring.** The historical period and any missing source partitions limit the comparisons that can be drawn.
- **Data and visualization availability vary.** Some external map tiles and global partitions require network access, while advanced 3D visualization requires a compatible browser/GPU.

## Contributing

Suggestions, data-quality reports, reproducible bug reports, and focused pull requests are welcome through [GitHub Issues](https://github.com/akshaywesleykothapalli/embergrid/issues).

When proposing a numerical or scientific change, include:

- Data source
- Date range
- District or region
- Reproduction steps

**Source-code license:** This repository does not currently include a project-level `LICENSE` file. Public visibility on GitHub does not itself grant reuse rights; third-party datasets and map services have separate licensing terms.

## Creator

**Akshay Wesley Kothapalli**

[GitHub](https://github.com/akshaywesleykothapalli) · [LinkedIn](https://linkedin.com/in/akshay-wesley-kothapalli-966738378) · [Portfolio](https://akshaywesleykothapalli.github.io/akshaywesley-portfolio/)

---

<div align="center">

*Explore the observations. Compare the seasons. Keep the limitations visible.*

**[Open EmberGrid](https://embergrid.onrender.com/)**

</div>
