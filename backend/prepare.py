"""Build a local browser dataset from NASA FIRMS historical CSV exports."""
import argparse
import calendar
import csv
from datetime import date, datetime, timedelta, timezone
import json
import math
from pathlib import Path

BOUNDS = [75.65, 30.05, 76.15, 30.45]
IST = timezone(timedelta(hours=5, minutes=30))


def read_points(paths, sensor, bounds, years):
    west, south, east, north = bounds
    points = set()
    for path in paths:
        with path.open(encoding="utf-8-sig", newline="") as source:
            rows = csv.DictReader(source)
            required = {"latitude", "longitude", "acq_date", "acq_time", "confidence"}
            if not required.issubset(rows.fieldnames or []):
                raise ValueError(f"{path.name} is missing required FIRMS columns.")
            for row in rows:
                lat, lon = float(row["latitude"]), float(row["longitude"])
                if not (west <= lon <= east and south <= lat <= north):
                    continue
                # Use Aqua for the MODIS series when the archive contains both platforms.
                if sensor == "MODIS" and (row.get("satellite") or "").strip().lower() not in {"", "a", "aqua"}:
                    continue
                confidence = row["confidence"].strip().lower()
                if sensor == "MODIS" and not 30 <= float(confidence) <= 100:
                    continue
                if sensor == "VIIRS" and confidence not in {"n", "h", "nominal", "high"}:
                    continue
                if (row.get("type") or "").strip() not in {"", "0", "0.0"}:
                    continue
                observed = datetime.strptime(
                    row["acq_date"] + row["acq_time"].strip().zfill(4), "%Y-%m-%d%H%M"
                ).replace(tzinfo=timezone.utc).astimezone(IST)
                day = observed.date()
                if day.year not in years:
                    continue
                points.add((lon, lat, day.isoformat(), observed.isoformat()))
    return sorted(points)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--modis", nargs="+", required=True, type=Path)
    parser.add_argument("--viirs", nargs="+", required=True, type=Path)
    parser.add_argument("--years", nargs="+", required=True, type=int)
    parser.add_argument("--bounds", nargs=4, type=float, default=BOUNDS, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    parser.add_argument("--area", default="Sangrur area, Punjab")
    args = parser.parse_args()
    years = sorted(set(args.years))
    if len(years) < 2 or not all(2012 <= year <= date.today().year for year in years):
        parser.error("Provide at least two overlapping MODIS and VIIRS years from 2012 onward.")
    west, south, east, north = args.bounds
    if not all(map(math.isfinite, args.bounds)) or not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        parser.error("Provide ordered geographic bounds in decimal degrees.")
    data = {"mode": "NASA FIRMS", "area": args.area, "bounds": args.bounds, "seasons": []}
    observations = {}
    for sensor, paths in (("MODIS", args.modis), ("VIIRS", args.viirs)):
        observations[sensor] = read_points(paths, sensor, args.bounds, years)
        if not observations[sensor]:
            parser.error(f"No matching {sensor} detections. Check the files, region and years.")
    for year in years:
        # Use a leap-year template for comparable dates and preserve the original autumn bins.
        template = date(2000, 1, 1)
        weeks = []
        day_index = {}
        segments = [(template, date(2000, 9, 30)),
                    (date(2000, 10, 1), date(2000, 11, 30)),
                    (date(2000, 12, 1), date(2000, 12, 31))]
        for start, end in segments:
            for offset in range((end - start).days + 1):
                day = start + timedelta(days=offset)
                if offset % 7 == 0:
                    last = min(day + timedelta(days=6), end)
                    weeks.append({"start": str(year) + day.isoformat()[4:],
                                  "end": str(year) + last.isoformat()[4:],
                                  "MODIS": [], "VIIRS": []})
                day_index[str(year) + day.isoformat()[4:]] = weeks[-1]
        if not calendar.isleap(year):
            for week in weeks:
                if week["end"].endswith("-02-29"):
                    week["end"] = str(year) + "-02-28"
        for sensor, points in observations.items():
            for lon, lat, day, timestamp in points:
                observed = date.fromisoformat(day)
                if observed.year == year and (sensor != "VIIRS" or observed >= date(2012, 1, 20)):
                    day_index[day][sensor].append([lon, lat, day, timestamp])
        if any(not any(week[sensor] for week in weeks) for sensor in observations):
            parser.error(f"Missing {year} detections for at least one sensor. Check archive coverage.")
        data["seasons"].append({"year": year, "fullYear": True, "weeks": weeks})
    target = Path(__file__).with_name("data") / "data.js"
    temporary = target.with_suffix(".tmp")
    temporary.write_text("window.fireData = " + json.dumps(data, separators=(",", ":")) + ";\n")
    temporary.replace(target)
    print(f"Wrote {target.name} for {len(years)} seasons.")


if __name__ == "__main__":
    main()
