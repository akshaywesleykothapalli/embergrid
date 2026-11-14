# Embergrid

## Start the web app

Double-click **Start Embergrid.command** or run `python3 backend/server.py` from the project folder. Then open http://127.0.0.1:8765 in a browser. Leave the server window open while using the app.

- **/** introduces the project and opens the featured Sangrur comparison.
- **/explore** provides the India Explorer with zone, state, district, year, month, and sensor filters.
- **/sangrur** provides the original weekly and monthly comparison.
- **/api/** serves the historical archive as JSON. The India Explorer requests one month at a time.

The frontend and shared site layout live in `frontend/`. The Python server and data archive live in `backend/`. The server listens only on this computer. The satellite and street basemaps require an internet connection.

## Build requirements

- **NASA hotspot data:** Historical NASA FIRMS standard-processing CSVs for Aqua MODIS and Suomi NPP VIIRS for the same years. The importer expects latitude, longitude, acquisition date/time, and confidence. Use the FIRMS yearly country catalog or archive export.
- **Study area:** The starter uses a rectangular region around Sangrur in Punjab, India. District-level reporting requires a licensed district polygon and point-in-polygon filtering.
- **Science check:** Use October–November seasons in India Standard Time, align both sensors on a common grid, and fit the regional adjustment on earlier years. Report the raw and adjusted mean absolute error for the newest season. Compare the same week in earlier seasons for historical context.
- **Data quality:** Review coverage using the gridded fire-mask products before interpreting gaps or claiming a real change in burning activity. Point detections alone cannot establish complete observation coverage, fire count, burned area, or whether a detection was crop-residue burning.
- **Next additions:** Expand to selectable study areas and verify observation coverage using fire masks. The current prototype covers the overlapping MODIS and VIIRS archive years. Evaluate a more stable adjustment before extending the record into the MODIS-only era.

## Bundled dataset

The current build includes 2012–2025 NASA FIRMS Aqua MODIS and Suomi NPP VIIRS archives for the rectangular Sangrur study area. Suomi NPP coverage starts January 20, 2012. The calendar flags partial or unavailable periods at that boundary. This archive does not establish usable observation coverage for every period. The experimental adjustment is fitted and tested on October–November weekly bins only; raw counts are the default.

## Refresh the data

Use Python 3 with its standard library. From this folder, run:

```sh
python3 backend/prepare.py --modis /path/to/modis_*.csv --viirs /path/to/viirs-snpp_*.csv --years 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025
```

This replaces `backend/data/data.js`. Use complete files for each year in both series. The app labels synthetic data as **Illustrative data** when the sample dataset is in use. Real NASA files are filtered to this study area and dates before bundling. The calendar color reflects VIIRS grid-cell counts within the selected season. The short last bin ends November 30. The regional adjustment is the ratio of summed VIIRS to summed MODIS grid-cell counts across training weeks.

## Sources

- [NASA Earthdata FIRMS](https://www.earthdata.nasa.gov/data/tools/firms) documents the official hotspot products. The bundled records are historical FIRMS exports for 2022, 2023 and 2025.
- [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) supplies the online satellite tiles.

- [NASA Space Apps challenge](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)
- [NASA FIRMS archive](https://firms.modaps.eosdis.nasa.gov/download/) and [yearly country catalog](https://firms.modaps.eosdis.nasa.gov/data/country/yearly_summary_files.txt)
- [NASA FIRMS caveats](https://forum.earthdata.nasa.gov/viewtopic.php?p=18047)
- [geoBoundaries API](https://www.geoboundaries.org/api.html) for district polygons
- [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) for rainfall context

- [Detailed challenge brief mirrored by HackAthlone](https://hackathlone.com/challenges/modis-and-viirs-hot-spots)

- [NASA EOSDIS GIBS](https://www.earthdata.nasa.gov/data/tools/gibs) provides the bundled NOAA-20 VIIRS true-color imagery from March 17, 2025. The fixed basemap is geographic context for every season and works offline.

## Geographic context

The Sangrur outline uses the geoBoundaries gbOpen IND ADM2 simplified release (CC BY 4.0). It is an overlay for geographic reference. The dashed rectangle defines the FIRMS analysis area. Rainfall is NASA POWER PRECTOTCORR at 30.25°N, 75.90°E, summed over the same calendar date bins and shown as context. These are point estimates, not district averages.

## Sensor agreement and local analysis

Switch Map view to **Sensor agreement** to see cells with MODIS only, VIIRS only, or detections from both during the same week. The comparison uses a 0.025° grid. Agreement measures overlap in reported detections, with no matching by event or time of overpass. The Analysis area selector filters the map, timeline, historical comparison, and point-level CSV to the selected grid-aligned section. The rainfall strip and calibration tests use their original geographic scope.

## Observation pilot

The 2023 season includes daily Aqua daytime cloud-fraction imagery for visual inspection. In **Observation coverage**, choose a UTC date within the selected calendar week to overlay imagery or open it in NASA Worldview. The FIRMS calendar groups hotspots by India Standard Time. Cloud imagery is supplementary and does not measure whether the active-fire algorithm had a usable view. The app marks fire-mask coverage unverified, leaves hotspot counts unchanged, and does not infer that a zero count means no burning.

NASA's MYD14A1 science granules were located for the study area, but the catalog links point to Earthdata-protected files. A future quantitative coverage check requires the Aqua and Suomi NPP active-fire masks, matching acquisition windows, and validation before any counts are normalized.

- [NASA GIBS imagery access](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)
- [NASA MYD14A1 product](https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/MYD14A1)

## Weekly and monthly views

Use **Time view** to switch between January–December and weekly bins. In Weekly view, use **Week starts in** to jump to a month. The original October–November bins remain aligned to the autumn comparison. Monthly FIRMS counts are recalculated from detection dates in India Standard Time and count each grid cell once per sensor per month. Monthly rainfall comes from daily NASA POWER values summed on the calendar-month boundaries. Experimental calibration applies only to October–November weekly counts for the full study area. Rainfall and cloud imagery retain their original limited date ranges.

## Detection evidence and map detail

The app retains original FIRMS acquisition timestamps converted to IST. The comparison panel shows the same dates across all bundled seasons, unique grid cells by sensor, shared cells, and the range of recorded detection times between 06:00 and 18:00 IST. Point popups and CSV exports include the original acquisition time. Detection times are not estimates of observation coverage.

Esri satellite imagery near central Sangrur was checked at zoom levels 18 and 19. Level 18 returned imagery and level 19 returned a provider placeholder. The satellite view requests higher-resolution tiles on Retina displays and caps zoom accordingly. Streets remains a separate basemap, and the offline overview has its own lower zoom limit.

## India explorer

Open **India Explorer** from the landing page. Use **Sangrur comparison** in the header for the original weekly and monthly dashboard. Pick a zone, state or union territory, district, year, month and sensor. National and zone maps show state totals. State maps show district totals and can switch to individual hotspots. District maps open directly to point detail. The CSV export uses the selected filters.

The archive uses one local file per month for 2012–2025. State and district assignments use geoBoundaries gbOpen polygons and geographic zone assignments defined for this app. A detection inside a state can remain unassigned to a district; the sidebar reports these rows separately. Points outside all state/UT polygons are excluded. The boundary snapshot includes 36 states/UTs and 735 district features, including 14 for Andhra Pradesh. District menus reflect that snapshot. The archive begins partway through January 2012 for Suomi NPP VIIRS. Online satellite and street basemaps require internet access.

The India Explorer’s **Is this month unusual?** panel compares each sensor with up to five earlier instances of the same month for the selected area. It requires three earlier comparable values. January 2012 is partial for Suomi NPP VIIRS. The panel uses both sensors regardless of the map display filter. Its labels guide follow-up review and reflect a descriptive historical range. Observation coverage remains unverified.

## Harmonized calendar

Open **Harmonized calendar** at `/calendar` and choose a state and district, or open it from a selected district in India Explorer. The backend calculates the district’s historical estimates and validation scores on request from a monthly occupied-cell index. The source is the 2003–2025 NASA FIRMS archive.

Observed VIIRS is shown from February 2012 onward. Earlier estimates are displayed when the adjustment beats raw MODIS in each of 2023–2025 and training contains at least 12 paired nonzero months. Raw MODIS and the benchmark remain available when estimates are withheld. The test measures agreement with VIIRS. Usable observation coverage remains unverified.

To rebuild the district index, run `python3 backend/index_districts.py /path/to/archives` with Shapely installed and the original geoBoundaries ADM2 file named `districts.json` alongside the 2003–2011 FIRMS India MODIS CSVs. The legacy study-rectangle page remains accessible via its direct URL.
