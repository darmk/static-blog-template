/**
 * Site-wide micro-interactions, deliberately vanilla.
 *
 * Rules this file follows:
 *  - pointer moves are throttled through rAF and written to CSS variables,
 *    never into React state
 *  - every listener / observer / rAF is returned in a teardown function so
 *    `astro:after-swap` can reinstall cleanly (no duplicate listeners)
 *  - pointer-driven effects are disabled on coarse pointers and when the user
 *    prefers reduced motion
 */

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = () =>
  window.matchMedia('(pointer: coarse)').matches;

type Teardown = () => void;

/* -------------------------------------------------------------------------
 * 1. Mouse spotlight
 *    [data-spotlight]        → local --mouse-x / --mouse-y
 *    [data-spotlight-scope]  → same, but also drives a page-level grid glow
 * ---------------------------------------------------------------------- */
function initSpotlight(): Teardown {
  const nodes = document.querySelectorAll<HTMLElement>('[data-spotlight]');
  const scopes = document.querySelectorAll<HTMLElement>(
    '[data-spotlight-scope]'
  );

  if (!nodes.length && !scopes.length) return () => {};

  let frame = 0;
  const pending = new Map<HTMLElement, { x: number; y: number }>();

  const flush = () => {
    frame = 0;
    for (const [node, point] of pending) {
      node.style.setProperty('--mouse-x', `${point.x}px`);
      node.style.setProperty('--mouse-y', `${point.y}px`);
    }
    pending.clear();
  };

  const onMove = (event: PointerEvent) => {
    const target = (event.currentTarget as HTMLElement) ?? null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    pending.set(target, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    if (!frame) frame = requestAnimationFrame(flush);
  };

  nodes.forEach((node) => node.addEventListener('pointermove', onMove));

  // page-level grid glow follows the cursor inside a scope element
  let scopeFrame = 0;
  let scopePoint = { x: 0, y: 0 };
  const onScopeMove = (event: PointerEvent) => {
    scopePoint = { x: event.clientX, y: event.clientY };
    if (scopeFrame) return;
    scopeFrame = requestAnimationFrame(() => {
      scopeFrame = 0;
      scopes.forEach((scope) => {
        const rect = scope.getBoundingClientRect();
        scope.style.setProperty('--mouse-x', `${scopePoint.x - rect.left}px`);
        scope.style.setProperty('--mouse-y', `${scopePoint.y - rect.top}px`);
      });
    });
  };

  const enablePointerEffects = !coarsePointer() && !reducedMotion();
  if (enablePointerEffects) {
    scopes.forEach((scope) =>
      scope.addEventListener('pointermove', onScopeMove)
    );
  }

  return () => {
    if (frame) cancelAnimationFrame(frame);
    if (scopeFrame) cancelAnimationFrame(scopeFrame);
    nodes.forEach((node) => node.removeEventListener('pointermove', onMove));
    scopes.forEach((scope) =>
      scope.removeEventListener('pointermove', onScopeMove)
    );
  };
}

/* -------------------------------------------------------------------------
 * 2. Scroll reveal — CSS transition driven, only toggles a class
 * ---------------------------------------------------------------------- */
function initReveal(): Teardown {
  const nodes = document.querySelectorAll<HTMLElement>('.reveal:not(.is-visible)');
  if (!nodes.length) return () => {};

  if (reducedMotion() || !('IntersectionObserver' in window)) {
    nodes.forEach((node) => node.classList.add('is-visible'));
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        const delay = Number(node.dataset.revealDelay ?? 0);
        window.setTimeout(() => node.classList.add('is-visible'), delay);
        observer.unobserve(node);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  nodes.forEach((node) => observer.observe(node));
  return () => observer.disconnect();
}

/* -------------------------------------------------------------------------
 * 3. Code block copy — single delegated listener
 * ---------------------------------------------------------------------- */
function initCodeCopy(): Teardown {
  const onClick = async (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-code-copy]'
    );
    if (!button) return;

    const block = button.closest<HTMLElement>('.code-block');
    const code = block?.querySelector('.code-body code');
    if (!code) return;

    const label = button.querySelector<HTMLElement>('[data-copy-icon]');
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      button.dataset.copied = 'true';
      if (label) label.textContent = '已复制';
    } catch {
      if (label) label.textContent = '复制失败';
    }

    window.setTimeout(() => {
      button.dataset.copied = 'false';
      if (label) label.textContent = '复制';
    }, 1600);
  };

  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}

/* -------------------------------------------------------------------------
 * 4. Image lightbox
 * ---------------------------------------------------------------------- */
let lightboxEl: HTMLDivElement | null = null;
let lightboxLastFocused: HTMLElement | null = null;

function ensureLightbox(): HTMLDivElement {
  if (lightboxEl) return lightboxEl;

  const root = document.createElement('div');
  root.className =
    'fixed inset-0 z-[120] hidden items-center justify-center bg-black/85 p-6 backdrop-blur-sm';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '图片预览');
  root.innerHTML = `
    <button type="button" data-lb-close
      class="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
      aria-label="关闭预览">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <path d="M18 6 6 18M6 6l12 12"></path>
      </svg>
    </button>
    <figure class="max-h-full max-w-full">
      <img data-lb-img alt="" class="max-h-[82vh] w-auto max-w-full rounded-[var(--radius)] border border-white/10 object-contain" />
      <figcaption data-lb-caption class="mt-4 text-center font-mono text-[12px] text-white/60"></figcaption>
    </figure>
  `;

  document.body.appendChild(root);
  lightboxEl = root;

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-lb-close') || target === root) closeLightbox();
  });

  return root;
}

function openLightbox(img: HTMLImageElement) {
  const root = ensureLightbox();
  const target = root.querySelector<HTMLImageElement>('[data-lb-img]');
  const caption = root.querySelector<HTMLElement>('[data-lb-caption]');

  if (target) {
    target.src = img.currentSrc || img.src;
    target.alt = img.alt;
  }
  if (caption) {
    caption.textContent = img.getAttribute('data-caption') || img.alt || '';
    caption.style.display = caption.textContent ? '' : 'none';
  }

  lightboxLastFocused = document.activeElement as HTMLElement;
  root.classList.remove('hidden');
  root.classList.add('flex');
  document.body.style.overflow = 'hidden';
  root.querySelector<HTMLElement>('[data-lb-close]')?.focus();
}

function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.classList.add('hidden');
  lightboxEl.classList.remove('flex');
  document.body.style.overflow = '';
  lightboxLastFocused?.focus?.();
}

function initLightbox(): Teardown {
  const onClick = (event: MouseEvent) => {
    const img = (event.target as HTMLElement).closest<HTMLImageElement>(
      'img[data-lightbox]'
    );
    if (img) {
      event.preventDefault();
      openLightbox(img);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeLightbox();

    // keyboard activation for the focusable images
    if (event.key === 'Enter' || event.key === ' ') {
      const img = document.activeElement as HTMLElement;
      if (img?.tagName === 'IMG' && img.hasAttribute('data-lightbox')) {
        event.preventDefault();
        openLightbox(img as HTMLImageElement);
      }
    }
  };

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeyDown);
  };
}

/* -------------------------------------------------------------------------
 * 5. Magnetic buttons — 3px, pointer devices only
 * ---------------------------------------------------------------------- */
function initMagnetic(): Teardown {
  if (coarsePointer() || reducedMotion()) return () => {};

  const buttons = document.querySelectorAll<HTMLElement>('[data-magnetic]');
  if (!buttons.length) return () => {};

  const teardowns: Teardown[] = [];

  buttons.forEach((button) => {
    let frame = 0;
    let dx = 0;
    let dy = 0;

    const apply = () => {
      frame = 0;
      button.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };

    const onMove = (event: PointerEvent) => {
      const rect = button.getBoundingClientRect();
      dx = ((event.clientX - rect.left) / rect.width - 0.5) * 6;
      dy = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      dx = 0;
      dy = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      button.style.transform = '';
    };

    button.addEventListener('pointermove', onMove);
    button.addEventListener('pointerleave', onLeave);
    teardowns.push(() => {
      button.removeEventListener('pointermove', onMove);
      button.removeEventListener('pointerleave', onLeave);
      button.style.transform = '';
    });
  });

  return () => teardowns.forEach((fn) => fn());
}

/* -------------------------------------------------------------------------
 * 6. Section indicator (desktop rail)
 * ---------------------------------------------------------------------- */
function initSectionIndicator(): Teardown {
  const rail = document.querySelector<HTMLElement>('[data-section-rail]');
  if (!rail) return () => {};

  const links = [...rail.querySelectorAll<HTMLAnchorElement>('a[data-target]')];
  const targets = links
    .map((link) => ({
      link,
      el: document.getElementById(link.dataset.target ?? ''),
    }))
    .filter((entry): entry is { link: HTMLAnchorElement; el: HTMLElement } =>
      Boolean(entry.el)
    );

  if (!targets.length) return () => {};

  let frame = 0;
  const update = () => {
    frame = 0;
    const line = window.innerHeight * 0.34;
    let currentIndex = 0;

    targets.forEach((entry, index) => {
      const rect = entry.el.getBoundingClientRect();
      if (rect.top <= line) currentIndex = index;
    });

    targets.forEach((entry, index) => {
      entry.link.dataset.active = String(index === currentIndex);
    });
  };

  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
  };
}

/* -------------------------------------------------------------------------
 * bootstrap
 * ---------------------------------------------------------------------- */
let teardowns: Teardown[] = [];

export function initInteractions() {
  teardowns.forEach((fn) => fn());
  teardowns = [
    initSpotlight(),
    initReveal(),
    initCodeCopy(),
    initLightbox(),
    initMagnetic(),
    initSectionIndicator(),
  ];
}

initInteractions();
document.addEventListener('astro:after-swap', initInteractions);
