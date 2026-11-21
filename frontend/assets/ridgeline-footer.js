/** Hex → [r, g, b] in 0–255, or null for anything that isn't #rgb / #rrggbb. */
function rdfHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** [r, g, b] → one opaque pixel for a little-endian Uint32 view of ImageData. */
function rdfPack(rgb) {
  return ((255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0
}

/** The classic 8×8 Bayer matrix, as thresholds in (0, 1). */
const RDF_BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64)

/** Palette index for a tone in [0, 1] across `n` colours at Bayer threshold `b`. */
function rdfDither(tone, n, b) {
  const t = tone < 0 ? 0 : tone > 1 ? 1 : tone
  const v = Math.floor(t * (n - 1) + b)
  return v > n - 1 ? n - 1 : v
}

/** Integer lattice hash → [0, 1). */
function rdfHash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise in [0, 1). */
function rdfNoise(x, y, seed) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = rdfHash(xi, yi, seed)
  const b = rdfHash(xi + 1, yi, seed)
  const c = rdfHash(xi, yi + 1, seed)
  const d = rdfHash(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Fractal value noise, normalised back into [0, 1). */
function rdfFbm(x, y, seed, octaves) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += rdfNoise(x, y, seed + o * 31) * amp
    norm += amp
    x *= 2.03
    y *= 2.03
    amp *= 0.5
  }
  return norm > 0 ? sum / norm : 0
}

/** Hermite step from e0 to e1, clamped. */
function rdfSmooth(e0, e1, x) {
  const t = e1 === e0 ? (x < e0 ? 0 : 1) : Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Ease-out cubic over a progress that may run outside [0, 1]. */
function rdfEase(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return 1 - Math.pow(1 - c, 3)
}

/**
 * Crest row of ridge `i` of `layers` (0 is the farthest) for every column of
 * a `cols` × `rows` grid, plus `margin` columns either side for parallax.
 * Farther ridges sit higher with more, smaller peaks; nearer ones are lower,
 * broader and taller.
 */
function rdfRidgeline(cols, rows, i, layers, seed, margin) {
  const k = layers > 1 ? i / (layers - 1) : 1
  const n = cols + margin * 2
  const out = new Float32Array(n)
  const base = rows * (0.38 + 0.66 * Math.pow(k, 1.4))
  const amp = rows * (0.2 + 0.24 * k)
  const freq = 6 - 3.8 * k
  // Near ridges climb toward both edges, one side more than the other, so the
  // range opens into a valley. Nothing climbs into the faded band at the top.
  const flankL = rows * 0.5 * k * k * k * (0.55 + 0.6 * rdfHash(i, 11, seed))
  const flankR = rows * 0.5 * k * k * k * (0.55 + 0.6 * rdfHash(i, 13, seed))
  const ceil = rows * 0.17
  const tilt = (rdfHash(i, 7, seed) - 0.5) * rows * 0.34 * (0.4 + k)
  const s = (seed | 0) * 13 + i * 101
  for (let x = 0; x < n; x++) {
    const u = (x - margin) / cols
    const r1 = 1 - Math.abs(rdfNoise(u * freq + i * 3.7, 0.5, s) * 2 - 1)
    const r2 = 1 - Math.abs(rdfNoise(u * freq * 2.3, 3.5, s + 1) * 2 - 1)
    const f = rdfFbm(u * freq * 4.1, 9.5, s + 2, 3)
    const h = r1 * r1 * 0.62 + r2 * 0.24 + f * 0.14
    const e = Math.min(1.2, Math.abs(u * 2 - 1))
    const y = base - h * amp + tilt * (u - 0.5) * 2 - (u < 0.5 ? flankL : flankR) * e * e * Math.sqrt(e)
    out[x] = y < ceil ? ceil - (ceil - y) * 0.25 : y
  }
  return out
}

const colors = ["#0b0b0b", "#23382e", "#2d513d", "#3d6b4b", "#52835a", "#6c9c6a", "#96b982"];
const columns = [
  ["Explore", [["/", "Home"], ["/global", "World Hotspot Explorer"], ["/explore", "India Explorer"]]],
  ["Analyze", [["/calendar", "Harmonized calendar"], ["/sangrur", "Sangrur study"]]],
  ["Sources", [["https://www.earthdata.nasa.gov/data/tools/firms", "NASA FIRMS"],
    ["https://huggingface.co/datasets/warrensaw530/fire-harmony", "Fire Harmony"],
    ["https://www.geoboundaries.org/", "geoBoundaries"]]]
];

export function mountRidgelineFooter(host) {
  if (!host) return;
  // Rounded layout adapted from Hirael Footer 02 (MIT, Mohammad Shehadeh).
  host.innerHTML = `<footer class="rdf-root">
    <div class="rdf-frame">
      <div class="rdf-top">
        <a class="rdf-logo rdf-r" href="/" style="--d:0ms"><img class="brand-globe" src="/assets/embergrid-globe.png" alt="" width="36" height="36"> Embergrid</a>
        <nav class="rdf-nav" aria-label="Footer">
          ${columns.map(([title, entries], index) => `<div class="rdf-col rdf-r" style="--d:${(index + 1) * 60}ms">
            <h3>${title}</h3>
            <ul>${entries.map(([url, label]) => `<li><a class="rdf-link" href="${url}">${label}</a></li>`).join("")}</ul>
          </div>`).join("")}
        </nav>
      </div>
      <div class="rdf-bar rdf-r" style="--d:240ms">
        <a class="rdf-link" href="https://github.com/akshaywesleykothapalli/embergrid">GitHub</a>
        <a class="rdf-link" href="https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/">NASA Space Apps Challenge</a>
      </div>
    </div>
    <div class="rdf-scene" aria-hidden="true"><canvas></canvas></div>
  </footer>`;
  const root = host.firstElementChild;
  const scene = root.querySelector(".rdf-scene");
  const canvas = scene.querySelector("canvas");
  const context = canvas.getContext("2d");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const palette = colors.map(color => rdfPack(rdfHex(color)));
  let image, pixels, ridges, mist, fogWidth, width, height, margin, pixel;
  let visible = false, start, frame = 0, lastDraw = 0;
  const layers = 6;

  function resize() {
    if (!context) return;
    pixel = Math.max(2, Math.ceil(scene.clientWidth / 440));
    width = Math.max(1, Math.ceil(scene.clientWidth / pixel));
    height = Math.max(1, Math.ceil(scene.clientHeight / pixel));
    canvas.width = width;
    canvas.height = height;
    image = context.createImageData(width, height);
    pixels = new Uint32Array(image.data.buffer);
    margin = Math.ceil(width * .048) + 3;
    ridges = Array.from({length: layers}, (_, i) => rdfRidgeline(width, height, i, layers, 23, margin));
    fogWidth = Math.ceil(width / 3);
    mist = new Float32Array(fogWidth * Math.ceil(height / 3));
    draw(performance.now());
  }

  function draw(now) {
    if (!image) return;
    const still = motion.matches;
    const age = still ? 5000 : now - (start ?? now - 5000);
    const drift = still ? 0 : now * .000035;
    for (let i = 0; i < mist.length; i++) {
      const x = i % fogWidth;
      const y = Math.floor(i / fogWidth);
      mist[i] = rdfSmooth(.24, .76, rdfFbm(x / fogWidth * 7 + drift,
        y * 10 / height, 31, 2));
    }
    const reveals = ridges.map((_, i) => rdfEase((age - i * 125) / 1250));
    const crestAt = (i, x) => ridges[i][x + margin] +
      (1 - reveals[i]) * height * .08;
    for (let x = 0; x < width; x++) {
      const tops = ridges.map((_, i) => crestAt(i, x));
      for (let y = 0; y < height; y++) {
        let layer = layers - 1;
        while (layer >= 0 && y < tops[layer]) layer--;
        const depth = layer / (layers - 1);
        const fog = mist[Math.floor(y / 3)*fogWidth + Math.floor(x / 3)];
        const rim = layer < 0 ? 0 : 1-.68*rdfSmooth(0, height*(.16+.39*depth), y-tops[layer]);
        const tone = layer < 0 ? .025 * fog : (.19 + .80*depth) * rim * reveals[layer] *
          (1 - .55*fog) + .035*fog;
        pixels[y*width+x] = palette[rdfDither(tone*rdfSmooth(0,height*.36,y), palette.length,
          RDF_BAYER[(y&7)*8+(x&7)])];
      }
    }
    context.putImageData(image, 0, 0);

  }

  function tick(now) {
    frame = 0;
    if (!visible) return;
    if (now - lastDraw > 41 || motion.matches) {
      draw(now);
      lastDraw = now;
    }
    if (!motion.matches) frame = requestAnimationFrame(tick);
  }
  const wake = () => { if (visible && !frame) frame = requestAnimationFrame(tick); };
  new ResizeObserver(resize).observe(scene);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      start ??= performance.now();
      root.classList.add("rdf-in");
      wake();
    }
  }).observe(root);
  motion.addEventListener("change", wake);
}
