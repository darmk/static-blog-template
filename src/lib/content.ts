import { getCollection, type CollectionEntry } from 'astro:content';
import { getCategoryLabel } from '~/config/categories';

export type Post = CollectionEntry<'blog'>;
export type Project = CollectionEntry<'projects'>;
export type Note = CollectionEntry<'notes'>;

const isProd = import.meta.env.PROD;

/* ------------------------------------------------------------------ blog */

/** 列表排序：pinned 优先，其次发布时间倒序 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) =>
    isProd ? !data.draft : true
  );
  return posts.sort((a, b) => {
    if (a.data.pinned !== b.data.pinned) return a.data.pinned ? -1 : 1;
    return b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();
  });
}

/** 推荐排序：featured → featuredOrder → 发布时间倒序 */
export async function getFeaturedPosts(limit = 1): Promise<Post[]> {
  const posts = await getPosts();
  return posts
    .filter((p) => p.data.featured || p.data.recommend)
    .sort((a, b) => {
      if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
      if (a.data.featuredOrder !== b.data.featuredOrder) {
        return a.data.featuredOrder - b.data.featuredOrder;
      }
      return b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();
    })
    .slice(0, limit);
}

export async function getRecommendedPosts(limit = 6): Promise<Post[]> {
  const posts = await getPosts();
  return posts.filter((p) => p.data.recommend).slice(0, limit);
}

/** 统计每个分类的文章数 */
export async function getCategoryCounts(): Promise<Record<string, number>> {
  const posts = await getPosts();
  return posts.reduce<Record<string, number>>((acc, post) => {
    acc[post.data.category] = (acc[post.data.category] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getAllTags(): Promise<
  { tag: string; count: number }[]
> {
  const [posts, projects] = await Promise.all([getPosts(), getProjects()]);
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  for (const project of projects) {
    for (const tag of project.data.stack) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 相关文章：同分类优先，其次标签重合度 */
export async function getRelatedPosts(
  current: Post,
  limit = 3
): Promise<Post[]> {
  const posts = (await getPosts()).filter((p) => p.id !== current.id);

  const scored = posts.map((post) => {
    let score = 0;
    if (post.data.category === current.data.category) score += 3;
    if (post.data.featured) score += 1;
    for (const tag of post.data.tags) {
      if (current.data.tags.includes(tag)) score += 1;
    }
    return { post, score };
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.post.data.publishedAt.valueOf() - a.post.data.publishedAt.valueOf()
    )
    .slice(0, limit)
    .map((s) => s.post);
}

/* -------------------------------------------------------------- projects */

export async function getProjects(): Promise<Project[]> {
  const projects = await getCollection('projects', ({ data }) =>
    isProd ? !data.draft : true
  );
  return projects.sort((a, b) => {
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    if (a.data.featuredOrder !== b.data.featuredOrder) {
      return a.data.featuredOrder - b.data.featuredOrder;
    }
    return b.data.date.valueOf() - a.data.date.valueOf();
  });
}

export async function getFeaturedProjects(limit = 3): Promise<Project[]> {
  return (await getProjects()).slice(0, limit);
}

/* ----------------------------------------------------------------- notes */

export async function getNotes(): Promise<Note[]> {
  const notes = await getCollection('notes', ({ data }) =>
    isProd ? !data.draft : true
  );
  return notes.sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );
}

/* ------------------------------------------------------------- utilities */

/** 中英混排的阅读时长估算 */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const chinese = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (body.match(/[a-zA-Z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(chinese / 400 + words / 220));
}

const MONTHS = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12',
];

export function formatDate(date: Date): string {
  return `${date.getFullYear()}.${MONTHS[date.getMonth()]}.${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function formatDateShort(date: Date): string {
  return `${date.getFullYear()}.${MONTHS[date.getMonth()]}`;
}

export function isoDate(date: Date): string {
  return date.toISOString();
}

export function postUrl(post: Post): string {
  return `/blog/${post.data.slug ?? post.id}/`;
}

export function projectUrl(project: Project): string {
  return `/projects/${project.data.slug ?? project.id}/`;
}

export function categoryLabel(key: string): string {
  return getCategoryLabel(key);
}

export type { CollectionEntry };
