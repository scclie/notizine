# # notizine

a small modular site starter on [zine](https://zine-ssg.io)

the interactive bits use plain js with no frontend framework
css lives inside the page by default and module scripts load only where needed (inline mode - main feature)

search starts with a list of every page then filters locally as type, the index and search client load only on pages with the search widget, no extra requests for every letter

## ## quick start

```bash
nix-shell        # brings in the tools from shell.nix
npm install
npm run dev      # http://localhost:1990
```

then make it urs

1. replace the text in `content/*`
2. set `site.host_url` in `assets/notizine.ziggy` to ur domain
3. tweak features slots and layout in that same config
4. `npm run sync:zine` to sync site settings into `zine.ziggy`
5. `npm run build` and grab the site from `public/`

## ## where stuff lives

| path | whats there |
|------|---------|
| `content/en/` | pages and posts as `.smd` files with markdown and ziggy frontmatter |
| `assets/notizine.ziggy` | site settings features slots and layout |
| `zine.ziggy` | zine settings synced from the site config |
| `modules/` | widgets and their styles scripts and generators |
| `i18n/` | interface text |
| `layouts/` | page templates |

## ## whats in the starter

a home page an about page and one first post to replace with your own stuff
plus search tags recent posts a site explorer and a 404 page

the left sidebar has the site title theme toggle and page tree
the right one shows recent posts
breadcrumbs sit above the content and a small footer sits below

no docs wiki release history promo badges or product links in the footer
rss is off by default

## ## before u ship

```bash
npm run ci       # validate test build and check page weight
npm run preview  # build and serve the result locally
```
