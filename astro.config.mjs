import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { codeBlockTransformer } from './src/lib/shiki-transformer';
import { rehypeHeadingAnchor, rehypeLightbox } from './src/lib/rehype';

// https://astro.build/config
export default defineConfig({
  site: 'https://darmk.dev',
  integrations: [react(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    // Astro 7 默认使用 Sätteri 处理器；为了完整兼容 rehype 插件生态，
    // 显式使用 @astrojs/markdown-remark 的 unified 处理器
    processor: unified({
      rehypePlugins: [rehypeHeadingAnchor, rehypeLightbox],
    }),
    shikiConfig: {
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-default',
      },
      // emit --shiki-light / --shiki-dark vars so code follows the theme
      defaultColor: false,
      wrap: false,
      transformers: [codeBlockTransformer()],
    },
  },
  build: {
    format: 'directory',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});
