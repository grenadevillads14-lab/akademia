#!/usr/bin/env python3
"""
Bake CC0 MakeHuman assets into compact game data (public/assets/humans/).

Sources (all CC0):
  - MakeHuman base mesh hm08, macro targets, default skeleton + weights:
      https://github.com/makehumancommunity/makehuman (makehuman/data)
  - MakeHuman system assets (skins, hair, eyebrows, eyelashes, eyes):
      https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
  - Community beards (bodyparts05, CC0):
      https://files2.makehumancommunity.org/asset_packs/bodyparts05/bodyparts05_cc0.zip

The runtime (src/characters/mhuman.ts) blends the targets for a character's sex, age and build, fits the hair,
beards and eyes to the shaped body, poses the arms down, and binds everything to the game's 20-bone skeleton,
so the existing procedural animator drives realistic bodies.

Usage: python3 -I scripts/build_humans.py   (downloads into assets-src/makehuman/, writes public/assets/humans/)
"""
import base64
import io
import json
import os
import posixpath
import subprocess
import sys
import urllib.request
import zipfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src', 'makehuman')
OUT = os.path.join(ROOT, 'public', 'assets', 'humans')
REPO = os.path.join(SRC, 'repo')
DATA = os.path.join(REPO, 'makehuman', 'data')
PACKS = {
    'sys': 'https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip',
    'bodyparts05': 'https://files2.makehumancommunity.org/asset_packs/bodyparts05/bodyparts05_cc0.zip',
}

# Game skeleton (must match BONES in src/characters/humanoid.ts).
BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
         'shoulderL', 'upperArmL', 'foreArmL', 'handL',
         'shoulderR', 'upperArmR', 'foreArmR', 'handR',
         'thighL', 'shinL', 'footL',
         'thighR', 'shinR', 'footR']
# MakeHuman bone -> game bone (anything not listed inherits its nearest listed ancestor).
MAP = {
    'root': 'hips', 'spine05': 'hips', 'pelvis.L': 'hips', 'pelvis.R': 'hips',
    'spine04': 'spine', 'spine03': 'spine',
    'spine02': 'chest', 'spine01': 'chest', 'breast.L': 'chest', 'breast.R': 'chest',
    'neck01': 'neck', 'neck02': 'neck', 'neck03': 'neck',
    'head': 'head',
}
for s in 'LR':
    MAP.update({
        f'clavicle.{s}': f'shoulder{s}', f'shoulder01.{s}': f'shoulder{s}',
        f'upperarm01.{s}': f'upperArm{s}', f'upperarm02.{s}': f'upperArm{s}',
        f'lowerarm01.{s}': f'foreArm{s}', f'lowerarm02.{s}': f'foreArm{s}',
        f'wrist.{s}': f'hand{s}',
        f'upperleg01.{s}': f'thigh{s}', f'upperleg02.{s}': f'thigh{s}',
        f'lowerleg01.{s}': f'shin{s}', f'lowerleg02.{s}': f'shin{s}',
        f'foot.{s}': f'foot{s}',
    })
# Where each game bone pivots: the head joint of this MakeHuman bone.
PIVOT = {'hips': 'spine05', 'spine': 'spine03', 'chest': 'spine01', 'neck': 'neck01', 'head': 'head'}
for s in 'LR':
    PIVOT.update({f'shoulder{s}': f'clavicle.{s}', f'upperArm{s}': f'upperarm01.{s}', f'foreArm{s}': f'lowerarm01.{s}',
                  f'hand{s}': f'wrist.{s}', f'thigh{s}': f'upperleg01.{s}', f'shin{s}': f'lowerleg01.{s}', f'foot{s}': f'foot.{s}'})

# Targets the runtime blends (MakeHuman macro system, child/baby ages left out).
SEXES = ['male', 'female']
AGES = ['young', 'old']
MUSCLES = ['averagemuscle', 'maxmuscle']
WEIGHTS = ['minweight', 'averageweight', 'maxweight']

HAIR = ['short01', 'short02', 'short03', 'short04', 'long01', 'bob02', 'braid01', 'ponytail01']
BEARDS = {'scruffy': 'clothes/wdg_scruffy_beard', 'viking': 'clothes/rehmanpolanski_beard_viking', 'sigmund': 'clothes/grinsegold_beard_sigmund_wip'}
SKINS = ['young_caucasian_male', 'young_caucasian_female', 'middleage_caucasian_male', 'middleage_caucasian_female',
         'old_caucasian_male', 'old_caucasian_female', 'young_african_male', 'middleage_african_male', 'young_african_female']
TEX_SIZE = 1024


def log(*a):
    print('[humans]', *a, file=sys.stderr)


def fetch():
    os.makedirs(SRC, exist_ok=True)
    if not os.path.isdir(DATA):
        log('cloning makehuman (sparse)')
        subprocess.check_call(['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/makehumancommunity/makehuman.git', REPO])
        subprocess.check_call(['git', '-C', REPO, 'sparse-checkout', 'set', 'makehuman/data/3dobjs', 'makehuman/data/rigs', 'makehuman/data/targets/macrodetails'])
    for k, url in PACKS.items():
        p = os.path.join(SRC, f'{k}.zip')
        ok = os.path.exists(p) and zipfile.is_zipfile(p)
        if not ok:
            log('downloading', url)
            urllib.request.urlretrieve(url, p)
    return {k: zipfile.ZipFile(os.path.join(SRC, f'{k}.zip')) for k in PACKS}


def b64(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode('ascii')


def parse_obj(text: str, group=None):
    """Vertices, uvs and faces (lists of (v, vt)). If group is given, only faces of that group."""
    V, VT, F = [], [], []
    g = None
    for line in text.splitlines():
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g ') or line.startswith('o '):
            g = line.split()[1] if len(line.split()) > 1 else None
        elif line.startswith('f '):
            if group and g != group:
                continue
            face = []
            for tok in line.split()[1:]:
                parts = tok.split('/')
                face.append((int(parts[0]) - 1, int(parts[1]) - 1 if len(parts) > 1 and parts[1] else -1))
            F.append(face)
    return np.array(V, dtype=np.float64), np.array(VT, dtype=np.float64) if VT else np.zeros((0, 2)), F


def split_mesh(F):
    """Unique (v, vt) render vertices and triangle indices."""
    key = {}
    vo, vt, idx = [], [], []
    for face in F:
        ids = []
        for v, t in face:
            k = (v, t)
            if k not in key:
                key[k] = len(vo)
                vo.append(v)
                vt.append(t)
            ids.append(key[k])
        for i in range(1, len(ids) - 1):
            idx += [ids[0], ids[i], ids[i + 1]]
    return np.array(vo), np.array(vt), np.array(idx)


def read_target(path):
    idx, d = [], []
    for line in open(path):
        if not line[0].isdigit():
            continue
        p = line.split()
        idx.append(int(p[0]))
        d.append([float(x) for x in p[1:4]])
    return np.array(idx, dtype=np.uint32), np.array(d, dtype=np.float64)


def encode_target(idx, d):
    # Quantise to 0.01 mm (MakeHuman units are decimetres).
    q = np.clip(np.round(d / 1e-4), -32767, 32767).astype(np.int16)
    return {'idx': b64(idx.astype(np.uint16)), 'd': b64(q), 'scale': 1e-4}


def parse_mhclo(text):
    """Reference vertices (3 per proxy vertex), weights, offsets, axis scales."""
    refs, ws, offs, scales = [], [], [], {}
    meta = {}
    in_verts = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        p = line.split()
        if p[0] in ('x_scale', 'y_scale', 'z_scale'):
            scales[p[0][0]] = [int(p[1]), int(p[2]), float(p[3])]
            continue
        if p[0] == 'verts':
            in_verts = True
            continue
        numeric = p[0].lstrip('-').replace('.', '', 1).isdigit()
        if not numeric:
            # Section keywords end the vertex list; plain metadata lines may appear anywhere.
            if p[0] in ('delete_verts', 'weights'):
                in_verts = False
            meta[p[0]] = ' '.join(p[1:])
            continue
        if in_verts:
            if len(p) == 1:
                refs.append([int(p[0])] * 3)
                ws.append([1.0, 0.0, 0.0])
                offs.append([0.0, 0.0, 0.0])
            elif len(p) >= 9:
                refs.append([int(x) for x in p[0:3]])
                ws.append([float(x) for x in p[3:6]])
                offs.append([float(x) for x in p[6:9]])
    return np.array(refs), np.array(ws), np.array(offs), scales, meta


def parse_mhmat(text):
    m = {}
    for line in text.splitlines():
        p = line.strip().split(None, 1)
        if len(p) == 2 and not p[0].startswith(('#', '//')):
            m[p[0]] = p[1].strip()
    return m


def save_texture(data: bytes, name: str, size=TEX_SIZE, alpha=False, gray=False):
    img = Image.open(io.BytesIO(data))
    img = img.convert('RGBA' if alpha or img.mode in ('RGBA', 'LA', 'P') else 'RGB')
    if gray:
        # Neutral grey, normalised so the game can tint hair to any colour.
        a = np.asarray(img).astype(np.float32) / 255
        lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        mask = a[..., 3] > 0.3 if a.shape[-1] == 4 else np.ones(lum.shape, bool)
        hi = np.percentile(lum[mask], 95) if mask.any() else 1.0
        lum = np.clip(lum / max(hi, 1e-3) * 0.92, 0, 1)
        out = np.dstack([lum, lum, lum, a[..., 3] if a.shape[-1] == 4 else np.ones_like(lum)])
        img = Image.fromarray((out * 255).astype(np.uint8), 'RGBA')
    if max(img.size) > size:
        img = img.resize((size, size * img.size[1] // img.size[0]), Image.LANCZOS)
    path = os.path.join(OUT, 'tex', name)
    img.save(path, 'WEBP', quality=88, method=6)
    return f'tex/{name}'


def proxy(zf: zipfile.ZipFile, folder: str, out_name: str, nbase: int, gray=False):
    files = [n for n in zf.namelist() if n.startswith(folder + '/')]
    clo = next(n for n in files if n.endswith('.mhclo') or n.endswith('.proxy'))
    meta_text = zf.read(clo).decode('utf-8', 'replace')
    refs, ws, offs, scales, meta = parse_mhclo(meta_text)
    obj_name = meta.get('obj_file') or next(n for n in files if n.endswith('.obj')).split('/')[-1]
    obj = zf.read(f'{folder}/{obj_name}').decode('utf-8', 'replace')
    V, VT, F = parse_obj(obj)
    if len(refs) != len(V):
        raise ValueError(f'{folder}: {len(refs)} refs for {len(V)} vertices')
    if refs.max() >= nbase:
        raise ValueError(f'{folder}: reference beyond base mesh')
    vo, vt, idx = split_mesh(F)
    mat_name = meta.get('material') or next((n.split('/')[-1] for n in files if n.endswith('.mhmat')), None)
    mat_path = posixpath.normpath(f'{folder}/{mat_name}') if mat_name else None
    mat = parse_mhmat(zf.read(mat_path).decode('utf-8', 'replace')) if mat_path else {}
    tex = None
    if 'diffuseTexture' in mat:
        tname = mat['diffuseTexture'].split('/')[-1]
        near = posixpath.dirname(mat_path)
        src = next((n for n in zf.namelist() if n.startswith(near + '/') and n.endswith('/' + tname)), None) or next((n for n in zf.namelist() if n.endswith('/' + tname)), None)
        if src:
            tex = save_texture(zf.read(src), f'{out_name}.webp', 1024, alpha=True, gray=gray)
    uv = VT[np.maximum(vt, 0)] if len(VT) else np.zeros((len(vo), 2))
    out = {
        'name': out_name,
        'vRef': b64(vo.astype(np.uint16)),
        'uv': b64(uv.astype(np.float32)),
        'index': b64(idx.astype(np.uint16 if len(vo) < 65536 else np.uint32)),
        'refs': b64(refs.astype(np.uint16)),
        'w': b64(ws.astype(np.float32)),
        'off': b64(offs.astype(np.float32)),
        'scales': scales,
        'texture': tex,
        'transparent': mat.get('transparent', 'False').lower() == 'true',
        'color': [float(x) for x in mat.get('diffuseColor', '1 1 1').split()[:3]],
        'count': int(len(V)),
    }
    with open(os.path.join(OUT, f'{out_name}.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    log(f'proxy {out_name}: {len(V)} verts, {len(idx) // 3} tris, texture {tex}')
    return out_name


def main():
    zips = fetch()
    os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
    base_text = open(os.path.join(DATA, '3dobjs', 'base.obj')).read()
    V, VT, F = parse_obj(base_text, 'body')
    n0 = len(V)
    vo, vt, idx = split_mesh(F)
    log(f'body: {n0} base vertices, {len(vo)} render vertices, {len(idx) // 3} triangles')

    # --- Skin weights mapped onto the game skeleton ---
    sk = json.load(open(os.path.join(DATA, 'rigs', 'default.mhskel')))
    wfile = json.load(open(os.path.join(DATA, 'rigs', 'default_weights.mhw')))['weights']

    def game_bone(b):
        while b is not None:
            if b in MAP:
                return MAP[b]
            b = sk['bones'][b]['parent']
        return 'hips'

    W = np.zeros((n0, len(BONES)))
    for b, lst in wfile.items():
        gi = BONES.index(game_bone(b))
        for vi, w in lst:
            W[vi, gi] += w
    # Vertices without weights (helpers): copy from the nearest weighted vertex.
    have = W.sum(1) > 1e-6
    if (~have).any():
        from_idx = np.where(have)[0]
        for vi in np.where(~have)[0]:
            j = from_idx[np.argmin(((V[from_idx] - V[vi]) ** 2).sum(1))]
            W[vi] = W[j]
    top = np.argsort(-W, axis=1)[:, :4]
    tw = np.take_along_axis(W, top, 1)
    tw /= tw.sum(1, keepdims=True)
    skin_idx = top.astype(np.uint8)
    skin_w = np.round(tw * 255).astype(np.uint8)

    # --- Joints (each game bone's pivot = mean of these base vertices) ---
    joints = {}
    for g, mb in PIVOT.items():
        joints[g] = [int(x) for x in sk['joints'][sk['bones'][mb]['head']]]
    joints['headTop'] = [int(x) for x in sk['joints'][sk['bones']['head']['tail']]]
    joints['ground'] = [int(x) for x in sk['joints']['joint-ground']] if 'joint-ground' in sk['joints'] else []
    for s in 'LR':
        joints[f'handEnd{s}'] = [int(x) for x in sk['joints'][sk['bones'][f'wrist.{s}']['tail']]]
        joints[f'toe{s}'] = [int(x) for x in sk['joints'][sk['bones'][f'foot.{s}']['tail']]]

    # --- Clothing helpers (fitted bodysuit and skirt that deform with the body) ---
    helpers = {}
    for g in ('helper-tights', 'helper-skirt'):
        _, _, HF = parse_obj(base_text, g)
        hv, ht, hi = split_mesh(HF)
        helpers[g.split('-')[1]] = {'vRef': b64(hv.astype(np.uint16)), 'uv': b64(VT[ht].astype(np.float32)), 'index': b64(hi.astype(np.uint16))}
        log(f'{g}: {len(hv)} vertices, {len(hi) // 3} triangles')

    # --- Targets ---
    tdir = os.path.join(DATA, 'targets', 'macrodetails')
    targets = {}
    for sx in SEXES:
        for ag in AGES:
            for mu in MUSCLES:
                for we in WEIGHTS:
                    name = f'universal-{sx}-{ag}-{mu}-{we}'
                    targets[name] = encode_target(*read_target(os.path.join(tdir, name + '.target')))
            for race in ('caucasian', 'african'):
                name = f'{race}-{sx}-{ag}'
                targets[name] = encode_target(*read_target(os.path.join(tdir, name + '.target')))
            for h in ('minheight', 'maxheight'):
                name = f'{sx}-{ag}-averagemuscle-averageweight-{h}'
                targets[name] = encode_target(*read_target(os.path.join(tdir, 'height', name + '.target')))
    log(f'{len(targets)} targets')

    body = {
        'source': 'MakeHuman hm08 base mesh, macro targets and default skeleton (CC0)',
        'units': 'decimetres',
        'bones': BONES,
        'count': n0,
        'base': b64(np.array([list(map(float, l.split()[1:4])) for l in base_text.splitlines() if l.startswith('v ')], dtype=np.float32)),
        'vRef': b64(vo.astype(np.uint16)),
        'uv': b64(VT[vt].astype(np.float32)),
        'index': b64(idx.astype(np.uint16)),
        'skinIndex': b64(skin_idx),
        'skinWeight': b64(skin_w),
        'joints': joints,
        'targets': targets,
        'helpers': helpers,
    }
    with open(os.path.join(OUT, 'body.json'), 'w') as f:
        json.dump(body, f, separators=(',', ':'))
    log('body.json', os.path.getsize(os.path.join(OUT, 'body.json')) // 1024, 'KB')

    # --- Proxies: eyes, eyebrows, eyelashes, hair, beards ---
    sysz = zips['sys']
    manifest = {'hair': [], 'beard': [], 'eyebrows': [], 'skins': {}, 'eyes': {}}
    proxy(sysz, 'eyes/low-poly', 'eyes', n0)
    for e in ('eyebrow001', 'eyebrow006', 'eyebrow010'):
        manifest['eyebrows'].append(proxy(sysz, f'eyebrows/{e}', e, n0, gray=True))
    proxy(sysz, 'eyelashes/eyelashes01', 'eyelashes', n0)
    for lo, folder in (('body_male_lo', 'proxymeshes/male1591'), ('body_female_lo', 'proxymeshes/female1605')):
        manifest.setdefault('bodies', []).append(proxy(sysz, folder, lo, n0))
    for h in HAIR:
        manifest['hair'].append(proxy(sysz, f'hair/{h}', h, n0, gray=True))
    for k, folder in BEARDS.items():
        manifest['beard'].append(proxy(zips['bodyparts05'], folder, f'beard_{k}', n0, gray=True))
    for s in SKINS:
        files = [n for n in sysz.namelist() if n.startswith(f'skins/{s}/') and n.endswith('.png')]
        diffuse = next(n for n in files if 'diffuse' in n or n.endswith(f'{s}.png'))
        manifest['skins'][s] = save_texture(sysz.read(diffuse), f'skin_{s}.webp', TEX_SIZE)
    for e in ('brown', 'brownlight', 'grey', 'bluegreen'):
        manifest['eyes'][e] = save_texture(sysz.read(f'eyes/materials/{e}_eye.png'), f'eye_{e}.webp', 256)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(OUT) for fn in fns)
    log(f'done: {total // 1024} KB in {OUT}')


if __name__ == '__main__':
    main()
