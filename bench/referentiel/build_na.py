#!/usr/bin/env python3
"""
Générateur du jeu « référentiel Nouvelle-Aquitaine ».

Produit `db/data/referentiel-na.json`, **versionné** : un déploiement neuf n'a
besoin ni de ce script, ni de Python, ni du réseau. Ce script ne sert qu'à
régénérer le jeu quand le découpage administratif change.

Entrées (trois sources, toutes sous licence libre) :
  1. `@etalab/decoupage-administratif` (npm, MIT) — communes, EPCI, départements,
     région ; SIREN, codes postaux, population, appartenance.
  2. `codes-postaux` (npm, MIT) — recoupement postal par code INSEE.
  3. `gregoiredavid/france-geojson` (Licence Ouverte, Admin Express) — contours
     communaux et départementaux, dont on tire les centroïdes.

Méthode de géocodage : centroïde géométrique de l'anneau extérieur du plus grand
polygone (formule du lacet). Les contours sont simplifiés : la précision est
celle du contour communal, pas celle d'une adresse. Pour les EPCI et la région,
centroïde pondéré par la population des communes membres.

Standard library uniquement. Lancer :
    python3 bench/referentiel/build_na.py --fetch
    python3 bench/referentiel/build_na.py --data-dir ../radar-bench-data

Les sources externes ne sont pas versionnées : leur emplacement se règle par
`RADAR_BENCH_DATA` (défaut : `../radar-bench-data`, à côté du dépôt) ou `--data-dir`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import sys
import tarfile
import urllib.request
from collections import Counter

NA_DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]
REGION_CODE = "75"

DECOUPAGE_VERSION = "6.0.0"
CODES_POSTAUX_VERSION = "4.1.2"
GEO_REPO = "gregoiredavid/france-geojson"

DEPT_SLUG_NAMES = {
    "16": "charente", "17": "charente-maritime", "19": "correze", "23": "creuse",
    "24": "dordogne", "33": "gironde", "40": "landes", "47": "lot-et-garonne",
    "64": "pyrenees-atlantiques", "79": "deux-sevres", "86": "vienne", "87": "haute-vienne",
}


# --------------------------------------------------------------------------- géométrie

def ring_area_centroid(ring):
    """Aire signée et centroïde d'un anneau (lon, lat) — formule du lacet."""
    area = 0.0
    cx = 0.0
    cy = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    area *= 0.5
    if abs(area) < 1e-12:
        # Polygone dégénéré : moyenne des sommets.
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    return area, cx / (6 * area), cy / (6 * area)


def geometry_centroid(geometry):
    """Centroïde du plus grand polygone. Renvoie (lat, lon) ou None."""
    if not geometry:
        return None
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    polygons = []
    if kind == "Polygon":
        polygons = [coords]
    elif kind == "MultiPolygon":
        polygons = list(coords)
    else:
        return None
    best = None
    for polygon in polygons:
        if not polygon or not polygon[0]:
            continue
        area, cx, cy = ring_area_centroid(polygon[0])
        if best is None or abs(area) > abs(best[0]):
            best = (area, cx, cy)
    if best is None:
        return None
    return round(best[2], 5), round(best[1], 5)


def features_of(doc):
    """Les fichiers du dépôt sont tantôt FeatureCollection, tantôt Feature."""
    if doc.get("type") == "FeatureCollection":
        return doc.get("features") or []
    if doc.get("type") == "Feature":
        return [doc]
    if doc.get("type") in ("Polygon", "MultiPolygon"):
        return [{"geometry": doc, "properties": {}}]
    return []


def weighted_centroid(points):
    """points = [(lat, lon, poids)] → centroïde pondéré, ou moyenne simple."""
    usable = [(lat, lon, w) for lat, lon, w in points if lat is not None and lon is not None]
    if not usable:
        return None
    total = sum(max(0, w or 0) for _, _, w in usable)
    if total <= 0:
        return (
            round(sum(p[0] for p in usable) / len(usable), 5),
            round(sum(p[1] for p in usable) / len(usable), 5),
        )
    return (
        round(sum(lat * max(0, w or 0) for lat, _, w in usable) / total, 5),
        round(sum(lon * max(0, w or 0) for _, lon, w in usable) / total, 5),
    )


# --------------------------------------------------------------------------- entrées

def fetch(url: str, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "radar-cyber-referentiel-builder",
        "Accept": "application/vnd.github.raw",
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def ensure_npm_package(data_dir: str, name: str, version: str, folder: str) -> str:
    """Télécharge et déballe un tarball npm s'il n'est pas déjà là."""
    root = os.path.join(data_dir, folder)
    package_dir = os.path.join(root, "package")
    if os.path.isdir(package_dir):
        return package_dir
    os.makedirs(root, exist_ok=True)
    scoped = name.replace("/", "%2f")
    tarball = f"https://registry.npmjs.org/{scoped}/-/{name.split('/')[-1]}-{version}.tgz"
    print(f"  téléchargement {name}@{version} …", flush=True)
    raw = fetch(tarball)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        archive.extractall(root, filter="data")
    return package_dir


def ensure_geo(data_dir: str) -> str:
    root = os.path.join(data_dir, "geo-na")
    os.makedirs(root, exist_ok=True)
    for code in NA_DEPTS:
        slug = DEPT_SLUG_NAMES[code]
        folder = f"{code}-{slug}"
        for prefix in ("communes", "departement"):
            filename = f"{prefix}-{folder}.geojson"
            dest = os.path.join(root, filename)
            if os.path.exists(dest) and os.path.getsize(dest) > 1000:
                continue
            url = (f"https://api.github.com/repos/{GEO_REPO}/contents/"
                   f"departements/{folder}/{filename}")
            print(f"  téléchargement {filename} …", flush=True)
            with open(dest, "wb") as handle:
                handle.write(fetch(url))
    return root


def geo_commit() -> str | None:
    try:
        raw = fetch(f"https://api.github.com/repos/{GEO_REPO}/commits?per_page=1", timeout=30)
        return json.loads(raw)[0]["sha"]
    except Exception:
        return None


# --------------------------------------------------------------------------- construction

def build(data_dir: str, do_fetch: bool) -> dict:
    if do_fetch:
        decoupage = ensure_npm_package(data_dir, "@etalab/decoupage-administratif",
                                       DECOUPAGE_VERSION, "decoupage")
        postal = ensure_npm_package(data_dir, "codes-postaux", CODES_POSTAUX_VERSION, "codes-postaux")
        geo_dir = ensure_geo(data_dir)
    else:
        decoupage = os.path.join(data_dir, "decoupage", "package")
        postal = os.path.join(data_dir, "codes-postaux", "package")
        geo_dir = os.path.join(data_dir, "geo-na")

    def load(base, name):
        with open(os.path.join(base, name), encoding="utf-8") as handle:
            return json.load(handle)

    all_communes = load(decoupage, "data/communes.json")
    all_epci = load(decoupage, "data/epci.json")
    all_depts = load(decoupage, "data/departements.json")
    all_regions = load(decoupage, "data/regions.json")
    postal_rows = load(postal, "codes-postaux.json")

    depts = [d for d in all_depts if d.get("region") == REGION_CODE]
    dept_codes = {d["code"] for d in depts}
    region = next(r for r in all_regions if r["code"] == REGION_CODE)

    communes_raw = [c for c in all_communes if c.get("departement") in dept_codes]
    # Piège vérifié : 77 codes INSEE apparaissent deux fois, une ligne
    # « commune-actuelle » (porteuse du SIREN, de la population et des codes
    # postaux) et une ligne « commune-deleguee » du même code. Un dict naïf
    # garde la dernière et perd le SIREN. On préfère toujours la ligne actuelle.
    by_code: dict[str, dict] = {}
    duplicate_codes: set[str] = set()
    for entry in communes_raw:
        code = entry["code"]
        previous = by_code.get(code)
        if previous is None:
            by_code[code] = entry
            continue
        duplicate_codes.add(code)
        if previous.get("type") != "commune-actuelle" and entry.get("type") == "commune-actuelle":
            by_code[code] = entry

    # Centroïdes communaux et départementaux.
    centroids: dict[str, tuple[float, float]] = {}
    dept_centroids: dict[str, tuple[float, float]] = {}
    for code in NA_DEPTS:
        folder = f"{code}-{DEPT_SLUG_NAMES[code]}"
        with open(os.path.join(geo_dir, f"communes-{folder}.geojson"), encoding="utf-8") as handle:
            for feature in features_of(json.load(handle)):
                insee = (feature.get("properties") or {}).get("code")
                point = geometry_centroid(feature.get("geometry"))
                if insee and point:
                    centroids[insee] = point
        with open(os.path.join(geo_dir, f"departement-{folder}.geojson"), encoding="utf-8") as handle:
            feats = features_of(json.load(handle))
            if feats:
                point = geometry_centroid(feats[0].get("geometry"))
                if point:
                    dept_centroids[code] = point

    # Recoupement postal : codes postaux vus par une seconde source.
    postal_by_commune: dict[str, set[str]] = {}
    for row in postal_rows:
        code = row.get("codeCommune")
        if code in by_code:
            postal_by_commune.setdefault(code, set()).add(row["codePostal"])

    # EPCI : appartenance par les communes membres, pas par un champ département.
    na_codes = set(by_code)
    epci_out = []
    commune_epci: dict[str, str] = {}
    for entry in all_epci:
        members = [m.get("code") if isinstance(m, dict) else m for m in (entry.get("membres") or [])]
        members_na = [m for m in members if m in na_codes]
        if not members_na:
            continue
        points = [
            (centroids.get(m, (None, None))[0], centroids.get(m, (None, None))[1],
             (by_code[m].get("population") or 0))
            for m in members_na
        ]
        center = weighted_centroid(points)
        epci_out.append({
            "code": entry["code"],
            "nom": entry["nom"],
            "type": entry["type"],
            "population": entry.get("populationTotale"),
            "membres": sorted(members_na),
            "membresHorsRegion": len(members) - len(members_na),
            "lat": center[0] if center else None,
            "lon": center[1] if center else None,
        })
        for member in members_na:
            # Une commune ne peut appartenir qu'à un EPCI ; en cas de conflit on
            # garde le premier et on le signale plutôt que d'écraser en silence.
            if member in commune_epci and commune_epci[member] != entry["code"]:
                print(f"  AVERTISSEMENT commune {member} dans plusieurs EPCI", file=sys.stderr)
            else:
                commune_epci[member] = entry["code"]

    communes_out = []
    for code, entry in sorted(by_code.items()):
        point = centroids.get(code)
        parent = entry.get("chefLieu")
        kind = entry.get("type")
        if kind == "commune-actuelle" or not parent or parent == code or parent not in by_code:
            parent = None
        postal_official = sorted(entry.get("codesPostaux") or [])
        postal_cross = sorted(postal_by_commune.get(code, set()))
        communes_out.append({
            "code": code,
            "nom": entry["nom"],
            "type": kind,
            "siren": entry.get("siren"),
            "departement": entry["departement"],
            "epci": commune_epci.get(code),
            "population": entry.get("population"),
            "codesPostaux": postal_official or postal_cross,
            "codesPostauxRecoupes": postal_cross,
            "parent": parent,
            "lat": point[0] if point else None,
            "lon": point[1] if point else None,
        })

    dept_out = []
    for entry in sorted(depts, key=lambda d: d["code"]):
        point = dept_centroids.get(entry["code"])
        dept_out.append({
            "code": entry["code"],
            "nom": entry["nom"],
            "chefLieu": entry.get("chefLieu"),
            "lat": point[0] if point else None,
            "lon": point[1] if point else None,
        })

    region_center = weighted_centroid([
        (c["lat"], c["lon"], c["population"] or 0) for c in communes_out
    ])
    region_out = {
        "code": REGION_CODE,
        "nom": region["nom"],
        "chefLieu": region.get("chefLieu"),
        "lat": region_center[0] if region_center else None,
        "lon": region_center[1] if region_center else None,
    }

    counts = {
        "lignesSourceCommunes": len(communes_raw),
        "codesInseeEnDoublon": len(duplicate_codes),
        "communes": len(communes_out),
        "communesActuelles": sum(1 for c in communes_out if c["type"] == "commune-actuelle"),
        "communesDeleguees": sum(1 for c in communes_out if c["type"] == "commune-deleguee"),
        "communesAssociees": sum(1 for c in communes_out if c["type"] == "commune-associee"),
        "communesAvecSiren": sum(1 for c in communes_out if c["siren"]),
        "communesGeocodees": sum(1 for c in communes_out if c["lat"] is not None),
        "communesAvecCodePostal": sum(1 for c in communes_out if c["codesPostaux"]),
        "communesRecoupeesParCodesPostaux": sum(1 for c in communes_out if c["codesPostauxRecoupes"]),
        "communesRattacheesAEpci": sum(1 for c in communes_out if c["epci"]),
        "communesAvecParent": sum(1 for c in communes_out if c["parent"]),
        "epci": len(epci_out),
        "epciGeocodes": sum(1 for e in epci_out if e["lat"] is not None),
        "departements": len(dept_out),
        "regions": 1,
    }
    counts["entites"] = counts["communes"] + counts["epci"] + counts["departements"] + 1
    homonyms = Counter(c["nom"] for c in communes_out if c["type"] == "commune-actuelle")
    counts["nomsCommunauxHomonymes"] = sum(1 for n in homonyms.values() if n > 1)
    counts["communesHomonymes"] = sum(n for n in homonyms.values() if n > 1)

    return {
        "meta": {
            "titre": "Référentiel territorial Nouvelle-Aquitaine",
            "genereLe": dt.date.today().isoformat(),
            "region": {"code": REGION_CODE, "nom": region["nom"]},
            "sources": [
                {
                    "nom": "@etalab/decoupage-administratif",
                    "version": DECOUPAGE_VERSION,
                    "licence": "MIT",
                    "url": f"https://www.npmjs.com/package/@etalab/decoupage-administratif/v/{DECOUPAGE_VERSION}",
                    "apporte": "communes, EPCI, départements, région, SIREN, codes postaux, population, appartenances",
                },
                {
                    "nom": "codes-postaux",
                    "version": CODES_POSTAUX_VERSION,
                    "licence": "MIT",
                    "url": f"https://www.npmjs.com/package/codes-postaux/v/{CODES_POSTAUX_VERSION}",
                    "apporte": "recoupement postal indépendant par code INSEE",
                },
                {
                    "nom": GEO_REPO,
                    "licence": "Licence Ouverte 1.0 (Admin Express, IGN)",
                    "url": f"https://github.com/{GEO_REPO}",
                    "commit": geo_commit() if do_fetch else None,
                    "apporte": "contours communaux et départementaux → centroïdes",
                },
            ],
            "methodeGeocodage": (
                "Centroïde géométrique de l'anneau extérieur du plus grand polygone "
                "(formule du lacet), contours simplifiés : précision communale, pas "
                "adresse. EPCI et région : centroïde pondéré par la population des "
                "communes membres."
            ),
            "limites": [
                "Périmètre territorial uniquement : ni entreprises (SIRENE), ni santé (FINESS), ni scolaire (UAI).",
                "Les communes déléguées et associées sans SIREN sont rattachées en alias de leur commune parente quand le lien existe.",
                "Les noms communaux homonymes exigent un contexte de département pour être rattachés sans ambiguïté.",
            ],
            "counts": counts,
        },
        "region": region_out,
        "departements": dept_out,
        "epci": epci_out,
        "communes": communes_out,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default=os.environ.get("RADAR_BENCH_DATA", "../radar-bench-data"))
    parser.add_argument("--fetch", action="store_true", help="télécharger les entrées manquantes")
    parser.add_argument("--out", default="db/data/referentiel-na.json")
    args = parser.parse_args()

    payload = build(args.data_dir, args.fetch)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    size = os.path.getsize(args.out)
    print(f"\nécrit {args.out} ({size / 1e6:.2f} Mo)")
    for key, value in payload["meta"]["counts"].items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
