const facts = document.querySelector(".archive-facts");
const preference = matchMedia("(prefers-reduced-motion: reduce)");
const animations = [];

function finish() {
  for (const animation of animations) animation.finish();
}

function roll() {
  if (preference.matches) return;
  for (const value of facts.querySelectorAll(".stat-number")) {
    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = value.dataset.value;
    const digits = document.createElement("span");
    digits.className = "stat-digits";
    digits.setAttribute("aria-hidden", "true");

    for (const character of value.dataset.value) {
      if (character === ".") {
        digits.append(".");
        continue;
      }
      const digit = Number(character);
      const window = document.createElement("span");
      window.className = "stat-digit";
      const strip = document.createElement("span");
      strip.className = "stat-strip";
      // Every reel makes one full turn, then lands on its final digit.
      const steps = digit + 10;
      for (let step = 0; step <= steps; step++) {
        const cell = document.createElement("span");
        cell.textContent = step % 10;
        strip.append(cell);
      }
      const end = `translateY(-${steps}em)`;
      strip.style.transform = end;
      window.append(strip);
      digits.append(window);
      animations.push(strip.animate(
        [{transform: "translateY(0)"}, {transform: end}],
        {duration: 1600, easing: "cubic-bezier(.16, 1, .3, 1)"}
      ));
    }
    value.replaceChildren(label, digits);
  }
}

if (facts) {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    roll();
  }, {threshold: .3});
  observer.observe(facts);
  preference.addEventListener("change", () => {
    if (preference.matches) finish();
  });
}
