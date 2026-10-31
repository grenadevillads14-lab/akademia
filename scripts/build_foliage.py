#!/usr/bin/env python3
"""
Build the photographic leaf-spray atlas (public/assets/foliage/leaves.webp) from CC0 ambientCG leaf sets.

Each ambientCG "LeafSet" is a sheet of photographed leaves with an opacity mask. This script cuts out the
individual leaves, then composes, for each tree species, a twig spray in a 512 px cell of a 2048 x 1024 atlas,
in the same cell order as src/vegetation/leafAtlas.ts (olive, plane, fig, pomegranate / cypress, myrtle, laurel,
reed). The reed cell is left empty: the game paints it procedurally.

Usage: python3 -I scripts/build_foliage.py   (downloads into assets-src/ambientcg/)
"""
import io
import math
import os
import random
import urllib.request
import zipfile
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src', 'ambientcg')
OUT = os.path.join(ROOT, 'public', 'assets', 'foliage')
CELL = 512
# Olive leaves are dark grey-green above (the silver underside is done in the shader).
OLIVE = (0.55, 0.66, 0.56)
ORDER = ['olive', 'plane', 'fig', 'pomegranate', 'cypress', 'myrtle', 'laurel', 'reed']
SETS = {'olive': 'LeafSet013', 'plane': 'LeafSet029', 'fig': 'LeafSet029', 'pomegranate': 'LeafSet020',
        'cypress': 'LeafSet019', 'myrtle': 'LeafSet001', 'laurel': 'LeafSet022'}


def load(asset):
    p = os.path.join(SRC, f'{asset}.zip')
    if not os.path.exists(p) or not zipfile.is_zipfile(p):
        os.makedirs(SRC, exist_ok=True)
        urllib.request.urlretrieve(f'https://ambientcg.com/get?file={asset}_2K-PNG.zip', p)
    z = zipfile.ZipFile(p)
    color = Image.open(io.BytesIO(z.read(f'{asset}_2K-PNG_Color.png'))).convert('RGB')
    alpha = Image.open(io.BytesIO(z.read(f'{asset}_2K-PNG_Opacity.png'))).convert('L')
    return color, alpha


def leaves(asset, min_area=0.002):
    """Cut out each leaf: RGBA crops, rotated so the leaf's long axis is vertical (base at the bottom)."""
    color, alpha = load(asset)
    W, H = color.size
    s = 4
    small = np.asarray(alpha.resize((W // s, H // s))) > 100
    h, w = small.shape
    lab = np.zeros((h, w), np.int32)
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if small[y0, x0] and not lab[y0, x0]:
                n = len(comps) + 1
                q = deque([(y0, x0)])
                lab[y0, x0] = n
                pts = []
                while q:
                    y, x = q.popleft()
                    pts.append((y, x))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < h and 0 <= xx < w and small[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n
                            q.append((yy, xx))
                comps.append(np.array(pts))
    rgba = color.copy()
    rgba.putalpha(alpha)
    out = []
    for pts in comps:
        if len(pts) < min_area * h * w:
            continue
        y1, x1 = pts.min(0) * s
        y2, x2 = (pts.max(0) + 1) * s
        pad = 8
        crop = rgba.crop((max(0, x1 - pad), max(0, y1 - pad), min(W, x2 + pad), min(H, y2 + pad)))
        # Principal axis -> vertical.
        c = pts - pts.mean(0)
        cov = c.T @ c
        evals, evecs = np.linalg.eigh(cov)
        vy, vx = evecs[:, -1]
        ang = math.degrees(math.atan2(vx, vy))
        crop = crop.rotate(ang, expand=True, resample=Image.BICUBIC)
        # Base at the bottom: the stalk end is the narrower half by mass near the extreme... use where the
        # opaque mass is lower: leaves are widest above the middle (the stalk and narrow base go down).
        a = np.asarray(crop.getchannel('A')) > 100
        rows = a.sum(1)
        nz = np.nonzero(rows)[0]
        if len(nz) == 0:
            continue
        top, bot = nz[0], nz[-1]
        mid = (top + bot) // 2
        upper = rows[top:mid].sum()
        lower = rows[mid:bot + 1].sum()
        if lower > upper * 1.08:
            crop = crop.rotate(180)
        bb = crop.getbbox()
        if bb:
            crop = crop.crop(bb)
        out.append(crop)
    out.sort(key=lambda im: -im.size[0] * im.size[1])
    return out


def jitter(im, rng, hue=(1.0, 1.0), bright=(0.85, 1.12), sat=(0.85, 1.1), tint=None):
    rgb = im.convert('RGB')
    rgb = ImageEnhance.Brightness(rgb).enhance(rng.uniform(*bright))
    rgb = ImageEnhance.Color(rgb).enhance(rng.uniform(*sat))
    if tint is not None:
        arr = np.asarray(rgb).astype(np.float32) / 255
        arr = np.clip(arr * np.array(tint, np.float32), 0, 1)
        rgb = Image.fromarray((arr * 255).astype(np.uint8))
    rgb.putalpha(im.getchannel('A'))
    return rgb


def paste_leaf(cell, leaf, x, y, length, angle, rng, shade=1.0, tint=None):
    """Paste a leaf with its base at (x, y), pointing at `angle` (radians, 0 = up), `length` px long."""
    lw, lh = leaf.size
    sc = length / lh
    im = leaf.resize((max(1, int(lw * sc)), max(1, int(lh * sc))), Image.LANCZOS)
    im = jitter(im, rng, bright=(0.8 * shade, 1.1 * shade), tint=tint)
    # Pivot at the bottom centre: put the leaf on a square canvas with its base at the centre, then rotate.
    side = int(math.hypot(*im.size) * 2) + 4
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, (side // 2 - im.size[0] // 2, side // 2 - im.size[1]), im)
    canvas = canvas.rotate(-math.degrees(angle), resample=Image.BICUBIC)
    cell.alpha_composite(canvas, (int(x - side // 2), int(y - side // 2)))


def twig(cell, rng, color, width, length, bend=0.25):
    d = ImageDraw.Draw(cell)
    pts = []
    x, y = CELL * 0.5, CELL * 0.98
    a = rng.uniform(-0.15, 0.15)
    n = 14
    for i in range(n):
        nx = x + math.sin(a) * length / n
        ny = y - math.cos(a) * length / n
        d.line((x, y, nx, ny), fill=color, width=max(1, int(width * (1 - i / (n + 2)))))
        pts.append((nx, ny, a))
        x, y = nx, ny
        a += rng.uniform(-bend, bend) * 0.4
    return pts


def compose(kind, pool, rng):
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    big = pool[: max(2, len(pool) // 2)] or pool
    if kind == 'olive':
        # Opposite pairs of narrow silver-green leaves along a thin twig.
        pts = twig(cell, rng, (92, 86, 72, 255), 5, CELL * 0.88)
        for i, (x, y, a) in enumerate(pts[1:], 1):
            for side in (-1, 1):
                L = CELL * rng.uniform(0.17, 0.24) * (1 - i / 30)
                paste_leaf(cell, rng.choice(pool), x, y, L, a + side * rng.uniform(0.55, 0.95), rng, tint=OLIVE)
        paste_leaf(cell, rng.choice(pool), *pts[-1][:2], CELL * 0.2, pts[-1][2], rng, tint=OLIVE)
    elif kind in ('plane', 'fig'):
        n = 6 if kind == 'plane' else 4
        pts = twig(cell, rng, (88, 72, 52, 255), 6, CELL * 0.5)
        for i in range(n):
            x, y, a = pts[min(len(pts) - 1, 3 + i * 2)]
            ang = a + (-1) ** i * rng.uniform(0.35, 1.1)
            L = CELL * rng.uniform(0.33, 0.42) * (1.15 if kind == 'fig' else 1)
            # Petiole.
            ex, ey = x + math.sin(ang) * L * 0.18, y - math.cos(ang) * L * 0.18
            ImageDraw.Draw(cell).line((x, y, ex, ey), fill=(110, 100, 60, 255), width=3)
            paste_leaf(cell, rng.choice(big), ex, ey, L, ang, rng, shade=0.85 + 0.15 * (i / n), tint=(0.78, 0.9, 0.72) if kind == 'plane' else (0.72, 0.85, 0.66))
    elif kind == 'cypress':
        for i in range(3):
            leaf = pool[i % len(pool)]
            paste_leaf(cell, leaf, CELL * (0.35 + 0.15 * i), CELL * 0.98, CELL * rng.uniform(0.85, 0.97), rng.uniform(-0.25, 0.25), rng, tint=(0.7, 0.82, 0.68))
    else:
        # Myrtle, laurel, pomegranate: alternate leaves along a twig.
        size = {'myrtle': (0.12, 0.17), 'laurel': (0.22, 0.3), 'pomegranate': (0.16, 0.22)}[kind]
        tint = {'myrtle': (0.78, 0.88, 0.74), 'laurel': (0.72, 0.84, 0.7), 'pomegranate': (0.85, 0.95, 0.75)}[kind]
        pts = twig(cell, rng, (90, 76, 58, 255), 5, CELL * 0.85)
        for i, (x, y, a) in enumerate(pts[1:], 1):
            for side in ((-1, 1) if kind == 'myrtle' else ((-1) ** i,)):
                paste_leaf(cell, rng.choice(pool), x, y, CELL * rng.uniform(*size), a + side * rng.uniform(0.5, 1.0), rng, tint=tint)
        paste_leaf(cell, rng.choice(pool), *pts[-1][:2], CELL * size[1], pts[-1][2], rng, tint=tint)
    # Leaves deeper in the spray are darker: a soft multiply toward the twig base (cheap ambient occlusion).
    a = np.asarray(cell).astype(np.float32)
    yy = np.linspace(0, 1, CELL)[:, None]
    occl = 0.82 + 0.18 * (1 - yy)
    a[..., :3] *= occl[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def main():
    os.makedirs(OUT, exist_ok=True)
    atlas = Image.new('RGBA', (CELL * 4, CELL * 2), (0, 0, 0, 0))
    cache = {}
    for i, kind in enumerate(ORDER):
        asset = SETS.get(kind)
        if not asset:
            continue
        if asset not in cache:
            cache[asset] = leaves(asset)
            print(f'[foliage] {asset}: {len(cache[asset])} leaves')
        rng = random.Random(100 + i)
        cell = compose(kind, cache[asset], rng)
        atlas.alpha_composite(cell, ((i % 4) * CELL, (i // 4) * CELL))
    # Bleed colour into transparent pixels so mipmaps don't darken leaf edges.
    rgb = atlas.convert('RGB').filter(ImageFilter.MaxFilter(5))
    bled = Image.composite(atlas.convert('RGB'), rgb, atlas.getchannel('A').point(lambda v: 255 if v > 8 else 0))
    bled.putalpha(atlas.getchannel('A'))
    path = os.path.join(OUT, 'leaves.webp')
    bled.save(path, 'WEBP', quality=90, method=6)
    print('[foliage]', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
