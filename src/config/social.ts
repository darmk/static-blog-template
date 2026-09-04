export interface SocialLink {
  label: string;
  href: string;
  icon: 'github' | 'mail' | 'rss' | 'x' | 'bilibili';
  /** 为空时在页面上自动隐藏 */
  value: string;
}

export const socialLinks: SocialLink[] = [
  {
    label: 'GitHub',
    href: 'https://github.com/darmk',
    icon: 'github',
    value: 'darmk',
  },
  {
    label: '邮箱',
    href: 'mailto:',
    icon: 'mail',
    value: '',
  },
  {
    label: 'RSS',
    href: '/rss.xml',
    icon: 'rss',
    value: '/rss.xml',
  },
];

export function getActiveSocials(): SocialLink[] {
  return socialLinks.filter((s) => s.value && s.value.length > 0);
}
