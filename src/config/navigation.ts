export interface NavItem {
  label: string;
  href: string;
  /** 英文小标，仅 Desktop 展示 */
  en?: string;
}

export const navigation: NavItem[] = [
  { label: '首页', href: '/', en: 'Home' },
  { label: '文章', href: '/blog', en: 'Blog' },
  { label: '项目', href: '/projects', en: 'Projects' },
  { label: '笔记', href: '/notes', en: 'Notes' },
  { label: '关于', href: '/about', en: 'About' },
];

/** 404 与 Footer 使用的次级导航 */
export const secondaryNavigation: NavItem[] = [
  { label: '标签', href: '/tags' },
  { label: '归档', href: '/archive' },
  { label: 'RSS', href: '/rss.xml' },
];
