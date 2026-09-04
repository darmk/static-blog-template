import rss from '@astrojs/rss';
import { getPosts, postUrl } from '~/lib/content';
import { siteConfig } from '~/config/site';

export async function GET(context) {
  const posts = await getPosts();

  return rss({
    title: siteConfig.name,
    description: siteConfig.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: postUrl(post),
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: '<language>zh-CN</language>',
  });
}
