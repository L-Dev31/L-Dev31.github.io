#!/usr/bin/env python3
"""Builds the home hero video from about.mp4 (Léo's face turning, lit on black).

The face is drawn the way a terminal draws shades, one cell at a time, in the flat accent red on the page's black:

    solid         the cell is red                   (the brightest cells)
    checkerboard  half of the cell is red           (mid tones)
    dots          a few red dots                    (dim)
    nothing       the page's black                  (the darkest cells, and the video's own background)

Cells are CELL px wide with GAP px of black between neighbours.

  assets/images/core/hero-face.mp4  the turn forward, then backward without repeating either end, so it loops cleanly.
                                    On desktop the scroll drives the forward half (scrollScrubbedVideo); phones loop the whole clip.
  assets/images/core/hero-face.jpg  poster: the first frame

Needs python3 with numpy, and ffmpeg. From the repository root:

    python3 tools/render-hero-media.py
    python3 tools/render-hero-media.py --cell 10 --gap 2 --levels 22,60,130

Keep ACCENT and PAGE_BLACK in step with --accent and --black in assets/styles/*.css.
"""
import argparse, os, subprocess
import numpy as np

CORE = "assets/images/core/"
FPS = 24
ACCENT = (0xE4, 0x06, 0x13)        # --accent
PAGE_BLACK = (0x0D, 0x09, 0x09)    # --black
SUB = 2                            # px of one dot / one checker square


def run(cmd):
    subprocess.run(cmd, check=True)


def cells_of(w, h):
    """Mean luminance of every w x h cell of every frame of the forward turn (ffmpeg's area filter does the averaging)."""
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", CORE + "about.mp4", "-vf",
                        f"fps={FPS},trim=0:2.3,scale={w}:{h}:flags=area,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                       stdout=subprocess.PIPE, check=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--cell", type=int, default=12, help="px per cell (width and height must be multiples of it)")
    ap.add_argument("--gap", type=int, default=2, help="px of black between two neighbouring cells")
    ap.add_argument("--levels", default="22,60,130", help="luminance (0-255) where dots, checkerboard and solid start")
    ap.add_argument("--shift-x", type=int, default=0, help="move the face by this many cells (+ = right)")
    ap.add_argument("--shift-y", type=int, default=0, help="move the face by this many cells (+ = down)")
    ap.add_argument("--crf", type=int, default=28, help="x264 quality (lower = sharper and heavier)")
    ap.add_argument("--gop", type=int, default=12, help="frames between keyframes (the scroll seeks backwards, so keep it short)")
    ap.add_argument("--out", default=CORE + "hero-face.mp4")
    a = ap.parse_args()
    W, H, C, G = a.width, a.height, a.cell, a.gap
    if W % C or H % C:
        ap.error("width and height must be multiples of --cell")
    levels = [int(x) for x in a.levels.split(",")]

    turn = cells_of(W // C, H // C)
    seq = list(turn) + list(turn[-2:0:-1])             # forward, then back without repeating either end

    # The three patterns, inside the (C - GAP) square of each cell, on a SUB px lattice.
    yy, xx = np.mgrid[0:H, 0:W]
    u, v = xx % C, yy % C
    i, j = u // SUB, v // SUB
    solid = (u < C - G) & (v < C - G)
    patterns = [None, solid & (i % 2 == 1) & (j % 2 == 1), solid & ((i + j) % 2 == 0), solid]   # nothing, dots, checkerboard, solid

    bg, accent = np.array(PAGE_BLACK, np.uint8), np.array(ACCENT, np.uint8)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-an", "-c:v", "libx264", "-crf", str(a.crf), "-preset", "slow", "-g", str(a.gop), "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.out],
                           stdin=subprocess.PIPE)
    ones = np.ones((C, C), np.uint8)
    counts = np.zeros(4)
    for cell in seq:
        cell = np.roll(cell, (a.shift_y, a.shift_x), (0, 1))
        state = np.digitize(cell, levels)               # 0 nothing, 1 dots, 2 checkerboard, 3 solid
        counts += np.bincount(state.ravel(), minlength=4)
        s = np.kron(state.astype(np.uint8), ones)
        lit = (s == 1) & patterns[1] | (s == 2) & patterns[2] | (s == 3) & patterns[3]
        enc.stdin.write(np.where(lit[..., None], accent, bg).tobytes())
    enc.stdin.close()
    enc.wait()

    run(["ffmpeg", "-v", "error", "-y", "-i", a.out, "-frames:v", "1", "-vf", "scale=1280:-1", "-q:v", "3", CORE + "hero-face.jpg"])
    share = counts / counts.sum() * 100
    print(f"{a.out}: {os.path.getsize(a.out) / 1e6:.2f} MB, {len(seq)} frames, {W}x{H}, grid {W // C}x{H // C}, cell {C}px, gap {G}px")
    print(f"cells: nothing {share[0]:.0f}%  dots {share[1]:.0f}%  checkerboard {share[2]:.0f}%  solid {share[3]:.0f}%")


if __name__ == "__main__":
    main()
