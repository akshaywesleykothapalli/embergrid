const {states, districts} = window.indiaBoundaries;
let months = [];
let districtLabel = "";
const el = id => document.getElementById(id);
const format = new Intl.NumberFormat("en-IN", {maximumFractionDigits: 1});
const methodName = {raw: "Raw MODIS", global: "Overall scaling", seasonal: "Seasonal scaling"};
let visible = [];
let chart = "";
const first = el("first");
const last = el("last");
const state = el("calendarState");
const district = el("calendarDistrict");
const sorted = features => [...features].sort((a, b) => a.properties.name.localeCompare(b.properties.name));
function options(control, label, features) {
  control.replaceChildren(new Option(label, ""), ...sorted(features).map(({properties}) =>
    new Option(properties.name, properties.id)));
}
options(state, "Choose a state", states);
options(district, "Choose a district", []);
let request = 0;
let confirmedDistrict = "";

const showDistrict = el("showDistrict");
function selectionChanged() {
  request++;
  confirmedDistrict = "";
  visible = [];
  chart = "";
  el("districtCalendar").hidden = true;
  el("districtBenchmark").hidden = true;
  showDistrict.disabled = !district.value;
  el("districtStatus").textContent = district.value
    ? "Click Show details to calculate the selected district’s calendar."
    : "Choose a state and district, then click Show details.";
}
async function loadDistrict() {
  const id = ++request;
  el("districtCalendar").hidden = true;
  el("districtBenchmark").hidden = true;
  if (!district.value) {
    el("districtStatus").textContent = "Choose a state and district to calculate a calendar from the historical archive.";
    return;
  }
  const selectedId = district.value;
  showDistrict.disabled = true;
  el("districtStatus").textContent = "Calculating the district calendar…";
  try {
    const response = await fetch("/api/calendar/district/" + encodeURIComponent(selectedId));
    if (!response.ok) throw new Error("Archive unavailable");
    const result = await response.json();
    if (id !== request || district.value !== selectedId) return;
    confirmedDistrict = selectedId;
    months = result.months;
    districtLabel = result.district + ", " + result.state;
    el("districtStatus").textContent = districtLabel + " · Calculated from historical NASA FIRMS observations";
    for (const input of [first, last]) {
      input.min = months[0].month;
      input.max = months.at(-1).month;
    }
    first.value ||= first.min;
    last.value ||= last.max;
    el("benchmarkMethod").textContent = methodName[result.method] +
      " selected on 2016–2022 rolling tests and frozen before evaluating 2023–2025. " +
      result.pairedMonths + " training months had detections from both sensors. " +
      (result.validated ? "The adjustment passed the district validation rule." :
        "The district did not pass the validation rule. Earlier MODIS counts are available in month details and CSV.");
    el("benchmarkRows").innerHTML = result.evaluation.map(row =>
      "<tr>" + [row.year, row.raw, row.global, row.seasonal].map(value => "<td>" + value + "</td>").join("") + "</tr>"
    ).join("");
    el("districtCalendar").hidden = false;
    el("districtBenchmark").hidden = false;
    render();
  } catch {
    if (id === request) el("districtStatus").textContent = "The district archive could not load. Click Show details to retry.";
  } finally {
    if (id === request) showDistrict.disabled = !district.value;
  }
}
state.onchange = () => {
  options(district, "Choose a district", districts.filter(f => String(f.properties.state) === state.value));
  district.disabled = !state.value || district.options.length < 2;
  selectionChanged();
};
district.onchange = selectionChanged;
showDistrict.onclick = loadDistrict;
const escapeXml = text => text.replace(/[&<>]/g, character => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"})[character]);

function describe(row) {
  const monthName = new Intl.DateTimeFormat("en-IN", {month: "long", year: "numeric", timeZone: "UTC"})
    .format(new Date(row.month + "-01T00:00:00Z"));
  return monthName + " · " + (row.value === null ? "Estimate unavailable" : format.format(row.value) + " cells · " + row.source) +
    " · Raw MODIS " + format.format(row.modis) +
    " · Observed VIIRS " + (row.viirs === null ? "unavailable" : format.format(row.viirs)) +
    (row.baseline === null ? " · Limited earlier history" : " · Earlier same-month median " + format.format(row.baseline)) +
    (row.above ? " · Above the earlier range" : "");
}

let inspected = 0;
function inspect(index) {
  inspected = index;
  const tooltip = el("chartTooltip");
  tooltip.textContent = describe(visible[index]);
  tooltip.hidden = false;
  tooltip.style.left = (100 * (55 + (index + .5) * 815 / visible.length) / 900) + "%";
  tooltip.classList.toggle("align-left", index >= visible.length / 2);
  const cursor = el("chartCursor");
  const x = 55 + (index + .5) * 815 / visible.length;
  cursor.setAttribute("x1", x);
  cursor.setAttribute("x2", x);
  cursor.setAttribute("visibility", "visible");
}
function hideInspection() {
  el("chartTooltip").hidden = true;
  el("chartCursor")?.setAttribute("visibility", "hidden");
}
const chartElement = el("calendarChart");
function targetIndex(event) {
  const hit = event.target.closest("[data-month-index]");
  return hit ? Number(hit.dataset.monthIndex) : -1;
}
chartElement.onpointermove = event => {
  const index = targetIndex(event);
  if (index >= 0) inspect(index);
  else hideInspection();
};
chartElement.onpointerleave = hideInspection;
chartElement.onblur = hideInspection;
chartElement.onclick = event => {
  const index = targetIndex(event);
  if (index >= 0) {
    select(visible[index], el("calendarGrid").children[index]);
    inspect(index);
  }
};
chartElement.onkeydown = event => {
  if (!visible.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 :
    Math.max(0, Math.min(visible.length - 1, inspected + (event.key === "ArrowLeft" ? -1 : 1)));
  inspect(index);
  select(visible[index], el("calendarGrid").children[index]);
};

function select(row, button) {
  const old = el("calendarGrid").querySelector("[aria-pressed=true]");
  if (old) old.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-pressed", "true");
  el("monthDetail").textContent = describe(row);
}

function render() {
  if (!confirmedDistrict || confirmedDistrict !== district.value) return;
  const filtered = months.filter(row => row.month >= first.value && row.month <= last.value);
  if (first.value > last.value || !filtered.length) {
    el("rangeError").textContent = "Choose an ordered date range within the archive.";
    return;
  }
  el("rangeError").textContent = "";
  visible = filtered;
  hideInspection();
  inspected = visible.length - 1;
  const max = Math.max(1, ...visible.flatMap(row => [row.value, row.baseline]));
  const y = value => 158 - 108 * value / max;
  const guides = [0, .5, 1].map(fraction => {
    const level = fraction * max;
    return '<line x1="55" x2="870" y1="' + y(level) + '" y2="' + y(level) +
      '" stroke="#35483d"/><text x="50" y="' + (y(level) + 4) +
      '" text-anchor="end" fill="#abc8b5" font-size="10">' + format.format(level) + '</text>';
  }).join("");
  const step = 815 / visible.length;
  chart = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 195" role="img" aria-label="Monthly district hotspot activity">' +
    '<rect width="900" height="195" rx="9" fill="#121b16"/><text x="30" y="20" fill="#ecf5ed" font-size="13">' + escapeXml(districtLabel) + ' · monthly occupied grid cells</text>' +
    '<text x="30" y="37" fill="#abc8b5" font-size="11">Teal: VIIRS observed · Amber: MODIS estimate · Violet: above earlier range</text>' +
    guides + visible.map((row, i) => {
      if (row.value === null) return "";
      const height = 108 * row.value / max;
      return '<rect x="' + (55 + i * step) + '" y="' + (158 - height) + '" width="' + Math.max(1, step - 1) +
        '" height="' + height + '" fill="' + (row.source === "VIIRS" ? "#88edd4" : "#ffae6d") +
        '"' + (row.above ? ' stroke="#d7bcff"' : '') + '/>';
    }).join("") + '<path fill="none" stroke="#e8ecda" stroke-width="1.5" stroke-dasharray="4 3" d="' +
    visible.map((row, i) => row.baseline === null ? "" :
      (i && visible[i - 1].baseline !== null ? "L" : "M") + (55 + (i + .5) * step) + " " + y(row.baseline)).join(" ") +
    '"/><line id="chartCursor" x1="55" x2="55" y1="50" y2="158" stroke="#fff" visibility="hidden"/><text x="55" y="180" fill="#d4e4da" font-size="12">' + visible[0].month +
    '</text><text x="870" y="180" text-anchor="end" fill="#d4e4da" font-size="12">' + visible.at(-1).month + '</text></svg>';
  chartElement.innerHTML = chart;
  const svg = chartElement.querySelector("svg");
  for (const [index, row] of visible.entries()) {
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hit.setAttribute("x", 55 + index * step);
    hit.setAttribute("y", 46);
    hit.setAttribute("width", step);
    hit.setAttribute("height", 116);
    hit.setAttribute("fill", "transparent");
    hit.dataset.monthIndex = index;
    const title = document.createElementNS(hit.namespaceURI, "title");
    title.textContent = describe(row);
    hit.append(title);
    svg.append(hit);
  }
  const buttons = visible.map(row => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = (row.source === "VIIRS" ? "" : "estimated ") + (row.above ? "above" : "");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", row.month + ", " + (row.value === null ? row.source : format.format(row.value) + " cells, " + row.source));
    const count = document.createElement("strong");
    count.textContent = row.value === null ? "—" : format.format(row.value);
    button.append(row.month, count);
    button.onclick = () => select(row, button);
    return button;
  });
  el("calendarGrid").replaceChildren(...buttons);
  select(visible.at(-1), buttons.at(-1));
}

function download(filename, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], {type}));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
el("calendarFilters").onsubmit = event => { event.preventDefault(); render(); };
el("csv").onclick = () => download("district-harmonized.csv",
  ["district,month,harmonized_cells,source,modis_cells,viirs_cells,historical_median,above_range",
    ...visible.map(row => ['"' + districtLabel.replaceAll('"', '""') + '"', row.month, row.value, row.source, row.modis, row.viirs, row.baseline, row.above].join(","))].join("\n"), "text/csv");
el("svg").onclick = () => download("district-harmonized.svg", chart, "image/svg+xml");

const requested = new URLSearchParams(location.search).get("district");
const selected = districts.find(feature => String(feature.properties.id) === requested);
if (selected) {
  state.value = selected.properties.state;
  state.onchange();
  district.value = selected.properties.id;
  selectionChanged();
}

setupFullscreen(el("chartWorkspace"), el("chartFullscreen"), "chart", hideInspection);
