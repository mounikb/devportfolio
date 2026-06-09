import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

document.addEventListener("DOMContentLoaded", () => {
  initIntroReadFill();
  initExperienceCarousel();
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

function initExperienceCarousel() {
  const carousel = document.querySelector("[data-experience-carousel]");
  if (!carousel) return;

  const track = carousel.querySelector("[data-exp-track]");
  const cards = [...carousel.querySelectorAll(".stat-item")];
  const prev = carousel.querySelector("[data-exp-prev]");
  const next = carousel.querySelector("[data-exp-next]");
  const counter = carousel.querySelector("[data-exp-counter]");
  if (!track || !cards.length || !prev || !next) return;

  let index = 0;

  const visibleCount = () => {
    if (window.innerWidth <= 620) return 1;
    if (window.innerWidth <= 900) return 2;
    return 3;
  };

  const update = () => {
    const count = visibleCount();
    const maxIndex = Math.max(cards.length - count, 0);
    index = Math.min(Math.max(index, 0), maxIndex);

    const gap = Number.parseFloat(getComputedStyle(track).columnGap || "0") || 0;
    const cardWidth = cards[0]?.getBoundingClientRect().width || 0;
    track.style.transform = `translate3d(${-index * (cardWidth + gap)}px, 0, 0)`;

    prev.disabled = index === 0;
    next.disabled = index === maxIndex;
    if (counter) {
      const start = String(index + 1).padStart(2, "0");
      const end = String(Math.min(index + count, cards.length)).padStart(2, "0");
      counter.textContent = `${start}-${end} / ${String(cards.length).padStart(2, "0")}`;
    }
  };

  prev.addEventListener("click", () => {
    index -= 1;
    update();
  });

  next.addEventListener("click", () => {
    index += 1;
    update();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    const rect = carousel.getBoundingClientRect();
    const carouselIsInView = rect.top < window.innerHeight * 0.82 && rect.bottom > window.innerHeight * 0.18;
    if (!carouselIsInView) return;

    if (event.key === "ArrowRight" && !next.disabled) {
      event.preventDefault();
      index += 1;
      update();
    }

    if (event.key === "ArrowLeft" && !prev.disabled) {
      event.preventDefault();
      index -= 1;
      update();
    }
  });

  window.addEventListener("resize", update);
  update();
}

function initStatsSlide() {
  const statItems = [...document.querySelectorAll(".stat-item")].filter(
    (item) => !item.closest(".experience-carousel"),
  );
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
