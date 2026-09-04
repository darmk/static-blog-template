import { visit } from 'unist-util-visit';
import GithubSlugger from 'github-slugger';
import type { Element, Root } from 'hast';

/** 提取 heading 的纯文本（与 Astro 内置 rehypeHeadingIds 的文本提取保持一致） */
function headingText(node: Element): string {
  let text = '';
  const walk = (child: Element['children'][number]): void => {
    if (child.type === 'text') {
      text += child.value;
    } else if (child.type === 'element') {
      child.children.forEach(walk);
    }
  };
  node.children.forEach(walk);
  return text;
}

/**
 * Adds a `#` anchor link to every h2–h4 in article prose.
 * The link is invisible until the heading is hovered (see `.heading-anchor`).
 *
 * 注：Astro 的内置 rehypeHeadingIds 在用户插件之后运行，且会保留已存在的
 * id，所以这里直接用同样的 github-slugger 算法先生成 id，保证 TOC 链接一致。
 */
export function rehypeHeadingAnchor() {
  return (tree: Root) => {
    const slugger = new GithubSlugger();

    visit(tree, 'element', (node: Element) => {
      if (!/^h[234]$/.test(node.tagName)) return;
      // skip headings inside interactive components
      if (node.properties?.['dataNoAnchor'] !== undefined) return;

      let id = node.properties?.['id'];
      if (typeof id !== 'string' || !id) {
        id = slugger.slug(headingText(node));
        node.properties = node.properties ?? {};
        node.properties['id'] = id;
      }

      const existing = node.children.find(
        (child) =>
          child.type === 'element' &&
          (child as Element).properties?.['class']
            ?.toString()
            .includes('heading-anchor')
      );
      if (existing) return;

      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          class: 'heading-anchor',
          href: `#${id}`,
          ariaLabel: '链接到本节',
          tabIndex: 0,
        },
        children: [{ type: 'text', value: '#' }],
      });
    });
  };
}

/**
 * Marks prose images as lightbox-enabled and forwards width/height so the
 * browser can reserve space (no CLS). Behaviour lives in `lightbox.ts`.
 *
 *   ![说明](/img.webp)        → clickable, lazy, lightboxed
 *   ![说明](/img.webp#static) → rendered as-is
 */
export function rehypeLightbox() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'img') return;

      const src = node.properties?.['src'];
      if (typeof src !== 'string') return;
      if (src.includes('#static')) {
        node.properties['src'] = src.replace('#static', '');
        return;
      }

      const alt =
        typeof node.properties?.['alt'] === 'string'
          ? node.properties['alt']
          : '';

      node.properties['loading'] = 'lazy';
      node.properties['decoding'] = 'async';
      node.properties['dataLightbox'] = '';
      node.properties['dataCaption'] = alt;

      // the click target is the <img> itself; keyboard access is added by
      // the lightbox script via tabindex + role
      node.properties['tabindex'] = 0;
      node.properties['role'] = 'button';
      node.properties['ariaLabel'] = alt
        ? `放大查看：${alt}`
        : '放大查看图片';
    });
  };
}
