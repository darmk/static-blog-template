import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectStatuses } from './config/categories';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    /** 封面图可选，留空则不渲染 */
    cover: z.string().default(''),
    featured: z.boolean().default(false),
    featuredOrder: z.number().default(99),
    pinned: z.boolean().default(false),
    recommend: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string(),
    date: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    cover: z.string().default(''),
    featured: z.boolean().default(false),
    featuredOrder: z.number().default(99),
    status: z.enum(projectStatuses).default('已完成'),
    category: z.string(),
    stack: z.array(z.string()).default([]),
    github: z.string().default(''),
    demo: z.string().default(''),
    draft: z.boolean().default(false),
    /** 项目详情页的高亮数据 */
    highlights: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .default([]),
  }),
});

const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    publishedAt: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    /** 可选来源标注 */
    source: z.string().default(''),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, projects, notes };
