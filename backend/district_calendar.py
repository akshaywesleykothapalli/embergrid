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
    gate = score(2023, 2023)
    evaluation = [score(year, 2023) for year in (2024, 2025)]
    training = [row for row in overlap if row[0] < "2023-01"]
    paired_months = sum(modis > 0 and viirs > 0 for _, modis, viirs in training)
    # The 2023 publication gate is separate from retrospective 2024–2025 reporting.
    validated = (paired_months >= 12 and method != "raw" and
                 gate[method] < gate["raw"])
    predict = fit(training, method)
    holdout_errors = sorted(abs(predict(key, modis) - viirs) for key, modis, viirs in overlap if "2024-01" <= key <= "2025-12")
    error90 = holdout_errors[(9 * len(holdout_errors) + 9) // 10 - 1] if holdout_errors else None
    months = []
    previous = defaultdict(list)
    for key, modis, viirs in series:
        observed = key >= "2012-02"
        value = viirs if observed else round(predict(key, modis), 1) if validated else None
        history = previous[key[-2:]][-5:]
        months.append({"month": key, "value": value,
                       "source": "VIIRS" if observed else "MODIS estimate" if validated else "Estimate unavailable",
                       "modis": modis, "viirs": viirs if observed else None,
                       "coverage_note": "Suomi NPP archive begins January 20. Partial month excluded from observed VIIRS series." if key == "2012-01" else None,
                       "baseline": median(history) if len(history) >= 3 else None,
                       "above": value is not None and len(history) >= 3 and value > max(history)})
        if value is not None:
            previous[key[-2:]].append(value)
    return {"district": area["name"], "state": areas["states"][area["state"]]["properties"]["name"],
            "method": method, "validated": validated, "pairedMonths": paired_months,
            "holdoutError90": round(error90, 1) if error90 is not None else None,
            "gate": {k: round(v, 2) for k, v in gate.items()},
            "evaluation": [{k: round(v, 2) for k, v in row.items()} for row in evaluation],
            "months": months}


@lru_cache(maxsize=1)
def benchmark():
    """Summarize frozen-model errors across all district-months, including withheld models."""
    groups = defaultdict(lambda: [0, 0.0, 0.0])
    districts = []
    transition = {method: [] for method in METHODS}
    for feature in boundaries()["districts"]:
        district_id = feature["properties"]["id"]
        result = calculate(district_id)
        rows = [(key, *values[district_id]) for key, values in archive().items()]
        training = [row for row in rows if "2012-02" <= row[0] < "2023-01"]
        seam_training = [row for row in training if row[0] < "2017-01"]
        seam = {key: (m, v) for key, m, v in rows if key in ("2018-12", "2019-01")}
        if len(seam) == 2:
            dec_modis, dec_viirs = seam["2018-12"]
            # January is observed VIIRS in both joins, so it cancels from the
            # difference between the measured and simulated month-to-month jumps.
            for method in METHODS:
                estimate = fit(seam_training, method)("2018-12", dec_modis)
                transition[method].append(abs(estimate - dec_viirs))
        predict = fit(training, result["method"])
        typical = median([v for _, _, v in training])
        errors = []
        for key, modis, viirs in rows:
            if not "2024-01" <= key <= "2025-12":
                continue
            raw = abs(modis - viirs)
            adjusted = abs(predict(key, modis) - viirs)
            errors.append(adjusted)
            month = int(key[-2:])
            season = ("Dec–Feb" if month in (12, 1, 2) else "Mar–May" if month <= 5
                      else "Jun–Aug" if month <= 8 else "Sep–Nov")
            activity = "Above district training median" if viirs > typical else "At or below district training median"
            for group in ("All district-months", season, activity):
                total = groups[group]
                total[0] += 1
                total[1] += raw
                total[2] += adjusted
        districts.append({k: result[k] for k in
                          ("district", "state", "method", "validated", "pairedMonths", "evaluation")})
        districts[-1]["id"] = district_id
        districts[-1]["medianAbsoluteError"] = round(median(errors), 2)
    return {"districts": districts,
            "transition": {method: round(mean(errors), 2) if errors else None
                           for method, errors in transition.items()},
            "groups": [{"name": name, "months": count, "raw": round(raw / count, 2),
                        "adjusted": round(adjusted / count, 2)}
                       for name, (count, raw, adjusted) in groups.items()]}
