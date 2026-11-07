#!/usr/bin/env python3
"""Write assets/data/culture-<kind>.csv (the "see all" lists) from assets/data/culture.json.

    python3 tools/make-culture-csv.py
"""
import csv
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'assets/data/culture.json'
PLATFORMS = {'nes': 'NES', 'snes': 'SNES', 'n64': 'Nintendo 64', 'gb': 'Game Boy', 'gbc': 'Game Boy Color', 'gba': 'Game Boy Advance',
             'ds': 'Nintendo DS', '3ds': 'Nintendo 3DS', 'wii': 'Wii', 'wiiu': 'Wii U', 'switch': 'Switch', 'mame': 'Arcade',
             'steam': 'PC', 'pc': 'PC', 'android': 'Mobile'}


def clean(title):
    return re.sub(r' \((\d{4})\)$', '', title)


def write(kind, header, rows):
    with open(ROOT / f'assets/data/culture-{kind}.csv', 'w', encoding='utf8', newline='') as handle:
        writer = csv.writer(handle, lineterminator='\n')
        writer.writerow(header)
        writer.writerows(rows)


if __name__ == '__main__':
    data = json.loads(DATA.read_text())
    newest = lambda item: -item['year']
    write('films', ['title', 'year'], [[clean(f['title']), f['year']] for f in sorted(data['films'], key=newest)])
    write('series', ['title', 'year', 'seasons'], [[s['title'], s['year'], s.get('note', '')] for s in sorted(data['series'], key=newest)])
    write('games', ['title', 'year', 'platform'], [[g['title'], g['year'], PLATFORMS.get(g['platform'], g['platform'])] for g in sorted(data['games'], key=newest)])
    write('books', ['title', 'year', 'author'], [[b['title'], b['year'], b.get('author', '')] for b in sorted(data['books'], key=newest)])
