import { createFileRoute } from '@tanstack/react-router'
import { absoluteUrl } from '@/lib/site-url'

// Served rather than shipped as a static file so the URLs use the configured
// canonical origin — a static sitemap would have to hardcode one host and would
// be wrong everywhere else.
const paths = ['/', '/pricing']

function handler() {
  const urls = paths
    .map((path) => `  <url><loc>${absoluteUrl(path)}</loc></url>`)
    .join('\n')

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  )
}

export const Route = createFileRoute('/sitemap.xml')({
  server: { handlers: { GET: handler } },
})
