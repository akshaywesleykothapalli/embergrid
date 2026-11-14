// The available imagery dates are bundled in observation/dates.js.
let cloudOverlay;
let observationWeek;
const cloudDay = document.getElementById("cloudDay");
const cloudControls = document.getElementById("cloudControls");
const coverageStatus = document.getElementById("coverageStatus");

function drawObservation() {
  if (cloudOverlay) fireMap.removeLayer(cloudOverlay);
  cloudOverlay = undefined;
  const day = cloudDay.value;
  if (!day) return;
  if (!fireMap.getPane("cloudContext")) {
    fireMap.createPane("cloudContext").style.zIndex = "350";
  }
  cloudOverlay = L.imageOverlay("/assets/observation/" + day + ".png", [[29.88, 75.35], [30.62, 76.45]], {
    pane: "cloudContext", opacity: 0.62,
    attribution: '<a href="https://www.earthdata.nasa.gov/data/tools/gibs">NASA GIBS Aqua daytime cloud fraction</a>'
  }).addTo(fireMap);
  const url = new URL("https://worldview.earthdata.nasa.gov/");
  url.searchParams.set("t", day + "-T12:00:00Z");
  url.searchParams.set("v", "75.35,29.88,76.45,30.62");
  url.searchParams.set("l", "MODIS_Aqua_Cloud_Fraction_Day,MODIS_Aqua_CorrectedReflectance_TrueColor");
  document.getElementById("worldview").href = url.href;
}

function updateObservation(start, end) {
  if (observationWeek === start) return;
  observationWeek = start;
  const dates = window.cloudDates.filter(day => day >= start && day <= end);
  cloudControls.hidden = !dates.length;
  cloudDay.replaceChildren(new Option("Overlay off", ""));
  dates.forEach(day => cloudDay.add(new Option(day + " UTC", day)));
  coverageStatus.textContent = dates.length
    ? "Fire-mask coverage unverified · " + dates.length + " daily cloud images available"
    : "Fire-mask coverage unverified · no cloud imagery bundled for this week";
  drawObservation();
}

cloudDay.addEventListener("change", drawObservation);
