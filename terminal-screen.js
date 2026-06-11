const LOGICAL_WIDTH = 1024;
const LOGICAL_HEIGHT = 864;
const INTRO_MS = 2200;
const FONT = '"Public Pixel","Courier New",monospace';
const TEXT_COLOR = "#ffd84a";
const BG_COLOR = "#120905";
const BG_GLOW_COLOR = "rgba(68,34,10,0.88)";
const HIGHLIGHT_FILL_COLOR = "#fff06a";
const HIGHLIGHT_TEXT_COLOR = "#d46a18";
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

let fontPromise;

export function createTerminalScreen(projects) {
  const canvas = document.createElement("canvas");
  let monitorMode = false;

  resizeTerminalCanvas(canvas, monitorMode);

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ensurePixelFont();

  const entries = projects.map((project, index) => ({
    ...project,
    asset: makeAsset(project.imageSrc),
    label: project.label.trim(),
    slug: slugify(project.label),
    systemId: `${index + 1}`.padStart(2, "0"),
  }));

  const state = {
    hover: null,
    selected: null,
    input: "",
    log: [],
    history: [],
    historyIndex: -1,
    scroll: 0,
    startedAt: performance.now(),
    experienceStarted: false,
    keyboardInset: 0,
  };

  const current = () => state.hover || state.selected;
  const write = (text, style = "normal") => state.log.push({ text, style });
  const writeLines = (lines, style = "dim") => lines.forEach((line) => write(line, style));

  const profile = {
    github: "https://github.com/mounikb",
    email: "mounik.bm@gmail.com",
    linkedin: "https://www.linkedin.com/in/your-handle",
    sportsnu: "https://sports-nu-web.vercel.app",
    sportsnuRepo: "https://github.com/mounikb/SportsNU",
  };

  function openExternal(url, label) {
    if (typeof window === "undefined") {
      write(`${label}: ${url}`, "dim");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    write(`opening ${label}...`, "dim");
  }

  function startExperience() {
    if (state.experienceStarted) return;
    state.experienceStarted = true;
    write("initializing crt display...", "dim");
    if (api.onStart) api.onStart();
  }

  function scrollLogLines(step) {
    const total = 2 + state.log.length;
    if (total <= 5) return;
    state.scroll = clamp(state.scroll + step, 0, total - 5);
  }

  // Shared by the physical keyboard (Enter) and the mobile hidden input.
  function submitInput() {
    const raw = state.input.trim();
    write(`${promptStr(current())} ${raw}`);
    if (raw) state.history.unshift(raw);
    state.historyIndex = -1;
    state.scroll = 0;

    const parts = raw.toLowerCase().split(/\s+/);
    const [command, ...args] = parts;
    if (!raw) {}
    else if (command === "start") {
      startExperience();
    } else if (command === "help") {
      writeLines([
        "help                list commands",
        "about               print profile summary",
        "experience          show experience log",
        "projects            show featured project",
        "github              open github profile",
        "contact             show contact channels",
        "skills              list skill groups",
        "whoami              identify current user",
        "boot                replay mlinux post",
        "clear               clear terminal log",
        "sudo hire mounik    open contact channel",
      ]);
    } else if (command === "projects" || command === "ls") {
      writeLines([
        "SPORTSNU",
        "full-stack live sports and esports tracking platform",
        "features: auth, fixture workers, cached dashboards",
        `live: ${profile.sportsnu}`,
        `repo: ${profile.sportsnuRepo}`,
      ]);
    } else if (command === "home") {
      state.selected = null;
      write("returning to home screen...", "dim");
    } else if (command === "about") {
      writeLines([
        "Mounik B M",
        "Computer Science graduate building real products,",
        "AI-assisted systems, teaching programs, and cloud-ready",
        "full-stack applications.",
      ]);
    } else if (command === "experience" || command === "log") {
      writeLines([
        "01 frontend components across production codebase",
        "02 rag pipeline work at ai accessibility startup",
        "03 instructed 200+ students in web development",
        "04 course coordination: c++ / full stack / ml",
        "05 two shopify + razorpay ecommerce deployments",
        "06 ieee access research under review",
      ]);
    } else if (command === "github") {
      openExternal(profile.github, "github");
    } else if (command === "contact") {
      writeLines([
        `email:    ${profile.email}`,
        `github:   ${profile.github}`,
        `linkedin: ${profile.linkedin}`,
      ]);
    } else if (command === "skills") {
      writeLines([
        "frontend: react, ui systems, motion",
        "backend: node, auth, workers, postgres",
        "cloud: vercel, render, monitoring",
        "research: optimization, ml surrogates",
      ]);
    } else if (command === "whoami") {
      write("mounik: software engineer, product builder, cs graduate", "dim");
    } else if (command === "boot") {
      writeLines([
        "MLINUX BIOS v2.1.4",
        "COPYRIGHT (C) 2024 MLINUX SYSTEMS",
        "CPU       MLINX 68000 @ 7.16 MHz       [OK]",
        "MEM       512K RAM TEST                [OK]",
        "VID       NTSC 525-LINE CRT            [OK]",
        "SYSTEM READY",
      ]);
    } else if (command === "sudo" && args.join(" ") === "hire mounik") {
      write("permission granted: opening contact channel...", "dim");
      if (typeof window !== "undefined") window.location.href = `mailto:${profile.email}`;
    } else if (command === "clear") {
      state.log = [];
    } else if (command) {
      write(`${command}: command not found`);
    }

    state.input = "";
  }

  const api = {
    canvas,
    projects: entries,
    onStart: null,
    start() {
      startExperience();
    },
    // Restore paths (back/forward navigation) land directly on the zoomed-out
    // monitor — flag the experience as started without logging or re-running
    // the start transition.
    markStarted() {
      state.experienceStarted = true;
    },
    setMonitorMode() {
      monitorMode = true;
      resizeTerminalCanvas(canvas, monitorMode);
      ctx.imageSmoothingEnabled = false;
    },
    resize() {
      resizeTerminalCanvas(canvas, monitorMode);
      ctx.imageSmoothingEnabled = false;
    },
    preloadProjects() {
      let index = 0;
      const schedule = (callback) => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(callback, { timeout: 1800 });
        } else {
          window.setTimeout(callback, 120);
        }
      };
      const loadNext = () => {
        const project = entries[index++];
        if (!project) return;
        project.asset?.load?.(() => schedule(loadNext));
      };
      schedule(loadNext);
    },
    setProject(project) {
      if (!project || state.hover?.slug === project.slug) return false;
      project.asset?.load?.();
      state.hover = project;
      write(`${promptStr(current())} open ${project.slug}`);
      write(`loading ${project.label.toLowerCase()} preview...`, "dim");
      return true;
    },
    setIdle() {
      state.hover = null;
    },
    handleKeydown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.activeElement?.matches?.(".projects li")) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

      if (event.key === "Backspace") {
        event.preventDefault();
        state.input = state.input.slice(0, -1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (state.history.length) {
          state.historyIndex = clamp(state.historyIndex + 1, 0, state.history.length - 1);
          state.input = state.history[state.historyIndex];
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        state.historyIndex = clamp(state.historyIndex - 1, -1, state.history.length - 1);
        state.input = state.historyIndex === -1 ? "" : state.history[state.historyIndex];
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        state.input = "";
        state.historyIndex = -1;
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        submitInput();
        return;
      }
      if (event.key.length === 1 && state.input.length < 44) {
        event.preventDefault();
        state.input += event.key;
      }
    },
    handleWheel(event) {
      if (!state.experienceStarted && event.deltaY > 0) {
        event.preventDefault();
        startExperience();
        return;
      }
      if (2 + state.log.length <= 5) return;
      event.preventDefault();
      scrollLogLines(Math.sign(event.deltaY));
    },
    // ── Mobile (touch + on-screen keyboard) hooks ─────────────
    setInput(value) {
      state.input = (value || "").replace(/[\r\n]/g, "").slice(0, 44);
    },
    getInput() {
      return state.input;
    },
    submit() {
      submitInput();
    },
    scrollLines(step) {
      const before = state.scroll;
      scrollLogLines(step);
      return state.scroll !== before;
    },
    // Height (in CSS px) the on-screen keyboard covers, so the portrait
    // layout can lift the prompt above it.
    setKeyboardInset(px) {
      state.keyboardInset = Math.max(0, px || 0);
    },
    tick(elapsedSeconds) {
      drawScreen(ctx, state, current(), elapsedSeconds);
    },
  };
  return api;
}

function resizeTerminalCanvas(canvas, monitorMode = false) {
  if (monitorMode) {
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
    return;
  }

  const viewAspect = window.innerWidth / window.innerHeight;
  const logicalAspect = LOGICAL_WIDTH / LOGICAL_HEIGHT;

  if (viewAspect > logicalAspect) {
    canvas.height = LOGICAL_HEIGHT;
    canvas.width = Math.round(LOGICAL_HEIGHT * viewAspect);
  } else if (viewAspect > 1 / 1.35) {
    // Squarish viewports (e.g. a half-snapped browser window) still draw the
    // landscape layout, so keep the full logical width — otherwise the
    // 1024px-wide content gets cropped on both sides. Extra height is
    // letterboxed by the draw offset.
    canvas.width = LOGICAL_WIDTH;
    canvas.height = Math.round(LOGICAL_WIDTH / viewAspect);
  } else {
    const portraitWidth = window.innerWidth <= 600 ? 720 : 900;
    canvas.width = portraitWidth;
    canvas.height = Math.round(portraitWidth / viewAspect);
  }
}

function drawScreen(ctx, state, active, elapsedSeconds) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const intro = clamp((performance.now() - state.startedAt) / INTRO_MS, 0, 1);
  const activePreview = active?.asset.preview || null;
  const portraitLayout = ch / cw > 1.35;
  const header = active
    ? { lead: "Project loaded.", name: active.label, roles: ["Terminal Preview", "Phosphor Session"] }
    : { lead: "Hi there,", name: "I'm Mounik", roles: ["Software Engineer", "Digital Designer"] };

  // Neutral black/gray background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, cw, ch);

  // Subtle neutral base glow
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = BG_GLOW_COLOR;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const ambientGlow = ctx.createRadialGradient(cw * 0.32, ch * 0.26, 24, cw * 0.32, ch * 0.26, ch * 0.54);
  ambientGlow.addColorStop(0, "rgba(126,62,18,0.18)");
  ambientGlow.addColorStop(0.48, "rgba(84,43,15,0.05)");
  ambientGlow.addColorStop(1, "rgba(84,43,15,0)");
  ctx.fillStyle = ambientGlow;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();

  if (portraitLayout) {
    drawPortraitScreen(ctx, state, active, activePreview, header, intro, elapsedSeconds);
  } else {
    // Center logical content
    const ox = (cw - LOGICAL_WIDTH) / 2;
    const oy = (ch - LOGICAL_HEIGHT) / 2;
    ctx.save();
    ctx.translate(ox, oy);

    if (activePreview) {
      ctx.drawImage(activePreview, 0, 0);

      // Keep the preview feeling embedded in the CRT glass with subtle edge falloff.
      ctx.save();
      const vignette = ctx.createRadialGradient(
        LOGICAL_WIDTH * 0.5,
        LOGICAL_HEIGHT * 0.5,
        LOGICAL_HEIGHT * 0.12,
        LOGICAL_WIDTH * 0.5,
        LOGICAL_HEIGHT * 0.5,
        LOGICAL_HEIGHT * 0.78
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.72, "rgba(8,4,2,0.08)");
      vignette.addColorStop(1, "rgba(6,3,1,0.3)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.restore();
    } else {
      // Header section
      drawHeaderHalo(ctx);
      drawText(ctx, reveal(header.lead, 18 + intro * 40), 80, 80, 38, TEXT_COLOR);
      drawHighlight(ctx, reveal(header.name, 18 + intro * 56), 72, 136, 64);
      header.roles.forEach((role, index) => {
        drawText(ctx, `\u2022  ${reveal(role, 10 + intro * 40)}`, 80, 290 + index * 68, 34, TEXT_COLOR);
      });

      // Divider
      ctx.fillStyle = TEXT_COLOR;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(60, 458, 880, 2);
      ctx.globalAlpha = 1;

      // Log area
      const base = intro < 1
        ? [
            { text: reveal("Welcome to ED-Linux 1.0 LTS", 8 + intro * 26), style: "normal" },
            { text: reveal('\u2192\u2192 Scroll or type "help" to get started', 4 + intro * 38), style: "normal" },
          ]
        : [
            { text: "Welcome to ED-Linux 1.0 LTS", style: "normal" },
            { text: '\u2192\u2192 Scroll or type "help" to get started', style: "normal" },
          ];
      const lines = [...base, ...state.log];
      const visible = lines.slice(Math.max(lines.length - 5 - state.scroll, 0), Math.max(lines.length - state.scroll, 0));
      // Lines must fit inside the logical width: the monitor-mode canvas is
      // exactly LOGICAL_WIDTH wide, so anything longer gets hard-clipped on
      // the CRT (e.g. the welcome hint losing its last word).
      const maxLineWidth = LOGICAL_WIDTH - 66 - 28;
      visible.forEach((line, index) => {
        const alpha = line.style === "dim" ? 0.5 : 1;
        ctx.globalAlpha = alpha;
        drawFittedText(ctx, line.text, 66, 510 + index * 50, 22, maxLineWidth, TEXT_COLOR);
        ctx.globalAlpha = 1;
      });

      // Prompt + input
      const pText = promptStr(active);
      drawText(ctx, pText, 66, 790, 28, TEXT_COLOR);
      const pWidth = measure(ctx, pText, 28);
      const inputX = 66 + pWidth + 14;
      drawFittedText(ctx, state.input, inputX, 790, 28, LOGICAL_WIDTH - inputX - 40, TEXT_COLOR);

      // Blinking caret
      if (Math.sin(elapsedSeconds * 5.2) > 0) {
        const caretX = Math.min(
          inputX + measure(ctx, state.input, 28) + 2,
          LOGICAL_WIDTH - 84,
        );
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillRect(caretX, 790, 18, 30);
      }
    }

    ctx.restore(); // undo translate
  }

  // ── CRT post-processing (matching edh.dev reference pipeline) ──
  // Reference pipeline: render → bloom → lag → noise+scanlines

  // 1. Bloom glow (reference: UnrealBloomPass strength=1.1, radius=0.4, threshold=0)
  // Multi-pass bloom to simulate strong phosphor glow
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.16;
  ctx.filter = "blur(2px)";
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.07;
  ctx.filter = "blur(4px)";
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.02;
  ctx.filter = "blur(10px)";
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();

  // 2. Lag persistence (reference shader: current * 0.2 + previous * 0.8)
  const mixCtx = ensureBuffer(drawScreen, "_mix", cw, ch);
  const lagCtx = ensureBuffer(drawScreen, "_lag", cw, ch);
  mixCtx.clearRect(0, 0, cw, ch);
  if (drawScreen._lagReady) {
    mixCtx.globalAlpha = 0.18;
    mixCtx.drawImage(lagCtx.canvas, 0, 0);
    mixCtx.globalAlpha = 0.82;
    mixCtx.drawImage(ctx.canvas, 0, 0);
  } else {
    mixCtx.globalAlpha = 1;
    mixCtx.drawImage(ctx.canvas, 0, 0);
  }
  mixCtx.globalAlpha = 1;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(mixCtx.canvas, 0, 0);

  lagCtx.save();
  lagCtx.globalCompositeOperation = "copy";
  lagCtx.drawImage(mixCtx.canvas, 0, 0);
  lagCtx.restore();
  drawScreen._lagReady = true;

  // 3. Additive scanlines (reference: square wave, LINE_SIZE=288, LINE_STRENGTH=0.05)
  // Uses "lighter" (additive) composite — reference adds scanline value directly to color
  if (!drawScreen._scanlines || drawScreen._sw !== cw || drawScreen._sh !== ch) {
    const sc = document.createElement("canvas");
    sc.width = cw;
    sc.height = ch;
    const sctx = sc.getContext("2d");
    const LINE_SIZE = 288;
    const LINE_STRENGTH = 0.05;
    for (let y = 0; y < ch; y++) {
      const ny = y / ch;
      const sq =
        (Math.sin(Math.PI * LINE_SIZE * ny) +
          Math.sin(3 * Math.PI * LINE_SIZE * ny) / 3 +
          Math.sin(5 * Math.PI * LINE_SIZE * ny) / 5) *
        (4 / Math.PI) - 2;
      const val = sq * LINE_STRENGTH;
      // Positive values brighten, negative darken
      if (val > 0) {
        const v = Math.min(Math.round(val * 255), 255);
        sctx.fillStyle = `rgba(${v},${v},${v},1)`;
      } else {
        const v = Math.min(Math.round(-val * 255), 255);
        sctx.fillStyle = `rgba(0,0,0,${v / 255})`;
      }
      sctx.fillRect(0, y, cw, 1);
    }
    drawScreen._scanlines = sc;
    drawScreen._sw = cw;
    drawScreen._sh = ch;
    // Pre-render the dark scanline overlay
    const sd = document.createElement("canvas");
    sd.width = cw;
    sd.height = ch;
    const sdctx = sd.getContext("2d");
    for (let y = 0; y < ch; y++) {
      const ny = y / ch;
      const sq =
        (Math.sin(Math.PI * LINE_SIZE * ny) +
          Math.sin(3 * Math.PI * LINE_SIZE * ny) / 3 +
          Math.sin(5 * Math.PI * LINE_SIZE * ny) / 5) *
        (4 / Math.PI) - 2;
      const val = sq * LINE_STRENGTH;
      if (val < 0) {
        const a = Math.min(-val * 3, 1);
        sdctx.fillStyle = `rgba(0,0,0,${a})`;
        sdctx.fillRect(0, y, cw, 1);
      }
    }
    drawScreen._scanDark = sd;
  }
  // Apply dark scanlines (darken)
  ctx.drawImage(drawScreen._scanDark, 0, 0);
  // Apply bright scanlines (additive)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.3;
  ctx.drawImage(drawScreen._scanlines, 0, 0);
  ctx.restore();

  // 3. Progressive scan sweep (reference: uProgress cycles 0→1.2, gray band 0.2 tall)
  const progressNorm = (elapsedSeconds * 0.22) % 1.2;
  const bandTop = (progressNorm - 0.2) * ch;
  const bandBot = progressNorm * ch;
  if (bandBot > 0 && bandTop < ch) {
    ctx.save();
    const sweepGrad = ctx.createLinearGradient(0, bandTop, 0, bandBot);
    sweepGrad.addColorStop(0, "rgba(25,25,25,0)");
    sweepGrad.addColorStop(0.5, "rgba(25,25,25,0.08)");
    sweepGrad.addColorStop(1, "rgba(25,25,25,0.15)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, Math.max(bandTop, 0), cw, bandBot - Math.max(bandTop, 0));
    ctx.restore();
  }

  // 4. Film grain noise (reference: NOISE_STRENGTH=0.2, additive random per-pixel)
  if (!drawScreen._nc) {
    const nc = document.createElement("canvas");
    nc.width = 128;
    nc.height = 128;
    drawScreen._nc = nc;
  }
  const nc = drawScreen._nc;
  const nctx = nc.getContext("2d");
  const nimg = nctx.createImageData(128, 128);
  const nd = nimg.data;
  const seed = (elapsedSeconds * 800) | 0;
  for (let i = 0; i < nd.length; i += 4) {
    const v = (fract(Math.sin((i + seed) * 0.1731) * 43758.5453) * 255) | 0;
    nd[i] = nd[i + 1] = nd[i + 2] = v;
    nd[i + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0);
  // Additive noise (reference adds noise directly to color)
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = ctx.createPattern(nc, "repeat");
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

function drawPortraitScreen(ctx, state, active, activePreview, header, intro, elapsedSeconds) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const side = Math.round(cw * 0.075);
  const contentWidth = cw - side * 2;

  // Lift the prompt above the on-screen keyboard (inset is in CSS px,
  // converted into this canvas's logical pixels).
  const keyboardInsetLogical = state.keyboardInset
    ? Math.min(ch * 0.42, Math.round(state.keyboardInset * (ch / Math.max(window.innerHeight, 1))))
    : 0;
  const promptY = ch - Math.max(150, ch * 0.1) - keyboardInsetLogical;

  if (activePreview) {
    blit(ctx, activePreview, { x: 0, y: 0, width: cw, height: ch }, true);
    ctx.fillStyle = "rgba(7, 5, 3, 0.28)";
    ctx.fillRect(0, 0, cw, ch);
  } else {
    const halo = ctx.createRadialGradient(cw * 0.3, ch * 0.18, 10, cw * 0.3, ch * 0.18, cw * 0.72);
    halo.addColorStop(0, "rgba(255,207,92,0.16)");
    halo.addColorStop(1, "rgba(255,207,92,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, cw, ch * 0.48);

    drawText(ctx, reveal(header.lead, 18 + intro * 40), side, ch * 0.105, 30, TEXT_COLOR);
    drawHighlight(ctx, reveal(header.name, 18 + intro * 56), side, ch * 0.16, 48);
    header.roles.forEach((role, index) => {
      drawText(ctx, `\u2022  ${reveal(role, 10 + intro * 40)}`, side, ch * 0.27 + index * 58, 27, TEXT_COLOR);
    });

    ctx.fillStyle = TEXT_COLOR;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(side, ch * 0.405, contentWidth, 2);
    ctx.globalAlpha = 1;

    const base = intro < 1
      ? [
          { text: reveal("Welcome to ED-Linux 1.0 LTS", 8 + intro * 26), style: "normal" },
          { text: reveal("\u2192\u2192 Swipe up to enter", 4 + intro * 30), style: "normal" },
          { text: reveal('Tap to type \u00b7 try "help"', intro * 32), style: "dim" },
        ]
      : [
          { text: "Welcome to ED-Linux 1.0 LTS", style: "normal" },
          { text: "\u2192\u2192 Swipe up to enter", style: "normal" },
          { text: 'Tap to type \u00b7 try "help"', style: "dim" },
        ];
    const lines = [...base, ...state.log];
    // Only draw as many lines as fit between the divider and the (possibly
    // keyboard-lifted) prompt, newest last.
    const logTop = ch * 0.47;
    const maxVisible = Math.max(1, Math.min(7, Math.floor((promptY - 40 - logTop) / 50)));
    const visible = lines.slice(
      Math.max(lines.length - maxVisible - state.scroll, 0),
      Math.max(lines.length - state.scroll, 0),
    );
    visible.forEach((line, index) => {
      ctx.globalAlpha = line.style === "dim" ? 0.5 : 1;
      drawFittedText(ctx, line.text, side, logTop + index * 50, 23, contentWidth, TEXT_COLOR);
      ctx.globalAlpha = 1;
    });
  }

  const promptSize = 24;
  const pText = promptStr(active);
  drawText(ctx, pText, side, promptY, promptSize, TEXT_COLOR);
  const pWidth = measure(ctx, pText, promptSize);
  const inputX = side + pWidth + 12;
  drawFittedText(ctx, state.input, inputX, promptY, promptSize, contentWidth - pWidth - 12, TEXT_COLOR);

  if (Math.sin(elapsedSeconds * 5.2) > 0) {
    const caretX = Math.min(inputX + measure(ctx, state.input, promptSize) + 2, cw - side - 14);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillRect(caretX, promptY, 14, 27);
  }
}

// ── Helpers ────────────────────────────────────────────

function makeAsset(src) {
  const image = new Image();
  const asset = {
    image,
    sprite: null,
    preview: null,
    loaded: false,
    ready: false,
    callbacks: [],
    load(onReady) {
      if (typeof onReady === "function") {
        if (asset.ready) onReady();
        else asset.callbacks.push(onReady);
      }
      if (!src || asset.loaded) return;
      asset.loaded = true;
      image.src = src;
    },
  };
  image.decoding = "async";
  image.addEventListener("load", () => {
    asset.sprite = phosphorize(image);
    asset.preview = renderPreviewCanvas(image);
    asset.ready = true;
    asset.callbacks.splice(0).forEach((callback) => callback());
  });
  image.addEventListener("error", () => {
    asset.ready = true;
    asset.callbacks.splice(0).forEach((callback) => callback());
  });
  return asset;
}

function renderPreviewCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;
  const ctx = canvas.getContext("2d");
  const frame = { x: 0, y: 0, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT };

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.filter = "blur(8px)";
  blit(ctx, image, frame, true);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.filter = "contrast(1.06) saturate(0.95)";
  blit(ctx, image, frame, true);
  ctx.restore();

  return canvas;
}

function ensureBuffer(owner, key, width, height) {
  if (!owner[key] || owner[key].canvas.width !== width || owner[key].canvas.height !== height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    owner[key] = canvas.getContext("2d");
    owner[key].imageSmoothingEnabled = false;
    if (key === "_lag") owner._lagReady = false;
  }
  return owner[key];
}

function phosphorize(image) {
  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;
  const width = clamp(Math.round(sw / 2.4), 72, 180);
  const height = Math.max(48, Math.round((sh / sw) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);

  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      const l = ((data[i] * 0.2126) + (data[i + 1] * 0.7152) + (data[i + 2] * 0.0722)) / 255 * a;
      let v = l < ((BAYER[y % 4][x % 4] + 1) / 17) * 0.75 ? 0 : l < 0.45 ? 0.45 : l < 0.72 ? 0.72 : 1;
      if (y % 2) v *= 0.84;
      data[i]     = 249 * v;
      data[i + 1] = 144 * v;
      data[i + 2] = 33 * v;
      data[i + 3] = 255 * v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function drawSprite(ctx, sprite, frame, cover = false) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.filter = "blur(10px)";
  blit(ctx, sprite, frame, cover);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.95;
  blit(ctx, sprite, frame, cover);
  ctx.restore();
}

function blit(ctx, image, frame, cover) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (!iw || !ih) return;
  const scale = cover ? Math.max(frame.width / iw, frame.height / ih) : Math.min(frame.width / iw, frame.height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = frame.x + (frame.width - dw) * 0.5;
  const dy = frame.y + (frame.height - dh) * 0.5;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, dx, dy, dw, dh);
}

function drawText(ctx, text, x, y, size, color) {
  if (!text) return;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = "top";
  if (color !== HIGHLIGHT_TEXT_COLOR) {
    const tightBlur = size >= 34 ? 3 : 2;
    const softBlur = size >= 34 ? 7 : 5;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = size >= 34 ? 0.22 : 0.16;
    ctx.filter = `blur(${tightBlur}px)`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = size >= 34 ? 0.06 : 0.04;
    ctx.filter = `blur(${softBlur}px)`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawFittedText(ctx, text, x, y, size, maxWidth, color) {
  if (!text || maxWidth <= 0) return;
  let fitted = text;
  while (fitted.length > 1 && measure(ctx, fitted, size) > maxWidth) {
    fitted = `${fitted.slice(0, -2)}\u2026`;
  }
  drawText(ctx, fitted, x, y, size, color);
}

function drawHighlight(ctx, text, x, y, size) {
  if (!text) return;
  const width = measure(ctx, text, size);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.22;
  ctx.filter = "blur(8px)";
  ctx.fillStyle = HIGHLIGHT_FILL_COLOR;
  ctx.fillRect(x - 14, y - 10, width + 28, size + 26);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.12;
  ctx.filter = "blur(2px)";
  ctx.fillStyle = HIGHLIGHT_FILL_COLOR;
  ctx.fillRect(x - 8, y - 6, width + 16, size + 16);
  ctx.restore();

  ctx.fillStyle = HIGHLIGHT_FILL_COLOR;
  ctx.fillRect(x - 8, y - 6, width + 16, size + 18);
  drawText(ctx, text, x, y + 4, size, HIGHLIGHT_TEXT_COLOR);
}

function drawHeaderHalo(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = "blur(18px)";

  const halo = ctx.createRadialGradient(308, 208, 10, 308, 208, 170);
  halo.addColorStop(0, "rgba(255,217,92,0.18)");
  halo.addColorStop(0.42, "rgba(249,144,33,0.08)");
  halo.addColorStop(1, "rgba(249,144,33,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(92, 46, 470, 290);

  const secondary = ctx.createRadialGradient(332, 168, 12, 332, 168, 150);
  secondary.addColorStop(0, "rgba(255,207,92,0.12)");
  secondary.addColorStop(1, "rgba(255,207,92,0)");
  ctx.fillStyle = secondary;
  ctx.fillRect(138, 86, 360, 130);

  ctx.restore();
}

function ensurePixelFont() {
  if (fontPromise || typeof FontFace === "undefined") return;
  fontPromise = new FontFace("Public Pixel", "url(/fonts/public-pixel.woff)")
    .load()
    .then((font) => document.fonts?.add?.(font))
    .catch(() => {});
}

function promptStr(active) {
  return active ? "user:/projects$" : "user:~$";
}

function reveal(text, count) {
  return text.slice(0, Math.max(0, Math.floor(count)));
}

function measure(ctx, text, size) {
  ctx.font = `${size}px ${FONT}`;
  return ctx.measureText(text).width;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fract(x) {
  return x - Math.floor(x);
}
