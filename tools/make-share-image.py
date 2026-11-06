#!/usr/bin/env python3
"""Draws the 1200x630 card that link previews show (og:image and twitter:image).

It is made of what the site already has: the portrait of the "What you get" section drawn with the
cell renderer of pixel.js (same gap, same four brightness levels), the logo and the two typefaces.
Run it again when the name, the title or the portrait change:

    python3 tools/make-share-image.py

Needs Pillow (with raqm, for kerning and variable fonts) and ImageMagick (to draw the svg logo).
"""
import io
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / 'assets/images/core'
FONTS = ROOT / 'assets/fonts'
OUT = CORE / 'share.png'

W, H = 1200, 630
BLACK, WHITE, ACCENT = (0x21, 0x07, 0x10), (0xF6, 0xF2, 0xF2), (0xE0, 0x38, 0x2E)

# the portrait panel: cells like pixel.js draws them, 9 px wide so that 70 rows fill the card exactly
CELL, COLS, ROWS = 9, 56, 70
LEVELS = (20, 60, 130)
PANEL_X = W - COLS * CELL
# the photo has a white background and the site shows it as a red field; on a card the person is
# the pixels, so the background is dropped and the tones are spread over the four cell levels
TONES = [(0, 0), (15, 14), (30, 38), (70, 60), (110, 88), (140, 122), (165, 165), (190, 225), (215, 255), (255, 255)]

MARGIN = 72
NAME_SIZE = 200


def js_round(value):
    return math.floor(value + 0.5)


def draw_cell(draw, state, x, y):
    """The three cell tiles of pixel.js: scattered dots, a checkerboard, a solid square."""
    gap = max(1, js_round(CELL * 0.25))
    side = CELL - gap
    if state == 3:
        draw.rectangle((x, y, x + side - 1, y + side - 1), fill=ACCENT)
        return
    q = max(1, js_round(side / 5))
    n = side // q
    for i in range(n):
        for j in range(n):
            if (i % 2 == 1 and j % 2 == 1) if state == 1 else (i + j) % 2 == 0:
                draw.rectangle((x + i * q, y + j * q, x + i * q + q - 1, y + j * q + q - 1), fill=ACCENT)


def tone_table():
    table = []
    for value in range(256):
        for (x0, y0), (x1, y1) in zip(TONES, TONES[1:]):
            if value <= x1:
                table.append(js_round(y0 + (y1 - y0) * (value - x0) / (x1 - x0)))
                break
    return table


def portrait_cells(card):
    picture = Image.open(CORE / 'promise.webp').convert('L')
    # the background is the white that touches the corners
    flooded = picture.point(lambda v: 255 if v > 238 else 0)
    for corner in ((0, 0), (picture.width - 1, 0)):
        ImageDraw.floodfill(flooded, corner, 128, thresh=0)
    picture = picture.point(tone_table())
    picture.paste(0, mask=flooded.point(lambda v: 255 if v == 128 else 0))

    # same fit as pixelPicture: cover the grid, centred sideways and showing the top of the picture
    scale = max(COLS / picture.width, ROWS / picture.height)
    fitted = picture.resize((COLS, max(ROWS, js_round(picture.height * scale))), Image.Resampling.BOX)
    top = js_round((fitted.height - ROWS) * 0.25)
    grid = fitted.crop((0, top, COLS, top + ROWS))
    draw = ImageDraw.Draw(card)
    for row in range(ROWS):
        for col in range(COLS):
            state = sum(grid.getpixel((col, row)) >= level for level in LEVELS)
            if state:
                draw_cell(draw, state, PANEL_X + col * CELL, row * CELL)


def logo(height):
    svg = subprocess.run(['magick', '-background', 'none', '-density', '800', str(CORE / 'logo.svg'), '-resize', f'x{height}', 'png:-'], check=True, capture_output=True).stdout
    mark = Image.open(io.BytesIO(svg)).convert('RGBA')
    return mark.getchannel('A')  # the svg is a black shape: its alpha is the shape


def main():
    card = Image.new('RGB', (W, H), BLACK)
    portrait_cells(card)
    draw = ImageDraw.Draw(card)

    serif = ImageFont.truetype(str(FONTS / 'editorial-old-italic.otf'), NAME_SIZE, layout_engine=ImageFont.Layout.RAQM)
    sans = ImageFont.truetype(str(FONTS / 'satoshi-variable.ttf'), 34, layout_engine=ImageFont.Layout.RAQM)
    sans.set_variation_by_axes([500])
    small = ImageFont.truetype(str(FONTS / 'satoshi-variable.ttf'), 26, layout_engine=ImageFont.Layout.RAQM)
    small.set_variation_by_axes([500])

    mark = logo(72)
    card.paste(WHITE, (MARGIN - 6, 52), mark)
    draw.text((PANEL_X - MARGIN + 24, 100), 'l-dev31.github.io', font=small, fill=ACCENT, anchor='rs')

    draw.text((MARGIN - 8, 322), 'Léo', font=serif, fill=WHITE, anchor='ls')
    draw.text((MARGIN - 8, 492), 'Tosku.', font=serif, fill=WHITE, anchor='ls')
    draw.text((MARGIN, 560), 'UI/UX & Product Designer', font=sans, fill=WHITE, anchor='ls')

    # a handful of flat colours: a palette png is a fraction of the size of a jpeg and stays sharp
    card.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
