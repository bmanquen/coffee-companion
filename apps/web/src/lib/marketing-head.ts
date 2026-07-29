import { absoluteUrl } from '@/lib/site-url'

// Every marketing page advertises itself the same way: a title and description,
// a canonical URL, and a social card. Only the three inputs differ, so the tag
// list lives here rather than being restated per route — a page that forgot
// og:image or twitter:card would unfurl as a blank rectangle, and that is not
// the kind of omission anyone notices in review.
export function marketingHead({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}) {
  const url = absoluteUrl(path)
  // PNG, not SVG: every major unfurler drops an SVG og:image.
  const image = absoluteUrl('/og-default.png')

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
