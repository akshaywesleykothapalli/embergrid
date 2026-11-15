(() => {
  const byId = id => document.getElementById(id);
  const area = byId("globalArea");
  const state = byId("globalState");
  const district = byId("globalDistrict");
  const districtStatus = byId("districtStatus");
  let districtLayer;
  let districtCounts = {};
  let districtPlatforms = {};
  let districtRequest = 0;
  let districtBoundaryRequest = 0;
  const year = byId("globalYear");
  const month = byId("globalMonth");
  const day = byId("globalDay");
  const sensor = byId("globalSensor");
  const status = byId("globalStatus");
  const details = byId("worldDetails");
  const pointStatus = byId("globalPointStatus");
  const globeNode = byId("worldGlobe");
  const flatNode = byId("worldFlat");
  const tooltip = byId("worldTooltip");
  const mode = byId("worldMode");
  const C = window.Cesium;
  const imagery = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const credit = "Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community";
  const naturalEarth = '<a href="https://www.naturalearthdata.com/">Natural Earth</a>';
  const number = new Intl.NumberFormat("en", {maximumFractionDigits: 1});
  const date = new Intl.DateTimeFormat("en", {month: "long", timeZone: "UTC"});
  const monthName = value => date.format(new Date(Date.UTC(2025, value - 1, 1)));
  month.replaceChildren(...Array.from({length: 12}, (_, i) => new Option(monthName(i + 1), i + 1)));
  month.value = "10";

  const home = [15, 10];
  const homeHeight = 23000000;
  const detailHeight = 2200000;
  const areas = new Map();
  const globeCountries = new Map();
  const subdivisions = new Map();
  const overviewCache = new Map();
  const flat = L.map(flatNode, {zoomControl: false, minZoom: 2, maxZoom: 18, preferCanvas: true, zoomSnap: .25, zoomDelta: 1})
    .setView(home, 2);
  const tiles = L.tileLayer(imagery, {maxZoom: 18, attribution: credit}).addTo(flat);
  flat.attributionControl.addAttribution(naturalEarth);
  const flatPoints = L.featureGroup().addTo(flat);
  let countryLayer;
  let stateLayer;
  let viewer;
  let markers;
  let counts = {};
  let months = [];
  let points = [];
  let mapRequest = 0;
  let areaRequest = 0;
  let globeActive = false;
  let pointRequest;
  let modeRequest = 0;
  let fade;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let flatZoomArmed = false;
  let globeZoomArmed = false;
  const selectedId = () => state.value || area.value;
  const selected = () => areas.get(selectedId());
  const color = code => code === selectedId() ? "#ffdc86" : "#68eac0";

  async function read(path, signal) {
    const response = await fetch(path, {signal});
    if (!response.ok) throw new Error("Global archive unavailable");
    return response.json();
  }

  function globeView(location, height, animate) {
    const destination = C.Cartesian3.fromDegrees(location[1], location[0], height);
    const orientation = {heading: 0, pitch: -Math.PI / 2, roll: 0};
    viewer.camera.cancelFlight();
    if (animate) viewer.camera.flyTo({destination, orientation, duration: .85});
    else viewer.camera.setView({destination, orientation});
  }

  function setMode(useGlobe, transition = false) {
    const id = ++modeRequest;
    const next = Boolean(useGlobe && viewer);
    const outgoing = globeActive ? globeNode : flatNode;
    const incoming = next ? globeNode : flatNode;
    fade?.cancel();
    globeActive = next;
    flatZoomArmed = false;
    globeZoomArmed = false;
    incoming.hidden = false;
    incoming.style.pointerEvents = "";
    mode.textContent = globeActive ? "Flat map" : "3D globe";
    mode.hidden = !viewer;
    tooltip.hidden = true;
    if (viewer) viewer.useDefaultRenderLoop = globeActive;
    resize();

    if (!transition || outgoing === incoming || reduceMotion.matches) {
      (next ? flatNode : globeNode).hidden = true;
      incoming.style.zIndex = "";
      outgoing.style.zIndex = "";
      return Promise.resolve();
    }
    outgoing.hidden = false;
    outgoing.style.zIndex = "401";
    incoming.style.zIndex = "400";
    outgoing.style.pointerEvents = "none";
    incoming.style.pointerEvents = "";
    const ready = next ? Promise.resolve() : waitForTiles();
    return ready.then(() => {
      if (id !== modeRequest) return;
      fade = outgoing.animate([{opacity: 1}, {opacity: 0}], {duration: 280, easing: "ease-in-out", fill: "forwards"});
      return fade.finished.then(() => {
        if (id !== modeRequest) return;
        outgoing.hidden = true;
        outgoing.style.zIndex = incoming.style.zIndex = "";
        outgoing.style.pointerEvents = "";
        fade.cancel();
      }).catch(() => {});
    });
  }

  function waitForTiles() {
    return new Promise(resolve => {
      function finish() {
        clearTimeout(timeout);
        tiles.off("load", finish);
        resolve();
      }
      const timeout = setTimeout(finish, 450);
      tiles.once("load", finish);
    });
  }

  function resize() {
    if (globeActive) {
      viewer.resize();
      viewer.scene.requestRender();
    } else flat.invalidateSize({pan: false});
  }

  function globeCenter() {
    const canvas = viewer.scene.canvas;
    const center = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const cartesian = viewer.camera.pickEllipsoid(center);
    const position = cartesian ? C.Cartographic.fromCartesian(cartesian) : viewer.camera.positionCartographic;
    return [C.Math.toDegrees(position.latitude), C.Math.toDegrees(position.longitude)];
  }

  function matchedZoom(location) {
    const camera = viewer.camera;
    const metersPerPixel = 2 * camera.positionCartographic.height *
      Math.tan(camera.frustum.fovy / 2) / viewer.scene.canvas.clientHeight;
    const metersPerTile = 2 * Math.PI * 6378137 * Math.cos(C.Math.toRadians(location[0]));
    return Math.max(2, Math.min(18, Math.log2(metersPerTile / (256 * metersPerPixel))));
  }

  function openFlat() {
    const center = globeCenter();
    const zoom = matchedZoom(center);
    const transition = setMode(false, true);
    flat.stop();
    flat.setView(center, zoom, {animate: false});
    return transition;
  }

  function openGlobe(location, height, animate) {
    setMode(true, true);
    globeView(location, height, animate);
  }

  try {
    viewer = new C.Viewer(globeNode, {
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      fullscreenButton: false, infoBox: false, selectionIndicator: false,
      baseLayer: false, requestRenderMode: true, maximumRenderTimeChange: Infinity, scene3DOnly: true,
      resolutionScale: 0.85
    });
    viewer.resolutionScale = .85;
    viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
      url: imagery, maximumLevel: 18, credit
    }));
    viewer.scene.globe.baseColor = C.Color.fromCssColorString("#253c51");
    viewer.scene.globe.depthTestAgainstTerrain = true;
    const camera = viewer.scene.screenSpaceCameraController;
    camera.enableTilt = false;
    camera.enableLook = false;
    camera.minimumZoomDistance = detailHeight * .65;
    camera.maximumZoomDistance = 30000000;
    camera.inertiaSpin = .55;
    viewer.creditDisplay.addStaticCredit(new C.Credit(naturalEarth, true));
    markers = viewer.scene.primitives.add(new C.PointPrimitiveCollection());
    const picking = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    picking.setInputAction(({position}) => {
      const hit = viewer.scene.pick(position)?.id;
      tooltip.hidden = true;
      if (hit?.hotspot) {
        tooltip.textContent = hit.hotspot;
        tooltip.hidden = false;
      } else if (hit?.countryCode) choose(hit.countryCode);
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    let moving = false;
    let lastPick = 0;
    viewer.camera.moveStart.addEventListener(() => { moving = true; tooltip.hidden = true; });
    picking.setInputAction(({endPosition}) => {
      if (moving || area.value !== "WORLD" || performance.now() - lastPick < 120) return;
      lastPick = performance.now();
      const code = viewer.scene.pick(endPosition)?.id?.countryCode;
      tooltip.hidden = !code;
      if (code) tooltip.textContent = areaLabel(code);
    }, C.ScreenSpaceEventType.MOUSE_MOVE);
    globeNode.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    viewer.camera.moveEnd.addEventListener(() => {
      moving = false;
      const location = viewer.camera.positionCartographic;
      if (globeActive && globeZoomArmed && location.height < detailHeight) {
        openFlat();
      }
    });
    globeNode.addEventListener("wheel", () => { globeZoomArmed = true; }, {passive: true});
    globeNode.addEventListener("touchstart", event => {
      if (event.touches.length > 1) globeZoomArmed = true;
    }, {passive: true});
    globeView(home, homeHeight, false);
  } catch {
    viewer?.destroy();
    viewer = undefined;
  }
  setMode(true);

  flat.on("zoomend", () => {
    if (!globeActive && viewer && flatZoomArmed && flat.getZoom() <= 2) {
      const center = flat.getCenter().wrap();
      openGlobe([center.lat, center.lng], homeHeight, false);
    }
  });
  for (const event of ["wheel", "touchstart"]) {
    flatNode.addEventListener(event, () => { flatZoomArmed = true; }, {passive: true});
  }
  byId("worldZoomIn").onclick = () => zoom(1);
  byId("worldZoomOut").onclick = () => zoom(-1);
  function zoom(direction) {
    if (!globeActive) {
      flatZoomArmed = true;
      if (direction < 0 && flat.getZoom() <= 2 && viewer) {
        const center = flat.getCenter().wrap();
        openGlobe([center.lat, center.lng], homeHeight, false);
      } else flat.setZoom(flat.getZoom() + direction);
      return;
    }
    const location = viewer.camera.positionCartographic;
    const center = [C.Math.toDegrees(location.latitude), C.Math.toDegrees(location.longitude)];
    const height = Math.min(30000000, location.height * (direction > 0 ? .58 : 1.65));
    if (height < detailHeight) {
      openFlat();
    } else globeView(center, height, true);
  }

  function resetView() {
    if (viewer) {
      openGlobe(home, homeHeight, globeActive);
    } else flat.setView(home, 2);
  }
  byId("worldReset").onclick = resetView;
  mode.onclick = () => {
    if (globeActive) openFlat();
    else {
      const center = flat.getCenter().wrap();
      const metersPerPixel = 2 * Math.PI * 6378137 * Math.cos(C.Math.toRadians(center.lat)) /
        (256 * 2 ** flat.getZoom());
      const fovy = viewer.camera.frustum.fovy;
      const height = metersPerPixel * flatNode.clientHeight / (2 * Math.tan(fovy / 2));
      openGlobe([center.lat, center.lng], Math.min(30000000, Math.max(detailHeight, height)), false);
    }
  };

  function choose(code) {
    const local = !areas.has(code);
    if (local) {
      district.value = code;
      changeDistrict();
      return;
    }
    if (areas.get(code)?.kind === "state") {
      if (state.value === code) return;
      state.value = code;
    }
    else {
      if (area.value === code && !state.value) return;
      area.value = code;
      populateStates();
    }
    changeArea();
  }

  function populateStates() {
    const options = subdivisions.get(area.value) || [];
    state.replaceChildren(new Option("All subdivisions", ""), ...options.map(item => new Option(item.name, item.id)));
    state.disabled = !options.length;
  }

  async function fit() {
    const local = districtLayer?.getLayers().find(layer => layer.feature.properties.id === district.value);
    if (local) {
      if (globeActive) await openFlat();
      if (district.value === local.feature.properties.id) {
        flat.flyToBounds(local.getBounds(), {padding: [35, 35], duration: .75, maxZoom: 13});
      }
      return;
    }
    const item = selected();
    if (!item || item.kind === "continent") {
      if (globeActive) globeView(item ? [item.lat, item.lon] : home, item ? 12500000 : homeHeight, true);
      else flat.flyTo(item ? [item.lat, item.lon] : home, item ? 3 : 2, {duration: .65});
      return;
    }
    if (globeActive) {
      const transition = openFlat();
      const id = modeRequest;
      await transition;
      if (id !== modeRequest || selected() !== item) return;
    }
    const layer = item.kind === "state" ? stateLayer : countryLayer;
    const feature = layer?.getLayers().find(entry => entry.feature.properties.id === item.id);
    const bounds = feature?.getBounds();
    // An international-date-line crossing can report nearly global rectangular bounds.
    if (bounds?.isValid() && bounds.getEast() - bounds.getWest() < 170) {
      flat.flyToBounds(bounds, {padding: [35, 35], duration: .75, maxZoom: 12});
    } else flat.flyTo([item.lat, item.lon], item.kind === "state" ? 7 : 4, {duration: .65});
  }

  function restyle() {
    const stateIds = subdivisions.get(area.value) || [];
    const related = area.value === "WORLD" ? Object.values(counts) : stateIds.map(item => counts[item.id]);
    const max = Math.max(1, ...related.filter(Number.isFinite));
    const shade = (value, peak) => value == null ? .07 : .06 + .52 * Math.log1p(Math.max(0, value)) / Math.log1p(peak);
    const isWorld = area.value === "WORLD";
    const active = code => code === selectedId();
    const opacity = code => active(code) ? .23 : !isWorld ? 0 : counts[code] == null ? .08 :
      .12 + .36 * Math.log1p(Math.max(0, counts[code])) / Math.log1p(max);
    countryLayer?.setStyle(feature => {
      const code = feature.properties.id;
      return {color: active(code) ? "#ffdc86" : "#c7f5e7", weight: active(code) ? 2 : 1,
        opacity: isWorld || active(code) ? 1 : 0, fillColor: color(code), fillOpacity: opacity(code)};
    });
    stateLayer?.setStyle(feature => {
      const code = feature.properties.id;
      const visible = !state.value || (state.value === code && !districtLayer?.getLayers().length);
      return {color: "#edf6f4", weight: 1, opacity: visible ? .9 : 0,
        fillColor: "#68eac0", fillOpacity: visible ? shade(counts[code], max) : 0};
    });
    const districtMax = Math.max(1, ...Object.values(districtCounts));
    districtLayer?.setStyle(feature => {
      const code = feature.properties.id;
      const active = code === district.value;
      const visible = !district.value || active;
      return {color: active ? "#ffdc86" : "#edf6f4", weight: active ? 2 : 1, opacity: visible ? .95 : 0,
        fillColor: active ? "#ffdc86" : "#68eac0",
        fillOpacity: active ? .2 : visible ? shade(districtCounts[code], districtMax) : 0};
    });
    for (const [code, entities] of globeCountries) {
      const fill = C.Color.fromCssColorString(color(code)).withAlpha(opacity(code));
      for (const entity of entities) entity.polygon.material = fill;
    }
    viewer?.scene.requestRender();
  }

  function areaLabel(code) {
    const name = areas.get(code)?.name || code;
    return counts[code] == null ? name : name + " · " + number.format(counts[code]) + " harmonized hotspots";
  }

  function boundaryLayer(data) {
    return L.geoJSON(data, {onEachFeature(feature, layer) {
      const code = feature.properties.id;
      layer.bindTooltip(() => {
        const label = document.createElement("span");
        const local = feature.properties.name;
        label.textContent = local ? local + (districtCounts[code] == null ? "" :
          " · " + number.format(districtCounts[code]) + " detections") : areaLabel(code);
        return label;
      }, {direction: "top"});
      layer.on("click", () => {
        if (feature.properties.name || !state.value || areas.get(code)?.kind === "state") choose(code);
      });
    }});
  }

  function render() {
    byId("globalMonths").replaceChildren(...months.filter(row => String(row.yr) === year.value).map(row => {
      const tr = document.createElement("tr");
      for (const value of [monthName(row.mo), row.h, row.t, row.a, row.s, row.n, row.j]) {
        const td = document.createElement("td");
        td.textContent = value == null ? "Unavailable" : typeof value === "number" ? number.format(value) : value;
        tr.append(td);
      }
      return tr;
    }));
  }

  async function changeArea() {
    const id = ++areaRequest;
    loadDistricts();
    ++mapRequest;
    clearPoints();
    months = [];
    render();
    year.disabled = day.disabled = true;
    syncSummaryExport();
    byId("worldIndiaCalendar").hidden = true;
    const item = selected();
    const country = area.value;
    status.textContent = "Reading the selected area…";
    details.textContent = item?.name || "World";
    if (stateLayer?.country !== country) {
      stateLayer?.remove();
      stateLayer = undefined;
    }
    fit();
    restyle();
    if (!stateLayer && subdivisions.has(country)) {
      read("/api/global/subdivisions/" + encodeURIComponent(country)).then(data => {
        if (area.value !== country || stateLayer) return;
        stateLayer = boundaryLayer(data).addTo(flat);
        stateLayer.country = country;
        restyle();
        flatPoints.eachLayer(layer => layer.bringToFront());
        if (state.value) fit();
      }).catch(() => {
        if (area.value === country) details.textContent += " · Subdivision outlines unavailable.";
      });
    }
    try {
      const result = await read("/api/global/series?area=" + encodeURIComponent(selectedId()));
      if (id !== areaRequest) return;
      months = result.months;
      from.value = from.min = months.length ? monthKey(months[0]) : "";
      to.value = to.max = months.length ? monthKey(months.at(-1)) : "";
      from.max = to.max;
      to.min = from.min;
      renderMonthMatrix(byId("worldMatrix"), months, row => row.yr + "-" + String(row.mo).padStart(2, "0"), row => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.year = row.yr;
        button.dataset.month = row.mo;
        button.textContent = row.h == null ? "—" : number.format(row.h);
        button.title = monthName(row.mo) + " " + row.yr + " · " +
          (row.h == null ? "Harmonized total unavailable" : number.format(row.h) + " harmonized hotspots");
        button.onclick = () => {
          year.value = row.yr;
          month.value = row.mo;
          render();
          updateMap();
          loadDistrictTotals();
        };
        return button;
      });
      const years = [...new Set(months.map(row => row.yr))].reverse();
      const previous = year.value;
      year.replaceChildren(...years.map(value => new Option(value, value)));
      if (years.includes(Number(previous))) year.value = previous;
      year.disabled = !years.length;
      status.textContent = years.length ? result.area.name + " · " + years.at(-1) + "–" + years[0] : "No archived months for this area.";
      render();
      updateMap();
      loadDistrictTotals();
    } catch {
      if (id === areaRequest) status.textContent = "Global data is unavailable. Reload this page to try again.";
    }
  }

  async function loadDistricts() {
    const id = ++districtBoundaryRequest;
    ++districtRequest;
    districtLayer?.remove();
    districtLayer = undefined;
    districtCounts = {};
    districtPlatforms = {};
    district.replaceChildren(new Option("All local divisions", ""));
    district.disabled = true;
    byId("districtLabel").textContent = "Local division";
    districtStatus.textContent = "";
    if (!state.value) return;
    districtStatus.textContent = "Loading local boundaries…";
    try {
      const data = await read("/api/global/districts?area=" + encodeURIComponent(state.value));
      if (id !== districtBoundaryRequest) return;
      byId("districtLabel").textContent = data.label;
      data.features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
      district.append(...data.features.map(({properties}) => new Option(properties.name, properties.id)));
      if (!data.features.length) {
        districtStatus.textContent = "No second-level boundaries are available for this area.";
        return;
      }
      district.disabled = false;
      districtLayer = boundaryLayer(data).addTo(flat);
      flatPoints.eachLayer(layer => layer.bringToFront());
      restyle();
      if (!year.disabled) loadDistrictTotals();
    } catch {
      if (id === districtBoundaryRequest) districtStatus.textContent = "Local boundaries could not be loaded.";
    }
  }

  async function loadDistrictTotals() {
    if (!districtLayer || !year.value || year.disabled) return;
    const id = ++districtRequest;
    districtCounts = {};
    districtPlatforms = {};
    restyle();
    districtStatus.textContent = "Counting archived detections by local division…";
    const query = new URLSearchParams({area: state.value, year: year.value, month: month.value, sensor: sensor.value});
    try {
      const result = await read("/api/global/district-totals?" + query);
      if (id !== districtRequest) return;
      districtCounts = result.counts;
      districtPlatforms = result.platforms || {};
      districtStatus.textContent = result.missing ?
        "Local counts are incomplete because some archive files are unavailable." :
        "Local shading shows individual detections for the selected month and satellite filter.";
      restyle();
      updateSummary();
    } catch {
      if (id === districtRequest) districtStatus.textContent = "Local detection counts could not be loaded.";
    }
  }

  function changeDistrict() {
    if (!year.disabled) updateMap();
    fit();
    restyle();
  }

  const from = byId("globalFrom");
  const to = byId("globalTo");
  const summaryCsv = byId("globalSummaryCsv");
  const pointsCsv = byId("globalPointsCsv");
  const monthKey = row => row.yr + "-" + String(row.mo).padStart(2, "0");
  let pointExport = null;

  function exportCsv(name, header, rows) {
    const encode = value => '"' + String(value ?? "").replaceAll('"', '""') + '"';
    const content = [header, ...rows].map(row => row.map(encode).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], {type:"text/csv;charset=utf-8"}));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function summaryRows() {
    if (district.value || year.disabled || !from.value || !to.value ||
        !from.validity.valid || !to.validity.valid || from.value > to.value) return [];
    return months.filter(row => monthKey(row) >= from.value && monthKey(row) <= to.value);
  }

  function syncSummaryExport() {
    summaryCsv.disabled = !summaryRows().length;
    byId("globalExportStatus").textContent = district.value ?
      "Monthly harmonized summaries are available at the parent area level." :
      from.value && to.value && from.value > to.value ? "Choose an ordered month range." : "";
  }

  from.oninput = to.oninput = syncSummaryExport;
  summaryCsv.onclick = () => {
    const rows = summaryRows();
    if (!rows.length) return;
    exportCsv("embergrid-global-monthly.csv",
      ["area_id","area","month_utc","harmonized_estimate","harmonized_unit","terra_detections","aqua_detections","suomi_npp_detections","noaa20_detections","noaa21_detections","range_start","range_end","source"],
      rows.map(row => [selectedId(), selected()?.name || "World", monthKey(row), row.h,
        "Fire Harmony NOAA-20 VIIRS equivalent hotspots per month", row.t,row.a,row.s,row.n,row.j,
        from.value,to.value,"Fire Harmony v1 using NASA FIRMS"]));
  };
  pointsCsv.onclick = () => {
    if (!pointExport) return;
    const {result, filter, label} = pointExport;
    exportCsv("embergrid-displayed-detections.csv",
      ["area_id","local_division_id","area","date_utc","time_utc_hhmm","longitude","latitude","satellite","frp_mw","selected_year","selected_month","selected_day","selected_satellite","matching_detections_in_available_partitions","truncated","missing_partitions","source"],
      result.points.map(([lon,lat,day,time,platform,power]) =>
        [filter.area,filter.district,label,day,String(time).padStart(4,"0"),lon,lat,platform,power,
          filter.year,filter.month,filter.day,filter.sensor,result.total,result.truncated,result.missing,"Fire Harmony v1 using NASA FIRMS"]));
  };

  function updateSummary() {
    syncSummaryExport();
    const link = byId("worldIndiaCalendar");
    link.hidden = !(area.value === "IND" && district.value);
    if (!link.hidden) link.href = "/calendar?district=" + encodeURIComponent(district.value) +
      "&month=" + year.value + "-" + String(month.value).padStart(2, "0");
    byId("worldMatrixPanel").hidden = Boolean(district.value);
    document.querySelectorAll("#worldMatrix button").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.year === year.value && button.dataset.month === month.value)));
    byId("worldMonthly").hidden = Boolean(district.value);
    const period = monthName(month.value) + " " + year.value;
    if (district.value) {
      const total = districtCounts[district.value];
      details.textContent = district.selectedOptions[0].textContent + " · " + period +
        (total == null ? "" : " · " + number.format(total) + " detections");
      const platforms = districtPlatforms[district.value];
      if (platforms) {
        const sensors = [["Aqua", "Aqua MODIS"], ["Suomi-NPP", "Suomi NPP VIIRS"]];
        const visible = sensors.filter(([key]) => sensor.value === "all" || sensor.value === key);
        if (visible.length) details.textContent += " · " +
          visible.map(([key, label]) => label + " " + number.format(platforms[key] || 0)).join(" · ");
      }
      return;
    }
    const row = months.find(row => String(row.yr) === year.value && String(row.mo) === month.value);
    details.textContent = (selected()?.name || "World") + " · " + period + " · " +
      (row?.h == null ? "Monthly total unavailable" : number.format(row.h) + " harmonized hotspots");
  }

  function clearPoints() {
    pointExport = null;
    pointsCsv.disabled = true;
    pointRequest?.abort();
    points = [];
    pointStatus.textContent = "";
    flatPoints.clearLayers();
    markers?.removeAll();
    tooltip.hidden = true;
    viewer?.scene.requestRender();
  }

  function showPoints() {
    for (const [lon, lat, day, time, platform, power] of points) {
      const label = platform + " · " + day + " " + String(time).padStart(4, "0") + " UTC · " +
        (power == null ? "FRP unavailable" : number.format(power) + " MW");
      const text = document.createElement("span");
      text.textContent = label;
      const markerColor = platform === "Aqua" ? "#ffad66" : platform === "Suomi-NPP" ? "#88edd4" : "#d8b7ff";
      L.circleMarker([lat, lon], {radius: 2.5, stroke: false, fillColor: markerColor, fillOpacity: .9})
        .bindTooltip(text).addTo(flatPoints);
      markers?.add({position: C.Cartesian3.fromDegrees(lon, lat, 400),
        pixelSize: 5, color: C.Color.fromCssColorString(markerColor), id: {hotspot: label}});
    }
    flatPoints.eachLayer(layer => layer.bringToFront());
    viewer?.scene.requestRender();
  }

  async function updateMap() {
    const id = ++mapRequest;
    clearPoints();
    if (!year.value || year.disabled) return;
    const previousDay = day.value;
    const days = new Date(Number(year.value), Number(month.value), 0).getDate();
    day.replaceChildren(new Option("All days", ""),
      ...Array.from({length: days}, (_, i) => new Option(i + 1, i + 1)));
    day.value = Number(previousDay) <= days ? previousDay : "";
    day.disabled = !["country", "state"].includes(selected()?.kind);
    loadPoints();
    updateSummary();
    const key = year.value + "-" + month.value;
    if (!overviewCache.has(key)) {
      overviewCache.set(key, read("/api/global/overview?year=" + year.value + "&month=" + month.value)
        .catch(error => { overviewCache.delete(key); throw error; }));
    }
    try {
      const result = await overviewCache.get(key);
      if (id !== mapRequest) return;
      counts = result;
      restyle();
    } catch {
      if (id === mapRequest) details.textContent += " · Map totals unavailable.";
    }
  }

  area.onchange = () => { populateStates(); changeArea(); };
  state.onchange = changeArea;
  district.onchange = changeDistrict;
  year.onchange = () => { render(); updateMap(); loadDistrictTotals(); };
  month.onchange = () => { updateMap(); loadDistrictTotals(); };
  day.onchange = () => { clearPoints(); if (!year.disabled) loadPoints(); };
  sensor.onchange = () => { clearPoints(); if (!year.disabled) { loadPoints(); loadDistrictTotals(); } };
  byId("globalFit").onclick = fit;
  setupFullscreen(byId("worldWorkspace"), byId("worldFullscreen"),
    "world map", () => requestAnimationFrame(resize));
  async function loadPoints() {
    if (!year.value || !["country", "state"].includes(selected()?.kind)) return;
    const controller = new AbortController();
    pointRequest = controller;
    const query = new URLSearchParams({area: selectedId(), district: district.value, day: day.value, year: year.value, month: month.value, sensor: sensor.value});
    pointStatus.textContent = "Loading hotspot detections…";
    try {
      const result = await read("/api/global/points?" + query, controller.signal);
      if (controller.signal.aborted) return;
      points = result.points;
      pointExport = {result, filter:Object.fromEntries(query),
        label:district.value ? district.selectedOptions[0].textContent : selected()?.name || "World"};
      pointsCsv.disabled = !points.length;
      showPoints();
      pointStatus.textContent = number.format(points.length) + " of " + number.format(result.total) + " archived detections shown" +
        (day.value ? " · " + year.value + "-" + String(month.value).padStart(2, "0") + "-" + day.value.padStart(2, "0") + " UTC" : "") +
        (result.truncated ? " · display limit reached" : "") +
        (result.missing ? " · " + result.missing + " regional archive files unavailable" : "");
    } catch {
      if (!controller.signal.aborted) pointStatus.textContent = "Hotspot files or their reader are unavailable.";
    }
  }

  read("/api/global/areas").then(items => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      areas.set(item.id, item);
      if (item.kind === "state") {
        if (!subdivisions.has(item.country_iso3)) subdivisions.set(item.country_iso3, []);
        subdivisions.get(item.country_iso3).push(item);
      }
    }
    area.replaceChildren(new Option("World", "WORLD"),
      ...items.filter(item => item.kind !== "state").map(item => new Option(item.name, item.id)));
    area.disabled = false;
    changeArea();
    return read("/api/global/globe");
  }).then(async data => {
    data.features = data.features.filter(feature => areas.get(feature.properties.id)?.kind === "country");
    countryLayer = boundaryLayer(data).addTo(flat);
    countryLayer.bringToBack();
    if (viewer) {
      const source = await C.GeoJsonDataSource.load(data, {clampToGround: true, stroke: C.Color.TRANSPARENT});
      for (const entity of source.entities.values) {
        if (!entity.polygon) continue;
        const code = entity.properties.id.getValue();
        entity.countryCode = code;
        entity.polygon.arcType = C.ArcType.GEODESIC;
        if (!globeCountries.has(code)) globeCountries.set(code, []);
        globeCountries.get(code).push(entity);
      }
      await viewer.dataSources.add(source);
    }
    restyle();
  }).catch(() => {
    if (area.disabled) status.textContent = "The global archive is unavailable. Reload this page to try again.";
    else details.textContent += " · Country outlines unavailable.";
  });
})();
