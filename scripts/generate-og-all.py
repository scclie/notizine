#!/usr/bin/env python3
"""Generate og.png for every page, output directly to public/ directory."""

import sys, os, re, json, hashlib
from urllib.request import urlopen, urlretrieve
from PIL import Image, ImageDraw, ImageFont

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630
_FONT_CACHE = None


def _hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _load_config():
    cfg_path = os.path.join(PROJECT_DIR, "assets", "notizine.ziggy")
    try:
        with open(cfg_path) as f:
            data = json.load(f)
        og = data.get("og", {})
        return {
            "bg_top": _hex_rgb(og.get("bg_top", "#2e3440")),
            "bg_bottom": _hex_rgb(og.get("bg_bottom", "#3b4252")),
            "accent": _hex_rgb(og.get("accent", "#5e81ac")),
            "text": _hex_rgb(og.get("text", "#eceff4")),
            "muted": _hex_rgb(og.get("muted", "#b48ead")),
            "title_size": og.get("title_size", 52),
            "desc_size": og.get("desc_size", 26),
            "site_size": og.get("site_size", 22),
            "date_size": og.get("date_size", 24),
            "site_name": og.get("site_name", "notizine"),
            "show_date": og.get("show_date", True),
            "show_desc": og.get("show_desc", True),
            "font_source": og.get("font_source", ""),
            "font_family": og.get("font_family", ""),
            "font_path": og.get("font_path", ""),
        }
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return {}


def _load_locales():
    zz = os.path.join(PROJECT_DIR, "zine.ziggy")
    locales = {}
    try:
        with open(zz) as f:
            text = f.read()
        code = dir_path = prefix = None
        for m in re.finditer(r'(\.code|\.content_dir_path|\.output_prefix_override)\s*=\s*"([^"]*)"', text):
            key, val = m.group(1), m.group(2)
            if key == ".code":
                if code and dir_path:
                    ln = os.path.basename(os.path.normpath(dir_path))
                    locales[ln] = {
                        "code": code,
                        "prefix": prefix if prefix is not None else code,
                    }
                code = val; dir_path = None; prefix = None
            elif key == ".content_dir_path":
                dir_path = val
            elif key == ".output_prefix_override":
                prefix = val
        if code and dir_path:
            ln = os.path.basename(os.path.normpath(dir_path))
            locales[ln] = {
                "code": code,
                "prefix": prefix if prefix is not None else code,
            }
    except (FileNotFoundError, OSError):
        pass
    return locales


def _smd_to_public(smd_path, locales):
    """Map content/*/page.smd to public/<prefix>/.../og.png."""
    content_dir = os.path.join(PROJECT_DIR, "content")
    rel = os.path.relpath(smd_path, content_dir)
    parts = rel.split(os.sep)
    if len(parts) < 2:
        return None
    locale_key = parts[0]
    rest = parts[1:]
    locale = locales.get(locale_key)
    if not locale and os.path.normpath(locale_key) in locales:
        locale = locales[os.path.normpath(locale_key)]
    if not locale:
        return None
    prefix = locale["prefix"]
    basename = os.path.splitext(rest[-1])[0]
    subdir = rest[:-1]

    if basename == "index":
        out_dir = os.path.join(PROJECT_DIR, "public", prefix, *subdir)
    else:
        out_dir = os.path.join(PROJECT_DIR, "public", prefix, *subdir, basename)

    return os.path.normpath(out_dir)


def _parse_frontmatter(smd_path):
    title, desc, date = "Untitled", "", ""
    try:
        with open(smd_path) as f:
            content = f.read()
        m = re.search(r'\.title\s*=\s*"([^"]*)"', content)
        if m: title = m.group(1)
        m = re.search(r'\.description\s*=\s*"([^"]*)"', content)
        if m: desc = m.group(1)
        m = re.search(r'\.date\s*=\s*\.date\("([^"]*)"', content)
        if m: date = m.group(1).split("T")[0]
    except (FileNotFoundError, OSError):
        pass
    return title, desc, date


def _download_google_font(family_str):
    css = urlopen(f"https://fonts.googleapis.com/css2?family={family_str}").read().decode()
    m = re.search(r"url\((https://[^)]+\.ttf)\)", css)
    return m.group(1) if m else None


def _get_font_path(cfg):
    global _FONT_CACHE
    if _FONT_CACHE is not None:
        return _FONT_CACHE
    source = cfg.get("font_source", "")
    if source == "google":
        family = cfg.get("font_family", "")
        if not family:
            _FONT_CACHE = ""; return ""
        cache_dir = os.path.join(PROJECT_DIR, ".cache")
        os.makedirs(cache_dir, exist_ok=True)
        fp = os.path.join(cache_dir, f"og-{hashlib.sha256(family.encode()).hexdigest()[:16]}.ttf")
        if not os.path.exists(fp):
            url = _download_google_font(family)
            if not url: _FONT_CACHE = ""; return ""
            print(f"  Font: {url}")
            urlretrieve(url, fp)
        _FONT_CACHE = fp; return fp
    if source == "local":
        lp = cfg.get("font_path", "")
        if lp and os.path.exists(lp):
            _FONT_CACHE = lp; return lp
    _FONT_CACHE = ""; return ""


def _load_font(cfg, size):
    fp = _get_font_path(cfg)
    if fp:
        try: return ImageFont.truetype(fp, size)
        except (OSError, IOError): pass
    return ImageFont.load_default()


def _wrap_text(text, font, max_width, draw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        bb = draw.textbbox((0, 0), test, font=font)
        if bb[2] - bb[0] <= max_width: cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


def _generate_one(title, desc, date, site_name, out_path, cfg):
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    bt, bb = cfg["bg_top"], cfg["bg_bottom"]
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(
            int(bt[0] + (bb[0] - bt[0]) * t),
            int(bt[1] + (bb[1] - bt[1]) * t),
            int(bt[2] + (bb[2] - bt[2]) * t),
        ))
    pad = 60
    d.rectangle([(pad, 0), (pad + 4, H)], fill=cfg["accent"])
    y = 55
    d.text((pad + 24, y), site_name, fill=cfg["muted"], font=_load_font(cfg, cfg["site_size"]))
    y += 60
    tf = _load_font(cfg, cfg["title_size"])
    for line in _wrap_text(title, tf, W - pad * 2 - 60, d):
        d.text((pad + 24, y), line, fill=cfg["text"], font=tf)
        y += int(cfg["title_size"] * 1.25)
    y += 10
    if cfg["show_date"] and date:
        d.text((pad + 24, y), date, fill=cfg["muted"], font=_load_font(cfg, cfg["date_size"]))
        y += int(cfg["date_size"] * 1.7)
    if cfg["show_desc"] and desc:
        y += 20
        df = _load_font(cfg, cfg["desc_size"])
        for line in _wrap_text(desc, df, int(W * 0.7), d)[:4]:
            d.text((pad + 24, y), line, fill=cfg["text"], font=df)
            y += int(cfg["desc_size"] * 1.4)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "PNG")


def main():
    notizine = _load_config()
    cfg = {
        "bg_top": notizine.get("bg_top", _hex_rgb("#2e3440")),
        "bg_bottom": notizine.get("bg_bottom", _hex_rgb("#3b4252")),
        "accent": notizine.get("accent", _hex_rgb("#5e81ac")),
        "text": notizine.get("text", _hex_rgb("#eceff4")),
        "muted": notizine.get("muted", _hex_rgb("#b48ead")),
        "title_size": notizine.get("title_size", 52),
        "desc_size": notizine.get("desc_size", 26),
        "site_size": notizine.get("site_size", 22),
        "date_size": notizine.get("date_size", 24),
        "site_name": notizine.get("site_name", "notizine"),
        "show_date": notizine.get("show_date", True),
        "show_desc": notizine.get("show_desc", True),
        "font_source": notizine.get("font_source", ""),
        "font_family": notizine.get("font_family", ""),
        "font_path": notizine.get("font_path", ""),
    }

    locales = _load_locales()
    content_dir = os.path.join(PROJECT_DIR, "content")
    found = 0
    for root, dirs, files in os.walk(content_dir):
        for f in files:
            if not f.endswith(".smd"):
                continue
            smd = os.path.join(root, f)
            out_dir = _smd_to_public(smd, locales)
            if not out_dir:
                continue
            title, desc, date = _parse_frontmatter(smd)
            _generate_one(title, desc, date, cfg["site_name"], os.path.join(out_dir, "og.png"), cfg)
            found += 1
    print(f"Done. Generated {found} OG image(s) into public/")


if __name__ == "__main__":
    main()
