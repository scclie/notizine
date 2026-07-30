#!/usr/bin/env python3
"""Tree-shake inline CSS: remove rules that don't match any element on the page."""

import sys, re, os

def extract_selectors(rule):
    """Get the selector part of a CSS rule (everything before the first {)."""
    brace = rule.find('{')
    if brace < 0:
        return ''
    return rule[:brace].strip()

def selector_used(selector, html):
    """Check if a CSS selector matches anything in the HTML."""
    selector = selector.strip()
    if not selector:
        return True  # keep empty selectors

    # Split compound selectors (ignore pseudo-classes/elements for matching)
    parts = re.split(r'\s+|,\s*', selector)
    for part in parts:
        part = re.sub(r':[a-zA-Z-]+(\([^)]*\))?', '', part)  # strip :pseudo
        part = part.strip()
        if not part:
            continue

        # Tag selector (e.g., "body", "h1", "pre")
        if re.match(r'^[a-zA-Z][a-zA-Z0-9]*$', part):
            tag = part
            if f'<{tag}' in html or f'</{tag}>' in html:
                return True
            continue

        # Class selector (e.g., ".breadcrumbs", "pre.line")
        for cls in re.findall(r'\.([a-zA-Z_-][a-zA-Z0-9_-]*)', part):
            if f'"{cls}"' in html or f"'{cls}'" in html or f'class="{cls}' in html or f'class=\'{cls}' in html or f' {cls} ' in html:
                return True

        # ID selector (e.g., "#header", "#content")
        for id_ in re.findall(r'#([a-zA-Z_-][a-zA-Z0-9_-]*)', part):
            if f'id="{id_}"' in html or f"id='{id_}'" in html:
                return True

        # Attribute selector (e.g., "[data-theme=dark]", "[hidden]")
        if re.match(r'^\[.+\]$', part):
            attr = part[1:-1]
            if '=' in attr:
                name, val = attr.split('=', 1)
                val = val.strip('"\'')
                if f'{name}="{val}"' in html or f"{name}='{val}'" in html:
                    return True
            else:
                if f' {attr}' in html or f'<[^>]*{attr}' in html:
                    return True

    return False

def purge_css(html):
    """Remove unused CSS rules from inline <style> tags."""
    style_pattern = re.compile(r'(<style[^>]*>)(.*?)(</style>)', re.DOTALL)

    def replace_style(match):
        open_tag = match.group(1)
        css = match.group(2)
        close_tag = match.group(3)

        # Split CSS into individual rules (by closing brace)
        rules = re.split(r'\}\s*', css)
        kept = []

        for rule in rules:
            rule = rule.strip()
            if not rule:
                continue
            # Re-add the closing brace
            full_rule = rule + '}'
            selector = extract_selectors(rule)
            if not selector:
                kept.append(full_rule)
                continue

            # Always keep :root, @media, @keyframes, font-face
            if selector.startswith(':root') or selector.startswith('@') or selector == ':root':
                kept.append(full_rule)
                continue

            # Always keep universal and body/html resets
            if selector in ('*', '*, *::before, *::after', 'html', 'body',
                           '::-webkit-scrollbar', '::-webkit-scrollbar-track',
                           '::-webkit-scrollbar-thumb', '::selection'):
                kept.append(full_rule)
                continue

            if selector_used(selector, html):
                kept.append(full_rule)

        result = open_tag + '\n'.join(kept) + '\n' + close_tag
        return result

    return style_pattern.sub(replace_style, html)

def main():
    if len(sys.argv) < 2:
        print("Usage: purge-css.py <html_file> [--in-place]")
        sys.exit(1)

    path = sys.argv[1]
    with open(path) as f:
        html = f.read()

    before = len(html)
    html = purge_css(html)
    after = len(html)

    if '--in-place' in sys.argv or '-i' in sys.argv:
        with open(path, 'w') as f:
            f.write(html)

    saved = before - after
    print(f"{path}: {before} -> {after} bytes (-{saved}, -{100*saved//before}%)")

if __name__ == '__main__':
    main()
