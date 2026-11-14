"""Calibrate and benchmark one district from the monthly occupied-cell archive."""
from collections import defaultdict
from functools import lru_cache
import json
from pathlib import Path
from statistics import mean, median

from build_calendar import fit
from index_districts import read_assignment

DATA = Path(__file__).with_name("data")
METHODS = ("raw", "global", "seasonal")


@lru_cache(maxsize=1)
def archive():
    return json.loads((DATA / "district-cells.json").read_text())


@lru_cache(maxsize=1)
def boundaries():
    return read_assignment(DATA / "india/boundaries.js")


@lru_cache(maxsize=64)
def calculate(district):
    areas = boundaries()
    features = areas["districts"]
    if not 0 <= district < len(features):
        raise ValueError("Unknown district")
    area = features[district]["properties"]
    series = [(key, *rows[district]) for key, rows in archive().items()]
    overlap = [row for row in series if row[0] >= "2012-02"]

    def score(year, cutoff):
        training = [row for row in overlap if row[0] < f"{cutoff}-01"]
        test = [row for row in overlap if row[0].startswith(str(year))]
        return {"year": year, **{
            method: mean(abs(predict(key, modis) - viirs) for key, modis, viirs in test)
            for method in METHODS for predict in [fit(training, method)]
        }}

    development = [score(year, year) for year in range(2016, 2023)]
    method = min(METHODS, key=lambda name: mean(row[name] for row in development))
    evaluation = [score(year, 2023) for year in range(2023, 2026)]
    training = [row for row in overlap if row[0] < "2023-01"]
    paired_months = sum(modis > 0 and viirs > 0 for _, modis, viirs in training)
    # Require positive evidence in at least a year's worth of paired months and
    # strict improvement over the raw baseline in every held-out year.
    validated = (paired_months >= 12 and method != "raw" and
                 all(row[method] < row["raw"] for row in evaluation))
    predict = fit(training, method)
    months = []
    previous = defaultdict(list)
    for key, modis, viirs in series:
        observed = key >= "2012-02"
        value = viirs if observed else round(predict(key, modis), 1) if validated else None
        history = previous[key[-2:]][-5:]
        months.append({"month": key, "value": value,
                       "source": "VIIRS" if observed else "MODIS estimate" if validated else "Estimate unavailable",
                       "modis": modis, "viirs": viirs if observed else None,
                       "baseline": median(history) if len(history) >= 3 else None,
                       "above": value is not None and len(history) >= 3 and value > max(history)})
        if value is not None:
            previous[key[-2:]].append(value)
    return {"district": area["name"], "state": areas["states"][area["state"]]["properties"]["name"],
            "method": method, "validated": validated, "pairedMonths": paired_months,
            "evaluation": [{k: round(v, 2) for k, v in row.items()} for row in evaluation],
            "months": months}
