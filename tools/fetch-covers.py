#!/usr/bin/env python3
"""Fetch the official European cover of every entry of assets/data/culture.json.

Each entry looks like {"title": "...", "year": 1996, "platform": "n64"} and may add
"search" (a name or a list of names to look for when it differs from the title) or
"image" (a direct URL). The script finds the cover online, saves a small webp in
assets/images/culture/ and writes the path back as "cover". Entries whose file already
exists are skipped unless --force is given. Needs ImageMagick (magick).

    python3 tools/fetch-covers.py [--force] [--only "Super Mario 64"]

Sources, all free and without any token:
  GameTDB    Wii, Wii U, 3DS, DS and Switch: the PAL box, French first, then English
  Libretro   NES, SNES, N64, Game Boy (all), GBA, arcade: scans of the real boxes, Europe first
  Nintendo   Nintendo of Europe's own search, for digital games GameTDB has no box for
  Steam      PC games: the portrait capsule
  iTunes     mobile games and films (French store)
  Open Library  books
Fallbacks: the Mario Wiki (box art only) and Wikipedia (never a logo).
"""
import argparse
import difflib
import hashlib
import io
import json
import pathlib
import re
import subprocess
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'assets/data/culture.json'
OUT = ROOT / 'assets/images/culture'
CACHE = ROOT / 'tools/.cache'
UA = {'User-Agent': 'portfolio-covers/1.0 (leotoskuepro@gmail.com)'}

LANGS = ['FR', 'EN', 'DE', 'ES', 'IT', 'NL', 'PT']
COVER_TYPES = {
    'wii': ['coverHQ', 'coverfull', 'cover'],
    'wiiu': ['coverHQ', 'coverM', 'cover'],
    '3ds': ['coverHQ', 'coverM', 'cover'],
    'ds': ['coverHQ', 'coverM', 'cover'],
    'switch': ['coverHQ', 'coverM', 'cover'],
}
REGION_ORDER = ['PAL', 'ALL', 'NTSC-U', 'NTSC-J']

LIBRETRO = 'https://thumbnails.libretro.com/'
SYSTEMS = {
    'nes': 'Nintendo - Nintendo Entertainment System',
    'snes': 'Nintendo - Super Nintendo Entertainment System',
    'n64': 'Nintendo - Nintendo 64',
    'gb': 'Nintendo - Game Boy',
    'gbc': 'Nintendo - Game Boy Color',
    'gba': 'Nintendo - Game Boy Advance',
    'mame': 'MAME',
}
TAGS_REGIONS = ['Europe', 'France', 'World', r'USA|\bUS\b', 'Japan']
SKIP_TAGS = re.compile(r'(demo|kiosk|beta|proto|sample|collector|unl|virtual console|nintendo switch online|alt|pirate|bonus|promo)', re.I)


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()


def fetch_json(url):
    return json.loads(fetch(url))


def exists(url):
    try:
        urllib.request.urlopen(urllib.request.Request(url, headers=UA, method='HEAD'), timeout=20)
        return True
    except Exception:
        return False


def norm(name):
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    name = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', name)
    name = re.sub(r'^(.*?), (the|a|an)(?= - |$| )', r'\2 \1', name.strip())
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', name.replace('&', ' and ')).split())


def item_id(item):
    return slug(item['title'], item.get('platform', ''))


def slug(title, platform=''):
    text = unicodedata.normalize('NFKD', f'{title} {platform}').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')


def names(item):
    wanted = item.get('search', item['title'])
    return [wanted] if isinstance(wanted, str) else wanted


# GameTDB ---------------------------------------------------------------------------------------

_tdb = {}


def tdb_index(platform):
    if platform not in _tdb:
        CACHE.mkdir(parents=True, exist_ok=True)
        archive = CACHE / f'{platform}tdb.zip'
        if not archive.exists():
            archive.write_bytes(fetch(f'https://www.gametdb.com/{platform}tdb.zip'))
        with zipfile.ZipFile(archive) as z:
            xml = z.read(next(n for n in z.namelist() if n.endswith('.xml')))
        index = {}
        for game in ET.parse(io.BytesIO(xml)).getroot().iter('game'):
            entry = {'id': game.findtext('id'), 'region': game.findtext('region'), 'languages': (game.findtext('languages') or '').split(',')}
            titles = {t.text for t in game.iter('title') if t.text} | {re.sub(r'\s*\(.*$', '', game.get('name', ''))}
            for title in titles:
                index.setdefault(norm(title), []).append(entry)
        _tdb[platform] = index
    return _tdb[platform]


def gametdb(item):
    platform = item.get('via') or item['platform']
    index = tdb_index(platform)
    for name in names(item):
        found = index.get(norm(name), [])
        # a PAL release first, and among them the one that speaks French, then English
        found.sort(key=lambda e: (REGION_ORDER.index(e['region']) if e['region'] in REGION_ORDER else len(REGION_ORDER),
                                  next((i for i, l in enumerate(LANGS) if l in e['languages']), len(LANGS))))
        for entry in found:
            for lang in [l for l in LANGS if l in entry['languages']] or ['EN']:
                # the sharpest front cover first; on the Wii only the full wrap is large enough, the front half is cropped on save
                for kind in COVER_TYPES[platform]:
                    for ext in ('jpg', 'png'):
                        url = f"https://art.gametdb.com/{platform}/{kind}/{lang}/{entry['id']}.{ext}"
                        if exists(url):
                            return url
    return None


# Libretro --------------------------------------------------------------------------------------

_listings = {}


def rank(filename):
    # the plain retail release wins: no demo or beta tag, then Europe first, then the fewest tags
    tags = re.findall(r'\(([^)]*)\)', filename)
    region = next((i for i, r in enumerate(TAGS_REGIONS) if tags and re.search(r, tags[0])), len(TAGS_REGIONS))
    return (sum(1 for t in tags if SKIP_TAGS.match(t)), region, len(tags))


def libretro(item):
    system = SYSTEMS[item.get('via') or item['platform']]
    if system not in _listings:
        html = fetch(f'{LIBRETRO}{urllib.parse.quote(system)}/Named_Boxarts/').decode('utf-8', 'ignore')
        _listings[system] = [urllib.parse.unquote(h) for h in re.findall(r'href="([^"]+\.png)"', html)]
    files = _listings[system]
    by_name = {}
    for f in files:
        by_name.setdefault(norm(f[:-4]), []).append(f)
    for name in names(item):
        target = norm(name)
        match = by_name.get(target) or by_name.get((difflib.get_close_matches(target, by_name, n=1, cutoff=0.92) or [None])[0])
        if match:
            return f'{LIBRETRO}{urllib.parse.quote(system)}/Named_Boxarts/{urllib.parse.quote(sorted(match, key=rank)[0])}'
    return None


# Other sources ---------------------------------------------------------------------------------

def steam(item):
    for name in names(item):
        found = fetch_json('https://store.steampowered.com/api/storesearch/?' + urllib.parse.urlencode({'term': name, 'cc': 'fr', 'l': 'french'})).get('items', [])
        target = norm(name)
        pick = next((f for f in found if norm(f['name']) == target), None) or next((f for f in found if norm(f['name']).startswith(target)), None)
        if pick:
            for host in ('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps', 'https://cdn.cloudflare.steamstatic.com/steam/apps'):
                url = f"{host}/{pick['id']}/library_600x900.jpg"
                if exists(url):
                    return url
    return None


def nintendo_europe(item):
    system = {'switch': 'nintendoswitch*', '3ds': 'nintendo3ds*', 'wiiu': 'nintendowiiu*'}.get(item.get('via') or item['platform'], '*')
    for name in names(item):
        docs = fetch_json('https://searching.nintendo-europe.com/fr/select?' + urllib.parse.urlencode({
            'q': name, 'fq': f'type:GAME AND system_type:{system}', 'rows': 6, 'wt': 'json', 'fl': 'title,image_url,image_url_sq_s'})).get('response', {}).get('docs', [])
        target = norm(name)
        pick = next((d for d in docs if norm(d.get('title', '')) == target), None)
        if pick and (pick.get('image_url') or pick.get('image_url_sq_s')):
            return pick.get('image_url') or pick.get('image_url_sq_s')
    return None


def mariowiki(item):
    # only box art counts: the page image must have "box" in its name, never a logo or a screenshot
    for name in names(item):
        data = fetch_json('https://www.mariowiki.com/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': name, 'prop': 'pageimages', 'piprop': 'original', 'redirects': 1, 'format': 'json'}))
        url = next(iter(data['query']['pages'].values())).get('original', {}).get('source', '')
        if re.search(r'box', url.rsplit('/', 1)[-1], re.I):
            return url
    return None


def itunes(item):
    kind = 'movie' if item['kind'] == 'films' else 'software'
    for name in names(item):
        found = fetch_json('https://itunes.apple.com/search?' + urllib.parse.urlencode({'term': name, 'entity': kind, 'country': 'fr', 'limit': 8})).get('results', [])
        target = norm(name)
        for match in (lambda n: n == target, lambda n: n.startswith(target + ' ')):
            for f in found:
                if match(norm(f.get('trackName') or f.get('collectionName') or '')):
                    art = f.get('artworkUrl512') or f.get('artworkUrl100', '')
                    return re.sub(r'/\d+x\d+bb', '/600x900bb', art) if kind == 'movie' else art
    return None


def tvmaze(item):
    for name in names(item):
        found = fetch_json('https://api.tvmaze.com/search/shows?' + urllib.parse.urlencode({'q': name}))
        target = norm(name)
        for entry in found:
            show = entry['show']
            if norm(show['name']) == target and show.get('image') and (not item.get('year') or str(item['year']) == (show.get('premiered') or '')[:4]):
                return show['image'].get('original') or show['image'].get('medium')
    return None


def openlibrary(item):
    for name in names(item):
        found = fetch_json('https://openlibrary.org/search.json?' + urllib.parse.urlencode({'title': name, 'author': item.get('author', '').split(',')[0], 'limit': 8, 'fields': 'title,cover_i'})).get('docs', [])
        target = norm(name)
        pick = next((d for d in found if d.get('cover_i') and norm(d['title']) == target), None) or next((d for d in found if d.get('cover_i')), None)
        if pick:
            return f"https://covers.openlibrary.org/b/id/{pick['cover_i']}-L.jpg"
    return None


def wikipedia(item):
    for name in names(item):
        data = fetch_json('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(name.replace(' ', '_'), safe=''))
        url = (data.get('originalimage') or data.get('thumbnail') or {}).get('source', '')
        if url and not re.search(r'logo|icon|wordmark|\.svg', url.rsplit('/', 1)[-1], re.I):
            return url
    return None


CHAIN = {
    **{p: [libretro] for p in SYSTEMS},
    **{p: [gametdb, nintendo_europe, libretro] for p in ('wii', 'wiiu', '3ds', 'ds')},
    'switch': [gametdb, nintendo_europe, mariowiki, wikipedia],
    'steam': [steam],
    'android': [itunes, wikipedia],
    'web': [tvmaze, wikipedia],
    'pc': [],
    'film': [itunes, wikipedia],
    'book': [openlibrary, wikipedia],
}
LIBRETRO_SYSTEMS = {'wii': 'Nintendo - Wii', 'wiiu': 'Nintendo - Wii U', '3ds': 'Nintendo - Nintendo 3DS', 'ds': 'Nintendo - Nintendo DS'}
SYSTEMS.update(LIBRETRO_SYSTEMS)


def is_placeholder(raw):
    # GameTDB serves a small flat red "Nintendo eShop" tile for games it has no box for
    if len(raw) > 30000:
        return False
    out = subprocess.run(['magick', '-', '-resize', '32x32!', '-format', '%[fx:mean.r] %[fx:mean.g] %[fx:mean.b]', 'info:'], input=raw, capture_output=True).stdout.decode().split()
    r, g, b = (float(v) for v in out[:3]) if len(out) >= 3 else (0, 0, 0)
    return 0.6 < r < 0.8 and g < 0.2 and 0.1 < b < 0.35


def save(raw, dest, url=''):
    # the Wii only has its full wrap in high resolution: keep the front, the right 47.5%
    crop = ['-gravity', 'East', '-crop', '47.5%x100%+0+0', '+repage'] if '/wii/coverfull/' in url else []
    subprocess.run(['magick', '-', *crop, '-resize', 'x440>', '-strip', '-quality', '66', str(dest)], input=raw, check=True, stderr=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--only', action='append', default=[])
    args = parser.parse_args()
    data = json.loads(DATA.read_text())
    kept, missing = set(), []
    for kind, items in data.items():
        if kind == 'games':  # games are shown as short clips, see fetch-previews.py
            continue
        (OUT / kind).mkdir(parents=True, exist_ok=True)
        for item in items:
            dest = OUT / kind / f"{item_id(item)}.webp"
            item['kind'] = kind
            wanted = not args.only or any(query.lower() in item['title'].lower() for query in args.only)
            if (dest.exists() and not args.force) or not wanted:
                if dest.exists():
                    kept.add(dest)
                item.pop('kind')
                continue
            candidates = [('image', item['image'])] if item.get('image') else []
            if not candidates:
                platform = item.get('via') or item.get('platform') or ('film' if kind == 'films' else 'book' if kind == 'books' else 'web' if kind == 'series' else 'pc')
                candidates = [(finder.__name__, finder) for finder in CHAIN.get(platform, [])]
            raw = url = source = None
            for source, finder in candidates:
                try:
                    url = finder if isinstance(finder, str) else finder(item)
                    raw = fetch(url) if url else None
                except Exception as error:
                    print(f"  ! {source} failed for {item['title']}: {error}")
                    raw = None
                if raw and not is_placeholder(raw):
                    break
                raw = None
            item.pop('kind')
            if not raw:
                missing.append(item['title'])
                print(f"-- {item['title']}: no cover found")
                continue
            save(raw, dest, url)
            kept.add(dest)
            print(f"ok {item['title']} <- {source}: {url}")
    if not args.only:
        for file in OUT.glob('*/*.webp'):
            if file not in kept:
                file.unlink()
    print('missing:', missing or 'none')


if __name__ == '__main__':
    main()
