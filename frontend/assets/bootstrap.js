const page = document.body.dataset.page;
const links = [["/", "Home", "home"], ["/calendar", "Harmonized calendar", "calendar"], ["/explore", "India Explorer", "explorer"], ];
document.getElementById("siteHeader").innerHTML = `
  <header class="top"><div class="shell top-inner">
    <a class="brand" href="/"><span aria-hidden="true">◉</span> Embergrid</a>
    <nav class="site-nav" aria-label="Main navigation">${links.map(([url, label, key]) =>
      `<a href="${url}"${page === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  </div></header>`;
document.getElementById("siteFooter").innerHTML = `
  <footer class="site-footer"><div class="shell footer-inner">
    <div><strong>Embergrid</strong><p>Historical satellite hotspot analysis for India.</p></div>
    <nav aria-label="Footer navigation">
      <a href="/explore">India Explorer</a><a href="/calendar">Harmonized calendar</a>
      <a href="https://www.earthdata.nasa.gov/data/tools/firms">NASA FIRMS ↗</a>
      <a href="https://www.geoboundaries.org/">geoBoundaries ↗</a>
    </nav>
  </div></footer>`;

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
  if (page === "calendar") {
    window.indiaBoundaries = await read("/api/india/boundaries");
    await script("fullscreen.js?v=3");
    await script("calendar.js?v=3");
  } else if (page === "explorer") {
    [window.indiaBoundaries, window.indiaReviewSummary] = await Promise.all([
      read("/api/india/boundaries"), read("/api/india/review"), script("vendor/leaflet.js"), script("review.js")
    ]);
    await script("fullscreen.js?v=3");
    await script("india.js?v=4");
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
