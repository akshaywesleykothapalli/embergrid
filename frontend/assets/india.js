const byId = id => document.getElementById(id);
const {states, districts} = window.indiaBoundaries;
const [zone, state, district, year, month, instrument, base] =
  ["zone", "state", "district", "year", "month", "instrument", "base"].map(byId);
const day = byId("day");
const metric = byId("metric");
const displayMode = byId("displayMode");
const monthName = new Intl.DateTimeFormat("en", {month: "long", timeZone: "UTC"});
const names = ["Aqua MODIS", "Suomi NPP VIIRS"];
const colors = ["#ffae6d", "#88edd4"];
const number = new Intl.NumberFormat("en-IN");
const selectOptions = (control, options) =>
  control.replaceChildren(...options.map(([name, value]) => new Option(name, value)));
selectOptions(zone, [["All India", ""], ...["North", "South", "East", "West", "Central", "Northeast"].map(name => [name, name])]);
selectOptions(year, Array.from({length: 14}, (_, i) => [2025 - i, 2025 - i]));
selectOptions(month, Array.from({length: 12}, (_, i) => [
  monthName.format(new Date(Date.UTC(2025, i, 1))), String(i + 1).padStart(2, "0")]));
month.value = "10";

const map = L.map("indiaMap", {minZoom: 3, maxZoom: 18, scrollWheelZoom: false}).setView([22.8, 80], 5);
const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {maxZoom: 18, detectRetina: true, attribution: "Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community"});
const street = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  {maxZoom: 19, attribution: "© Esri, HERE, Garmin, OpenStreetMap contributors and the GIS User Community"});
let basemap = satellite.addTo(map);
map.setMaxZoom(satellite.options.maxZoom);
base.onchange = () => {
  map.removeLayer(basemap);
  basemap = base.value === "street" ? street : satellite;
  map.setMaxZoom(basemap.options.maxZoom);
  basemap.addTo(map);
};
map.attributionControl.addAttribution('<a href="https://www.geoboundaries.org/">geoBoundaries</a>');
L.control.scale({imperial: false}).addTo(map);
let polygons = L.featureGroup().addTo(map);
const pointsLayer = L.layerGroup().addTo(map);
const renderer = L.canvas({padding: .25});
let displayed = [];
let request = 0;
const pending = new Map();

function loadMonth(key) {
  if (!pending.has(key)) {
    const promise = fetch("/api/india/month/" + encodeURIComponent(key)).then(async response => {
      if (!response.ok) throw new Error("Month file unavailable");
      const data = await response.json();
      if (data.key !== key) throw new Error("Unexpected archive month");
      return data.points;
    });
    pending.set(key, promise);
    promise.catch(() => pending.delete(key));
    if (pending.size > 3) pending.delete(pending.keys().next().value);
  }
  return pending.get(key);
}

const availableStates = () => states.filter(f => !zone.value || f.properties.zone === zone.value);
const availableDistricts = () => districts.filter(f => String(f.properties.state) === state.value);
const options = features => features.map(f => [f.properties.name, f.properties.id])
  .sort((a, b) => a[0].localeCompare(b[0]));
function updateDistricts() {
  selectOptions(district, [["All districts", ""], ...options(availableDistricts())]);
  district.disabled = !state.value || district.children.length <= 1;
}
function updateStates() {
  selectOptions(state, [["All states and UTs", ""], ...options(availableStates())]);
  updateDistricts();
}

function selectFeature(id) {
  if (state.value) district.value = id;
  else { state.value = id; updateDistricts(); }
  refresh(true);
}

function fit() {
  const extent = state.value && !district.value ? L.geoJSON(states[Number(state.value)]).getBounds() : polygons.getBounds();
  if (extent.isValid()) map.fitBounds(extent, {padding: [16, 16], maxZoom: 12});
}

function areaKm2(geometry) {
  const radians = Math.PI / 180;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] :
    geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.reduce((total, rings) => total + rings.reduce((area, ring, index) => {
    let sum = 0;
    for (let i = 1; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      const [prevLon, prevLat] = ring[i - 1];
      sum += (lon - prevLon) * radians * (Math.sin(lat * radians) + Math.sin(prevLat * radians));
    }
    return area + (index === 0 ? 1 : -1) * Math.abs(sum) * 6371 ** 2 / 2;
  }, 0), 0);
}

const areas = new Map([...states, ...districts].map(feature => [feature, areaKm2(feature.geometry)]));
const densityFormat = new Intl.NumberFormat("en-IN", {maximumFractionDigits: 1});

function aggregate(rows) {
  const totals = names.map(() => ({count: 0, cells: new Set()}));
  for (const [lon, lat, , , sensor] of rows) {
    totals[sensor].count++;
    totals[sensor].cells.add(Math.floor(lon / .025) + "," + Math.floor(lat / .025));
  }
  return totals;
}

function timeLabel(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

async function refresh(refit) {
  const id = ++request;
  const previousDay = day.value;
  const days = new Date(Number(year.value), Number(month.value), 0).getDate();
  selectOptions(day, [["All days", ""], ...Array.from({length: days}, (_, i) => [i + 1, i + 1])]);
  day.value = Number(previousDay) <= days ? previousDay : "";
  const key = year.value + "-" + month.value;
  const statesInZone = new Set(availableStates().map(f => f.properties.id));
  const selected = district.value ? districts[Number(district.value)] : state.value ? states[Number(state.value)] : null;
  const scope = selected?.properties.name || (zone.value ? zone.value + " India" : "India");
  const childDistricts = state.value ? availableDistricts() : [];
  const features = district.value ? [selected] : state.value ? childDistricts : availableStates();
  displayMode.disabled = !state.value || Boolean(district.value);
  const showPoints = Boolean(district.value || (state.value && displayMode.value === "points"));
  const calendarLink = document.getElementById("districtCalendarLink");
  calendarLink.hidden = !district.value;
  if (district.value) calendarLink.href = "/calendar?district=" + encodeURIComponent(district.value) + "&month=" + key;
  byId("mapTitle").textContent = scope;
  renderReview({
    key, scope,
    stateId: state.value ? Number(state.value) : null,
    districtId: district.value ? Number(district.value) : null,
    zone: zone.value,
    month: month.selectedOptions[0].textContent
  });
  byId("selection").textContent = scope + " · " + month.selectedOptions[0].textContent + " " + year.value + (day.value ? " · Day " + day.value + " IST" : "");
  byId("mapHelp").textContent = showPoints ? "Click a hotspot for its sensor, date, and time." :
    state.value ? "Select a district to see individual detections." : "Select a state to explore its districts.";
  byId("breakdownTitle").textContent = state.value ? "District detections" : "State and union territory detections";
  byId("status").textContent = "Loading NASA FIRMS records…";
  byId("download").disabled = true;
  byId("pointLegendIndia").hidden = !showPoints;
  byId("totals").replaceChildren();
  byId("breakdown").replaceChildren();
  polygons.clearLayers();
  pointsLayer.clearLayers();
  displayed = [];
  let rows;
  try { rows = await loadMonth(key); }
  catch {
    if (id === request) byId("status").textContent = "This archive file could not be loaded.";
    return;
  }
  if (id !== request) return;
  displayed = rows.filter(([, , localDay, , s, a, d]) => statesInZone.has(a) &&
    (!day.value || Number(day.value) === localDay) &&
    (!state.value || Number(state.value) === a) && (!district.value || Number(district.value) === d) &&
    (!instrument.value || Number(instrument.value) === s));
  const totals = aggregate(displayed);
  const counts = new Map();
  for (const row of displayed) {
    const group = row[state.value ? 6 : 5];
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  const density = metric.value === "density";
  const ranked = features.map(feature => {
    const count = counts.get(feature.properties.id) || 0;
    const area = areas.get(feature);
    return {feature, value: density ? area > 0 ? 1000 * count / area : null : count};
  }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const peak = ranked[0]?.value || 1;
  for (const {feature, value} of ranked) {
    const formatted = value == null ? "Unavailable" : density
      ? densityFormat.format(value) + " / 1,000 km²" : number.format(value) + " detections";
    const name = feature.properties.name;
    const layer = L.geoJSON(feature, {style: {
      color: "#d5eade", weight: district.value ? 2 : 1,
      fillColor: "#59e1b0", fillOpacity: showPoints ? .04 : .08 + .67 * Math.sqrt((value ?? 0) / peak)
    }}).addTo(polygons);
    if (!district.value) {
      const label = document.createElement("span");
      label.textContent = name + " · " + formatted;
      layer.bindTooltip(label);
      layer.on("click", () => selectFeature(feature.properties.id));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name + " · " + formatted;
      button.onclick = () => selectFeature(feature.properties.id);
      byId("breakdown").append(button);
    }
  }
  byId("breakdownTitle").hidden = Boolean(district.value);
  if (state.value && !district.value && !childDistricts.length) {
    L.geoJSON(selected, {style: {color: "#d5eade", fillOpacity: .04}}).addTo(polygons);
    byId("breakdown").textContent = "No district boundaries available for this area.";
  }
  if (showPoints) for (const [lon, lat, day, minutes, sensor] of displayed) {
    L.circleMarker([lat, lon], {renderer, radius: 4, color: "#16241c", weight: 1,
      fillColor: colors[sensor], fillOpacity: .9}).bindPopup(
        names[sensor] + " · " + key + "-" + String(day).padStart(2, "0") + " · " + timeLabel(minutes) + " IST"
      ).addTo(pointsLayer);
  }
  totals.forEach(({count, cells}, i) => {
    if (instrument.value && Number(instrument.value) !== i) return;
    const line = document.createElement("div");
    line.className = "india-stat";
    const label = document.createElement("span");
    label.textContent = names[i];
    const detail = document.createElement("strong");
    detail.textContent = number.format(count) + " detections";
    const cellLabel = document.createElement("small");
    cellLabel.textContent = number.format(cells.size) + " occupied grid cells";
    detail.append(cellLabel);
    line.append(label, detail);
    byId("totals").append(line);
  });
  const unassigned = displayed.filter(row => row[6] < 0).length;
  byId("status").textContent = [
    key === "2012-01" ? "Partial VIIRS month. Records begin 20 January." : "",
    unassigned ? number.format(unassigned) + " detections lack a district assignment." : ""
  ].filter(Boolean).join(" ");
  byId("download").disabled = false;
  if (refit) fit();
}

zone.onchange = () => { updateStates(); refresh(true); };
state.onchange = () => { updateDistricts(); refresh(true); };
district.onchange = () => refresh(true);
year.onchange = month.onchange = day.onchange = instrument.onchange = displayMode.onchange = metric.onchange = () => refresh(false);
byId("fit").onclick = fit;
byId("download").onclick = () => {
  const key = year.value + "-" + month.value;
  const csv = ["sensor,local_date,local_time_ist,latitude,longitude",
    ...displayed.map(([lon, lat, day, minutes, sensor]) =>
      [names[sensor], key + "-" + String(day).padStart(2, "0"), timeLabel(minutes), lat, lon].join(","))];
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv.join("\n")], {type: "text/csv"}));
  const area = (district.value ? districts[Number(district.value)].properties.name :
    state.value ? states[Number(state.value)].properties.name : zone.value || "India").toLowerCase();
  link.download = "firms-" + area.replace(/[^a-z0-9]+/g, "-") + "-" + key + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
const query = new URLSearchParams(location.search);
updateStates();
const requestedState = states.find(feature => feature.properties.name === query.get("state"));
if (requestedState) {
  state.value = requestedState.properties.id;
  updateDistricts();
  const requestedDistrict = availableDistricts().find(feature => feature.properties.name === query.get("district"));
  if (requestedDistrict) district.value = requestedDistrict.properties.id;
}
for (const control of [year, month]) {
  const value = query.get(control.id);
  if ([...control.options].some(option => option.value === value)) control.value = value;
}
const requestedDay = Number(query.get("day"));
if (Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= 31) {
  day.add(new Option(requestedDay, requestedDay));
  day.value = requestedDay;
}
refresh(true);

setupFullscreen(byId("mapWorkspace"), byId("mapFullscreen"), "map", () => {
  requestAnimationFrame(() => map.invalidateSize({pan: true, animate: false}));
});
