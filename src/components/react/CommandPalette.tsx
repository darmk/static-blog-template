import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ArrowRight,
  CornerDownLeft,
  FileText,
  FolderGit2,
  Home,
  Search,
  StickyNote,
  Sun,
  User,
  X,
} from 'lucide-react';
import { navigation } from '~/config/navigation';

/* ------------------------------------------------------------------ types */

interface QuickAction {
  id: string;
  label: string;
  hint: string;
  href?: string;
  icon: typeof Home;
  action?: 'theme' | 'github' | 'search';
}

interface PagefindResult {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  meta: Record<string, string>;
}

type Row =
  | { kind: 'action'; item: QuickAction; key: string }
  | { kind: 'result'; item: PagefindResult; key: string };

/* --------------------------------------------------------------- helpers */

const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

let pagefindPromise: Promise<any> | null = null;

// 动态 URL 让 TS / Vite 不在构建期解析该模块（Pagefind 索引只在 build 后存在）
const pagefindUrl = '/pagefind/pagefind.js';

function loadPagefind() {
  if (!pagefindPromise) {
    pagefindPromise = import(/* @vite-ignore */ pagefindUrl).catch(() => null);
  }
  return pagefindPromise;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------ component */

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  /* ---- quick actions (shown when the query is empty) ------------------ */
  const actions: QuickAction[] = useMemo(
    () => [
      { id: 'home', label: '首页', hint: 'Home', href: '/', icon: Home },
      {
        id: 'blog',
        label: '文章',
        hint: 'Blog',
        href: '/blog',
        icon: FileText,
      },
      {
        id: 'projects',
        label: '项目',
        hint: 'Projects',
        href: '/projects',
        icon: FolderGit2,
      },
      {
        id: 'notes',
        label: '笔记',
        hint: 'Notes',
        href: '/notes',
        icon: StickyNote,
      },
      { id: 'about', label: '关于', hint: 'About', href: '/about', icon: User },
      {
        id: 'theme',
        label: '切换主题',
        hint: 'Theme',
        icon: Sun,
        action: 'theme',
      },
    ],
    []
  );

  /* ---- open / close --------------------------------------------------- */
  const openPalette = useCallback(() => {
    lastFocused.current = document.activeElement as HTMLElement;
    setOpen(true);
    setQuery('');
    setResults([]);
    setActive(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open ? closePalette() : openPalette();
        return;
      }
      if (event.key.toLowerCase() === 'escape' && open) {
        event.preventDefault();
        closePalette();
        return;
      }
      if (event.key === '/' && !open) {
        const target = event.target as HTMLElement;
        const typing =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable;
        if (!typing) {
          event.preventDefault();
          openPalette();
        }
      }
    };

    const onCustomOpen = () => openPalette();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('open-command-palette', onCustomOpen);
    document.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest?.(
        '[data-search-open]'
      );
      if (target) {
        event.preventDefault();
        openPalette();
      }
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('open-command-palette', onCustomOpen);
    };
  }, [open, openPalette, closePalette]);

  /* ---- side effects while open ---------------------------------------- */
  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);

    return () => {
      document.body.style.overflow = '';
      window.clearTimeout(timer);
      lastFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!ready) {
      loadPagefind().then((mod) => {
        if (mod?.init) {
          mod.init().then(() => setReady(true));
        }
      });
    }
  }, [ready]);

  /* ---- search --------------------------------------------------------- */
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      const pagefind = await loadPagefind();
      if (!pagefind || !pagefind.search) {
        if (!cancelled) {
          setResults([]);
          setLoading(false);
        }
        return;
      }

      try {
        const search = await pagefind.search(term);
        const data = await Promise.all(
          search.results.slice(0, 8).map((r: any) => r.data())
        );
        if (cancelled) return;
        setResults(
          data.map((item: any) => ({
            id: item.url,
            url: item.url,
            title: stripHtml(item.meta?.title ?? ''),
            excerpt: stripHtml(item.excerpt ?? ''),
            meta: item.meta ?? {},
          }))
        );
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  /* ---- rows ----------------------------------------------------------- */
  const rows: Row[] = useMemo(() => {
    if (query.trim()) {
      return results.map((item) => ({
        kind: 'result' as const,
        item,
        key: item.id,
      }));
    }
    return actions.map((item) => ({
      kind: 'action' as const,
      item,
      key: item.id,
    }));
  }, [query, results, actions]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${active}"]`
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  /* ---- navigation ----------------------------------------------------- */
  const runAction = useCallback(
    (action: QuickAction) => {
      if (action.action === 'theme') {
        const next =
          document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        closePalette();
        return;
      }
      if (action.href) closePalette();
    },
    [closePalette]
  );

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key.toLowerCase() === 'escape') {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[active];
      if (!row) return;
      if (row.kind === 'action') {
        if (row.item.href) window.location.href = row.item.href;
        else runAction(row.item);
      } else {
        window.location.href = row.item.url;
      }
      return;
    }
    // simple focus trap
    if (event.key === 'Tab' && panelRef.current) {
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'input, button, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const modKey = isMac() ? '⌘' : 'Ctrl';
  const searching = query.trim().length > 0;

  return (
    <>
      {/* ---- trigger --------------------------------------------------- */}
      <button
        type="button"
        onClick={openPalette}
        className="group hidden md:flex items-center gap-2 h-9 pl-3 pr-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors duration-200 hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
        aria-label="搜索"
      >
        <Search className="h-[15px] w-[15px]" strokeWidth={1.8} />
        <span className="text-[13px]">搜索</span>
        <kbd className="mono ml-1 flex items-center gap-0.5 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">
          {modKey} K
        </kbd>
      </button>

      <button
        type="button"
        onClick={openPalette}
        className="flex md:hidden h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--muted)]"
        aria-label="搜索"
      >
        <Search className="h-[16px] w-[16px]" strokeWidth={1.8} />
      </button>

      {/* ---- dialog ---------------------------------------------------- */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
          onKeyDown={onKeyDown}
          ref={panelRef}
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            onClick={closePalette}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="搜索"
            className="relative w-full max-w-[620px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] shadow-2xl"
          >
            {/* input */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
                <Search
                  className="h-[17px] w-[17px] shrink-0 text-[var(--faint)]"
                  strokeWidth={1.8}
                />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索文章、项目、标签…"
                  className="h-14 flex-1 bg-transparent text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--faint)]"
                  aria-label="搜索关键词"
                  autoComplete="off"
                  spellCheck={false}
                />
                {loading && (
                  <span className="mono text-[10px] text-[var(--faint)]">
                    …
                  </span>
                )}
                <button
                  type="button"
                  onClick={closePalette}
                  className="shrink-0 rounded p-1 text-[var(--faint)] hover:text-[var(--foreground)]"
                  aria-label="关闭搜索"
                >
                  <X className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>

              {/* results */}
              <div
                ref={listRef}
                className="max-h-[52vh] overflow-y-auto overscroll-contain p-2"
              >
                {!searching && (
                  <p className="eyebrow px-3 pb-1 pt-2">快速访问</p>
                )}

                {searching && rows.length === 0 && !loading && (
                  <div className="px-3 py-10 text-center">
                    <p className="text-[14px] text-[var(--muted)]">
                      没有匹配的内容
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--faint)]">
                      {ready
                        ? '试试其他关键词'
                        : '搜索索引需要先执行 npm run build'}
                    </p>
                  </div>
                )}

                {rows.map((row, index) => {
                  const selected = index === active;
                  if (row.kind === 'action') {
                    const Icon = row.item.icon;
                    return (
                      <button
                        key={row.key}
                        data-row-index={index}
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => {
                          if (row.item.href) {
                            closePalette();
                            window.location.href = row.item.href;
                          } else {
                            runAction(row.item);
                          }
                        }}
                        className={[
                          'flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors duration-150',
                          selected
                            ? 'bg-[var(--surface-hover)] text-[var(--foreground)]'
                            : 'text-[var(--muted)]',
                        ].join(' ')}
                      >
                        <Icon
                          className="h-[15px] w-[15px] shrink-0"
                          strokeWidth={1.7}
                        />
                        <span className="text-[14px]">{row.item.label}</span>
                        <span className="mono ml-auto text-[10.5px] text-[var(--faint)]">
                          {row.item.hint}
                        </span>
                        {selected && (
                          <CornerDownLeft
                            className="h-[13px] w-[13px] text-[var(--primary)]"
                            strokeWidth={1.8}
                          />
                        )}
                      </button>
                    );
                  }

                  return (
                    <a
                      key={row.key}
                      href={row.item.url}
                      data-row-index={index}
                      onMouseEnter={() => setActive(index)}
                      onClick={closePalette}
                      className={[
                        'group flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors duration-150',
                        selected
                          ? 'bg-[var(--surface-hover)]'
                          : 'hover:bg-[var(--surface)]',
                      ].join(' ')}
                    >
                      <FileText
                        className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[var(--faint)]"
                        strokeWidth={1.7}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-[var(--foreground)]">
                          {row.item.title}
                        </span>
                        {row.item.excerpt && (
                          <span className="mt-0.5 block line-clamp-2 text-[12px] leading-relaxed text-[var(--faint)]">
                            {row.item.excerpt}
                          </span>
                        )}
                      </span>
                      <ArrowRight
                        className={[
                          'mt-0.5 h-[14px] w-[14px] shrink-0 transition-opacity duration-150',
                          selected ? 'opacity-100' : 'opacity-0',
                        ].join(' ')}
                        strokeWidth={1.8}
                      />
                    </a>
                  );
                })}
              </div>

              {/* footer */}
              <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2.5">
                <span className="mono flex items-center gap-1 text-[10.5px] text-[var(--faint)]">
                  <kbd className="rounded border border-[var(--border)] px-1">
                    ↑
                  </kbd>
                  <kbd className="rounded border border-[var(--border)] px-1">
                    ↓
                  </kbd>
                  选择
                </span>
                <span className="mono flex items-center gap-1 text-[10.5px] text-[var(--faint)]">
                  <kbd className="rounded border border-[var(--border)] px-1">
                    ↵
                  </kbd>
                  打开
                </span>
                <span className="mono flex items-center gap-1 text-[10.5px] text-[var(--faint)]">
                  <kbd className="rounded border border-[var(--border)] px-1">
                    esc
                  </kbd>
                  关闭
                </span>
                <span className="mono ml-auto text-[10.5px] text-[var(--faint)]">
                  {navigation.length} 个页面
                </span>
              </div>
            </div>
          </div>
        )}
    </>
  );
}

export default CommandPalette;
