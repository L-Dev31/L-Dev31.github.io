import json, math, sys
from collections import Counter
from PIL import Image, ImageDraw

SCALE = 8

def to_grid(image, width, height, palette):
    rgb = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in palette]
    small = []
    for y in range(height):
        line = ''
        for x in range(width):
            votes = Counter()
            for sy in range(SCALE):
                for sx in range(SCALE):
                    votes[image.getpixel((x * SCALE + sx, y * SCALE + sy))] += 1
            line += chr(48 + votes.most_common(1)[0][0])
        small.append(line)
    return small

def star(draw, cx, cy, outer, inner, fill):
    points = []
    for i in range(10):
        radius = outer if i % 2 == 0 else inner
        angle = -math.pi / 2 + i * math.pi / 5
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    draw.polygon(points, fill=fill)

def guadeloupe():
    width, height = 60, 30
    palette = ['#078A34', '#F6F2F2', '#DA1218', '#FFDE0A']
    image = Image.new('P', (width * SCALE, height * SCALE), 2)
    d = ImageDraw.Draw(image)
    d.rectangle([0, 0, width * SCALE, 6 * SCALE - 1], fill=0)
    d.rectangle([0, 6 * SCALE, width * SCALE, 7 * SCALE - 1], fill=1)
    d.rectangle([0, 23 * SCALE, width * SCALE, 24 * SCALE - 1], fill=1)
    d.rectangle([0, 24 * SCALE, width * SCALE, height * SCALE], fill=0)
    star(d, 15 * SCALE, 15.6 * SCALE, 9.6 * SCALE, 4.6 * SCALE, 3)
    return {'aspect': 2, 'palette': palette, 'grid': to_grid(image, width, height, palette)}

def san_marino():
    width, height = 96, 72
    palette = ['#F6F2F2', '#19B6EF', '#1E9E5A', '#F4C20D', '#6A4A2A']
    image = Image.new('P', (width * SCALE, height * SCALE), 0)
    d = ImageDraw.Draw(image)
    half = height * SCALE // 2
    d.rectangle([0, half, width * SCALE, height * SCALE], fill=1)
    cx, cy = width * SCALE / 2, half
    # wreath
    d.ellipse([cx - 17 * SCALE, cy - 18 * SCALE, cx + 17 * SCALE, cy + 20 * SCALE], fill=2)
    # shield
    d.ellipse([cx - 12 * SCALE, cy - 14 * SCALE, cx + 12 * SCALE, cy + 16 * SCALE], fill=0)
    d.rectangle([cx - 12 * SCALE, cy - 14 * SCALE, cx + 12 * SCALE, cy + 2 * SCALE], fill=0)
    d.pieslice([cx - 12 * SCALE, cy - 8 * SCALE, cx + 12 * SCALE, cy + 16 * SCALE], 0, 180, fill=0)
    # three towers on a blue hill
    d.pieslice([cx - 13 * SCALE, cy + 4 * SCALE, cx + 13 * SCALE, cy + 22 * SCALE], 180, 360, fill=1)
    for dx, top in ((-7, -6), (0, -9), (7, -6)):
        x0 = cx + (dx - 3) * SCALE
        d.rectangle([x0, cy + top * SCALE, x0 + 6 * SCALE, cy + 6 * SCALE], fill=1)
        for k in range(3):
            d.rectangle([x0 + k * 2.4 * SCALE, cy + (top - 1.6) * SCALE, x0 + k * 2.4 * SCALE + 1.4 * SCALE, cy + top * SCALE], fill=1)
        d.rectangle([x0 + 2 * SCALE, cy + (top + 3) * SCALE, x0 + 4 * SCALE, cy + (top + 7) * SCALE], fill=0)
    # crown
    d.rectangle([cx - 8 * SCALE, cy - 22 * SCALE, cx + 8 * SCALE, cy - 15 * SCALE], fill=3)
    for k in range(5):
        d.polygon([(cx - 8 * SCALE + k * 4 * SCALE, cy - 22 * SCALE), (cx - 6 * SCALE + k * 4 * SCALE, cy - 26 * SCALE), (cx - 4 * SCALE + k * 4 * SCALE, cy - 22 * SCALE)], fill=3)
    d.ellipse([cx - 1.6 * SCALE, cy - 29 * SCALE, cx + 1.6 * SCALE, cy - 25 * SCALE], fill=3)
    return {'aspect': round(width / height, 3), 'palette': palette, 'grid': to_grid(image, width, height, palette)}

def preview(flag, path):
    palette = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in flag['palette']]
    grid = flag['grid']
    image = Image.new('RGB', (len(grid[0]), len(grid)))
    for y, line in enumerate(grid):
        for x, ch in enumerate(line):
            image.putpixel((x, y), palette[ord(ch) - 48])
    image.resize((image.width * 6, image.height * 6), Image.NEAREST).save(path)

if __name__ == '__main__':
    path = 'assets/data/flags.json'
    flags = json.load(open(path, encoding='utf8'))
    flags['gp'] = guadeloupe()
    flags['sm'] = san_marino()
    json.dump(flags, open(path, 'w', encoding='utf8'), separators=(',', ':'))
    if len(sys.argv) > 1:
        preview(flags['sm'], sys.argv[1] + '-sm.png')
        preview(flags['gp'], sys.argv[1] + '-gp.png')
