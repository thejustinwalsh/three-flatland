import type { AstroBuiltinAttributes } from 'astro';
import type { HTMLAttributes } from 'astro/types';
import { z } from 'zod';

const linkHTMLAttributesSchema = z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.undefined()])
) as z.Schema<Omit<HTMLAttributes<'a'>, keyof AstroBuiltinAttributes | 'children'>>;

const LinkItemHTMLAttributesSchema = () => linkHTMLAttributesSchema.default({});

export const linkSchema = z.object({
    /**
     * An optional badge to display next to the topic label.
     *
     * This option accepts the same configuration as the Starlight badge sidebar item configuration.
     * @see https://starlight.astro.build/guides/sidebar/#badges
     */
    badge: z.string().optional(),
    /**
     * The topic label visible at the top of the sidebar.
     *
     * The value can be a string, or for multilingual sites, an object with values for each different locale. When using
     * the object form, the keys must be BCP-47 tags (e.g. en, fr, or zh-CN).
     */
    label: z.union([z.string(), z.record(z.string(), z.string())]),
    /**
     * The link to the topic’s content which an be a relative link to local files or the full URL of an external page.
     *
     * For internal links, the link can either be a page included in the items array or a different page acting as the
     * topic’s landing page.
     */
    link: z.string(),
    /** HTML attributes to add to the link item. */
    attrs: LinkItemHTMLAttributesSchema().optional(),
});

export type Link = z.infer<typeof linkSchema>;

export const StarlightThemeConfigSchema = z.object({
    navLinks: z.array(linkSchema).optional(),
    docs: z
        .object({
            includeAiUtilities: z.boolean().optional().default(true),
        })
        .optional()
        .default({ includeAiUtilities: true }),
    footerText: z
        .string()
        .optional()
        .default(
            'This documentation was created with AI assistance. AI can make mistakes — please verify claims and test code examples. Submit corrections [here](https://github.com/thejustinwalsh/three-flatland/issues).'
        ),
});

export type StarlightThemeUserConfig = z.input<typeof StarlightThemeConfigSchema>;
export type StarlightThemeConfig = z.output<typeof StarlightThemeConfigSchema>;
