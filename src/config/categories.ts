/**
 * 文章与项目的分类统一在这里维护。
 * `key` 用于程序化视觉（Bento 图形、项目封面生成），`label` 用于展示。
 */
export interface Category {
  key: string;
  label: string;
  /** 英文小标 */
  en: string;
  description: string;
  /** Bento / 程序化视觉类型 */
  visual: 'nodes' | 'wireframe' | 'browser' | 'architecture' | 'pipeline' | 'terminal';
  /** Bento 中的栅格跨度（4 列栅格） */
  span: 'lg' | 'md' | 'sm';
  /** 主题色，仅用于极少量的图形点缀 */
  accent: 'blue' | 'cyan' | 'purple' | 'neutral';
}

export const categories: Category[] = [
  {
    key: 'ai',
    label: 'AI 与智能应用',
    en: 'AI & Agents',
    description:
      '大模型应用、Agent 工程、RAG 与工具调用，以及把模型真正接进产品里的那些坑。',
    visual: 'nodes',
    span: 'lg',
    accent: 'cyan',
  },
  {
    key: 'web',
    label: 'Web 开发',
    en: 'Web',
    description: '现代前端框架、渲染模式、性能优化与工程化实践。',
    visual: 'browser',
    span: 'md',
    accent: 'blue',
  },
  {
    key: 'threejs',
    label: 'Three.js / 可视化',
    en: 'Three.js',
    description: 'Three.js、WebGL、着色器与大规模数据可视化的实现与优化。',
    visual: 'wireframe',
    span: 'md',
    accent: 'purple',
  },
  {
    key: 'architecture',
    label: '架构与工程化',
    en: 'Architecture',
    description: '系统设计、模块边界、构建体系与长期可维护性的取舍。',
    visual: 'architecture',
    span: 'sm',
    accent: 'blue',
  },
  {
    key: 'devops',
    label: 'DevOps',
    en: 'DevOps',
    description: '容器化、CI/CD、部署与本地开发环境的一致性治理。',
    visual: 'pipeline',
    span: 'sm',
    accent: 'cyan',
  },
  {
    key: 'essay',
    label: '开发随笔',
    en: 'Essays',
    description: '不成体系的想法、踩坑记录与关于技术本身的思考。',
    visual: 'terminal',
    span: 'sm',
    accent: 'neutral',
  },
];

/** 项目分类（与文章分类相互独立） */
export const projectCategories = [
  { key: 'all', label: '全部' },
  { key: 'web', label: 'Web' },
  { key: 'ai', label: 'AI' },
  { key: '3d', label: '3D 可视化' },
  { key: 'tool', label: '工具' },
] as const;

export type ProjectCategoryKey = (typeof projectCategories)[number]['key'];

export const projectStatuses = [
  '已完成',
  '持续优化',
  '开发中',
  '暂停',
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export function getCategory(key: string): Category | undefined {
  return categories.find((c) => c.key === key);
}

export function getCategoryLabel(key: string): string {
  return getCategory(key)?.label ?? key;
}
