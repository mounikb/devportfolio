import gsap from "gsap";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { vertexShader, fragmentShader } from "./shaders.js";
import { createTerminalScreen } from "./terminal-screen.js";
document.addEventListener("DOMContentLoaded", () => {
  const restoreZoomedHome = isBackForwardNavigation();
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const compactViewport = window.matchMedia("(max-width: 900px)").matches;
  const lowPowerDevice =
    compactViewport ||
    prefersReducedMotion ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    navigator.connection?.saveData === true;

  document.documentElement.classList.toggle("reduced-effects", lowPowerDevice);

  runBootSequence();

  const projectEntries = [
    { imageSrc: "/nav-previews/projects.webp", label: "Projects" },
    { imageSrc: "/nav-previews/skills.jpg", label: "Experience" },
    { imageSrc: "/nav-previews/resume.png", label: "Resume" },
    { imageSrc: "/nav-previews/about.jpg", label: "About" },
    { imageSrc: "/nav-previews/terminal.jpg", label: "Terminal" },
    { imageSrc: "/nav-previews/contact.jpg", label: "Contact" },
  ];
  const hero = document.querySelector(".hero");
  const projectsList = document.querySelector(".projects");
  const kpMenuContainer = document.querySelector(".kp-menu-container");
  const statusPanels = [...document.querySelectorAll(".top-status, .status-panel, .hud-lines, .social-icons, .coord-marks")];
  const statusClock = document.querySelector(".status-panel-clock");
  const memValueEl = document.querySelector("[data-mem-value]");
  const interactiveGrid = document.querySelector(".interactive-grid");
  const GRID_BLOCK_SIZE = 60;
  const GRID_HIGHLIGHT_DURATION = 300;
  const gridBlocks = [];
  const gridLookup = new Map();
  const activeGridBlocks = new Set();
  const shuffleTimers = new WeakMap();
  const gridState = {
    columns: 0,
    rows: 0,
    offsetX: 0,
    offsetY: 0,
  };
  const gridMouse = {
    x: undefined,
    y: undefined,
    radius: GRID_BLOCK_SIZE * 2,
  };
  let activeScrollTween = null;
  const screenRefresh = {
    fps: lowPowerDevice ? 12 : 20,
    lastFrameAt: 0,
  };
  const renderRefresh = {
    fps: lowPowerDevice ? 20 : 30,
    lastFrameAt: 0,
  };
  let pageVisible = !document.hidden;
  let heroVisible = true;
  let gridAnimationRunning = false;
  let resizeFrame = 0;
  let pointerFrame = 0;
  let initialRevealPlaying = false;
  let scenePrewarmed = false;

  // ── Mobile (≤900px): clean static home — the CRT/WebGL scene and the
  // 2D terminal canvas are never created. The page scrolls normally from a
  // terminal-styled hero card straight into the content sections.
  if (compactViewport) {
    document.documentElement.classList.add("mobile-mode");
    initMobileHome();
    return;
  }

  function initMobileHome() {
    setKpMenuVisibility(true);
    setStatusPanelsVisibility(true);
    startStatusClock();
    startMemTicker();
    initMobileNav();
    initScrollSpy();
    initMobileHeroIntro();
  }

  // Same bottom command rail as desktop, but links plainly smooth-scroll —
  // there is no CRT to collapse and no terminal to drive.
  function initMobileNav() {
    if (!kpMenuContainer) return;
    kpMenuContainer.classList.add("is-open");

    const terminalLink = kpMenuContainer.querySelector('a[data-terminal-nav="true"]');
    if (terminalLink) terminalLink.textContent = "Home";

    kpMenuContainer.querySelectorAll(".kp-menu-item-link a").forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");

        if (link.dataset.terminalNav === "true") {
          event.preventDefault();
          setActiveKpMenuItem(link.closest(".kp-menu-item"));
          smoothScrollToElement(hero);
          return;
        }

        if (href && href.startsWith("#") && href.length > 1) {
          event.preventDefault();
          const target = document.querySelector(href);
          if (target) smoothScrollToElement(target);
        }
      });
    });

    document.querySelectorAll(".mobile-hero-actions a").forEach((link) => {
      link.addEventListener("click", (event) => {
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) return;
        event.preventDefault();
        smoothScrollToElement(target);
      });
    });
  }

  // Types "whoami" at the hero prompt, then reveals the identity block —
  // a lightweight echo of the CRT terminal's intro.
  function initMobileHeroIntro() {
    const commandEl = document.querySelector("[data-mobile-typed]");
    const output = document.querySelector(".mobile-hero-output");
    if (!commandEl || !output) return;

    const command = commandEl.dataset.mobileTyped || commandEl.textContent || "whoami";
    if (prefersReducedMotion) {
      commandEl.textContent = command;
      output.classList.add("is-visible");
      return;
    }

    commandEl.textContent = "";
    let typed = 0;
    const typeNext = () => {
      typed += 1;
      commandEl.textContent = command.slice(0, typed);
      if (typed < command.length) {
        window.setTimeout(typeNext, 95 + Math.random() * 80);
      } else {
        window.setTimeout(() => output.classList.add("is-visible"), 300);
      }
    };
    // Let the boot loader clear before the prompt starts typing.
    window.setTimeout(typeNext, 1500);
  }

  // ── Terminal (2D fullscreen overlay) ──────────────────────────
  const projectItems = [];
  const terminalScreen = createTerminalScreen(projectEntries);

  // Mount the terminal canvas as a fullscreen overlay
  const terminalOverlay = terminalScreen.canvas;
  terminalOverlay.style.position = "absolute";
  terminalOverlay.style.inset = "0";
  terminalOverlay.style.width = "100%";
  terminalOverlay.style.height = "100svh";
  terminalOverlay.style.zIndex = "3";
  terminalOverlay.style.opacity = restoreZoomedHome ? "0" : "1";
  terminalOverlay.style.pointerEvents = restoreZoomedHome ? "none" : "auto";
  hero.appendChild(terminalOverlay);

  window.addEventListener("keydown", terminalScreen.handleKeydown);
  terminalOverlay.addEventListener("wheel", terminalScreen.handleWheel, { passive: false });

  // ── Touch devices: tap focuses a hidden input (summons the on-screen
  // keyboard), drag scrolls the terminal log, swipe up enters the experience.
  const touchDevice =
    window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  const mobileInput = touchDevice ? createMobileTerminalInput() : null;
  if (touchDevice) initTerminalTouchControls();

  function createMobileTerminalInput() {
    const form = document.createElement("form");
    form.setAttribute("aria-hidden", "true");
    form.style.cssText =
      "position:fixed;top:4.5rem;left:0.75rem;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
    const input = document.createElement("input");
    input.type = "text";
    input.autocapitalize = "none";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.enterKeyHint = "send";
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-label", "Terminal command input");
    form.appendChild(input);
    document.body.appendChild(form);

    input.addEventListener("input", () => {
      terminalScreen.setInput(input.value);
    });
    const submitCommand = (event) => {
      event.preventDefault();
      terminalScreen.submit();
      input.value = "";
    };
    form.addEventListener("submit", submitCommand);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitCommand(event);
    });

    // Keyboards overlay the page (iOS, and Android since Chrome 108), so track
    // the visual viewport to keep the terminal prompt visible above them.
    if (window.visualViewport) {
      const syncKeyboardInset = () => {
        terminalScreen.setKeyboardInset(
          Math.max(0, window.innerHeight - window.visualViewport.height),
        );
      };
      window.visualViewport.addEventListener("resize", syncKeyboardInset);
      input.addEventListener("blur", () => terminalScreen.setKeyboardInset(0));
    }

    return input;
  }

  function focusMobileTerminalInput() {
    if (!mobileInput) return;
    mobileInput.value = terminalScreen.getInput();
    mobileInput.focus({ preventScroll: true });
  }

  function initTerminalTouchControls() {
    const TAP_SLOP = 12;
    const SWIPE_ENTER_DISTANCE = 56;
    const SCROLL_STEP_PX = 48;
    let gestureStartX = 0;
    let gestureStartY = 0;
    let lastGestureY = 0;
    let gestureMoved = false;
    let gestureScrolledLog = false;
    let scrollRemainder = 0;

    // Stop the browser from hijacking drags for pull-to-refresh etc.
    terminalOverlay.style.touchAction = "none";

    terminalOverlay.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      gestureStartX = event.clientX;
      gestureStartY = event.clientY;
      lastGestureY = event.clientY;
      gestureMoved = false;
      gestureScrolledLog = false;
      scrollRemainder = 0;
    });

    terminalOverlay.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse" || event.buttons === 0) return;
      if (
        Math.abs(event.clientX - gestureStartX) > TAP_SLOP ||
        Math.abs(event.clientY - gestureStartY) > TAP_SLOP
      ) {
        gestureMoved = true;
      }

      // Drag scrolls the log: finger down reveals older lines, up newer ones.
      scrollRemainder += lastGestureY - event.clientY;
      lastGestureY = event.clientY;
      while (Math.abs(scrollRemainder) >= SCROLL_STEP_PX) {
        const step = Math.sign(scrollRemainder);
        if (terminalScreen.scrollLines(-step)) gestureScrolledLog = true;
        scrollRemainder -= step * SCROLL_STEP_PX;
      }
    });

    terminalOverlay.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse") return;
      if (!gestureMoved) {
        focusMobileTerminalInput();
        return;
      }
      // A decisive upward swipe enters the experience (the touch counterpart
      // of scrolling down on desktop) — unless the drag was scrolling the log.
      if (
        !gestureScrolledLog &&
        event.clientY - gestureStartY < -SWIPE_ENTER_DISTANCE
      ) {
        terminalScreen.start();
      }
    });

    // After the zoom-out, the overlay is gone; a still tap on the 3D monitor
    // re-opens the keyboard so commands stay usable on the CRT.
    let heroTapX = 0;
    let heroTapY = 0;
    let heroTapActive = false;
    hero.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      heroTapX = event.clientX;
      heroTapY = event.clientY;
      heroTapActive = true;
    });
    hero.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse" || !heroTapActive) return;
      heroTapActive = false;
      if (!started || heroPhase !== "hero" || transitionPlaying) return;
      if (
        Math.abs(event.clientX - heroTapX) > TAP_SLOP ||
        Math.abs(event.clientY - heroTapY) > TAP_SLOP
      ) {
        return;
      }
      focusMobileTerminalInput();
    });
  }

  // ── Three.js scene (hidden initially) ─────────────────────────
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    42,
    innerWidth / innerHeight,
    0.1,
    1000,
  );
  camera.position.set(0, 0.03, 0.35);
  const cameraLookTarget = new THREE.Vector3(0, 0.03, 0.041);
  camera.lookAt(cameraLookTarget);

  const renderer = new THREE.WebGLRenderer({
    antialias: !lowPowerDevice,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPowerDevice ? 1 : 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "1";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.height = "100svh";
  renderer.domElement.style.opacity = restoreZoomedHome ? "1" : "0";
  hero.appendChild(renderer.domElement);

  // Handle WebGL context loss (common when the tab is backgrounded for a
  // while on Windows/Chrome). Without this the CRT silently disappears and
  // never comes back when the user returns to the tab.
  let contextLost = false;
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
  }, false);
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    // Force the canvas-backed screen texture to re-upload to the GPU.
    screenTexture.needsUpdate = true;
    // Re-establish renderer size in case it drifted during the loss.
    renderer.setSize(innerWidth, innerHeight);
  }, false);

  scene.add(new THREE.AmbientLight(0xffffff, 5));

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight.position.set(15, 10, -5);
  scene.add(dirLight);

  const topLight = new THREE.PointLight(0xffffff, 5, 10);
  topLight.position.set(-5, -2.5, 0);
  topLight.decay = 0.3;
  scene.add(topLight);

  const monitorGroup = new THREE.Group();
  scene.add(monitorGroup);

  const fallbackMonitor = createFallbackMonitor();
  monitorGroup.add(fallbackMonitor);

  const monitorUrl = `${import.meta.env.BASE_URL}monitor.glb`;
  let monitorLoadStarted = false;

  function prewarmScene() {
    if (scenePrewarmed || contextLost) return;
    terminalScreen.tick(timer.getElapsed());
    screenTexture.needsUpdate = true;
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    scenePrewarmed = true;
  }

  function disposeObject(object) {
    object.traverse((child) => {
      child.geometry?.dispose();

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.filter(Boolean).forEach((material) => material.dispose());
    });
  }

  function loadMonitorModel() {
    if (monitorLoadStarted || lowPowerDevice || !pageVisible) return;
    monitorLoadStarted = true;

    new GLTFLoader().load(
      monitorUrl,
      (gltf) => {
        const model = gltf.scene;
        const center = new THREE.Box3()
          .setFromObject(model)
          .getCenter(new THREE.Vector3());
        model.position.sub(center);
        monitorGroup.remove(fallbackMonitor);
        disposeObject(fallbackMonitor);
        monitorGroup.add(model);
        scenePrewarmed = false;
        if (!started && "requestIdleCallback" in window) {
          window.requestIdleCallback(prewarmScene, { timeout: 2500 });
        }
      },
      undefined,
      (error) => {
        monitorLoadStarted = false;
        console.error(`Unable to load monitor model from ${monitorUrl}`, error);
      },
    );
  }

  const scheduleMonitorLoad = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadMonitorModel, { timeout: 9000 });
    } else {
      window.setTimeout(loadMonitorModel, 5000);
    }
  };
  window.addEventListener("load", scheduleMonitorLoad, { once: true });

  function createFallbackMonitor() {
    const group = new THREE.Group();
    group.name = "fallback-monitor";

    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0x252422,
      roughness: 0.72,
      metalness: 0.08,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x11110f,
      roughness: 0.8,
      metalness: 0.04,
    });

    const addBox = (width, height, depth, x, y, z, material = shellMaterial) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material,
      );
      mesh.position.set(x, y, z);
      group.add(mesh);
    };

    addBox(0.39, 0.34, 0.13, -0.008, 0.002, -0.045);
    addBox(0.36, 0.035, 0.05, -0.008, 0.145, 0.018, edgeMaterial);
    addBox(0.36, 0.035, 0.05, -0.008, -0.135, 0.018, edgeMaterial);
    addBox(0.04, 0.25, 0.05, -0.168, 0.005, 0.018, edgeMaterial);
    addBox(0.04, 0.25, 0.05, 0.152, 0.005, 0.018, edgeMaterial);
    addBox(0.12, 0.08, 0.09, -0.008, -0.205, -0.02);
    addBox(0.28, 0.035, 0.16, -0.008, -0.255, -0.035, edgeMaterial);

    group.rotation.x = -0.015;
    return group;
  }

  function createScreenGeometry(w, h, r) {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;

    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    const geometry = new THREE.ShapeGeometry(shape);
    const positions = geometry.attributes.position;
    const uvs = new Float32Array(positions.count * 2);

    for (let i = 0; i < positions.count; i++) {
      uvs[i * 2] = (positions.getX(i) - x) / w;
      uvs[i * 2 + 1] = (positions.getY(i) - y) / h;
    }

    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    return geometry;
  }

  const screenTexture = new THREE.CanvasTexture(terminalScreen.canvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.minFilter = THREE.LinearFilter;
  screenTexture.magFilter = THREE.LinearFilter;
  screenTexture.generateMipmaps = false;

  const displayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: screenTexture },
      imageAspect: {
        value: terminalScreen.canvas.width / terminalScreen.canvas.height,
      },
      planeAspect: { value: 0.28 / 0.235 },
      iResolution: {
        value: new THREE.Vector2(
          terminalScreen.canvas.width,
          terminalScreen.canvas.height,
        ),
      },
      glitchIntensity: { value: 0.0 },
      time: { value: 0.0 },
    },
    vertexShader,
    fragmentShader,
  });

  let lastScreenTextureWidth = terminalScreen.canvas.width;
  let lastScreenTextureHeight = terminalScreen.canvas.height;

  function refreshScreenTextureSize() {
    const { width, height } = terminalScreen.canvas;
    // three.js allocates immutable GPU storage for the canvas texture at its
    // first upload. If the canvas is later resized (overlay size → monitor
    // mode, or window resizes before start), `needsUpdate` alone only writes
    // the new, smaller frame into part of the old storage — leaving the rest
    // of the CRT frozen on a stale frame. Dispose to force reallocation.
    if (width !== lastScreenTextureWidth || height !== lastScreenTextureHeight) {
      lastScreenTextureWidth = width;
      lastScreenTextureHeight = height;
      screenTexture.dispose();
    }
    displayMaterial.uniforms.imageAspect.value = width / height;
    displayMaterial.uniforms.iResolution.value.set(width, height);
  }

  const displayPlane = new THREE.Mesh(
    createScreenGeometry(1, 1, 0.03),
    displayMaterial,
  );
  displayPlane.scale.set(0.28, 0.235, 1);
  displayPlane.position.set(-0.008, 0.005, 0.041);
  displayPlane.rotation.set(-0.18, 0, 0);
  monitorGroup.add(displayPlane);

  const mouse = { x: 0, y: 0 };
  const lerpedMouse = { x: 0, y: 0 };
  const zoom = { current: restoreZoomedHome ? 1 : 0 };
  const timer = new THREE.Timer();
  let started = restoreZoomedHome;

  if (projectsList) {
    projectsList.style.opacity = restoreZoomedHome ? "1" : "0";
    projectsList.style.pointerEvents = restoreZoomedHome ? "auto" : "none";
    projectsList.style.transition = "opacity 220ms ease";
  }

  if (!restoreZoomedHome) {
    document.documentElement.style.overflow = "hidden";
  }

  setKpMenuVisibility(restoreZoomedHome);
  setStatusPanelsVisibility(restoreZoomedHome);
  startStatusClock();
  startMemTicker();

  if (interactiveGrid && !lowPowerDevice) {
    resetInteractiveGrid(interactiveGrid);
  }

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(prewarmScene, { timeout: 1800 });
  } else {
    window.setTimeout(prewarmScene, 700);
  }

  // "start" command: crossfade from 2D terminal to 3D, then zoom out
  terminalScreen.onStart = () => {
    if (started) return;
    started = true;
    mobileInput?.blur();
    initialRevealPlaying = true;
    suspendScreenUpdates = true;
    prewarmScene();
    terminalOverlay.style.willChange = "opacity";

    const tl = gsap.timeline();

    // The two canvases show the same terminal frame, so reveal the prewarmed
    // WebGL layer immediately and only fade the top canvas. Avoiding two
    // fullscreen alpha animations keeps this handoff compositor-friendly.
    gsap.set(renderer.domElement, { opacity: 1 });
    tl.to(terminalOverlay, {
      opacity: 0,
      duration: 0.28,
      ease: "power1.out",
      onComplete() {
        terminalOverlay.style.pointerEvents = "none";
        terminalOverlay.style.willChange = "";
        terminalScreen.setMonitorMode();
        terminalScreen.tick(timer.getElapsed());
        refreshScreenTextureSize();
        screenTexture.needsUpdate = true;
      },
    });
    tl.call(() => {
      setKpMenuVisibility(true, { immediate: false });
      setStatusPanelsVisibility(true, { immediate: false });
    }, [], 1.45);
    tl.to(kpMenuContainer, {
      opacity: 1,
      duration: 0.45,
      ease: "power2.out",
    }, 1.45);
    tl.to(statusPanels, {
      opacity: 1,
      duration: 0.45,
      ease: "power2.out",
      stagger: 0.04,
    }, 1.45);

    // Zoom out camera to reveal CRT monitor
    tl.to(zoom, {
      current: 1,
      duration: 2.15,
      ease: "power3.inOut",
      onComplete() {
        initialRevealPlaying = false;
        suspendScreenUpdates = false;
        document.documentElement.style.overflow = "";
        heroReady = true;
        refreshIntroTop();
        scheduleAmbientFlicker();
        terminalScreen.preloadProjects();
      },
    }, 0.16);
  };

  // ── One-scroll hero → content transition ───────────────────────
  // A single scroll input plays one fixed, fluid timeline instead of being
  // tied to how far you drag (which felt sticky): the CRT collapses in place
  // (the window stays put, so it shrinks toward its centre without drifting
  // up), then the page glides to the intro and the headline pops in centred.
  // Scrolling up at the top of the content plays the same motion in reverse.
  const introSection = document.querySelector(".intro-copy");
  const introHeading = introSection?.querySelector("h3");
  const crtScreen = renderer.domElement;
  const heroTransitionEnabled = !prefersReducedMotion && !!introSection;
  const HEADING_HIDDEN = { opacity: 0, scale: 0.86, y: 44, transformOrigin: "50% 50%" };
  let heroReady = restoreZoomedHome;
  let heroPhase = "hero"; // "hero" | "content"
  let transitionPlaying = false;
  let heroTransition = null;
  let cachedIntroTop = 0;
  // While the CRT is scaling, stop redrawing/re-uploading the terminal texture
  // every frame — that per-frame CPU+GPU work is what made the collapse stutter
  // while the (cheap) text transform stayed smooth. It's shrinking away anyway.
  let suspendScreenUpdates = false;

  function refreshIntroTop() {
    cachedIntroTop = introSection
      ? Math.round(introSection.getBoundingClientRect().top + window.scrollY)
      : window.innerHeight;
  }

  if (heroTransitionEnabled && introHeading) {
    gsap.set(introHeading, HEADING_HIDDEN);
  }

  function scrollWindowTo(targetY, duration, ease) {
    const proxy = { y: window.scrollY };
    return gsap.to(proxy, {
      y: targetY,
      duration,
      ease,
      onUpdate() {
        window.scrollTo(0, proxy.y);
      },
    });
  }

  function playForwardTransition(onDone) {
    if (!heroTransitionEnabled || transitionPlaying || heroPhase === "content") {
      onDone?.();
      return;
    }
    transitionPlaying = true;
    suspendScreenUpdates = true;
    crtScreen.style.willChange = "transform";
    refreshIntroTop();
    const targetY = cachedIntroTop;
    heroTransition?.kill();
    heroTransition = gsap.timeline({
      onComplete() {
        transitionPlaying = false;
        suspendScreenUpdates = false;
        crtScreen.style.willChange = "";
        heroPhase = "content";
        window.scrollTo(0, targetY);
        onDone?.();
      },
    });
    // 1. Collapse the CRT in place — window stays at the top, so no upward drift.
    heroTransition.to(crtScreen, {
      scale: 0,
      duration: 0.5,
      ease: "power2.in",
      transformOrigin: "50% 50%",
    }, 0);
    // 2. Glide the page to the intro once the screen has essentially gone, so
    //    the CRT never visibly travels upward.
    heroTransition.add(scrollWindowTo(targetY, 0.6, "power2.inOut"), 0.46);
    // 3. Pop the headline into the centred intro as the page settles.
    if (introHeading) {
      heroTransition.to(introHeading, {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.55,
        ease: "back.out(1.5)",
      }, 0.66);
    }
  }

  function playReverseTransition(onDone) {
    if (!heroTransitionEnabled || transitionPlaying || heroPhase === "hero") {
      onDone?.();
      return;
    }
    transitionPlaying = true;
    crtScreen.style.willChange = "transform";
    heroTransition?.kill();
    heroTransition = gsap.timeline({
      onComplete() {
        transitionPlaying = false;
        crtScreen.style.willChange = "";
        heroPhase = "hero";
        window.scrollTo(0, 0);
        onDone?.();
      },
    });
    if (introHeading) {
      heroTransition.to(introHeading, { ...HEADING_HIDDEN, duration: 0.3, ease: "power2.in" }, 0);
    }
    heroTransition.add(scrollWindowTo(0, 0.55, "power2.inOut"), 0);
    heroTransition.to(crtScreen, {
      scale: 1,
      duration: 0.55,
      ease: "power2.out",
      transformOrigin: "50% 50%",
    }, 0.12);
  }

  const HERO_DOWN_KEYS = new Set(["ArrowDown", "PageDown", " ", "Spacebar", "End"]);
  const HERO_UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

  function atContentTop() {
    return window.scrollY <= cachedIntroTop + 2;
  }

  function onHeroWheel(event) {
    if (!heroReady) return;
    if (transitionPlaying) {
      event.preventDefault();
      return;
    }
    if (heroPhase === "hero") {
      event.preventDefault();
      if (event.deltaY > 0) playForwardTransition();
      return;
    }
    if (event.deltaY < 0 && atContentTop()) {
      event.preventDefault();
      playReverseTransition();
    }
  }

  function onHeroKeydown(event) {
    if (!heroReady) return;
    const isNavKey = HERO_DOWN_KEYS.has(event.key) || HERO_UP_KEYS.has(event.key);
    if (transitionPlaying) {
      if (isNavKey) event.preventDefault();
      return;
    }
    if (heroPhase === "hero") {
      if (HERO_DOWN_KEYS.has(event.key)) {
        event.preventDefault();
        playForwardTransition();
      }
      return;
    }
    if (HERO_UP_KEYS.has(event.key) && atContentTop()) {
      event.preventDefault();
      playReverseTransition();
    }
  }

  let heroTouchStartY = null;
  function onHeroTouchStart(event) {
    if (!heroReady) return;
    heroTouchStartY = event.touches[0] ? event.touches[0].clientY : null;
  }
  function onHeroTouchMove(event) {
    if (!heroReady || heroTouchStartY === null) return;
    const currentY = event.touches[0] ? event.touches[0].clientY : heroTouchStartY;
    const delta = heroTouchStartY - currentY; // > 0 = swipe up = scroll down
    if (transitionPlaying) {
      event.preventDefault();
      return;
    }
    if (heroPhase === "hero") {
      event.preventDefault();
      if (delta > 8) playForwardTransition();
      return;
    }
    if (delta < -8 && atContentTop()) {
      event.preventDefault();
      playReverseTransition();
    }
  }

  // Keep momentum from drifting up into the (collapsed) hero zone.
  function onHeroScrollClamp() {
    if (transitionPlaying) return;
    if (heroPhase === "content" && window.scrollY < cachedIntroTop - 1) {
      window.scrollTo(0, cachedIntroTop);
    }
  }

  if (heroTransitionEnabled) {
    window.addEventListener("wheel", onHeroWheel, { passive: false });
    window.addEventListener("keydown", onHeroKeydown);
    window.addEventListener("touchstart", onHeroTouchStart, { passive: true });
    window.addEventListener("touchmove", onHeroTouchMove, { passive: false });
    window.addEventListener("scroll", onHeroScrollClamp, { passive: true });
    window.addEventListener("resize", refreshIntroTop);

    // If a reload restored a scrolled position, start in the content state.
    requestAnimationFrame(() => {
      refreshIntroTop();
      if (window.scrollY > 4) {
        heroPhase = "content";
        gsap.set(crtScreen, { scale: 0 });
        if (introHeading) gsap.set(introHeading, { opacity: 1, scale: 1, y: 0 });
      }
    });
  }

  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      heroVisible = entry.isIntersecting;
    },
    { rootMargin: "120px 0px" },
  );
  heroObserver.observe(hero);

  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
    if (pageVisible && !monitorLoadStarted) scheduleMonitorLoad();
  });

  function animate(frameTime = 0) {
    requestAnimationFrame(animate);

    if (contextLost || !pageVisible || (!heroVisible && !transitionPlaying)) return;

    // Parked in the content view: the CRT is collapsed and off-screen, so skip
    // rendering it entirely — otherwise the full WebGL scene keeps redrawing
    // every frame and steals frame budget from the scroll animations.
    if (heroPhase === "content" && !transitionPlaying) return;
    const targetRenderFps = initialRevealPlaying
      ? (lowPowerDevice ? 30 : 60)
      : renderRefresh.fps;
    if (frameTime - renderRefresh.lastFrameAt < 1000 / targetRenderFps) return;
    renderRefresh.lastFrameAt = frameTime;

    timer.update();
    const elapsed = timer.getElapsed();
    // Wrap the shader time uniform so sin/hash calls keep float precision
    // even after the tab has been open (or backgrounded) for a long time.
    displayMaterial.uniforms.time.value = elapsed % 1000;
    if (!suspendScreenUpdates && elapsed - screenRefresh.lastFrameAt >= 1 / screenRefresh.fps) {
      terminalScreen.tick(elapsed);
      if (started) screenTexture.needsUpdate = true;
      screenRefresh.lastFrameAt = elapsed;
    }

    if (!started) return;

    lerpedMouse.x = gsap.utils.interpolate(lerpedMouse.x, mouse.x, 0.05);
    lerpedMouse.y = gsap.utils.interpolate(lerpedMouse.y, mouse.y, 0.05);
    const mouseInfluence = THREE.MathUtils.lerp(0.0, 0.5, zoom.current);
    const modelScale = THREE.MathUtils.lerp(1.45, 1.48, zoom.current);
    const baseRotationX = THREE.MathUtils.lerp(0.0, 0.012, zoom.current);
    const baseRotationY = THREE.MathUtils.lerp(0.0, -0.035, zoom.current);
    const baseRotationZ = THREE.MathUtils.lerp(0.0, 0.002, zoom.current);
    monitorGroup.scale.setScalar(modelScale);
    monitorGroup.position.y = THREE.MathUtils.lerp(0.0, 0.005, zoom.current);
    monitorGroup.rotation.x = baseRotationX + lerpedMouse.y * 0.1 * mouseInfluence;
    monitorGroup.rotation.y = baseRotationY + lerpedMouse.x * 0.16 * mouseInfluence;
    monitorGroup.rotation.z = baseRotationZ;

    camera.fov = THREE.MathUtils.lerp(42, 24, zoom.current);
    camera.position.x = 0;
    camera.position.y = THREE.MathUtils.lerp(0.03, 0.055, zoom.current);
    camera.position.z = THREE.MathUtils.lerp(0.35, computeFittedCameraZ(), zoom.current);
    cameraLookTarget.set(
      0,
      THREE.MathUtils.lerp(0.03, 0.008, zoom.current),
      THREE.MathUtils.lerp(0.041, 0.028, zoom.current),
    );
    camera.updateProjectionMatrix();
    camera.lookAt(cameraLookTarget);

    if (projectsList) {
      const controlsOpacity = THREE.MathUtils.clamp(
        (zoom.current - 0.76) / 0.16,
        0,
        1,
      );
      const controlsEnabled = controlsOpacity > 0.98;
      projectsList.style.opacity = `${controlsOpacity}`;
      projectsList.style.pointerEvents = controlsEnabled ? "auto" : "none";
      projectItems.forEach((item) => {
        item.tabIndex = controlsEnabled ? 0 : -1;
      });
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);

  // Pull the camera back until the monitor's footprint (bezel included, at its
  // zoomed scale) fits whichever viewport axis is tighter, with a small
  // margin. On wide screens this settles at the designed 1.98; on portrait
  // phones it backs off just enough that the CRT is never cropped.
  const MONITOR_HALF_WIDTH = 0.31;
  const MONITOR_HALF_HEIGHT = 0.27;
  const MONITOR_FIT_MARGIN = 1.16;
  function computeFittedCameraZ() {
    const halfVTan = Math.tan(THREE.MathUtils.degToRad(12)); // final 24° fov
    const halfHTan = halfVTan * camera.aspect;
    const fitWidth = (MONITOR_HALF_WIDTH * MONITOR_FIT_MARGIN) / halfHTan;
    const fitHeight = (MONITOR_HALF_HEIGHT * MONITOR_FIT_MARGIN) / halfVTan;
    return Math.max(1.98, fitWidth, fitHeight);
  }

  window.addEventListener("mousemove", (event) => {
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      mouse.x = (event.clientX / innerWidth - 0.5) * 10;
      mouse.y = (event.clientY / innerHeight - 0.5) * 5;
      if (!lowPowerDevice) {
        gridMouse.x = event.clientX;
        gridMouse.y = event.clientY;
        addGridHighlights();
      }
    });
  }, { passive: true });

  window.addEventListener("mouseout", () => {
    gridMouse.x = undefined;
    gridMouse.y = undefined;
  });

  window.addEventListener("resize", () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio, lowPowerDevice ? 1 : 1.25));
      renderer.setSize(innerWidth, innerHeight);
      terminalScreen.resize();
      terminalScreen.tick(timer.getElapsed());
      refreshScreenTextureSize();
      screenTexture.needsUpdate = true;
      if (interactiveGrid && !lowPowerDevice) resetInteractiveGrid(interactiveGrid);
    });
  }, { passive: true });

  const glitchState = { intensity: 0 };
  let glitchAnimation = null;

  function flashDisplay() {
    if (glitchAnimation) glitchAnimation.kill();
    glitchState.intensity = 0.72;
    displayMaterial.uniforms.glitchIntensity.value = glitchState.intensity;

    glitchAnimation = gsap.to(glitchState, {
      intensity: 0,
      duration: 0.38,
      ease: "power2.out",
      onUpdate() {
        displayMaterial.uniforms.glitchIntensity.value = glitchState.intensity;
      },
      onComplete() {
        glitchAnimation = null;
      },
    });
  }

  function ambientFlicker() {
    if (glitchState.intensity > 0.04) return;
    if (glitchAnimation) glitchAnimation.kill();
    glitchState.intensity = 0.08 + Math.random() * 0.1;
    glitchAnimation = gsap.to(glitchState, {
      intensity: 0,
      duration: 0.32 + Math.random() * 0.28,
      ease: "power2.out",
      onUpdate() {
        displayMaterial.uniforms.glitchIntensity.value = glitchState.intensity;
      },
    });
  }

  function scheduleAmbientFlicker() {
    if (lowPowerDevice) return;
    const delay = 7000 + Math.random() * 11000;
    window.setTimeout(() => {
      if (pageVisible && heroVisible) ambientFlicker();
      scheduleAmbientFlicker();
    }, delay);
  }

  function setActiveProject(activeItem) {
    projectItems.forEach((item) =>
      item.classList.toggle("active", item === activeItem),
    );
  }

  function setDisplayProject(project, activeItem = null) {
    const projectChanged = terminalScreen.setProject(project);
    if (!projectChanged) return;
    terminalScreen.tick(timer.getElapsed());
    screenTexture.needsUpdate = true;
    setActiveProject(activeItem);
    flashDisplay();
  }

  function setDisplayHome() {
    terminalScreen.setIdle();
    setActiveProject(null);
    flashDisplay();
  }

  function restoreZoomedHomeState() {
    started = true;
    heroReady = true;
    zoom.current = 1;
    terminalOverlay.style.opacity = "0";
    terminalOverlay.style.pointerEvents = "none";
    renderer.domElement.style.opacity = "1";
    setKpMenuVisibility(true);
    setStatusPanelsVisibility(true);
    setActiveProject(null);
    terminalScreen.setIdle();
    // The monitor texture must use the fixed logical canvas, not the
    // window-sized overlay canvas — otherwise the screen content renders
    // cropped and misaligned on the CRT.
    terminalScreen.setMonitorMode();
    terminalScreen.markStarted();
    refreshScreenTextureSize();
    terminalScreen.tick(timer.getElapsed());
    screenTexture.needsUpdate = true;
    scheduleAmbientFlicker();
  }

  initKpMenu();
  initScrollSpy();
  if (restoreZoomedHome) {
    restoreZoomedHomeState();
  }

  function resetInteractiveGrid(container) {
    const fragment = document.createDocumentFragment();
    gridBlocks.length = 0;
    gridLookup.clear();
    activeGridBlocks.clear();

    const gridWidth = window.innerWidth;
    const gridHeight = window.innerHeight;
    const gridColumnCount = Math.ceil(gridWidth / GRID_BLOCK_SIZE);
    const gridRowCount = Math.ceil(gridHeight / GRID_BLOCK_SIZE);
    const gridOffsetX = (gridWidth - gridColumnCount * GRID_BLOCK_SIZE) / 2;
    const gridOffsetY = (gridHeight - gridRowCount * GRID_BLOCK_SIZE) / 2;
    gridState.columns = gridColumnCount;
    gridState.rows = gridRowCount;
    gridState.offsetX = gridOffsetX;
    gridState.offsetY = gridOffsetY;

    for (let rowIndex = 0; rowIndex < gridRowCount; rowIndex++) {
      for (let colIndex = 0; colIndex < gridColumnCount; colIndex++) {
        const posX = colIndex * GRID_BLOCK_SIZE + gridOffsetX;
        const posY = rowIndex * GRID_BLOCK_SIZE + gridOffsetY;
        createGridBlock(fragment, posX, posY, colIndex, rowIndex);
      }
    }

    container.replaceChildren(fragment);
  }

  function createGridBlock(container, posX, posY, gridX, gridY) {
    const gridBlock = document.createElement("div");
    gridBlock.classList.add("block");
    gridBlock.style.width = `${GRID_BLOCK_SIZE}px`;
    gridBlock.style.height = `${GRID_BLOCK_SIZE}px`;
    gridBlock.style.left = `${posX}px`;
    gridBlock.style.top = `${posY}px`;
    container.appendChild(gridBlock);

    gridBlocks.push({
      element: gridBlock,
      x: posX + GRID_BLOCK_SIZE / 2,
      y: posY + GRID_BLOCK_SIZE / 2,
      gridX,
      gridY,
      highlightEndTime: 0,
    });
    gridLookup.set(`${gridX},${gridY}`, gridBlocks[gridBlocks.length - 1]);
  }

  function addGridHighlights() {
    if (gridMouse.x === undefined || gridMouse.y === undefined) return;

    const gridX = Math.floor((gridMouse.x - gridState.offsetX) / GRID_BLOCK_SIZE);
    const gridY = Math.floor((gridMouse.y - gridState.offsetY) / GRID_BLOCK_SIZE);
    if (
      gridX < 0 ||
      gridY < 0 ||
      gridX >= gridState.columns ||
      gridY >= gridState.rows
    ) return;

    const closestGridBlock = gridLookup.get(`${gridX},${gridY}`);
    if (!closestGridBlock) return;
    const distanceX = gridMouse.x - closestGridBlock.x;
    const distanceY = gridMouse.y - closestGridBlock.y;
    const closestGridDistance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
    if (!closestGridBlock || closestGridDistance > gridMouse.radius) return;

    const currentGridTime = Date.now();
    const animationWasIdle = activeGridBlocks.size === 0;
    closestGridBlock.element.classList.add("highlight");
    closestGridBlock.highlightEndTime = currentGridTime + GRID_HIGHLIGHT_DURATION;
    activeGridBlocks.add(closestGridBlock);

    const gridClusterSize = 1;
    let currentGridBlock = closestGridBlock;
    const highlightedGridBlocks = [closestGridBlock];

    for (let i = 0; i < gridClusterSize; i++) {
      const gridNeighbors = [];
      for (let y = currentGridBlock.gridY - 1; y <= currentGridBlock.gridY + 1; y++) {
        for (let x = currentGridBlock.gridX - 1; x <= currentGridBlock.gridX + 1; x++) {
          const neighborBlock = gridLookup.get(`${x},${y}`);
          if (!neighborBlock || highlightedGridBlocks.includes(neighborBlock)) continue;
          gridNeighbors.push(neighborBlock);
        }
      }

      if (gridNeighbors.length === 0) break;

      const randomGridNeighbor = gridNeighbors[Math.floor(Math.random() * gridNeighbors.length)];
      randomGridNeighbor.element.classList.add("highlight");
      randomGridNeighbor.highlightEndTime = currentGridTime + GRID_HIGHLIGHT_DURATION + i * 10;
      activeGridBlocks.add(randomGridNeighbor);

      highlightedGridBlocks.push(randomGridNeighbor);
      currentGridBlock = randomGridNeighbor;
    }

    if (animationWasIdle && !gridAnimationRunning) {
      gridAnimationRunning = true;
      requestAnimationFrame(updateGridHighlights);
    }
  }

  function updateGridHighlights() {
    const currentGridTime = Date.now();

    activeGridBlocks.forEach((gridBlock) => {
      if (gridBlock.highlightEndTime > 0 && currentGridTime > gridBlock.highlightEndTime) {
        gridBlock.element.classList.remove("highlight");
        gridBlock.highlightEndTime = 0;
        activeGridBlocks.delete(gridBlock);
      }
    });

    if (activeGridBlocks.size) {
      requestAnimationFrame(updateGridHighlights);
    } else {
      gridAnimationRunning = false;
    }
  }

  function initKpMenu() {
    if (!kpMenuContainer) return;

    const kpMenuItems = [...kpMenuContainer.querySelectorAll(".kp-menu-item")];
    const kpTextTargets = [
      ...kpMenuContainer.querySelectorAll(".kp-menu-item-link a"),
      ...kpMenuContainer.querySelectorAll(".kp-menu-item > span"),
    ];

    kpTextTargets.forEach(wrapChars);
    sizeKpMenuHoverBlocks();
    window.addEventListener("resize", sizeKpMenuHoverBlocks);
    kpMenuContainer.classList.add("is-open");

    kpMenuItems.forEach((item, index) => {
      const linkElement = item.querySelector(".kp-menu-item-link a");
      const spanElement = item.querySelector(":scope > span");
      const spanChars = spanElement?.querySelectorAll(".char") || [];
      const projectIndex =
        linkElement?.dataset.projectNav !== undefined
          ? Number(linkElement.dataset.projectNav)
          : null;
      const project =
        projectIndex !== null && Number.isFinite(projectIndex)
          ? terminalScreen.projects[projectIndex]
          : null;

      if (linkElement) {
        linkElement.addEventListener("mouseenter", () => {
          activateCharTrail(spanChars);
        });

        linkElement.addEventListener("mouseleave", () => {
          clearCharTrail(spanChars);
        });

        linkElement.addEventListener("focus", () => {
          if (project) setDisplayProject(project);
        });

        linkElement.addEventListener("blur", (event) => {
          if (project && !kpMenuContainer.contains(event.relatedTarget)) {
            terminalScreen.setIdle();
            flashDisplay();
          }
        });

        linkElement.addEventListener("click", (event) => {
          const href = linkElement.getAttribute("href");

          if (linkElement.dataset.terminalNav === "true") {
            event.preventDefault();
            setActiveKpMenuItem(item);
            // Going home shows the CRT, so reverse the collapse if we're in
            // the content view; otherwise just reset the screen.
            if (!heroTransitionEnabled) {
              smoothScrollToElement(hero);
              setDisplayHome();
            } else if (heroPhase === "content") {
              playReverseTransition(setDisplayHome);
            } else {
              setDisplayHome();
            }
            return;
          }

          if (href && href.startsWith("#") && href.length > 1) {
            event.preventDefault();
            const target = document.querySelector(href);
            if (!target) return;
            const navigateToDeckCard = () => {
              if (window.navigateSectionDeck?.(href)) return;
              smoothScrollToElement(target);
            };
            // Leaving the hero for a content section collapses the CRT first.
            if (heroTransitionEnabled && heroPhase === "hero") {
              playForwardTransition(navigateToDeckCard);
            } else {
              navigateToDeckCard();
            }
            return;
          }

          if (href !== "#") return;
          event.preventDefault();

          // These drive the CRT screen, so bring it back if we're in content.
          const showOnScreen = () => {
            if (project) {
              setDisplayProject(project);
              setActiveKpMenuItem(item);
            } else if (linkElement.dataset.projectHome === "true") {
              setDisplayHome();
              setActiveKpMenuItem(item);
            }
          };
          if (heroTransitionEnabled && heroPhase === "content") {
            playReverseTransition(showOnScreen);
          } else {
            showOnScreen();
          }
        });
      }

      setTimeout(() => {
        item.style.transitionDelay = `${index * 30}ms`;
      }, 0);

      item.addEventListener("mouseenter", () => {
        if (project) setDisplayProject(project);
      });

    });

    kpMenuContainer.addEventListener("mouseleave", () => {
      terminalScreen.setIdle();
      flashDisplay();
    });

    kpMenuContainer.querySelectorAll(".kp-menu-item").forEach((entry) => {
      entry.addEventListener("mouseenter", () => {
        const textNodes = entry.querySelectorAll(".kp-menu-item-link a, .kp-menu-item > span");
        textNodes.forEach((textNode) => addShuffleEffect(textNode, { fast: true }));
      });
    });

    requestAnimationFrame(() => {
      if (restoreZoomedHome) {
        kpMenuItems.forEach((item) => {
          item.style.transform = "translateX(0px)";
        });
        return;
      }

      animateKpMenuItems("in");
      shuffleAllKpMenuText();
    });
  }

  function animateKpMenuItems(direction) {
    const kpMenuItems = kpMenuContainer.querySelectorAll(".kp-menu-item");
    kpMenuItems.forEach((item, index) => {
      setTimeout(() => {
        item.style.transform =
          direction === "in" ? "translateX(0px)" : "translateX(-80px)";
      }, index * 45);
    });
  }

  function smoothScrollToElement(target) {
    const startY = window.scrollY;
    const targetY = target.getBoundingClientRect().top + window.scrollY;
    const travel = Math.abs(targetY - startY);
    const scrollState = { y: startY };

    activeScrollTween?.kill();
    activeScrollTween = gsap.to(scrollState, {
      y: targetY,
      duration: Math.min(Math.max(travel / 850, 0.9), 1.65),
      ease: "power2.inOut",
      overwrite: true,
      onUpdate() {
        window.scrollTo(0, scrollState.y);
      },
      onComplete() {
        activeScrollTween = null;
      },
    });
  }

  function sizeKpMenuHoverBlocks() {
    if (!kpMenuContainer) return;

    kpMenuContainer.querySelectorAll(".kp-menu-item").forEach((item) => {
      const linkElement = item.querySelector(".kp-menu-item-link a");
      const hoverElement = item.querySelector(".kp-bg-hover");
      const spanElement = item.querySelector(":scope > span");
      if (!linkElement || !hoverElement) return;

      const width = linkElement.offsetWidth;
      hoverElement.style.width = `${width + 24}px`;
      if (spanElement) spanElement.style.left = `${width + 30}px`;
    });
  }

  function setActiveKpMenuItem(activeItem) {
    kpMenuContainer?.querySelectorAll(".kp-menu-item").forEach((item) => {
      item.classList.toggle("is-active", item === activeItem);
    });
  }

  // Highlight the nav item for whichever section is currently in view.
  function initScrollSpy() {
    if (!kpMenuContainer) return;

    const spyItems = new Map();
    kpMenuContainer
      .querySelectorAll(".kp-menu-item-link a[data-spy]")
      .forEach((link) => {
        const item = link.closest(".kp-menu-item");
        if (item) spyItems.set(link.dataset.spy, item);
      });
    if (!spyItems.size) return;

    // Document-order anchors → spy key (intro-copy + stats both map to experience).
    const anchorDefs = [
      [document.querySelector(".hero"), "terminal"],
      [document.querySelector("#about"), "about"],
      [document.querySelector(".stats"), "experience"],
      [document.querySelector("#projects"), "projects"],
      [document.querySelector("#contact"), "contact"],
    ].filter(([el, key]) => el && spyItems.has(key));
    if (!anchorDefs.length) return;

    let currentKey = null;

    const updateSpy = () => {
      const centerY = window.scrollY + window.innerHeight / 2;
      let key = anchorDefs[0][1];
      for (const [el, anchorKey] of anchorDefs) {
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= centerY) key = anchorKey;
      }
      if (key !== currentKey) {
        currentKey = key;
        setActiveKpMenuItem(spyItems.get(key));
      }
    };

    updateSpy();
    window.addEventListener("scroll", updateSpy, { passive: true });
    window.addEventListener("resize", updateSpy);
  }

  function setKpMenuVisibility(visible, { immediate = true } = {}) {
    if (!kpMenuContainer) return;

    kpMenuContainer.setAttribute("aria-hidden", visible ? "false" : "true");
    kpMenuContainer.style.pointerEvents = visible ? "auto" : "none";

    if (immediate || !visible) {
      kpMenuContainer.style.opacity = visible ? "1" : "0";
    }

    kpMenuContainer
      .querySelectorAll(".kp-menu-item-link a")
      .forEach((link) => {
        link.tabIndex = visible ? 0 : -1;
      });
  }

  function setStatusPanelsVisibility(visible, { immediate = true } = {}) {
    if (!statusPanels.length) return;

    statusPanels.forEach((panel) => {
      panel.style.opacity = immediate || !visible ? (visible ? "1" : "0") : panel.style.opacity;
    });
  }

  function startMemTicker() {
    if (!memValueEl) return;
    let mem = 72;
    const tick = () => {
      const drift = Math.round((Math.random() - 0.5) * 4);
      mem = Math.max(64, Math.min(81, mem + drift));
      memValueEl.textContent = `${mem}%`;
    };
    window.setInterval(tick, 1800);
  }

  function startStatusClock() {
    if (!statusClock) return;

    const update = () => {
      const now = new Date();
      const time = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      statusClock.textContent = time;
      statusClock.dateTime = now.toISOString();
    };

    update();
    window.setInterval(update, 1000);
  }

  function wrapChars(element) {
    if (!element || element.dataset.wrapped === "true") return;

    const text = element.textContent || "";
    element.textContent = "";
    const word = document.createElement("span");
    word.className = "word";

    [...text].forEach((character) => {
      const char = document.createElement("span");
      char.className = "char";
      const value = character === " " ? "\u00A0" : character;
      char.textContent = value;
      char.dataset.original = value;
      word.appendChild(char);
    });

    element.appendChild(word);
    element.dataset.wrapped = "true";
  }

  function activateCharTrail(chars) {
    chars.forEach((char, index) => {
      setTimeout(() => {
        char.classList.add("char-active");
      }, index * 32);
    });
  }

  function clearCharTrail(chars) {
    chars.forEach((char) => {
      char.classList.remove("char-active");
    });
  }

  function shuffleAllKpMenuText() {
    if (!kpMenuContainer) return;

    kpMenuContainer
      .querySelectorAll(".kp-menu-item-link a, .kp-menu-item > span")
      .forEach(addShuffleEffect);
  }

  function addShuffleEffect(element, { fast = false } = {}) {
    const chars = [...element.querySelectorAll(".char")];
    if (!chars.length) return;

    const existing = shuffleTimers.get(element);
    if (existing) {
      existing.timeouts.forEach(clearTimeout);
      existing.intervals.forEach(clearInterval);
    }

    chars.forEach((char) => {
      char.textContent = char.dataset.original || char.textContent;
    });

    const timerState = {
      timeouts: [],
      intervals: [],
    };
    shuffleTimers.set(element, timerState);
    const shuffleInterval = fast ? 7 : 10;
    const resetDelay = fast ? 34 : 70;
    const additionalDelay = fast ? 24 : 120;

    chars.forEach((char, index) => {
      const startTimeout = setTimeout(() => {
        const interval = setInterval(() => {
          char.textContent = String.fromCharCode(
            97 + Math.floor(Math.random() * 26),
          );
        }, shuffleInterval);
        timerState.intervals.push(interval);

        const stopTimeout = setTimeout(() => {
          clearInterval(interval);
          char.textContent = char.dataset.original || char.textContent;
          timerState.intervals = timerState.intervals.filter(
            (activeInterval) => activeInterval !== interval,
          );
        }, resetDelay + index * additionalDelay);
        timerState.timeouts.push(stopTimeout);
      }, index * shuffleInterval);
      timerState.timeouts.push(startTimeout);
    });
  }

  function runBootSequence() {
    const bootScreen = document.getElementById("boot-screen");
    if (!bootScreen) return;

    if (isBackForwardNavigation()) {
      bootScreen.remove();
      return;
    }

    const fill = bootScreen.querySelector(".boot-loader-fill");
    const progressLabel = bootScreen.querySelector("[data-boot-progress]");
    const statusLabel = bootScreen.querySelector("[data-boot-status]");
    if (!fill || !progressLabel || !statusLabel) return;

    const statuses = [
      [18, "Preparing display..."],
      [46, "Loading terminal..."],
      [72, "Warming CRT renderer..."],
      [92, "Nearly there..."],
      [100, "Terminal ready."],
    ];
    const startedAt = performance.now();
    const duration = lowPowerDevice ? 1150 : 1450;

    const update = (now) => {
      const elapsed = now - startedAt;
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));
      fill.style.transform = `scaleX(${progress / 100})`;
      progressLabel.textContent = `${String(progress).padStart(2, "0")}%`;
      statusLabel.textContent =
        statuses.find(([threshold]) => progress <= threshold)?.[1] ||
        statuses.at(-1)[1];

      if (progress < 100) {
        requestAnimationFrame(update);
        return;
      }

      window.setTimeout(() => {
        bootScreen.classList.add("is-hidden");
        window.setTimeout(() => bootScreen.remove(), 380);
      }, 180);
    };

    requestAnimationFrame(update);
  }

  function isBackForwardNavigation() {
    const navEntry = performance.getEntriesByType?.("navigation")?.[0];
    return navEntry?.type === "back_forward";
  }
});
