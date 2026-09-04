export const siteConfig = {
  name: 'Darmk 个人空间',
  shortName: 'darmk',
  description:
    '记录 Java、Web、AI、工程实践、Three.js 与 3D 可视化，以及开发过程中值得留下来的思考。',
  author: 'darmk',
  /** 站点地址，用于 SEO canonical / RSS / sitemap */
  url: 'https://darmk.com.cn',
  /** 头像，放在 public/images/ 下 */
  avatar: '/images/avatar.svg',
  location: '中国',
  github: '',
  email: '',
  icp: '',
  /** 建站年份，用于 Footer */
  since: 2024,
} as const;

export const giscusConfig = {
  enabled: false,
  /** 需要先在 https://giscus.app 获取以下三个值 */
  repo: '' as `${string}/${string}` | '',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
  lang: 'zh-CN',
} as const;
