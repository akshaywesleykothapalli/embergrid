"""Read Fire Harmony's published global monthly summaries from external storage."""
import gzip
import json
import os
from pathlib import Path
import sys
from importlib import import_module
from functools import lru_cache

USB = Path("/Volumes/EMBERGRID/embergrid-data")
ROOT = Path(os.environ.get("EMBERGRID_GLOBAL_ARCHIVE", USB / "fire-harmony-v1"))
BUNDLED = Path(__file__).with_name("data") / "fire-harmony-v1"
REMOTE = os.environ.get("EMBERGRID_GLOBAL_ARCHIVE_URL", "").rstrip("/")


def archive_file(name):
    local = ROOT / name
    return local if local.is_file() or not REMOTE else BUNDLED / name


def load_dependencies(*modules):
    # Prefer packages installed for the server interpreter. The USB may have
    # separate package directories for multiple Python versions.
    base = ROOT.parent / "python"
    tag = f"cp{sys.version_info.major}{sys.version_info.minor}"
    for dependencies in (base / tag, base):
        if dependencies.is_dir() and str(dependencies) not in sys.path:
            sys.path.append(str(dependencies))
    for module in modules:
        try:
            import_module(module)
        except (ImportError, OSError) as error:
            raise ImportError(f"{module} unavailable under Python {sys.version_info.major}.{sys.version_info.minor}. "
                              "Install backend/requirements-global.txt into the project .venv.") from error


def areas():
    return json.loads(archive_file("areas.json").read_text())


@lru_cache(maxsize=8)
def boundaries(country=None):
    data = Path(__file__).with_name("data")
    if country is None:
        return json.loads((data / "world-boundaries.json").read_text())
    if not country.isascii() or not country.isalnum() or len(country) != 3:
        raise ValueError("Unknown country")
    path = data / "world-admin1" / f"{country}.json.gz"
    if not path.is_file():
        return {"type": "FeatureCollection", "features": []}
    return json.loads(gzip.decompress(path.read_bytes()))


def series(area_id):
    area = {"id":"WORLD","name":"World","kind":"world"} if area_id == "WORLD" else next((item for item in areas() if str(item["id"]) == area_id
                 and item["kind"] in {"country", "continent", "world", "state"}), None)
    if area is None:
        raise ValueError("Unknown area")
    load_dependencies("duckdb")
    import duckdb

    with duckdb.connect(config={"threads": 2}) as db:
        cursor = db.execute(
            "SELECT * FROM read_parquet(?) WHERE kind = ? AND id = ? ORDER BY yr, mo",
            [str(archive_file("area_monthly.parquet")), area["kind"], area["id"]],
        )
        columns = [column[0] for column in cursor.description]
        return {"area": area, "months": [dict(zip(columns, row)) for row in cursor.fetchall()]}


def overview(year, month):
    load_dependencies("duckdb")
    import duckdb

    with duckdb.connect(config={"threads": 2}) as db:
        return dict(db.execute(
            "SELECT id, h FROM read_parquet(?) WHERE kind IN ('country', 'state') AND yr = ? AND mo = ?",
            [str(archive_file("area_monthly.parquet")), year, month],
        ).fetchall())


def point_geometry(area_id):
    state = next((item for item in areas() if item["kind"] == "state" and item["id"] == area_id), None)
    features = boundaries(state["country_iso3"] if state else None)["features"]
    matches = [f["geometry"] for f in features if f["properties"]["id"] == area_id]
    if not matches:
        raise ValueError("Country boundary unavailable")
    load_dependencies("shapely")
    import shapely
    from shapely.geometry import shape
    geometries = [shape(geometry) for geometry in matches]
    geometry = shapely.union_all([shapely.make_valid(g) for g in geometries])
    return geometry


def point_paths(geometry):
    import h3
    from shapely.geometry import Polygon

    manifest = json.loads(archive_file("hotspots/index.json").read_text())["regions"]
    # Intersect each coarse region with the country, including boundary cells.
    paths = []
    missing = 0
    for cell, entry in manifest.items():
        boundary = [(lon, lat) for lat, lon in h3.cell_to_boundary(cell)]
        if max(x for x, _ in boundary) - min(x for x, _ in boundary) > 180:
            shifted = [(x % 360, y) for x, y in boundary]
            polygons = [Polygon(shifted), Polygon([(x - 360, y) for x, y in shifted])]
        else:
            polygons = [Polygon(boundary)]
        if not any(geometry.intersects(poly) for poly in polygons):
            continue
        path = ROOT / entry["file"]
        if path.is_file():
            paths.append(str(path))
        elif REMOTE:
            paths.append(f"{REMOTE}/{entry['file']}")
        else:
            missing += 1
    return paths, missing


def point_batches(paths, bounds, year, month, sensor, day=0):
    from datetime import date
    from calendar import monthrange
    import duckdb

    west, south, east, north = bounds
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    if day:
        start = end = date(year, month, day)
    if not paths:
        return
    config = {"threads": 2}
    remote = any(path.startswith("https://") for path in paths)
    if remote:
        extension_dir = os.environ.get("EMBERGRID_DUCKDB_EXTENSION_DIRECTORY")
        if extension_dir:
            config["extension_directory"] = extension_dir
        config["http_timeout"] = 20
    try:
        with duckdb.connect(config=config) as db:
            cursor = db.execute("""
                SELECT CAST(lon AS DOUBLE), CAST(lat AS DOUBLE), CAST(date AS VARCHAR), time, satellite, CAST(frp AS DOUBLE)
                FROM read_parquet(?) WHERE date BETWEEN ? AND ?
                AND lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?
                AND (? = 'all' OR satellite = ?) AND counted
                """, [paths, start, end, west, east, south, north, sensor, sensor])
            while batch := cursor.fetchmany(8192):
                yield batch
    except (duckdb.IOException, duckdb.HTTPException) as error:
        raise OSError("Unable to read the Fire Harmony hotspot partitions") from error


def points(area_id, year, month, sensor, geometry=None, day=0):
    if geometry is None:
        geometry = point_geometry(area_id)
    load_dependencies("shapely", "h3", "duckdb")
    import shapely
    shapely.prepare(geometry)
    paths, missing = point_paths(geometry)
    results = []
    total = 0
    limit = 8000
    for batch in point_batches(paths, geometry.bounds, year, month, sensor, day):
        matches = shapely.intersects_xy(geometry, [r[0] for r in batch], [r[1] for r in batch])
        total += int(matches.sum())
        if len(results) < limit:
            selected = [row for row, inside in zip(batch, matches) if inside]
            results.extend(selected[:limit - len(results)])
    return {"points": results, "total": total, "missing": missing, "truncated": total > limit}
