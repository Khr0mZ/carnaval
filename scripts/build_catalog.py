"""Create web derivatives and a catalogue without modifying the family originals."""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from pathlib import Path

from PIL import Image, ImageOps

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parent / "_fuentes"
ASSETS = PROJECT / "dist" / "assets" / "photos"
ASSETS.mkdir(parents=True, exist_ok=True)


def normal(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", normal(text)).strip("-")


def title(text):
    text = re.sub(r"\s+", " ", text).strip()
    words = text.lower().split()
    small = {"de", "del", "la", "las", "el", "los", "y", "a", "al", "en", "con", "que", "se", "por", "para", "mi", "me", "tu", "un", "una"}
    accents = {"cadiz": "Cádiz", "hipocrita": "Hipócrita", "ultima": "Última", "angeles": "Ángeles", "gaditanisima": "Gaditanísima", "serenisima": "Serenísima", "eternidad": "Eternidad", "pasion": "Pasión", "naufragas": "Náufragas", "valkirias": "Valkirias", "caidos": "Caídos", "bahia": "Bahía", "ahi": "Ahí", "esta": "Está", "tio": "Tío", "reconquista": "Reconquista"}
    return " ".join(accents.get(w, w if i and w in small else w.capitalize()) for i, w in enumerate(words))


OVERRIDES = {
    "ceuta/ahojala-samurai": {"coverName": "Ajolah Samuraijpg.jpg"},
    "ceuta/los-bala-perdia": {"coverName": "La Banda de los Bala Perdia.jpg"},
}
override_file = PROJECT / "catalog-overrides.json"
if override_file.exists():
    for key, value in json.loads(override_file.read_text(encoding="utf-8")).items():
        OVERRIDES[key] = {**OVERRIDES.get(key, {}), **value}


def cover_score(photo, folder):
    stem = normal(photo.stem)
    stem = re.sub(r"\b(?:19|20)\d{2}\b|\b(?:comparsa|chirigota|cuarteto|coro)\b|jpg$", "", stem).strip()
    score = SequenceMatcher(None, normal(folder), stem).ratio()
    if re.search(r"\b(comparsa|chirigota|cuarteto|coro)\b", normal(photo.stem)):
        score += 0.65
    return score


groups = []
jobs = []
for city_path in sorted(SOURCE.iterdir()):
    if not city_path.is_dir():
        continue
    for folder in sorted(city_path.iterdir()):
        if not folder.is_dir():
            continue
        files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
        if not files:
            continue
        group_id = city_path.name + "/" + slug(folder.name)
        override = OVERRIDES.get(group_id, {})
        is_event = normal(folder.name) == "eventos"
        candidates = sorted(files, key=lambda p: cover_score(p, folder.name), reverse=True)
        cover = candidates[0] if not is_event and cover_score(candidates[0], folder.name) >= 0.72 else None
        if override.get("coverName"):
            cover = folder / override["coverName"]
            assert cover in files, f"Missing override cover: {cover}"
        stem = cover.stem if cover else ""
        year_match = re.search(r"(?<!\d)((?:19|20)\d{2})(?!\d)", stem)
        type_match = re.search(r"\b(comparsa|chirigota|cuarteto|coro)\b", normal(stem))
        year = int(year_match.group(1)) if year_match else None
        group = {
            "id": group_id, "name": title(folder.name), "city": city_path.name,
            "year": override.get("year", year), "type": override.get("type", type_match.group(1) if type_match else None),
            "isEvent": is_event, "sourceFolder": folder.relative_to(SOURCE).as_posix(),
            "cover": None, "photos": [], "references": override.get("references", []),
        }
        if "name" in override:
            group["name"] = override["name"]
        for file in files:
            photo_id = hashlib.sha256(file.relative_to(SOURCE).as_posix().encode()).hexdigest()[:16]
            with Image.open(file) as im:
                width, height = im.size
                if im.getexif().get(274) in (5, 6, 7, 8):
                    width, height = height, width
            label = re.sub(r"\s*\(\d+\)\s*$", "", file.stem).strip(" .")
            label = re.sub(r"\.?(?:jpe?g)$", "", label, flags=re.I).strip(" .")
            unnamed = bool(re.match(r"^(?:IMG|DSC|PXL|WhatsApp|20\d{6})", label, re.I))
            photo = {"id": photo_id, "name": "Un recuerdo con Montse" if unnamed else label, "named": not unnamed,
                     "src": f"assets/photos/{photo_id}.webp", "thumb": f"assets/photos/{photo_id}-sm.webp",
                     "width": width, "height": height, "source": file.relative_to(SOURCE).as_posix()}
            if file == cover:
                photo["name"] = group["name"]
                group["cover"] = photo
            else:
                group["photos"].append(photo)
            jobs.append((file, photo_id))
        groups.append(group)


def convert(job):
    source, photo_id = job
    for suffix, size, quality in [("", 1600, 79), ("-sm", 640, 75)]:
        output = ASSETS / f"{photo_id}{suffix}.webp"
        if output.exists():
            continue
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((size, size), Image.Resampling.LANCZOS)
            image.save(output, "WEBP", quality=quality, method=4)


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=6) as pool:
        for i, _ in enumerate(pool.map(convert, jobs), 1):
            if i % 200 == 0:
                print(f"Optimized {i}/{len(jobs)} images", flush=True)
    catalogue = {"groups": groups, "stats": {
        "groups": sum(not g["isEvent"] for g in groups), "photos": sum(len(g["photos"]) for g in groups),
        "images": len(jobs), "cities": 2,
        "firstYear": min(g["year"] for g in groups if g["year"]),
        "lastYear": max(g["year"] for g in groups if g["year"]),
        "undated": sum(not g["year"] and not g["isEvent"] for g in groups),
        "unclassified": sum(not g["type"] and not g["isEvent"] for g in groups),
    }}
    (PROJECT / "dist" / "catalog.json").write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (PROJECT / "catalog-audit.json").write_text(json.dumps({"stats": catalogue["stats"], "pending": [{"id": g["id"], "name": g["name"], "year": g["year"], "type": g["type"], "hasCover": bool(g["cover"])} for g in groups if not g["isEvent"] and (not g["year"] or not g["type"] or not g["cover"])]}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(catalogue["stats"]))
    print(f"Web assets: {sum(p.stat().st_size for p in ASSETS.iterdir()) / 1e6:.1f} MB")
