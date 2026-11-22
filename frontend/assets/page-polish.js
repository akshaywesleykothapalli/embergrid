const preference = matchMedia("(prefers-reduced-motion: reduce)");
const running = new Set();
const targets = document.querySelectorAll(
  ".guide-heading, .guide-grid article, .faq-intro, .faq-list, .about-hero, .about-story section, .about-card"
);

if (!preference.matches && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (preference.matches) continue;
      const animation = entry.target.animate(
        [{opacity: .35, transform: "translateY(14px)"}, {opacity: 1, transform: "translateY(0)"}],
        {duration: 480, easing: "cubic-bezier(.2,.7,.2,1)"}
      );
      running.add(animation);
      animation.finished.then(() => running.delete(animation), () => running.delete(animation));
    }
  }, {threshold: .12});
  targets.forEach(target => observer.observe(target));
  preference.addEventListener("change", () => {
    if (preference.matches) {
      observer.disconnect();
      for (const animation of running) animation.finish();
    }
  });
}
