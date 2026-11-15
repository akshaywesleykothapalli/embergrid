"""Country-specific second-level boundaries and counts from original observations."""
from functools import lru_cache
import json
from collections import defaultdict
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

import global_archive

LABELS = {"IND": "District", "USA": "County", "FRA": "Department",
          "BRA": "Municipality", "ZAF": "District municipality", "PAK": "District",
          "BGD": "District", "AUS": "Local government area"}


@lru_cache(maxsize=12)
def source(country):
    if country == "IND":
        path = Path(__file__).with_name("data") / "india" / "boundaries.js"
        return json.loads(path.read_text().split("=", 1)[1].strip().rstrip(";"))["districts"]
    try:
        url = f"https://www.geoboundaries.org/api/current/gbOpen/{country}/ADM2/"
        with urlopen(url, timeout=12) as response:
            metadata = json.load(response)
    except HTTPError as error:
        if error.code == 404:
            return []
        raise
    with urlopen(metadata["gjDownloadURL"], timeout=20) as response:
        return json.load(response)["features"]


@lru_cache(maxsize=24)
def districts(state_code):
    global_archive.load_dependencies("shapely")
    import shapely
    from shapely.geometry import shape, mapping

    state = next((a for a in global_archive.areas() if a["kind"] == "state" and a["id"] == state_code), None)
    if not state:
        raise ValueError("Unknown subdivision")
    country = state["country_iso3"]
    parents = [(f["properties"]["id"], shapely.make_valid(shape(f["geometry"])))
               for f in global_archive.boundaries(country)["features"]]
    tree = shapely.STRtree([g for _, g in parents])
    children = []
    geometries = []
    for feature in source(country):
        props = feature["properties"]
        geom = shapely.make_valid(shape(feature["geometry"]))
        if geom.is_empty:
            continue
        overlaps = tree.query(geom, predicate="intersects")
        if not len(overlaps):
            continue
        parent = max(overlaps, key=lambda i: (geom.intersection(parents[i][1]).area, parents[i][0]))
        if parents[parent][0] != state_code:
            continue
        identifier = str(props.get("shapeID", props.get("id")))
        children.append({"type": "Feature", "properties": {
            "id": identifier, "name": props.get("shapeName", props.get("name")),
        }, "geometry": mapping(geom.simplify(.003, preserve_topology=True))})
        geometries.append(geom)
    label = LABELS.get(country, "Local division")
    return {"type": "FeatureCollection", "features": children, "label": label}, geometries


def selection(state, district):
    payload, geometries = districts(state)
    for feature, geom in zip(payload["features"], geometries):
        if feature["properties"]["id"] == district:
            return geom
    raise ValueError("Unknown local division")


def totals(state, year, month, sensor):
    global_archive.load_dependencies("shapely", "h3", "duckdb", "numpy")
    import numpy as np
    import shapely

    payload, geometries = districts(state)
    if not geometries:
        return {"counts": {}, "missing": 0}
    tree = shapely.STRtree(geometries)
    counts = np.zeros(len(geometries), dtype=np.int64)
    platforms = defaultdict(lambda: np.zeros(len(geometries), dtype=np.int64))
    geometry = shapely.union_all(geometries)
    paths, missing = global_archive.point_paths(geometry)
    for batch in global_archive.point_batches(paths, geometry.bounds, year, month, sensor):
        positions = shapely.points([r[0] for r in batch], [r[1] for r in batch])
        indices, matches = tree.query(positions, predicate="intersects")
        counts += np.bincount(matches, minlength=len(counts))
        sensors = np.asarray([r[4] for r in batch])[indices]
        for platform in np.unique(sensors):
            platforms[platform] += np.bincount(matches[sensors == platform], minlength=len(counts))
    return {"counts": {f["properties"]["id"]: int(total)
                       for f, total in zip(payload["features"], counts)},
            "platforms": {f["properties"]["id"]: {platform: int(values[i]) for platform, values in platforms.items()}
                          for i, f in enumerate(payload["features"])}, "missing": missing}
