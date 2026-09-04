/**
 * Hero 入场 Timeline —— GSAP 只负责这一处编排级动画。
 *
 * 规则（来自 GSAP 动画开发助手）：
 *  - 只动画 opacity / y / filter(blur)，不碰 layout 属性
 *  - stagger 100ms 左右，禁止 bounce/elastic
 *  - prefers-reduced-motion 时直接落到最终状态
 *  - astro:page-swap 前彻底 kill，after-swap 后重新初始化，避免重复时间线
 */
import { gsap } from 'gsap';

function playHero(): void {
  const root = document.querySelector<HTMLElement>('[data-hero-root]');
  if (!root) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const targets = [
    '[data-nav]', // navbar
    ...['eyebrow', 'title', 'desc', 'tags', 'cta', 'status'].map(
      (k) => `[data-hero="${k}"]`
    ),
  ].map((sel) => root.querySelector(sel) ?? document.querySelector(sel));

  const lines = root.querySelectorAll('[data-hero-line]');
  const floatTags = root.querySelectorAll('[data-hero-tag]');

  if (reduced) {
    gsap.set(targets, { clearProps: 'all' });
    gsap.set(lines, { clearProps: 'all' });
    return;
  }

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    // 标记便于在页面切换时统一销毁
    id: 'hero-intro',
  });

  tl.fromTo(
    targets.filter(Boolean),
    { opacity: 0, y: 26, filter: 'blur(8px)' },
    {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.9,
      stagger: 0.1,
      clearProps: 'filter', // blur 只用于入场，结束后移除避免残留合成层
    }
  )

    // 标题三行：从遮罩里升起（y 位移，不碰 transform 以外的属性）
    .fromTo(
      lines,
      { yPercent: 108 },
      { yPercent: 0, duration: 0.85, ease: 'power4.out', stagger: 0.09 },
      0.18
    )

    // 技术标签：极慢漂浮（无限循环，但只 transform）
    .fromTo(
      floatTags,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 },
      0.55
    );

  // 标签静态漂浮 —— 单独的无限 tween，跟随时间线清理
  floatTags.forEach((tag, i) => {
    gsap.to(tag, {
      y: i % 2 === 0 ? -3 : 3,
      duration: 3.2 + i * 0.35,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 1.4,
    });
  });

  tl.play();
}

function killHero(): void {
  gsap.killTweensOf(
    '[data-hero], [data-hero-line], [data-hero-tag], [data-nav]'
  );
  gsap.globalTimeline.getChildren().forEach((tween) => {
    if (
      (tween as gsap.core.Tween).targets?.toString?.().includes('data-hero')
    ) {
      tween.kill();
    }
  });
}

export function initHeroAnimation(): void {
  killHero();
  // 等一帧，确保布局稳定（避免首帧跳变）
  requestAnimationFrame(() => playHero());
}

if (typeof document !== 'undefined') {
  document.addEventListener('astro:page-swap', killHero);
  document.addEventListener('astro:after-swap', initHeroAnimation);
  initHeroAnimation();
}
