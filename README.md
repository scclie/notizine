# notizine

A modular, multilingual static site starter built on [Zine](https://zine-ssg.io).

**What it does:** Zine is a fast static site generator. Notizine wraps it
with a config layer so you don't write templates by hand. Configure
sidebars, features, and layout in one file. Write content in Markdown.
Get a bilingual site with dark mode, search, tags, OG images, and more --
out of the box.

## Quick start

```bash
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

You're looking at a demo. The sidebar shows **Recent Notes** (latest posts
from the `posts/` section) and a **Site Explorer** (clickable tree of all
pages). The header has a **language switcher** (RU/EN) and **theme toggle**.
All of this is configured in `assets/notizine.ziggy` -- no templates edited.

Build a blog, a digital garden, a portfolio -- it's all the same starter.
