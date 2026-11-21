import {mountRidgelineFooter} from "./ridgeline-footer.js?v=5";

const page = document.body.dataset.page;
const links = [
  ["/global", "World explorer", "global"],
  ["/explore", "India explorer", "explorer"],
  ["/calendar", "Fire calendar", "calendar"],
  ["/about", "About", "about"],
];
document.getElementById("siteHeader").innerHTML = `
  <header class="top"><div class="shell top-inner">
    <a class="brand" href="/"><img class="brand-globe" src="/assets/embergrid-globe.png" alt="" width="36" height="36"> Embergrid</a>
    <nav class="site-nav" aria-label="Main navigation">${links.map(([url, label, key]) =>
      `<a href="${url}"${page === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  </div></header>`;
mountRidgelineFooter(document.getElementById("siteFooter"));

// Animate the surrounding UI independently of the map and the Three.js render loop.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const targets = document.querySelectorAll(".valley-copy h1, .valley-copy p:not([hidden]), .valley-arrow, .intro > div, .explorer-filter-group");
  async function reveal() {
    const motion = await import("https://cdn.jsdelivr.net/npm/motion@14.11.1/+esm").catch(() => null);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    targets.forEach((target, index) => {
      const delay = index * 0.055;
      if (motion) {
        motion.animate(target, { opacity: [0.5, 1], y: [10, 0] }, { duration: 0.38, delay, ease: "easeOut" });
      } else {
        target.animate([{ opacity: 0.5, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
          { duration: 380, delay: delay * 1000, easing: "ease-out" });
      }
    });
  }
  void reveal();
}

async function read(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Archive request failed");
  return response.json();
}
function script(file) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "/assets/" + file;
    tag.onload = resolve;
    tag.onerror = reject;
    document.head.append(tag);
  });
}
try {
  if (page === "global") {
    window.CESIUM_BASE_URL = "/assets/vendor/cesium/";
    await Promise.all([script("vendor/cesium/Cesium.js"), script("vendor/leaflet.js")]);
    await script("fullscreen.js?v=3");
    await script("month-matrix.js");
    await script("global.js?v=audit-fixes-2");
  } else if (page === "calendar") {
    window.indiaBoundaries = await read("/api/india/boundaries");
    await script("fullscreen.js?v=3");
    await script("month-matrix.js");
    await script("calendar.js?v=audit-fixes-2");
  } else if (page === "explorer") {
    [window.indiaBoundaries, window.indiaReviewSummary] = await Promise.all([
      read("/api/india/boundaries"), read("/api/india/review"), script("vendor/leaflet.js"), script("review.js")
    ]);
    await script("fullscreen.js?v=3");
    await script("india.js?v=challenge-1");
  } else if (page === "sangrur") {
    [window.fireData, window.fireContext, window.cloudDates] = await Promise.all([
      read("/api/sangrur/detections"), read("/api/sangrur/context"), read("/api/sangrur/cloud-dates"), script("vendor/leaflet.js")
    ]);
    for (const file of ["analysis.js", "observation.js", "map.js", "app.js"]) await script(file);
  }
} catch {
  const message = document.createElement("p");
  message.className = "panel";
  message.setAttribute("role", "alert");
  message.textContent = "The archive could not load. Start Embergrid and reopen the page through its local address.";
  document.querySelector("main").prepend(message);
}
