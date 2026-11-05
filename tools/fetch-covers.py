#!/usr/bin/env python3
"""Fetch the official cover of every entry of assets/data/culture.json.

Each entry looks like {"title": "...", "year": 1996, "platform": "n64"} and may add
"search" (the name to look for when it differs from the title) or "image" (a direct URL).
The script looks the cover up online, saves a small webp in assets/images/culture/ and
writes the path back as "cover". Entries that already have their file are skipped
unless --force is given. Needs ImageMagick (magick).

    python3 tools/fetch-covers.py [--force] [--only "Super Mario 64"]
"""
import argparse
import difflib
import json
import pathlib
import re
import subprocess
import unicodedata
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'assets/data/culture.json'
OUT = ROOT / 'assets/images/culture'
UA = {'User-Agent': 'portfolio-covers/1.0 (leotoskuepro@gmail.com)'}

# Libretro hosts scans of the real boxes, one folder per console
LIBRETRO = 'https://thumbnails.libretro.com/'
SYSTEMS = {
    'nes': 'Nintendo - Nintendo Entertainment System',
    'snes': 'Nintendo - Super Nintendo Entertainment System',
    'n64': 'Nintendo - Nintendo 64',
    'gba': 'Nintendo - Game Boy Advance',
    'ds': 'Nintendo - Nintendo DS',
    '3ds': 'Nintendo - Nintendo 3DS',
    'wii': 'Nintendo - Wii',
    'wiiu': 'Nintendo - Wii U',
}
REGIONS = ['USA', 'World', 'Europe', 'France', 'Japan']
SKIP_TAGS = re.compile(r'(demo|kiosk|beta|proto|sample|collector|unl|virtual console|nintendo switch online|alt|pirate|bonus|promo)', re.I)


def rank(filename):
    # the plain retail release wins: no demo or beta tag, then the region, then the fewest tags
    tags = re.findall(r'\(([^)]*)\)', filename)
    region = next((i for i, r in enumerate(REGIONS) if tags and r in tags[0]), len(REGIONS))
    return (sum(1 for t in tags if SKIP_TAGS.match(t)), region, len(tags))


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()


def fetch_json(url):
    return json.loads(fetch(url))


def norm(name):
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    name = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', name)
    name = re.sub(r'^(.*?), (the|a|an)(?= - |$| )', r'\2 \1', name.strip())
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', name.replace('&', ' and ')).split())


def slug(title):
    return '-'.join(re.sub(r'[^a-z0-9]+', ' ', norm(title)).split())


_listings = {}


def libretro(item):
    system = SYSTEMS[item['platform']]
    if system not in _listings:
        html = fetch(f'{LIBRETRO}{urllib.parse.quote(system)}/Named_Boxarts/').decode('utf-8', 'ignore')
        _listings[system] = [urllib.parse.unquote(h) for h in re.findall(r'href="([^"]+\.png)"', html)]
    names = _listings[system]
    target = norm(item.get('search', item['title']))
    exact = [n for n in names if norm(n[:-4]) == target]
    if not exact:
        close = difflib.get_close_matches(target, {norm(n[:-4]): n for n in names}.keys(), n=1, cutoff=0.9)
        exact = [n for n in names if close and norm(n[:-4]) == close[0]]
    if not exact:
        return None
    exact.sort(key=rank)
    return f'{LIBRETRO}{urllib.parse.quote(system)}/Named_Boxarts/{urllib.parse.quote(exact[0])}'


def steam(item):
    term = item.get('search', item['title'])
    found = fetch_json('https://store.steampowered.com/api/storesearch/?' + urllib.parse.urlencode({'term': term, 'cc': 'us', 'l': 'en'})).get('items', [])
    target = norm(term)
    pick = next((f for f in found if norm(f['name']) == target), None) or next((f for f in found if norm(f['name']).startswith(target)), None)
    if not pick:
        return None
    for host in ('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps', 'https://cdn.cloudflare.steamstatic.com/steam/apps'):
        url = f"{host}/{pick['id']}/library_600x900.jpg"
        try:
            fetch(url)
            return url
        except Exception:
            continue
    return None


def mariowiki(item):
    # only box art counts: the page image must have "box" in its name, never a logo or a screenshot
    title = item.get('search', item['title'])
    data = fetch_json('https://www.mariowiki.com/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'pageimages', 'piprop': 'original', 'redirects': 1, 'format': 'json'}))
    page = next(iter(data['query']['pages'].values()))
    url = page.get('original', {}).get('source', '')
    return url if re.search(r'box', url.rsplit('/', 1)[-1], re.I) else None


def itunes(item):
    kind = 'movie' if item['kind'] == 'films' else 'software'
    term = item.get('search', item['title'])
    found = fetch_json('https://itunes.apple.com/search?' + urllib.parse.urlencode({'term': term, 'entity': kind, 'country': 'us', 'limit': 8})).get('results', [])
    target = norm(term)
    for match in (lambda n: n == target, lambda n: n.startswith(target + ' ')):
        for f in found:
            if match(norm(f.get('trackName') or f.get('collectionName') or '')):
                art = f.get('artworkUrl512') or f.get('artworkUrl100', '')
                return re.sub(r'/\d+x\d+bb', '/600x900bb', art) if kind == 'movie' else art
    return None


def openlibrary(item):
    term = item.get('search', item['title'])
    found = fetch_json('https://openlibrary.org/search.json?' + urllib.parse.urlencode({'title': term, 'limit': 8, 'fields': 'title,cover_i'})).get('docs', [])
    target = norm(term)
    pick = next((d for d in found if d.get('cover_i') and norm(d['title']) == target), None) or next((d for d in found if d.get('cover_i')), None)
    return f"https://covers.openlibrary.org/b/id/{pick['cover_i']}-L.jpg" if pick else None


def wikipedia(item):
    title = item.get('search', item['title']).replace(' ', '_')
    data = fetch_json('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title, safe=''))
    url = (data.get('originalimage') or data.get('thumbnail') or {}).get('source', '')
    name = url.rsplit('/', 1)[-1]
    return None if not url or re.search(r'logo|icon|wordmark|\.svg', name, re.I) else url


CHAIN = {
    **{p: [libretro] for p in SYSTEMS},
    'switch': [mariowiki, wikipedia],
    'steam': [steam],
    'ios': [itunes],
    'pc': [],
    'film': [itunes, wikipedia],
    'book': [openlibrary, wikipedia],
}


def save(raw, dest):
    subprocess.run(['magick', '-', '-resize', 'x440>', '-strip', '-quality', '66', str(dest)], input=raw, check=True, stderr=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--only')
    args = parser.parse_args()
    data = json.loads(DATA.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    kept, missing = set(), []
    for kind, items in data.items():
        for item in items:
            dest = OUT / f"{slug(item['title'])}.webp"
            item['kind'] = kind
            wanted = not args.only or args.only.lower() in item['title'].lower()
            if (dest.exists() and not args.force) or not wanted:
                if dest.exists() and item.get('cover'):
                    kept.add(dest.name)
                item.pop('kind')
                continue
            url, source = item.get('image'), 'image'
            if not url:
                platform = item.get('platform') or ('film' if kind == 'films' else 'book' if kind == 'books' else 'pc')
                for finder in CHAIN.get(platform, []):
                    try:
                        url = finder(item)
                    except Exception as error:
                        print(f"  ! {finder.__name__} failed for {item['title']}: {error}")
                        url = None
                    if url:
                        source = finder.__name__
                        break
            item.pop('kind')
            if not url:
                item.pop('cover', None)
                missing.append(item['title'])
                print(f"-- {item['title']}: no cover found")
                continue
            try:
                save(fetch(url), dest)
            except Exception as error:
                item.pop('cover', None)
                missing.append(item['title'])
                print(f"-- {item['title']}: download failed ({error})")
                continue
            item['cover'] = f'assets/images/culture/{dest.name}'
            kept.add(dest.name)
            print(f"ok {item['title']} <- {source}: {url}")
    for item in (i for items in data.values() for i in items):
        if 'cover' in item and not (ROOT / item['cover']).exists():
            item.pop('cover')
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    if not args.only:
        for file in OUT.glob('*.webp'):
            if file.name not in kept:
                file.unlink()
    print('missing:', missing or 'none')


if __name__ == '__main__':
    main()
