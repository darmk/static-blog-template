// ─────────────────────────────────────────────────────────────────────────────
// hero-particles.ts — Full-bleed particle field for the homepage Hero.
//
// What you see:
//   • ~650-1200 particles drift across the entire section in a gentle flow field
//     (vortex + tiny sin offsets, cheap per frame).
//   • The cursor lightly pushes nearby particles away (repulsion force with a
//     smooth falloff, only active for ~300ms after the last move).
//   • Every ~13s the system enters ASSEMBLE: each particle is reassigned a
//     target slot inside the headline silhouette ("记录技术 / 分享实践 / 探索
//     有趣的东西"), then eased in over 1.4s. We HOLD for 3.2s, then DISPERSE.
//     During HOLD we also paint a soft text watermark behind the real H1 so
//     the "千字归位" silhouette is clearly visible without hurting readability.
//   • Closest pairs are joined with hair-thin lines — gives the airy
//     "constellation" texture.
//
// Targets are sampled from the real H1 bounding boxes via an offscreen canvas,
// so the headline silhouette always aligns with whatever CSS the page renders.
//
// Reduced motion: no animation, no assemble. Particles rendered once, no rAF
// loop at all.
//
// Performance: dpr capped at 2, ~1200 particles on desktop, ~650 on mobile;
// connection lines capped at 90 pairs; mouse force gated on recent move;
// automatic pause when tab is hidden.
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'drift' | 'assemble' | 'hold' | 'disperse';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** current target (set during assemble cycle) */
  tx: number;
  ty: number;
  /** size jitter for organic look */
  s: number;
  /** 0-1, used during assemble for staggered arrival */
  delay: number;
}

const ASSEMBLE_MS = 1400;
const HOLD_MS = 3200;
const DISPERSE_MS = 1600;
const DRIFT_PAUSE_MS = 6200;
const WARMUP_MS = 1200;
const MOUSE_RADIUS = 90;
const MOUSE_STRENGTH = 0.04;
const CONNECT_DIST = 80;
const MAX_CONNECTIONS = 90;
const MOBILE_PARTICLES = 650;
const DESKTOP_PARTICLES = 1200;

// ── public entry ─────────────────────────────────────────────────────────────

export function initHeroParticles(): () => void {
  const root = document.getElementById('hero');
  if (!root) return () => {};

  // guard re-init under View Transitions
  if (root.querySelector(':scope > canvas[data-hero-particles]')) {
    return () => {};
  }

  const canvas = document.createElement('canvas');
  canvas.dataset.heroParticles = '';
  canvas.setAttribute('aria-hidden', 'true');
  root.prepend(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const isMobile = window.innerWidth < 768;

  let width = 0;
  let height = 0;
  let particles: Particle[] = [];
  let targets: Array<[number, number]> = [];
  let watermarkCanvas: HTMLCanvasElement | null = null;
  let phase: Phase = 'drift';
  let phaseStart = performance.now();
  let lastAssembleAt = 0;
  let mouse = { x: -9999, y: -9999, last: 0 };
  let raf = 0;
  let ro: ResizeObserver | null = null;
  let alive = true;
  let frameTick = 0;
  let phasePhases: Float32Array = new Float32Array(0);

  let onMouseMove: ((e: PointerEvent) => void) | null = null;
  let onMouseLeave: (() => void) | null = null;
  let onVis: (() => void) | null = null;
  let onThemeChange: (() => void) | null = null;
  let themeObserver: MutationObserver | null = null;

  // ── palette (theme-reactive) ──────────────────────────────────────────────
  const resolveColors = () => {
    const theme =
      document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const ambient =
      theme === 'light'
        ? 'rgba(34, 41, 58, 0.40)'
        : 'rgba(196, 210, 240, 0.45)';
    const accent =
      theme === 'light'
        ? 'rgba(30, 80, 220, 1)'
        : 'rgba(140, 185, 255, 1)';
    const link =
      theme === 'light'
        ? 'rgba(34, 41, 58, 0.10)'
        : 'rgba(196, 210, 240, 0.10)';
    return { ambient, accent, link };
  };
  let palette = resolveColors();

  // ── target sampling + watermark canvas ─────────────────────────────────────
  interface TextLine {
    text: string;
    x: number;
    y: number;
    size: number;
  }

  const buildTextLines = (w: number, h: number): TextLine[] => {
    const rootRect = root.getBoundingClientRect();
    const h1 = document.querySelector<HTMLElement>('h1[data-hero="title"]');
    const lines = h1
      ? Array.from(h1.querySelectorAll<HTMLElement>('[data-hero-line]'))
      : [];

    let centerX = w / 2;
    let centerY = h * 0.42;
    const scale = 1.8;

    if (!h1 || lines.length === 0) {
      const linesLiteral = ['记录技术', '分享实践', '探索有趣的东西'];
      const size = Math.max(36, Math.min(w * 0.07, 96)) * scale;
      const lineHeight = size * 1.12;
      const totalHeight = linesLiteral.length * lineHeight;
      return linesLiteral.map((text, i) => ({
        text,
        x: centerX,
        y: centerY - totalHeight / 2 + i * lineHeight + lineHeight / 2,
        size,
      }));
    }

    const h1Rect = h1.getBoundingClientRect();
    centerX = h1Rect.left - rootRect.left + h1Rect.width / 2;
    centerY = h1Rect.top - rootRect.top + h1Rect.height / 2;

    const ordered = lines
      .slice()
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    return ordered.map((line, i) => {
      const rect = line.getBoundingClientRect();
      const size = Math.max(28, rect.height * 0.78) * scale;
      const lineHeight = size * 1.12;
      const totalHeight = ordered.length * lineHeight;
      const y =
        centerY - totalHeight / 2 + i * lineHeight + lineHeight / 2;
      return { text: line.textContent ?? '', x: centerX, y, size };
    });
  };

  const sampleTargets = (w: number, h: number) => {
    const off = document.createElement('canvas');
    off.width = Math.floor(w);
    off.height = Math.floor(h);
    const octx = off.getContext('2d')!;

    octx.fillStyle = '#000';
    octx.fillRect(0, 0, off.width, off.height);
    octx.fillStyle = '#fff';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';

    const lines = buildTextLines(w, h);
    const fontFamily =
      "system-ui, -apple-system, 'PingFang SC', 'Microsoft Yahei', sans-serif";
    lines.forEach((line) => {
      octx.font = `600 ${line.size}px ${fontFamily}`;
      octx.fillText(line.text, line.x, line.y);
    });

    const data = octx.getImageData(0, 0, off.width, off.height).data;
    const pts: Array<[number, number]> = [];
    // Coarse sampling: keep target count low enough that the particle count
    // can produce a visible silhouette behind the real H1.
    for (let y = 0; y < off.height; y += 8) {
      for (let x = 0; x < off.width; x += 8) {
        const idx = (y * off.width + x) * 4;
        if (data[idx + 3] > 128) pts.push([x, y]);
      }
    }

    // Build a soft visual watermark of the same text to show behind the H1
    // during the HOLD phase.
    const wm = document.createElement('canvas');
    wm.width = off.width;
    wm.height = off.height;
    const wmCtx = wm.getContext('2d')!;
    wmCtx.textAlign = 'center';
    wmCtx.textBaseline = 'middle';
    wmCtx.filter = 'blur(4px)';
    wmCtx.fillStyle = palette.accent;
    lines.forEach((line) => {
      wmCtx.font = `600 ${line.size}px ${fontFamily}`;
      wmCtx.fillText(line.text, line.x, line.y);
    });
    watermarkCanvas = wm;

    return pts;
  };

  // ── particle init ─────────────────────────────────────────────────────────
  const seed = (w: number, h: number) => {
    const count = Math.round(
      (isMobile ? MOBILE_PARTICLES : DESKTOP_PARTICLES) *
        Math.min(1, Math.max(0.65, (w * h) / (1440 * 900))),
    );
    particles = new Array(count).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      s: 0.6 + Math.random() * 1.4,
      delay: Math.random(),
    }));
    phasePhases = new Float32Array(count);
    for (let i = 0; i < count; i++) phasePhases[i] = Math.random() * 6.28;
  };

  // ── lifecycle ─────────────────────────────────────────────────────────────
  const resize = (reset = false) => {
    const rect = root.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    targets = sampleTargets(width, height);
    if (reset) {
      phase = 'drift';
      phaseStart = performance.now();
      lastAssembleAt = 0;
      seed(width, height);
    }
  };

  // ── assemble kick-off ─────────────────────────────────────────────────────
  const startAssemble = (now: number) => {
    // Re-sample targets right before every assemble so the silhouette aligns
    // with the real rendered H1 even if fonts/layout shifted.
    targets = sampleTargets(width, height);
    if (targets.length === 0) return;

    const pool = targets.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < particles.length; i++) {
      const t = pool[i % pool.length];
      if (t) {
        particles[i].tx = t[0];
        particles[i].ty = t[1];
      }
    }
    phase = 'assemble';
    phaseStart = now;
    lastAssembleAt = now;
  };

  // ── frame update ──────────────────────────────────────────────────────────
  const step = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(step);
    frameTick++;

    const elapsed = now - phaseStart;
    // ── phase machine ────────────────────────────────────────────
    if (phase === 'drift') {
      if (lastAssembleAt === 0) {
        if (elapsed > WARMUP_MS) startAssemble(now);
      } else if (elapsed > DRIFT_PAUSE_MS) {
        startAssemble(now);
      }
    } else if (phase === 'assemble' && elapsed > ASSEMBLE_MS) {
      phase = 'hold';
      phaseStart = now;
    } else if (phase === 'hold' && elapsed > HOLD_MS) {
      phase = 'disperse';
      phaseStart = now;
    } else if (phase === 'disperse' && elapsed > DISPERSE_MS) {
      phase = 'drift';
      phaseStart = now;
    }

    // ── per-particle forces ──────────────────────────────────────
    const mouseActive = now - mouse.last < 300;
    const cx = width / 2;
    const cy = height / 2;
    const t4 = now * 0.0004;
    const t5 = now * 0.0005;
    const isAssemble = phase === 'assemble';
    const isHold = phase === 'hold';
    const isDisperse = phase === 'disperse';
    const assembleFraction = isAssemble ? elapsed / ASSEMBLE_MS : 0;
    const disperseFraction = isDisperse ? elapsed / DISPERSE_MS : 0;
    const dispersePush = Math.sin(disperseFraction * Math.PI);

    const isGather = isAssemble || isHold;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // gentle vortex around center (muted during gather so the silhouette locks)
      const dx = p.x - cx;
      const dy = p.y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const cosA = dx / r;
      const sinA = dy / r;
      const swirl = isGather
        ? 0.02 / Math.sqrt(r * 0.1 + 1)
        : 0.16 / Math.sqrt(r * 0.1 + 1);
      p.vx += -sinA * swirl + cosA * swirl * 0.4;
      p.vy += cosA * swirl + sinA * swirl * 0.4;

      // subtle flow (also muted during gather)
      const flow = isGather ? 0.002 : 0.012;
      p.vx += Math.sin(t4 + phasePhases[i]) * flow;
      p.vy += Math.cos(t5 + phasePhases[i] * 1.13) * flow;

      // mouse repulsion
      if (mouseActive) {
        const mx = p.x - mouse.x;
        const my = p.y - mouse.y;
        const md2 = mx * mx + my * my;
        if (md2 < MOUSE_RADIUS * MOUSE_RADIUS && md2 > 1) {
          const f = (1 - Math.sqrt(md2) / MOUSE_RADIUS) * MOUSE_STRENGTH;
          const inv = 1 / Math.sqrt(md2);
          p.vx += mx * inv * f;
          p.vy += my * inv * f;
        }
      }

      // assemble lerp
      if (isAssemble || isHold) {
        const localT = isHold
          ? 1
          : Math.max(
              0,
              Math.min(1, (assembleFraction - p.delay * 0.6) / 0.5),
            );
        const ease = localT * localT * (3 - 2 * localT);
        p.vx += (p.tx - p.x) * ease * 0.12;
        p.vy += (p.ty - p.y) * ease * 0.12;
      } else if (isDisperse) {
        p.vx += cosA * dispersePush * 0.04 + (Math.random() - 0.5) * 0.02;
        p.vy += sinA * dispersePush * 0.04 + (Math.random() - 0.5) * 0.02;
      }

      // damping
      p.vx *= 0.92;
      p.vy *= 0.92;

      p.x += p.vx;
      p.y += p.vy;

      // wrap edges during drift / disperse
      if (phase === 'drift' || isDisperse) {
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        else if (p.y > height + 10) p.y = -10;
      }
    }

    // ── draw ──────────────────────────────────────────────────────
    ctx.clearRect(0, 0, width, height);

    // soft text watermark during hold — this is the visible "千字归位"
    if (isHold && watermarkCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.drawImage(watermarkCanvas, 0, 0, width, height);
      ctx.restore();
    }

    // connections (constellation)
    if (frameTick % 2 === 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.link;
      ctx.beginPath();
      let drawn = 0;
      for (
        let i = 0;
        i < particles.length && drawn < MAX_CONNECTIONS;
        i += 2
      ) {
        const a = particles[i];
        for (
          let j = i + 1;
          j < particles.length && drawn < MAX_CONNECTIONS;
          j++
        ) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.abs(dx) > CONNECT_DIST || Math.abs(dy) > CONNECT_DIST)
            continue;
          const d2 = dx * dx + dy * dy;
          if (d2 < CONNECT_DIST * CONNECT_DIST) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            drawn++;
          }
        }
      }
      ctx.stroke();
    }

    // particle dots
    if (isGather) {
      ctx.fillStyle = palette.accent;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const size = p.s * 2.2;
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
    } else {
      ctx.fillStyle = palette.ambient;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    }
  };

  // ── static fallback for reduced-motion ───────────────────────────────────
  const renderStatic = () => {
    if (!width) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.ambient;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
  };

  // ── event wiring ─────────────────────────────────────────────────────────
  onMouseMove = (e: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.last = performance.now();
  };
  onMouseLeave = () => {
    mouse.x = -9999;
    mouse.y = -9999;
  };
  onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (alive && !raf) {
      raf = requestAnimationFrame(step);
    }
  };
  onThemeChange = () => {
    palette = resolveColors();
    // force watermark rebuild on next assemble so color matches theme
    watermarkCanvas = null;
  };

  root.addEventListener('pointermove', onMouseMove);
  root.addEventListener('pointerleave', onMouseLeave);
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('astro:after-swap', onThemeChange);
  themeObserver = new MutationObserver(onThemeChange);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // ── start ─────────────────────────────────────────────────────────────────
  resize(true);
  if (reducedMotion) {
    renderStatic();
  } else {
    raf = requestAnimationFrame(step);
  }

  ro = new ResizeObserver(() => {
    const rect = root.getBoundingClientRect();
    if (
      Math.abs(rect.width - width) < 1 &&
      Math.abs(rect.height - height) < 1
    )
      return;
    resize();
  });
  ro.observe(root);

  // ── cleanup ───────────────────────────────────────────────────────────────
  return () => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ro?.disconnect();
    themeObserver?.disconnect();
    document.removeEventListener('visibilitychange', onVis!);
    document.removeEventListener('astro:after-swap', onThemeChange!);
    root.removeEventListener('pointermove', onMouseMove!);
    root.removeEventListener('pointerleave', onMouseLeave!);
    if (canvas.parentElement) canvas.remove();
  };
}
