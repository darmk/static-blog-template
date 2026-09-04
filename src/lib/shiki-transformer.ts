import type { ShikiTransformer } from 'shiki';
import type { Element, ElementContent } from 'hast';

/**
 * A single transformer that turns a plain Shiki `<pre>` into the editorial
 * code block used across the site:
 *
 *   ┌──────────────────────────────────┐
 *   │ ● ● ●   src/agent.ts   TypeScript│
 *   ├──────────────────────────────────┤
 *   │ 01 const agent = createAgent({   │
 *   └──────────────────────────────────┘
 *
 * Meta syntax:
 *   ```ts title="src/agent.ts" showLineNumbers {1,3-5}
 *   ```diff
 *
 * Notation comments:
 *   // [!code highlight]    // [!code focus]
 *   // [!code ++]           // [!code --]
 */

type Notation = 'highlight' | 'focus' | 'add' | 'remove';

const NOTATION_RE =
  /^(\s*)((?:\/\/|\/\*|#|--|;|<!--)\s*)?\[!code\s+(highlight|focus|\+\+|--)\](\s*(?:\*\/|-->)?)?\s*$/;

function el(
  tag: string,
  properties: Element['properties'] = {},
  children: ElementContent[] = []
): Element {
  return { type: 'element', tagName: tag, properties, children };
}

function parseRange(raw: string, total: number): Set<number> {
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const segment = part.trim();
    if (!segment) continue;
    const [startRaw, endRaw] = segment.split('-');
    const start = Number.parseInt(startRaw, 10);
    if (Number.isNaN(start)) continue;
    const end = endRaw ? Number.parseInt(endRaw, 10) : start;
    for (let i = start; i <= Math.min(end, total); i++) out.add(i);
  }
  return out;
}

/** Parses `title="a.ts" showLineNumbers {1,3-5}` into structured meta. */
function parseMeta(raw: string | undefined) {
  const meta = {
    filename: '',
    showLineNumbers: false,
    highlightRaw: '',
  };
  if (!raw) return meta;

  const title = raw.match(/title=(?:"([^"]*)"|'([^']*)'|(\S+))/);
  if (title) meta.filename = title[1] ?? title[2] ?? title[3] ?? '';

  meta.showLineNumbers = /\bshowLineNumbers\b/.test(raw);

  const range = raw.match(/\{([\d\s,\-]+)\}/);
  if (range?.[1]) meta.highlightRaw = range[1];

  return meta;
}

export function codeBlockTransformer(): ShikiTransformer {
  return {
    name: 'darmk:code-block',

    preprocess(code) {
      const matched: Notation[] = [];

      const lines = code.split('\n').map((line) => {
        const match = line.match(NOTATION_RE);
        if (!match) return line;

        const kind = match[3];
        matched.push(
          kind === 'highlight'
            ? 'highlight'
            : kind === 'focus'
              ? 'focus'
              : kind === '++'
                ? 'add'
                : 'remove'
        );
        return '';
      });

      // stash the notations so the `root` hook can read them
      (this.meta as Record<string, unknown>).__notations = matched;
      return lines.join('\n');
    },

    root(root) {
      const pre = root.children.find(
        (n): n is Element => n.type === 'element' && n.tagName === 'pre'
      );
      if (!pre) return;

      const code = pre.children.find(
        (n): n is Element => n.type === 'element' && n.tagName === 'code'
      );
      if (!code) return;

      const lang: string =
        (typeof pre.properties?.['dataLanguage'] === 'string'
          ? pre.properties['dataLanguage']
          : '') || this.options.lang || 'text';

      const meta = parseMeta(this.options.meta?.__raw);
      const notations =
        ((this.meta as Record<string, unknown>)
          .__notations as Notation[] | undefined) ?? [];

      const lines = code.children.filter(
        (n): n is Element =>
          n.type === 'element' &&
          typeof n.properties?.['class'] === 'string' &&
          n.properties['class'].includes('line')
      );

      const metaHighlight = meta.highlightRaw
        ? parseRange(meta.highlightRaw, lines.length)
        : new Set<number>();

      let hasFocus = false;
      let hasDiff = false;

      lines.forEach((line, index) => {
        const notation = notations[index];

        if (notation === 'focus') {
          hasFocus = true;
          addLineClass(line, 'focused');
        } else if (notation === 'add' || notation === 'remove') {
          hasDiff = true;
          addLineClass(line, 'diff');
          addLineClass(line, notation === 'add' ? 'add' : 'remove');
          line.properties!['dataDiffSign'] = notation === 'add' ? '+' : '-';
        } else if (notation === 'highlight' || metaHighlight.has(index + 1)) {
          addLineClass(line, 'highlighted');
        }
      });

      // ---- header -------------------------------------------------------
      const header: ElementContent[] = [
        el('span', { class: 'code-dots' }, [
          el('i', {}),
          el('i', {}),
          el('i', {}),
        ]),
      ];

      if (meta.filename) {
        header.push(el('span', { class: 'code-filename' }, [
          { type: 'text', value: meta.filename },
        ]));
      }
      header.push(
        el('span', { class: 'code-lang' }, [
          { type: 'text', value: lang },
        ])
      );

      // ---- copy button (behaviour lives in a small delegated script) ----
      const copyButton = el(
        'button',
        {
          class: 'code-copy',
          type: 'button',
          'data-code-copy': '',
          'aria-label': '复制代码',
        },
        [
          el('span', { 'data-copy-icon': '' }, [
            { type: 'text', value: '复制' },
          ]),
        ]
      );

      const body = el('div', { class: 'code-body' }, [pre]);

      const wrapper = el(
        'div',
        {
          class: [
            'code-block',
            hasFocus ? 'has-focused' : '',
            hasDiff ? 'has-diff' : '',
          ]
            .filter(Boolean)
            .join(' '),
          'data-linenumbers': String(meta.showLineNumbers),
          'data-lang': lang,
        },
        [
          el('div', { class: 'code-head' }, header),
          body,
          copyButton,
        ]
      );

      root.children = [wrapper];
    },
  };
}

function addLineClass(line: Element, className: string) {
  const current = line.properties?.['class'];
  const base = typeof current === 'string' ? current : '';
  if (base.split(/\s+/).includes(className)) return;
  line.properties!['class'] = `${base} ${className}`.trim();
}
