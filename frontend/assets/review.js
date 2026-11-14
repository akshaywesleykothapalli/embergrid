function compareReview(months, key, areaIndex, sensor) {
  const year = Number(key.slice(0, 4));
  const month = key.slice(5);
  const current = months[key]?.[areaIndex]?.[sensor];
  const history = [];
  for (let previous = year - 1; previous >= 2012 && history.length < 5; previous--) {
    const date = previous + "-" + month;
    if (sensor === 1 && date === "2012-01") continue;
    const value = months[date]?.[areaIndex]?.[sensor];
    if (Number.isFinite(value)) history.push({year: previous, value});
  }
  const values = history.map(entry => entry.value).sort((a, b) => a - b);
  const median = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null;
  const low = values[0];
  const high = values.at(-1);
  const available = Number.isFinite(current) && !(sensor === 1 && key === "2012-01");
  const direction = !available || values.length < 3 ? "limited" :
    current > high ? "above" : current < low ? "below" : "within";
  return {current, available, history, median, low, high, direction};
}

function renderReview({key, scope, stateId, districtId, zone, month}) {
  const archive = window.indiaReviewSummary;
  const areaIndex = districtId !== null ? 43 + districtId :
    stateId !== null ? 7 + stateId : zone ? 1 + archive.zones.indexOf(zone) : 0;
  const results = [0, 1].map(sensor => compareReview(archive.months, key, areaIndex, sensor));
  const [aqua, viirs] = results.map(result => result.direction);
  let badge = "Within historical ranges";
  let action = "Both sensors’ counts fall within their own historical ranges for this month.";
  let tone = "neutral";
  if (aqua === "limited" || viirs === "limited") {
    badge = "Limited comparison";
    action = "At least one sensor lacks a comparable month or enough earlier years. Use the raw counts and check the underlying observations before drawing a trend conclusion.";
  } else if (aqua === "above" && viirs === "above") {
    badge = "Prioritize review";
    tone = "attention";
    action = "Both sensors exceeded their own historical ranges. Use the map to identify where detections were concentrated, then check local reports and satellite coverage.";
  } else if (aqua !== viirs) {
    badge = "Sensors differ";
    tone = "attention";
    action = "The sensors tell different stories this month. Check where and when the hotspots were detected, and review observation coverage before interpreting the change.";
  } else if (aqua === "below") {
    badge = "Both sensors below range";
    action = "Both sensors reported fewer detections than in the comparison years. Check observation coverage before interpreting the decrease as less burning.";
  }
  document.getElementById("reviewPeriod").textContent = scope + " · " + month + " " + key.slice(0, 4);
  const badgeElement = document.getElementById("reviewBadge");
  badgeElement.textContent = badge;
  badgeElement.dataset.tone = tone;
  document.getElementById("reviewAction").textContent = action;
  const format = new Intl.NumberFormat("en-IN", {maximumFractionDigits: 1});
  const cards = results.map((result, sensor) => {
    const card = document.createElement("article");
    const heading = document.createElement("h3");
    heading.textContent = sensor === 0 ? "Aqua MODIS" : "Suomi NPP VIIRS";
    const value = document.createElement("strong");
    value.textContent = Number.isFinite(result.current) ?
      format.format(result.current) + (result.available ? " detections" : " detections · partial month") : "Unavailable";
    const baseline = document.createElement("p");
    baseline.textContent = result.history.length < 3 ?
      result.history.length + " earlier comparable years · need at least 3" :
      "Historical median " + format.format(result.median) + " · range " + format.format(result.low) +
      "–" + format.format(result.high) + " · " + result.history.length + " years";
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Earlier years";
    const entries = document.createElement("p");
    entries.textContent = result.history.map(entry => entry.year + " " + format.format(entry.value)).join(" · ") || "No earlier archive years.";
    details.append(summary, entries);
    card.append(heading, value, baseline, details);
    return card;
  });
  document.getElementById("reviewSensors").replaceChildren(...cards);
}
