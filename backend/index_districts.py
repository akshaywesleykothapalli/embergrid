"""Index occupied cells by district and month for request-time calibration."""
import argparse
import json
from pathlib import Path

from build_calendar import cell

DATA = Path(__file__).with_name("data")


def read_assignment(path):
    return json.loads(path.read_text().split("=", 1)[1].strip().removesuffix(";"))


def build(archives):
    import shapely as sh
    from shapely.geometry import shape
    from prepare import read_points

    districts = read_assignment(DATA / "india/boundaries.js")["districts"]
    originals = json.loads((archives / "districts.json").read_text())["features"]
    if len(originals) != len(districts):
        raise ValueError("District boundary release does not match the archive")
    import unicodedata
    for feature, original in zip(districts, originals):
        name = unicodedata.normalize("NFKD", original["properties"]["shapeName"]).encode("ascii", "ignore").decode()
        if feature["properties"]["name"] != name:
            raise ValueError("District boundary order does not match the archive")
    geometries = [sh.make_valid(shape(district["geometry"])) for district in originals]
    tree = sh.STRtree(geometries)
    west, south, east, north = sh.total_bounds(geometries)
    index = {}

    def bucket():
        return [[set(), set()] for _ in districts]

    def save(key, rows):
        index[key] = [[len(group) for group in pair] for pair in rows]

    for path in sorted((DATA / "india").glob("????-??.js")):
        rows = bucket()
        for lon, lat, _, _, sensor, _, district in read_assignment(path)["points"]:
            if district >= 0:
                rows[district][sensor].add(cell(lon, lat))
        save(path.stem, rows)

    for year in range(2003, 2012):
        path = archives / f"modis_{year}_India.csv"
        points = read_points([path], "MODIS", [west, south, east, north], [year])
        matched = tree.query(sh.points([(lon, lat) for lon, lat, *_ in points]), predicate="intersects")
        assignments = {}
        for point_id, district_id in zip(*matched):
            assignments[point_id] = min(district_id, assignments.get(point_id, district_id))
        months = [bucket() for _ in range(12)]
        for point_id, district_id in assignments.items():
            lon, lat, day, _ = points[point_id]
            months[int(day[5:7]) - 1][district_id][0].add(cell(lon, lat))
        for month, rows in enumerate(months, 1):
            save(f"{year}-{month:02}", rows)

    target = DATA / "district-cells.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(dict(sorted(index.items())), separators=(",", ":")))
    temporary.replace(target)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", type=Path)
    build(parser.parse_args().archives)
