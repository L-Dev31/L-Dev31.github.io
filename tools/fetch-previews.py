#!/usr/bin/env python3
"""Cut a 21 second muted gameplay clip for every game of assets/data/culture.json.

For each game it looks for a longplay (pure gameplay, no commentary) of the exact game
on the exact console, rejecting titles that mention another console, a remake or a mod.
It downloads only 21 seconds taken a quarter of the way into the video, drops the sound
and encodes a tiny H.264 clip ("video_seconds" shortens it; 320 px wide unless the entry sets "video_width", 12 fps, about 100 KB) in assets/videos/culture/.
The file is named after the game's "id" in the json, which is how the page finds it. Needs yt-dlp and ffmpeg.

    python3 tools/fetch-previews.py [--force] [--only "Ocarina"] [--jobs 4]
"""
import argparse
import concurrent.futures
import json
import pathlib
import re
import subprocess
import tempfile
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'assets/data/culture.json'
OUT = ROOT / 'assets/videos/culture'
CLIP = 21

NAMES = {'nes': 'NES', 'snes': 'SNES', 'n64': 'Nintendo 64 N64', 'gb': 'Game Boy', 'gbc': 'Game Boy Color', 'gba': 'Game Boy Advance GBA', 'ds': 'Nintendo DS',
         '3ds': 'Nintendo 3DS', 'wii': 'Wii', 'wiiu': 'Wii U', 'switch': 'Nintendo Switch', 'steam': 'PC', 'pc': 'PC', 'android': 'Android', 'web': 'browser', 'mame': 'arcade'}
# words that identify each console in a video title
KEYS = {'nes': r'\bnes\b|famicom(?! disk)|nintendo entertainment', 'snes': r'\bsnes\b|super nintendo|super famicom', 'n64': r'\bn64\b|nintendo 64',
        'gb': r'game ?boy(?! (advance|color))|\bgb\b|\bdmg\b', 'gbc': r'game ?boy color|\bgbc\b', 'gba': r'game ?boy advance|\bgba\b', 'ds': r'(?<!3)\bn?ds\b|nintendo ds',
        '3ds': r'\b3ds\b', 'wii': r'\bwii\b(?! ?u)', 'wiiu': r'wii ?u\b', 'switch': r'\bswitch\b', 'mame': r'arcade|mame'}
BAD = r'streamer|stream\b|twitch|facecam|webcam|reaction|gamemaster|\blive\b|remake|remaster|reimagined|definitive|\bmod\b|\bhack\b|romhack|randomizer|speedrun|\btas\b|trailer|review|reaction|tutorial|guide|how to|\bvs\b|fan ?game|demo\b'


def norm(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', text).split())


def item_id(item):
    return slug(item['title'], item.get('platform', ''))


def slug(title, platform=''):
    return re.sub(r'[^a-z0-9]+', '-', norm(f'{title} {platform}')).strip('-')


def pick(item, rows):
    platform = item.get('via') or item['platform']
    name = norm(re.sub(r'\s*\([^)]*\)$', '', item.get('video_name', item['title'])))
    best, best_score = None, 0
    for vid, duration, title in rows:
        low, n = title.lower(), norm(title)
        if item.get('video_reject') and re.search(item['video_reject'], low):
            continue
        if vid in item.get('video_skip', []) or name not in n or re.search(BAD.replace(r'\bvs\b|', '') if 'vs' in name.split() else BAD, low) or duration < 240 or ('super' in n and 'super' not in name):
            continue
        # "Pokemon White Version" must not take the video of "Pokemon White Version 2"
        after = n[n.find(name) + len(name):].split()
        if after and after[0].isdigit() and not name.split()[-1].isdigit():
            continue
        others = [k for p, k in KEYS.items() if p != platform and re.search(k, low)]
        if others:
            continue
        own = re.search(KEYS[platform], low) if platform in KEYS else True
        if item.get('video_pure') and 'longplay' not in low.split('~')[0]:
            continue
        # pure uploads from longplay channels have no frame, no webcam and no overlay
        score = 1 + (4 if 'longplay' in low.split('~')[0] else 0) + (2 if own else 0) + (2 if 'longplay' in low else 0) + (1 if 'no commentary' in low else 0)
        if score > best_score:
            best, best_score = (vid, duration), score
    return best


def clip(item):
    dest = OUT / f"{item_id(item)}.mp4"
    platform = item.get('via') or item['platform']
    base = item.get('video_name', re.sub(r'\s*\([^)]*\)$', '', item['title']))
    queries = [item['video_search']] if item.get('video_search') else [
        f"{base} {NAMES.get(platform, '')} longplay no commentary", f"{base} {NAMES.get(platform, '')} full gameplay walkthrough",
        f"{base} longplay", f"{base} gameplay part 1 no commentary"]
    found = None
    for query in queries:
        lines = subprocess.run(['yt-dlp', '--no-warnings', '--print', '%(id)s|%(duration)s|%(channel)s ~ %(title)s', f'ytsearch15:{query}'], capture_output=True, text=True, timeout=180).stdout.split('\n')
        rows = []
        for line in lines:
            parts = line.split('|', 2)
            if len(parts) == 3 and parts[1].replace('.', '').isdigit():
                rows.append((parts[0], float(parts[1]), parts[2]))
        found = pick(item, rows)
        if found:
            break
    if not found:
        return None, None
    vid, duration = found
    start = max(30.0, min(duration * 0.25, duration - 60))
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['yt-dlp', '--no-warnings', '-q', '-f', f"bv*[height<={max(480, item.get('video_width', 320) * 9 // 16 + 1)}]/b", '--download-sections', f'*{start:.1f}-{start + item.get("video_seconds", CLIP) + 1:.1f}',
                        '--force-keyframes-at-cuts', '-o', str(pathlib.Path(tmp) / 'raw.mp4'), f'https://www.youtube.com/watch?v={vid}'], capture_output=True, timeout=300)
        raw = next(pathlib.Path(tmp).glob('raw*'), None)
        if not raw:
            return None, None
        # black bars around the picture are detected and cut out
        probe = subprocess.run(['ffmpeg', '-i', str(raw), '-vf', 'cropdetect=limit=24:round=2:reset=0', '-an', '-f', 'null', '-'], capture_output=True, text=True).stderr
        crops = re.findall(r'crop=(\d+:\d+:\d+:\d+)', probe)
        crop = f'crop={crops[-1]},' if crops else ''
        done = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw), '-t', str(item.get('video_seconds', CLIP)), '-an', '-vf', f"{crop}scale={item.get('video_width', 320)}:-2,fps=12",
                               '-c:v', 'libx264', '-crf', str(item.get('video_crf', 36)), '-preset', 'veryslow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dest)], capture_output=True)
        return (dest, vid) if done.returncode == 0 and dest.exists() else (None, None)


def width_of(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', str(path)], capture_output=True, text=True).stdout.split()
    return int(out[0]) if out else 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--only')
    parser.add_argument('--platform')
    parser.add_argument('--sharpen', action='store_true', help='redo the clips narrower than their video_width')
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    data = json.loads(DATA.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    todo = []
    for item in data['games']:
        dest = OUT / f"{item_id(item)}.mp4"
        if args.only and args.only.lower() not in item['title'].lower():
            continue
        if args.platform and item['platform'] != args.platform:
            continue
        if not dest.exists() or args.force or (args.sharpen and width_of(dest) < item.get('video_width', 320)):
            todo.append(item)
    with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
        for item, (dest, vid) in zip(todo, pool.map(clip, todo)):
            if dest:
                print(f"ok {item['title']} ({item['platform']}) <- youtube.com/watch?v={vid} {dest.stat().st_size // 1024} KB", flush=True)
            else:
                print(f"-- {item['title']} ({item['platform']}): no clip", flush=True)


if __name__ == '__main__':
    main()
