"""Build the Sangrur monthly harmonized series from FIRMS observations."""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, median

from prepare import BOUNDS, read_points

ROOT = Path(__file__).resolve().parent / "data"


def cell(lon, lat):
    return math.floor(lon / .025), math.floor(lat / .025)


def fit(rows, method):
    def ratio(items):
        pairs = [(m, v) for _, m, v in items]
        denominator = sum(m for m, _ in pairs)
        return sum(v for _, v in pairs) / denominator if denominator else 1

    overall = ratio(rows)
    by_month = {}
    for month in range(1, 13):
        subset = [row for row in rows if int(row[0][-2:]) == month]
        # Shrink calendar-month factors toward the overall ratio.
        total = sum(m for _, m, _ in subset)
        weight = total / (total + 100)
        by_month[month] = overall + weight * (ratio(subset) - overall)
    return lambda key, m: m * (1 if method == "raw" else overall if method == "global"
                               else by_month[int(key[-2:])])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", type=Path, help="Directory of full NASA annual India CSVs")
    parser.add_argument("--early", nargs="+", type=int, required=True)
    args = parser.parse_args()
    source = (ROOT / "data.js").read_text().split("=", 1)[1].strip().removesuffix(";")
    seasons = json.loads(source)["seasons"]
    counts = defaultdict(lambda: [set(), set()])
    for season in seasons:
        for week in season["weeks"]:
            for index, sensor in enumerate(("MODIS", "VIIRS")):
                for lon, lat, day, *_ in week[sensor]:
                    counts[day[:7]][index].add(cell(lon, lat))
    for year in args.early:
        path = args.archives / f"modis_{year}_India.csv"
        for lon, lat, day, _ in read_points([path], "MODIS", BOUNDS, [year]):
            counts[day[:7]][0].add(cell(lon, lat))
    overlap = [(f"{year}-{month:02}", *(len(s) for s in counts[f"{year}-{month:02}"]))
               for year in range(2012, 2026) for month in range(1, 13) if (year, month) != (2012, 1)]
    methods = ("raw", "global", "seasonal")
    def evaluate(years, cutoff=None):
        scores = []
        for year in years:
            train = [row for row in overlap if int(row[0][:4]) < (cutoff or year)]
            test = [row for row in overlap if int(row[0][:4]) == year]
            scores.append({"year": year, **{
                method: round(mean(abs(fit_predict(key, m) - v) for key, m, v in test), 2)
                for method in methods for fit_predict in [fit(train, method)]
            }})
        return scores

    development = evaluate(range(2016, 2023))
    winner = min(methods, key=lambda method: mean(row[method] for row in development))
    evaluation = evaluate(range(2023, 2026), cutoff=2023)
    # Freeze the model before the untouched 2023–2025 evaluation for the published series.
    predict = fit([row for row in overlap if row[0] < "2023"], winner)
    months = []
    previous = defaultdict(list)
    for year in sorted(set(args.early) | set(range(2012, 2026))):
        for month in range(1, 13):
            key = f"{year}-{month:02}"
            m, v = map(len, counts[key])
            observed = year >= 2012 and key != "2012-01"
            value = v if observed else round(predict(key, m), 1)
            history = previous[month][-5:]
            months.append({"month": key, "value": value, "source": "VIIRS" if observed else "MODIS estimate",
                           "modis": m, "viirs": v if observed else None,
                           "baseline": median(history) if len(history) >= 3 else None,
                           "above": len(history) >= 3 and value > max(history)})
            previous[month].append(value)
    output = {"method": winner, "development": development, "evaluation": evaluation, "months": months}
    (ROOT / "harmonized.json").write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
