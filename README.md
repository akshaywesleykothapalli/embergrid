# Embergrid

Embergrid is an interactive archive of satellite fire detections. It lets you explore where MODIS and VIIRS detected hotspots and compare the same month across years. The project was built for the [2026 NASA Space Apps MODIS and VIIRS Hot Spots challenge](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/).

[Open Embergrid](https://embergrid.onrender.com/) · [About the project](https://embergrid.onrender.com/about)

## Explore the archive

| View | What you can do |
| --- | --- |
| [World Explorer](https://embergrid.onrender.com/global) | Explore a 3D globe, compare monthly totals across countries and subdivisions, and inspect archived hotspots in a local map. Export monthly totals or the points currently displayed. |
| [India Explorer](https://embergrid.onrender.com/explore) | Filter the 2012–2025 NASA FIRMS archive by area, month, and sensor. Compare state and district totals, inspect individual detections, and export a CSV. |
| [Fire Calendar](https://embergrid.onrender.com/calendar) | Compare monthly fire activity for 735 Indian districts using observations and labeled historical estimates from the 2003–2025 archive. |
| [Sangrur Study](https://embergrid.onrender.com/sangrur) | Inspect weekly or monthly detections in the Punjab study area, view MODIS and VIIRS overlap, and see rainfall and cloud imagery for selected periods. |

## How the India Fire Calendar works

1. **Count occupied cells.** Assign detections to districts and count each grid cell with at least one detection once per district, sensor, and month.
2. **Compare calibration methods.** Use years when both sensors operated to compare raw MODIS with overall and seasonal adjustments. Choose the method with the lowest mean absolute error in the development years.
3. **Validate historical estimates.** Show earlier MODIS-based estimates where there are at least 12 paired nonzero training months and the selected adjustment beats raw MODIS in 2023. The calendar shows observed VIIRS from February 2012 onward. January 2012 has partial Suomi NPP VIIRS coverage.

On the held-out 2024–2025 benchmark across 735 districts, mean absolute error fell from **17.22 to 10.92 occupied cells** overall, about 37%. In district-months at or below the district’s typical activity, error increased from 1.17 to 1.44. The Fire Calendar includes the benchmark by season and activity level and supports district-level export.

The World Explorer uses Fire Harmony’s published NOAA-20 VIIRS scale for monthly totals. India views group dates in India Standard Time. The World Explorer uses UTC. Hotspots represent recorded thermal anomalies. Estimating fire counts, burned area, cause, or usable observation coverage requires additional evidence.

## Run locally

For the full app with the hosted data configuration, build and run the Docker image from the repository root.

```sh
docker build -t embergrid .
docker run --rm -p 127.0.0.1:8765:8765 embergrid
```

Open [localhost:8765](http://localhost:8765/). The image includes India data, world boundaries, and Fire Harmony monthly summaries. It reads individual world hotspot partitions from the published archive over HTTPS.

For local development without Docker, run `python3 backend/server.py` from the repository root or double-click **Start Embergrid.command** on macOS. The launcher uses `.venv/bin/python` when available. The India tools use the bundled data. To run World Explorer with a local Fire Harmony archive, install the data readers with Python 3.13 and point the server at the directory containing `area_monthly.parquet`, `areas.json`, and `hotspots/`.

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-global.txt
EMBERGRID_GLOBAL_ARCHIVE=/path/to/fire-harmony-v1 .venv/bin/python backend/server.py
```

On macOS, the default local archive path is `/Volumes/EMBERGRID/embergrid-data/fire-harmony-v1`. Use `--port` to select another port. Online basemaps require internet access, and the 3D globe requires WebGL.

## Deploy

The public app runs as one Docker web service on Render. The root Dockerfile starts the Python server on `0.0.0.0` using the host’s `PORT` value. Configure `/api/health` as the health check and put the service behind HTTPS. A free Render instance may take about a minute to wake up after inactivity. [Render free web services](https://render.com/docs/free#spinning-down-on-idle)

For a host with a complete local Fire Harmony archive, mount its parent read-only at `/data` and make the archive readable by UID 10001. The Docker image defaults to `/data/fire-harmony-v1`. Set `EMBERGRID_GLOBAL_ARCHIVE` if you mount it elsewhere.

Useful checks after deploy include `/about`, `/api/health`, `/api/calendar/district/0`, and `/api/global/series?area=WORLD`. To verify individual world hotspot data, request `/api/global/points?area=LKA&year=2025&month=10`.

## Data and implementation

- **Fire detections.** NASA FIRMS historical MODIS and VIIRS standard-processing records. The India database covers 36 states and union territories. State-assigned detections without a district match are reported separately. [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms) · [Historical downloads](https://firms.modaps.eosdis.nasa.gov/download/)
- **Global archive.** Warren Saw’s Fire Harmony v1.0 data, licensed under CC BY 4.0 and derived from NASA FIRMS. The World Explorer displays up to 8,000 hotspot points per query and reports the matched count and any missing partitions. [Fire Harmony dataset](https://huggingface.co/datasets/warrensaw530/fire-harmony)
- **Boundaries and imagery.** Natural Earth and geoBoundaries provide administrative boundaries. The maps use Esri World Imagery and NASA GIBS for geographic context. The Sangrur study uses NASA POWER rainfall estimates and 2023 cloud-fraction imagery for visual review. [Natural Earth](https://www.naturalearthdata.com/) · [geoBoundaries](https://www.geoboundaries.org/) · [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) · [NASA GIBS](https://www.earthdata.nasa.gov/data/tools/gibs) · [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
- **Code.** `frontend/` contains the HTML, CSS, JavaScript, and map assets. `backend/` serves the site and JSON archive APIs. DuckDB reads Parquet data, Shapely and H3 support spatial filtering, and Leaflet and CesiumJS render the maps.

### Rebuild selected India datasets

Rebuild the Sangrur dataset from complete NASA FIRMS CSV exports for Aqua MODIS and Suomi NPP VIIRS. The importer writes `backend/data/data.js`.

```sh
python3 backend/prepare.py \
  --modis /path/to/modis_*.csv \
  --viirs /path/to/viirs-snpp_*.csv \
  --years 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025
```

To rebuild `backend/data/district-cells.json`, run `.venv/bin/python backend/index_districts.py /path/to/archives` with the original geoBoundaries ADM2 file named `districts.json` alongside the 2003–2011 India MODIS CSVs. The script uses the bundled India Explorer data for the overlapping sensor years.

## Built by

Akshay Wesley Kothapalli · [GitHub](https://github.com/akshaywesleykothapalli) · [LinkedIn](https://linkedin.com/in/akshay-wesley-kothapalli-966738378) · [Portfolio](https://akshaywesleykothapalli.github.io/akshaywesley-portfolio/)
