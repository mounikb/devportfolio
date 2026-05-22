import gsap from "gsap";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { vertexShader, fragmentShader } from "./shaders.js";
import { createTerminalScreen } from "./terminal-screen.js";

document.addEventListener("DOMContentLoaded", () => {
  const projectEntries = [
    { imageSrc: "/nav-previews/projects.webp", label: "Projects" },
    { imageSrc: "/nav-previews/skills.jpg", label: "Skills" },
    { imageSrc: "/nav-previews/resume.png", label: "Resume" },
    { imageSrc: "/nav-previews/about.jpg", label: "About" },
    { imageSrc: "/nav-previews/terminal.jpg", label: "Terminal" },
    { imageSrc: "/nav-previews/contact.jpg", label: "Contact" },
  ];
  const hero = document.querySelector(".hero");
  const projectsList = document.querySelector(".projects");
  const kpMenuContainer = document.querySelector(".kp-menu-container");
  const languageSwitch = document.querySelector(".language-switch");
  const statusPanels = [...document.querySelectorAll(".top-status, .status-panel, .monitor-panel, .hud-lines")];
  const statusClock = document.querySelector(".status-panel-clock");
  const interactiveGrid = document.querySelector(".interactive-grid");
  const GRID_BLOCK_SIZE = 60;
  const GRID_HIGHLIGHT_DURATION = 300;
  const gridBlocks = [];
  const gridLookup = new Map();
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
  const screenRefresh = {
    fps: 30,
    lastFrameAt: 0,
  };

  // ── Terminal (2D fullscreen overlay) ──────────────────────────
  const projectItems = [];
  const terminalScreen = createTerminalScreen(projectEntries);

  // Mount the terminal canvas as a fullscreen overlay
  const terminalOverlay = terminalScreen.canvas;
  terminalOverlay.style.position = "absolute";
  terminalOverlay.style.inset = "0";
  terminalOverlay.style.width = "100%";
  terminalOverlay.style.height = "100%";
  terminalOverlay.style.zIndex = "3";
  hero.appendChild(terminalOverlay);

  window.addEventListener("keydown", terminalScreen.handleKeydown);
  terminalOverlay.addEventListener("wheel", terminalScreen.handleWheel, { passive: false });

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

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "1";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.opacity = "0";
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

  new GLTFLoader().load("/monitor.glb", (gltf) => {
    const model = gltf.scene;
    const center = new THREE.Box3()
      .setFromObject(model)
      .getCenter(new THREE.Vector3());
    model.position.sub(center);
    monitorGroup.add(model);
  });

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
  const zoom = { current: 0 };
  const timer = new THREE.Timer();
  let started = false;

  if (projectsList) {
    projectsList.style.opacity = "0";
    projectsList.style.pointerEvents = "none";
    projectsList.style.transition = "opacity 220ms ease";
  }

  setKpMenuVisibility(false);
  setLanguageSwitchVisibility(false);
  setStatusPanelsVisibility(false);
  startStatusClock();

  if (interactiveGrid) {
    resetInteractiveGrid(interactiveGrid);
    requestAnimationFrame(updateGridHighlights);
  }

  // "start" command: crossfade from 2D terminal to 3D, then zoom out
  terminalScreen.onStart = () => {
    if (started) return;
    started = true;

    const tl = gsap.timeline();

    // Fade out 2D overlay, fade in 3D renderer (camera is zoomed into screen)
    tl.to(terminalOverlay, {
      opacity: 0,
      duration: 0.6,
      ease: "power2.in",
      onComplete() {
        terminalOverlay.style.pointerEvents = "none";
      },
    });
    tl.to(renderer.domElement, {
      opacity: 1,
      duration: 0.6,
      ease: "power2.out",
    }, "<");
    tl.call(() => {
      setKpMenuVisibility(true, { immediate: false });
      setLanguageSwitchVisibility(true, { immediate: false });
      setStatusPanelsVisibility(true, { immediate: false });
      shuffleAllKpMenuText();
    }, [], 0.68);
    tl.to(kpMenuContainer, {
      opacity: 1,
      duration: 0.45,
      ease: "power2.out",
    }, 0.68);
    tl.to(languageSwitch, {
      opacity: 1,
      duration: 0.45,
      ease: "power2.out",
    }, 0.68);
    tl.to(statusPanels, {
      opacity: 1,
      duration: 0.45,
      ease: "power2.out",
      stagger: 0.04,
    }, 0.68);

    // Glitch flash at transition point
    tl.call(() => flashDisplay(), [], 0.3);

    // Zoom out camera to reveal CRT monitor
    tl.to(zoom, {
      current: 1,
      duration: 2.8,
      ease: "power2.inOut",
    }, 0.4);
  };

  function animate() {
    requestAnimationFrame(animate);

    if (contextLost) return;

    timer.update();
    const elapsed = timer.getElapsed();
    // Wrap the shader time uniform so sin/hash calls keep float precision
    // even after the tab has been open (or backgrounded) for a long time.
    displayMaterial.uniforms.time.value = elapsed % 1000;
    if (elapsed - screenRefresh.lastFrameAt >= 1 / screenRefresh.fps) {
      terminalScreen.tick(elapsed);
      screenTexture.needsUpdate = true;
      screenRefresh.lastFrameAt = elapsed;
    }

    lerpedMouse.x = gsap.utils.interpolate(lerpedMouse.x, mouse.x, 0.05);
    lerpedMouse.y = gsap.utils.interpolate(lerpedMouse.y, mouse.y, 0.05);
    const mouseInfluence = THREE.MathUtils.lerp(0.0, 0.5, zoom.current);
    const modelScale = THREE.MathUtils.lerp(1.12, 1.14, zoom.current);
    const baseRotationX = THREE.MathUtils.lerp(0.0, 0.012, zoom.current);
    const baseRotationY = THREE.MathUtils.lerp(0.0, -0.035, zoom.current);
    const baseRotationZ = THREE.MathUtils.lerp(0.0, 0.002, zoom.current);
    monitorGroup.scale.setScalar(modelScale);
    monitorGroup.position.y = THREE.MathUtils.lerp(0.0, -0.025, zoom.current);
    monitorGroup.rotation.x = baseRotationX + lerpedMouse.y * 0.1 * mouseInfluence;
    monitorGroup.rotation.y = baseRotationY + lerpedMouse.x * 0.16 * mouseInfluence;
    monitorGroup.rotation.z = baseRotationZ;

    camera.fov = THREE.MathUtils.lerp(42, 24, zoom.current);
    camera.position.x = 0;
    camera.position.y = THREE.MathUtils.lerp(0.03, 0.055, zoom.current);
    camera.position.z = THREE.MathUtils.lerp(0.35, 1.98, zoom.current);
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

  animate();

  window.addEventListener("mousemove", (e) => {
    mouse.x = (e.clientX / innerWidth - 0.5) * 10;
    mouse.y = (e.clientY / innerHeight - 0.5) * 5;
    gridMouse.x = e.clientX;
    gridMouse.y = e.clientY;
    addGridHighlights();
  });

  window.addEventListener("mouseout", () => {
    gridMouse.x = undefined;
    gridMouse.y = undefined;
  });

  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    if (interactiveGrid) resetInteractiveGrid(interactiveGrid);
  });

  const glitchState = { intensity: 0 };
  let glitchAnimation = null;

  function flashDisplay() {
    if (glitchAnimation) glitchAnimation.kill();
    glitchState.intensity = 1.0;

    glitchAnimation = gsap.to(glitchState, {
      intensity: 0,
      duration: 0.75,
      ease: "power3.out",
      onUpdate() {
        displayMaterial.uniforms.glitchIntensity.value = glitchState.intensity;
      },
    });
  }

  function setActiveProject(activeItem) {
    projectItems.forEach((item) =>
      item.classList.toggle("active", item === activeItem),
    );
  }

  function setDisplayProject(project, activeItem = null) {
    terminalScreen.setProject(project);
    setActiveProject(activeItem);
    flashDisplay();
  }

  function setDisplayHome() {
    terminalScreen.setIdle();
    setActiveProject(null);
    flashDisplay();
  }

  initKpMenu();

  function resetInteractiveGrid(container) {
    container.innerHTML = "";
    gridBlocks.length = 0;
    gridLookup.clear();

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
        createGridBlock(container, posX, posY, colIndex, rowIndex);
      }
    }
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
    closestGridBlock.element.classList.add("highlight");
    closestGridBlock.highlightEndTime = currentGridTime + GRID_HIGHLIGHT_DURATION;

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

      highlightedGridBlocks.push(randomGridNeighbor);
      currentGridBlock = randomGridNeighbor;
    }
  }

  function updateGridHighlights() {
    const currentGridTime = Date.now();

    gridBlocks.forEach((gridBlock) => {
      if (gridBlock.highlightEndTime > 0 && currentGridTime > gridBlock.highlightEndTime) {
        gridBlock.element.classList.remove("highlight");
        gridBlock.highlightEndTime = 0;
      }
    });

    requestAnimationFrame(updateGridHighlights);
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
          addShuffleEffect(linkElement);
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
          event.preventDefault();

          if (project) {
            setDisplayProject(project);
            setActiveKpMenuItem(item);
          } else if (linkElement.dataset.projectHome === "true") {
            setDisplayHome();
            setActiveKpMenuItem(item);
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
        textNodes.forEach(addShuffleEffect);
      });
    });

    requestAnimationFrame(() => {
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

  function setLanguageSwitchVisibility(visible, { immediate = true } = {}) {
    if (!languageSwitch) return;

    languageSwitch.style.pointerEvents = visible ? "auto" : "none";

    if (immediate || !visible) {
      languageSwitch.style.opacity = visible ? "1" : "0";
    }

    languageSwitch
      .querySelectorAll("button, [tabindex], .language-switch-segment")
      .forEach((button) => {
        button.tabIndex = visible ? 0 : -1;
      });
  }

  function setStatusPanelsVisibility(visible, { immediate = true } = {}) {
    if (!statusPanels.length) return;

    statusPanels.forEach((panel) => {
      panel.style.opacity = immediate || !visible ? (visible ? "1" : "0") : panel.style.opacity;
    });
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

  function addShuffleEffect(element) {
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
    const shuffleInterval = 10;
    const resetDelay = 70;
    const additionalDelay = 120;

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
});
