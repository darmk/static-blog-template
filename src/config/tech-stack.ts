/**
 * 技术栈 Marquee —— 纯文字，不使用 Logo 图片墙。
 * 两条轨道反向缓慢滚动，Hover 暂停，Reduced Motion 停止。
 */
export interface TechItem {
  name: string;
  /** 小标注，鼠标悬停时不做任何事，仅作为排版节奏 */
  note?: string;
}

export const techStack: TechItem[] = [
    { name: 'Java' },
    { name: 'Spring Boot' },
    { name: 'Spring Cloud' },
    { name: 'Vue' },
    { name: 'Vuex' },
    { name: 'Vue Router' },
    { name: 'Vue 3' },
    { name: 'Element UI' },
    { name: 'Element Plus' },
  { name: 'React' },
  { name: 'Astro' },
  { name: 'TypeScript' },
  { name: 'React' },
  { name: 'Astro' },
  { name: 'Node.js' },
  { name: 'Three.js' },
  { name: 'WebGL' },
  { name: 'GLSL' },
  { name: 'Vite' },
  { name: 'Tailwind CSS' },
  { name: 'GSAP' },
  { name: 'Docker' },
  { name: 'Nginx' },
  { name: 'Git' },
  { name: 'PostgreSQL' },
  { name: 'Redis' },
  { name: 'Cloudflare' },
  { name: 'Python' },
  { name: 'AI' },
];
