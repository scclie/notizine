# notizine

A modular, multilingual static site starter built on [Zine](https://zine-ssg.io).

**What it does:** Zine is a fast static site generator. Notizine wraps it
with a config layer so you don't write templates by hand. Configure
sidebars, features, and layout in one file. Write content in Markdown.
Get a bilingual site with dark mode, instant client-side search, tags,
RSS feeds, OG images, and more -- out of the box.

A small vanilla JS bundle (~4KB, no framework) handles the interactive
bits: theme toggle, live search over a prebuilt index, random-note
navigation, back-to-top. CSS is inlined into pages by default; JS loads
as one tiny deferred file.

## Quick start

```bash
nix-shell        # provides node, zine, python deps (see shell.nix)
npm install
npm run dev      # opens http://localhost:1987
```

Then:

1. Edit `content/en/index.smd` -- replace "Welcome" with your own text
2. Set `host_url` in `zine.ziggy` to your actual domain
3. Customize `assets/notizine.ziggy` -- toggle features, rearrange modules
4. `npm run build` -- output in `public/`

## Where is what

| Path | Purpose |
|------|---------|
| `content/{en,ru}/*.smd` | Your content (Markdown with Ziggy frontmatter) |
| `assets/notizine.ziggy` | Notizine config -- features, slots, layout |
| `zine.ziggy` | Zine config -- host_url, locales, site title |
| `modules/` | Custom modules -- add your own widgets |
| `i18n/` | Interface strings -- translate UI labels |
| `layouts/` | Page templates -- extend if needed |

## This demo site

You're looking at notizine's own documentation, built with notizine.
The left sidebar lists the **Documentation** tree; the right sidebar
shows recent **Updates** with an RSS feed at `/updates/index.xml`.
The header has a **theme toggle**; the footer has badges and an **RSS**
link. All of this is configured in `assets/notizine.ziggy` -- no
templates edited.

Build a blog, a digital garden, a portfolio -- it's all the same starter.
