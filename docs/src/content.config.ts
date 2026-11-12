import { defineCollection, z } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { blogSchema } from 'starlight-blog/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: (context) => blogSchema(context) }) }),
	// Overrides the text of starlight-blog's "Last update" metadata.
	i18n: defineCollection({
		loader: i18nLoader(),
		schema: i18nSchema({ extend: z.object({ 'starlightBlog.post.lastUpdate': z.string().optional() }) }),
	}),
};
