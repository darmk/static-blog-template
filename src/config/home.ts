export const homeConfig = {
  /** 置顶推荐文章数量（featured=true，按 featuredOrder 排列） */
  featuredArticles: 1,
  /** 「最近更新」展示数量 */
  latestArticles: 6,
  /** 首页展示的项目数量 */
  featuredProjects: 3,
  /** 是否展示文章分类 Bento */
  showTopics: true,
  /** 是否展示公众号区块 */
  showWechat: true,
  /** 是否展示技术栈 Marquee */
  showTechStack: true,
  /** 是否展示关于我区块 */
  showAbout: true,
} as const;
