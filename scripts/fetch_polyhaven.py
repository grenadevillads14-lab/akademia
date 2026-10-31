#!/usr/bin/env python3
"""Fetch the Poly Haven (CC0) assets listed in content/assets/polyhaven.json.

Textures: 1k diffuse, OpenGL normal and ARM (AO/rough/metal) maps, re-encoded to WebP.
Models: 1k glTF with its .bin; its textures are re-encoded to WebP and the .gltf rewritten to match.
Writes public/assets/ph/manifest.json (what was fetched, with sizes) for the game and ASSETS.md.

Usage: python3 -I scripts/fetch_polyhaven.py [--force]
"""
import io
import json
import os
import sys
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "ph")
API = "https://api.polyhaven.com"
FORCE = "--force" in sys.argv
UA = {"User-Agent": "akademeia-asset-fetch/1.0"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def to_webp(data: bytes, dest: str, quality: int) -> int:
    img = Image.open(io.BytesIO(data))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    img.save(dest, "WEBP", quality=quality, method=6)
    return os.path.getsize(dest)


def fetch_texture(asset_id: str) -> dict:
    dest_dir = os.path.join(OUT, "textures", asset_id)
    os.makedirs(dest_dir, exist_ok=True)
    files = json.loads(get(f"{API}/files/{asset_id}"))
    maps = {"diff": ("Diffuse", 84), "nor": ("nor_gl", 92), "arm": ("arm", 84)}
    result = {}
    for short, (key, q) in maps.items():
        dest = os.path.join(dest_dir, f"{short}.webp")
        if os.path.exists(dest) and not FORCE:
            result[short] = os.path.getsize(dest)
            continue
        url = files[key]["1k"]["jpg"]["url"]
        result[short] = to_webp(get(url), dest, q)
    return result


def fetch_model(asset_id: str) -> dict:
    dest_dir = os.path.join(OUT, "models", asset_id)
    os.makedirs(dest_dir, exist_ok=True)
    gltf_path = os.path.join(dest_dir, f"{asset_id}.gltf")
    if os.path.exists(gltf_path) and not FORCE:
        return {"gltf": os.path.getsize(gltf_path)}
    files = json.loads(get(f"{API}/files/{asset_id}"))
    entry = files["gltf"]["1k"]["gltf"]
    gltf = json.loads(get(entry["url"]))
    renamed = {}
    for rel, info in entry["include"].items():
        data = get(info["url"])
        if rel.lower().endswith((".jpg", ".jpeg", ".png")):
            new_rel = os.path.splitext(rel)[0] + ".webp"
            path = os.path.join(dest_dir, new_rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            to_webp(data, path, 90 if "nor" in rel else 84)
            renamed[rel] = new_rel
        else:
            path = os.path.join(dest_dir, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(data)
    for img in gltf.get("images", []):
        if img.get("uri") in renamed:
            img["uri"] = renamed[img["uri"]]
            img["mimeType"] = "image/webp"
    # Declare the WebP extension so loaders know what to expect.
    used = set(gltf.get("extensionsUsed", []))
    gltf["extensionsUsed"] = sorted(used)
    with open(gltf_path, "w") as f:
        json.dump(gltf, f)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(dest_dir) for fn in fns)
    return {"gltf": total}


def main() -> None:
    with open(os.path.join(ROOT, "content", "assets", "polyhaven.json")) as f:
        manifest = json.load(f)
    out = {"textures": {}, "models": {}}
    info = json.loads(get(f"{API}/assets?t=all"))
    for t in manifest["textures"]:
        print("texture", t["id"], flush=True)
        out["textures"][t["id"]] = {
            "role": t["role"],
            "files": fetch_texture(t["id"]),
            "name": info.get(t["id"], {}).get("name", t["id"]),
            "authors": list(info.get(t["id"], {}).get("authors", {}).keys()),
        }
    for m in manifest["models"]:
        print("model", m["id"], flush=True)
        out["models"][m["id"]] = {
            "role": m["role"],
            "files": fetch_model(m["id"]),
            "name": info.get(m["id"], {}).get("name", m["id"]),
            "authors": list(info.get(m["id"], {}).get("authors", {}).keys()),
        }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(out, f, indent=1)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(OUT) for fn in fns)
    print(f"done: {len(out['textures'])} textures, {len(out['models'])} models, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
