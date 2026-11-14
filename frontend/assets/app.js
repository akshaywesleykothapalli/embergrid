const {mode, area, bounds, seasons} = window.fireData;
const byId = (id) => document.getElementById(id);
const seasonSelect = byId("season");
const sensors = ["MODIS", "VIIRS"];
const holdout = seasons.at(-1);
const hasComparableViirs = period => period.start >= "2012-01-20";
const format = new Intl.DateTimeFormat("en-IN", {day: "numeric", month: "short", timeZone: "UTC"});
const dateLabel = (day) => format.format(new Date(day + "T00:00:00Z"));
const cellCount = (points) => new Set(points.map(([lon, lat]) =>
  Math.floor(lon / CELL_SIZE) + "," + Math.floor(lat / CELL_SIZE))).size;
const count = (week, sensor) => cellCount(week[sensor]);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const rainfall = window.fireContext.rain;
const autumnWeeks = season => season.weeks.filter(week => week.start.slice(5, 7) === "10" || week.start.slice(5, 7) === "11");
const tests = seasons.map(season => {
  const training = seasons.filter(item => item !== season).flatMap(autumnWeeks);
  const modis = sum(training.map(week => count(week, "MODIS")));
  const factor = modis ? sum(training.map(week => count(week, "VIIRS"))) / modis : null;
  const error = scale => sum(autumnWeeks(season).map(week =>
    Math.abs(count(week, "MODIS") * scale - count(week, "VIIRS")))) / autumnWeeks(season).length;
  return {year: season.year, factor, raw: error(1), adjusted: factor === null ? null : error(factor)};
});
byId("validation").innerHTML = '<p>Mean autumn weekly error against VIIRS, in grid cells. Each season was tested using the other seasons.</p>' +
  '<div class="validation-row"><span>Season</span><strong>Raw → adjusted</strong></div>' +
  tests.map(test => '<div class="validation-row"><span>' + test.year + '</span><strong>' +
    test.raw.toFixed(1) + ' → ' + (test.adjusted?.toFixed(1) ?? 'Unavailable') + '</strong></div>').join('');
let weekIndex = holdout.fullYear ? 9 : 0;
let timer;

byId("source").textContent = mode;
byId("area").textContent = area;
seasons.forEach(({year}) => seasonSelect.add(new Option(year, year)));
seasonSelect.value = holdout.year;
const selectedSeason = () => seasons.find(({year}) => year === Number(seasonSelect.value));

const focusControl = byId("focusArea");
const timeView = byId("timeView");
timeView.value = "month";
const jumpMonth = byId("jumpMonth");
const monthlyFormat = new Intl.DateTimeFormat("en-IN", {month: "long", timeZone: "UTC"});
const monthlyPeriods = new Map(seasons.map(season => [season.year, (season.fullYear ? Array.from({length: 12}, (_, i) => i + 1) : [10, 11]).map(month => {
  const prefix = season.year + "-" + String(month).padStart(2, "0");
  return {
    start: prefix + "-01",
    end: new Date(Date.UTC(season.year, month, 0)).toISOString().slice(0, 10),
    MODIS: season.weeks.flatMap(week => week.MODIS).filter(point => point[2].startsWith(prefix)),
    VIIRS: season.weeks.flatMap(week => week.VIIRS).filter(point => point[2].startsWith(prefix))
  };
})]));
const periods = season => timeView.value === "month" ? monthlyPeriods.get(season.year) : season.weeks;

const focusedWeek = week => filterWeek(week, bounds, focusControl.value);
initMap(bounds);

function renderEvidence(start, end) {
  byId("evidencePeriod").textContent = dateLabel(start) + " – " + dateLabel(end) + " · " +
    focusControl.selectedOptions[0].textContent;
  const cards = seasons.map(season => {
    const period = focusedWeek(periods(season)[weekIndex]);
    const cells = analyzeCells(period);
    const comparable = hasComparableViirs(period);
    const shared = cells.filter(cell => cell.MODIS && cell.VIIRS).length;
    const card = document.createElement("article");
    card.className = "evidence-year";
    const heading = document.createElement("h3");
    heading.textContent = season.year + (season === selectedSeason() ? " · Selected" : "");
    card.append(heading);
    for (const sensor of sensors) {
      const times = period[sensor].flatMap(point => point[3] ? [point[3].slice(11, 16)] : [])
        .filter(time => time >= "06:00" && time < "18:00").sort();
      const row = document.createElement("p");
      row.textContent = (sensor === "MODIS" ? "Aqua MODIS" : "Suomi NPP VIIRS") + " · " +
        count(period, sensor) + " cells · " +
        (times.length ? times[0] + "–" + times.at(-1) + " IST" : "No daytime timestamps");
      if (sensor === "VIIRS" && !comparable) row.textContent += " · archive begins 20 Jan 2012";
      card.append(row);
    }
    const footer = document.createElement("p");
    footer.className = "evidence-shared";
    footer.textContent = shared + " shared cells";
    card.append(footer);
    return card;
  });
  byId("evidenceYears").replaceChildren(...cards);
}

function render() {
  const season = selectedSeason();
  const unit = timeView.value;
  const monthly = unit === "month";
  const selectedPeriods = periods(season);
  jumpMonth.replaceChildren(...monthlyPeriods.get(season.year).map(item => new Option(
    monthlyFormat.format(new Date(item.start + "T00:00:00Z")), item.start.slice(5, 7))));
  byId("jumpControl").hidden = monthly;
  const week = focusedWeek(selectedPeriods[weekIndex]);
  activeMonth = week.start.slice(5, 7);
  jumpMonth.value = activeMonth;
  const periodLabel = day => monthly ? monthlyFormat.format(new Date(day + "T00:00:00Z")) : dateLabel(day);
  byId("periodHeading").textContent = monthly ? "Selected month" : "Selected week";
  byId("historyHeading").textContent = "Same " + unit + " in other years";
  byId("export").textContent = "↓ Download " + unit + " CSV";
  const factor = tests.find(test => test.year === season.year).factor;
  const fullArea = focusControl.value === "all";
  const canAdjust = !monthly && fullArea && ["10", "11"].includes(activeMonth) && factor !== null;
  byId("adjust").disabled = !canAdjust;
  byId("focusLabel").textContent = focusControl.selectedOptions[0].textContent;
  const cells = analyzeCells(week);
  const shared = cells.filter(cell => cell.MODIS && cell.VIIRS).length;
  const modisOnly = cells.filter(cell => cell.MODIS && !cell.VIIRS).length;
  const viirsOnly = cells.length - shared - modisOnly;
  byId("agreementStats").textContent = cells.length
    ? shared + " shared · " + modisOnly + " MODIS only · " + viirsOnly + " VIIRS only"
    : "No hotspots were reported in this selection.";
  const agreement = byId("sensor").value === "agreement";
  byId("agreementLegend").hidden = !agreement;
  byId("pointLegend").hidden = agreement;
  const rainData = monthly ? window.fireContext.monthlyRain : rainfall;
  const autumnRain = rainData[season.year] || [];
  const rain = selectedPeriods.map(item => {
    const month = Number(item.start.slice(5, 7));
    return monthly ? autumnRain[month - 10] : autumnRain[autumnWeeks(season).indexOf(item)];
  });
  const hasRain = rain.some(value => value != null);
  const maxRain = Math.max(1, ...Object.values(rainData).flat().filter(value => value !== null));
  byId("rainNote").hidden = !hasRain;
  const rainSummary = byId("rainSummary");
  rainSummary.hidden = !hasRain;
  if (hasRain) rainSummary.textContent = rain[weekIndex] == null ? "Rainfall unavailable for this period." :
    rain[weekIndex].toFixed(1) + " mm rainfall · NASA POWER estimate near Sangrur";
  const weekButtons = byId("weeks");
  const availableCloudDays = window.cloudDates.filter(day => day.startsWith(season.year + "-")).length;
  byId("coverageNote").textContent = availableCloudDays
    ? "Aqua daytime cloud imagery · " + availableCloudDays + " dates in this season · fire-mask coverage unverified"
    : "Fire-mask coverage unverified · cloud imagery bundled for the 2023 pilot";
  const focusedIndex = [...weekButtons.children].indexOf(document.activeElement);
  const peak = Math.max(1, ...selectedPeriods.map((item) => count(focusedWeek(item), "VIIRS")));
  weekButtons.classList.toggle("monthly", monthly);
  weekButtons.replaceChildren();
  selectedPeriods.forEach((item, index) => {
    if (!monthly && item.start.slice(5, 7) !== activeMonth) return;
    const button = document.createElement("button");
    const total = count(focusedWeek(item), "VIIRS");
    button.type = "button";
    button.style.setProperty("--heat", 24 * total / peak + "%");
    button.setAttribute("aria-pressed", index === weekIndex);
    button.setAttribute("aria-label", periodLabel(item.start) + ", " + total + " VIIRS grid cells");
    const value = document.createElement("strong");
    value.textContent = hasComparableViirs(item) ? total : item.end < "2012-01-20" ? "—" : total + "*";
    if (!hasComparableViirs(item)) {
      button.title = "VIIRS archive begins 20 January 2012";
      button.setAttribute("aria-label", periodLabel(item.start) + ", " + button.title);
    }
    button.append(periodLabel(item.start), value);
    if (hasRain) {
      const strip = document.createElement("span");
      strip.className = "rain";
      strip.textContent = rain[index] == null ? "—" : rain[index].toFixed(1) + " mm";
      strip.style.setProperty("--rain", 100 * (rain[index] ?? 0) / maxRain + "%");
      button.append(strip);
      button.setAttribute("aria-label", button.getAttribute("aria-label") + ", " + strip.textContent + " rainfall");
    }
    button.addEventListener("click", () => { stop(); weekIndex = index; render(); });
    weekButtons.append(button);
  });
  if (focusedIndex >= 0) weekButtons.children[focusedIndex]?.focus();
  const end = week.end ?? (selectedPeriods[weekIndex + 1]
    ? new Date(Date.parse(selectedPeriods[weekIndex + 1].start) - 86400000).toISOString().slice(0, 10)
    : season.year + (season.fullYear ? "-12-31" : "-11-30"));
  byId("weekRange").textContent = monthly ? periodLabel(week.start) + " " + season.year :
    dateLabel(week.start) + " – " + dateLabel(end) + " " + season.year;
  renderMap(week, byId("sensor").value);
  updateObservation(week.start, end);
  renderEvidence(week.start, end);
  const adjusted = canAdjust && byId("adjust").checked;
  const totals = [count(week, "MODIS") * (adjusted ? factor : 1), count(week, "VIIRS")];
  const max = Math.max(1, ...totals);
  byId("bars").innerHTML = totals.map((value, index) =>
    '<div class="bar"><div><span>' + (index === 0 && adjusted ? "MODIS (estimated)" : sensors[index]) +
    '</span><strong>' + (index === 1 && week.end < "2012-01-20" ? '—' : Math.round(value)) + '</strong></div><div class="track"><div class="fill" style="width:' +
    (100 * value / max) + '%"></div></div></div>').join("");
  const comparison = seasons.filter(item => item.year <= season.year &&
    hasComparableViirs(periods(item)[weekIndex]));
  const comparisonMax = Math.max(1, ...comparison.map(item => count(focusedWeek(periods(item)[weekIndex]), "VIIRS")));
  byId("history").innerHTML = comparison.map(item => {
    const value = count(focusedWeek(periods(item)[weekIndex]), "VIIRS");
    return '<div class="history-row"><span>' + item.year + '</span><div class="track"><div class="fill" style="width:' +
      (100 * value / comparisonMax) + '%"></div></div><strong>' + value + '</strong></div>';
  }).join("");
  const prior = seasons.filter(({year}) => year < season.year).map((item) => count(focusedWeek(periods(item)[weekIndex]), "VIIRS"));
  const status = totals[1] > Math.max(...prior) ? "Above the earlier range. " :
    totals[1] < Math.min(...prior) ? "Below the earlier range. " : "Within the earlier range. ";
  byId("baseline").textContent = !hasComparableViirs(week) ? "Suomi NPP VIIRS archive begins 20 January 2012. This period is excluded from historical comparisons." : prior.length
    ? status + "VIIRS detected activity in " + totals[1] + " grid cells. The same " + unit + " ranged from " +
      Math.min(...prior) + " to " + Math.max(...prior) + " across " + prior.length +
      (prior.length === 1 ? " earlier season." : " earlier seasons.")
    : "Choose a later season to compare this " + unit + " with earlier years.";
}

function stop() {
  clearInterval(timer);
  timer = undefined;
  byId("play").textContent = "▶ Play year";
}

byId("play").addEventListener("click", () => {
  if (timer) { stop(); return; }
  weekIndex = 0;
  render();
  byId("play").textContent = "❚❚ Pause";
  timer = setInterval(() => {
    if (weekIndex === periods(selectedSeason()).length - 1) { stop(); return; }
    weekIndex++;
    render();
  }, 850);
});
let activeMonth = periods(selectedSeason())[weekIndex].start.slice(5, 7);
timeView.addEventListener("change", () => {
  stop();
  weekIndex = Math.max(0, periods(selectedSeason()).findIndex(period => period.start.slice(5, 7) === activeMonth));
  render();
});
jumpMonth.addEventListener("change", () => {
  stop();
  weekIndex = periods(selectedSeason()).findIndex(period => period.start.slice(5, 7) === jumpMonth.value);
  render();
});
seasonSelect.addEventListener("change", () => { stop(); render(); });
byId("export").addEventListener("click", () => {
  const week = focusedWeek(periods(selectedSeason())[weekIndex]);
  const filter = byId("sensor").value;
  const rows = sensors.filter((sensor) => filter === "both" || filter === "agreement" || filter === sensor)
    .flatMap((sensor) => week[sensor].map(([lon, lat, day, timestamp]) => [mode, sensor, sensor === "MODIS" ? "Aqua" : "Suomi NPP", day, timestamp ?? "", lat, lon].join(",")));
  const csv = ["source,sensor,platform,local_date,acquired_at_ist,latitude,longitude", ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], {type: "text/csv"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hotspots-" + timeView.value + "-" + focusControl.value + "-" + week.start + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
focusControl.addEventListener("change", () => {
  stop();
  showFocus(focusBounds(bounds, focusControl.value), focusControl.value !== "all");
  render();
});
byId("sensor").addEventListener("change", render);
byId("adjust").addEventListener("change", render);
render();
