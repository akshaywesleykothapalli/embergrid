const CELL_SIZE = 0.025;
const INSTRUMENTS = ["MODIS", "VIIRS"];

function analyzeCells(week) {
  const cells = new Map();
  for (const sensor of INSTRUMENTS) {
    for (const [lon, lat] of week[sensor]) {
      const x = Math.floor(lon / CELL_SIZE);
      const y = Math.floor(lat / CELL_SIZE);
      const key = x + "," + y;
      if (!cells.has(key)) cells.set(key, {x, y, MODIS: 0, VIIRS: 0});
      cells.get(key)[sensor]++;
    }
  }
  return [...cells.values()];
}

function focusBounds(bounds, focus) {
  if (focus === "all") return bounds;
  const [west, south, east, north] = bounds;
  // Align the split to grid edges so a cell belongs to one focus area.
  const midLon = Math.round((west + east) / (2 * CELL_SIZE)) * CELL_SIZE;
  const midLat = Math.round((south + north) / (2 * CELL_SIZE)) * CELL_SIZE;
  return [focus.endsWith("w") ? west : midLon, focus.startsWith("s") ? south : midLat,
    focus.endsWith("w") ? midLon : east, focus.startsWith("s") ? midLat : north];
}

function filterWeek(week, bounds, focus) {
  if (focus === "all") return week;
  const [west, south, east, north] = focusBounds(bounds, focus);
  const inside = ([lon, lat]) => lon >= west && lat >= south &&
    (focus.endsWith("w") ? lon < east : lon <= east) &&
    (focus.startsWith("s") ? lat < north : lat <= north);
  return {...week, MODIS: week.MODIS.filter(inside), VIIRS: week.VIIRS.filter(inside)};
}
