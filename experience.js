import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

document.addEventListener("DOMContentLoaded", () => {
  initIntroReadFill();
  initStatsSlide();
  initExpProgress();
  initReveals();
});

// Scroll-driven "read-along" fill on the opening statement: each word turns
// from dim to accent orange in reading order as you scroll through it, as if
// someone is reading the line with the scroll.
function initIntroReadFill() {
  if (prefersReducedMotion) return;

  const heading = document.querySelector(".intro-copy h3");
  if (!heading) return;

  // Split the statement into word spans so each can fill independently.
  const words = (heading.textContent || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;

  heading.textContent = "";
  const wordSpans = words.map((word, index) => {
    const span = document.createElement("span");
    span.className = "read-word";
    span.textContent = word;
    heading.appendChild(span);
    if (index < words.length - 1) heading.appendChild(document.createTextNode(" "));
    return span;
  });

  // Pin the section so the screen scroll-locks while the paragraph fills:
  // the page stays put and the scroll input only drives words turning orange.
  // Once the last word is filled the pin releases and normal scrolling resumes.
  // The end distance (`+=150%`) controls how much scroll it takes to read the
  // whole line — longer = a slower, more deliberate read.
  gsap.to(wordSpans, {
    color: "#eb7d1f",
    ease: "none",
    stagger: 0.4,
    scrollTrigger: {
      trigger: ".intro-copy",
      start: "top top",
      end: "+=150%",
      scrub: 0.3,
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
    },
  });
}

window.addEventListener("load", () => {
  ScrollTrigger.refresh(true);
});

function initStatsSlide() {
  const statItems = document.querySelectorAll(".stat-item");
  if (!statItems.length) return;

  if (prefersReducedMotion) {
    gsap.set(statItems, { x: 0 });
    return;
  }

  // One-shot slide-in per card instead of a per-frame scrub. The cards use
  // `backdrop-filter: blur()`, which the browser must recompute every frame the
  // element moves — scrubbing that on every scroll pixel was the lag. A single
  // eased entrance only pays that cost briefly, then the blur stays static.
  statItems.forEach((item) => {
    gsap.set(item, { x: 120, opacity: 0 });
    ScrollTrigger.create({
      trigger: item,
      start: "top 78%",
      once: true,
      onEnter: () => {
        gsap.to(item, {
          x: 0,
          opacity: 1,
          duration: 0.7,
          ease: "power3.out",
        });
      },
    });
  });
}

// Drive the header progress rail + counter as cards scroll past.
function initExpProgress() {
  const statItems = document.querySelectorAll(".stat-item");
  const fill = document.querySelector(".stats-header-rail-fill");
  const current = document.querySelector("[data-exp-current]");
  if (!statItems.length || !fill || !current) return;

  const total = statItems.length;

  statItems.forEach((item, index) => {
    ScrollTrigger.create({
      trigger: item,
      start: "top 60%",
      end: "bottom 60%",
      onToggle: (self) => {
        if (!self.isActive) return;
        const step = index + 1;
        gsap.to(fill, {
          width: `${(step / total) * 100}%`,
          duration: 0.5,
          ease: "power3.out",
        });
        current.textContent = String(step).padStart(2, "0");
      },
    });
  });
}

// Soft fade/slide-up reveals for the project + contact blocks.
function initReveals() {
  if (prefersReducedMotion) return;

  const targets = document.querySelectorAll(
    ".project-summary, .contact-links"
  );

  targets.forEach((el) => {
    gsap.set(el, { opacity: 0, y: 36 });
    ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: "power3.out",
        });
      },
    });
  });
}
