let fireMap;
let hotspotLayer;
let activeDetections = [];
let agreementCells = null;
let focusOutline;

function initMap(studyBounds) {
  const [west, south, east, north] = studyBounds;
  const extent = L.latLngBounds([south, west], [north, east]);
  fireMap = L.map("map", {maxZoom: 19, minZoom: 2, scrollWheelZoom: false});
  fireMap.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
  const overview = L.imageOverlay("/assets/punjab.jpg", [[29.88, 75.35], [30.62, 76.45]], {
    attribution: 'Local overview: <a href="https://www.earthdata.nasa.gov/data/tools/gibs">NASA EOSDIS GIBS</a>'
  });
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {maxZoom: 18, detectRetina: true, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS User Community'}
  );
  const streets = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap contributors and the GIS User Community'
  });
  const notice = document.getElementById("mapDetail");
  for (const layer of [satellite, streets]) {
    layer.on("tileerror", () => {
      if (!fireMap.hasLayer(layer)) return;
      notice.textContent = "Some online tiles could not load. Switch to Local overview near Sangrur.";
      notice.hidden = false;
    });
    layer.on("loading", () => { notice.hidden = true; });
  }
  const basemaps = {Satellite: satellite, Streets: streets, "Local overview": overview};
  const basemapSelect = document.getElementById("basemap");
  let activeBasemap = satellite;
  fireMap.setMaxZoom(satellite.options.maxZoom);
  basemapSelect.addEventListener("change", () => {
    fireMap.removeLayer(activeBasemap);
    notice.hidden = true;
    activeBasemap = basemaps[basemapSelect.value];
    fireMap.setMaxZoom(activeBasemap === overview ? 12 : activeBasemap.options.maxZoom);
    activeBasemap.addTo(fireMap);
  });
  satellite.addTo(fireMap);
  fireMap.fitBounds(extent.pad(0.16), {maxZoom: 12});
  const towns = L.layerGroup();
  for (const [name, lat, lon] of [
    ["Sangrur", 30.245, 75.845], ["Barnala", 30.381, 75.548],
    ["Dhuri", 30.368, 75.868], ["Sunam", 30.128, 75.799], ["Nabha", 30.374, 76.151]
  ]) {
    L.circleMarker([lat, lon], {radius: 2, color: "#faf5df", fillOpacity: 1, interactive: false})
      .bindTooltip(name, {permanent: true, direction: "right", className: "town"})
      .addTo(towns);
  }
  towns.addTo(fireMap);
  L.rectangle(extent, {color: "#e4f5ec", weight: 1.5, dashArray: "6 5", fillOpacity: 0.025, interactive: false})
    .addTo(fireMap);
  hotspotLayer = L.layerGroup().addTo(fireMap);
  const overlays = {"Town labels": towns};
  if (window.fireContext.district) {
    overlays["Sangrur district"] = L.geoJSON(window.fireContext.district, {
      attribution: '<a href="https://www.geoboundaries.org/">geoBoundaries</a>',
      interactive: false, style: {color: "#c9adf7", weight: 2, fill: false}
    }).addTo(fireMap);
    const legend = document.getElementById("boundaryLegend");
    legend.hidden = false;
    fireMap.on("overlayadd overlayremove", event => {
      if (event.layer === overlays["Sangrur district"]) legend.hidden = event.type === "overlayremove";
    });
  }
  L.control.layers({}, overlays).addTo(fireMap);
  fireMap.on("zoomend", drawHotspots);
  L.control.scale({imperial: false}).addTo(fireMap);
  const fit = () => fireMap.fitBounds((focusOutline?.getBounds() ?? extent).pad(0.16), {maxZoom: 13});
  document.getElementById("resetMap").addEventListener("click", fit);
}

function showFocus(bounds, enabled) {
  if (focusOutline) fireMap.removeLayer(focusOutline);
  focusOutline = undefined;
  const [west, south, east, north] = bounds;
  if (enabled) {
    focusOutline = L.rectangle([[south, west], [north, east]], {
      color: "#f3df91", weight: 2, fillOpacity: 0.04, interactive: false
    }).addTo(fireMap);
  }
  document.getElementById("resetMap").click();
}

function renderMap(week, filter) {
  agreementCells = filter === "agreement" ? analyzeCells(week) : null;
  activeDetections = ["MODIS", "VIIRS"].filter(sensor => filter === "both" || filter === sensor)
    .flatMap(sensor => week[sensor].map(([lon, lat, day, timestamp]) => ({sensor, lon, lat, day, timestamp})));
  drawHotspots();
}

function drawHotspots() {
  hotspotLayer.clearLayers();
  if (agreementCells) {
    for (const cell of agreementCells) {
      const {x, y, MODIS, VIIRS} = cell;
      const color = MODIS && VIIRS ? "#cbb2fc" : MODIS ? "#ffae6d" : "#88edd4";
      L.rectangle([[y * CELL_SIZE, x * CELL_SIZE], [(y + 1) * CELL_SIZE, (x + 1) * CELL_SIZE]], {
        color, weight: 1, fillOpacity: 0.38
      }).bindPopup("Detections in selected period<br>MODIS: " + MODIS + "<br>VIIRS: " + VIIRS).addTo(hotspotLayer);
    }
    return;
  }
  const zoom = fireMap.getZoom();
  if (zoom >= 13) {
    activeDetections.forEach(drawDetection);
    return;
  }
  // Bucket in world pixels so groups remain anchored as the user pans.
  const groups = new Map();
  for (const detection of activeDetections) {
    const pixel = fireMap.project([detection.lat, detection.lon], zoom);
    const key = Math.floor(pixel.x / 44) + ":" + Math.floor(pixel.y / 44);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(detection);
  }
  for (const group of groups.values()) {
    if (group.length === 1) { drawDetection(group[0]); continue; }
    const locations = group.map(point => [point.lat, point.lon]);
    const groupBounds = L.latLngBounds(locations);
    const center = groupBounds.getCenter();
    const instruments = new Set(group.map(point => point.sensor));
    const style = instruments.size > 1 ? "mixed" : instruments.has("MODIS") ? "modis-only" : "";
    const marker = L.marker(center, {
      icon: L.divIcon({className: "hotspot-cluster " + style, html: String(group.length), iconSize: [31, 31]}),
      title: group.length + " detections. Activate to zoom in."
    }).addTo(hotspotLayer);
    marker.on("click", () => fireMap.setView(center, zoom + 1));
  }
}

function drawDetection({sensor, lat, lon, day, timestamp}) {
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = sensor + " hotspot";
  const detail = document.createElement("div");
  detail.textContent = day + (timestamp ? " · " + timestamp.slice(11, 16) : "") + " IST · " + lat.toFixed(4) + "°N, " + lon.toFixed(4) + "°E";
  content.append(heading, detail);
  L.marker([lat, lon], {
    title: sensor + " hotspot, " + day,
    icon: L.divIcon({className: "hotspot-symbol " + (sensor === "MODIS" ? "modis" : ""),
      html: "<span></span>", iconSize: [10, 10]})
  }).bindPopup(content).addTo(hotspotLayer);
}
