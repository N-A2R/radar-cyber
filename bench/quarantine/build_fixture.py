#!/usr/bin/env python3
"""
Constitue un échantillon versionné de revendications pour la file de revue.

Source : `joshhighet/ransomwatch` — `posts.json`, **Unlicense**, miroir GitHub
de publications de sites de fuite. Le fichier complet fait 2,3 Mo et 16 072
entrées ; on en versionne 500, suffisantes pour tester et démontrer le triage
sans embarquer l'archive.

Échantillonnage déterministe : toutes les revendications à consonance française
de la fenêtre, puis un pas fixe sur les autres. Pas de tirage aléatoire non
reproductible.

    python3 bench/quarantine/build_fixture.py \
        --posts ../radar-bench-data/ransomwatch/posts.json

Le corpus externe n'est pas versionné. Son emplacement se règle par
`RADAR_BENCH_DATA` (défaut : `../radar-bench-data`, à côté du dépôt) ou `--posts`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re

WINDOW_START = "2024-06-01"
WINDOW_END = "2025-06-17"
TARGET = 500

FRENCH_HINT = re.compile(
    r"\b(france|fran[çc]ais|sarl|sas|sasu|eurl|commune|mairie|ville|h[ôo]pital|"
    r"clinique|lyc[ée]e|coll[èe]ge|universit[ée]|bordeaux|toulouse|nantes|rennes|"
    r"limoges|poitiers|pau|bayonne|angoul[êe]me|la rochelle|p[ée]rigueux|agen|"
    r"mont-de-marsan|niort|brive|tulle|gu[ée]ret|ch[âa]tellerault)\b",
    re.I,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    data_dir = os.environ.get("RADAR_BENCH_DATA", "../radar-bench-data")
    parser.add_argument("--posts", default=os.path.join(data_dir, "ransomwatch", "posts.json"))
    parser.add_argument("--out", default="bench/fixtures/claims-sample.json")
    parser.add_argument("--target", type=int, default=TARGET)
    args = parser.parse_args()

    with open(args.posts, encoding="utf-8") as handle:
        posts = json.load(handle)

    window = [
        p for p in posts
        if WINDOW_START <= p.get("discovered", "") < WINDOW_END and p.get("post_title")
    ]
    window.sort(key=lambda p: (p["discovered"], p["post_title"]))

    def interesting(post: dict) -> bool:
        title = html.unescape(post["post_title"])
        # Les titres structurés déclarent un pays : ce sont les cas de tri
        # les plus instructifs, on les garde tous.
        return bool(FRENCH_HINT.search(title)) or "\\" in title

    french = [p for p in window if FRENCH_HINT.search(html.unescape(p["post_title"]))]
    priority = [p for p in window if interesting(p)]
    others = [p for p in window if not interesting(p)]
    remaining = max(0, args.target - len(priority))
    step = max(1, len(others) // remaining) if remaining else 1
    sampled = others[::step][:remaining]

    chosen = sorted(priority[: args.target] + sampled, key=lambda p: (p["discovered"], p["post_title"]))
    claims = [
        {
            "title": html.unescape(p["post_title"]).strip()[:400],
            "group": p["group_name"],
            "discovered": p["discovered"][:10],
        }
        for p in chosen
    ]

    payload = {
        "meta": {
            "titre": "Échantillon de revendications pour la file de revue",
            "genereLe": dt.date.today().isoformat(),
            "source": "joshhighet/ransomwatch — posts.json",
            "licence": "Unlicense",
            "url": "https://github.com/joshhighet/ransomwatch",
            "fenetre": [WINDOW_START, WINDOW_END],
            "revendicationsDansLaFenetre": len(window),
            "aConsonanceFrancaise": len(french),
            "casPrioritaires": len(priority),
            "titresStructures": sum(1 for p in priority if "\\" in html.unescape(p["post_title"])),
            "echantillon": len(claims),
            "methode": "toutes les revendications à consonance française, puis pas fixe sur les autres",
            "avertissement": (
                "Revendications de sites de fuite : non vérifiées, émanant des attaquants. "
                "Le pays et le montant présents dans certains titres sont déclarés, pas établis."
            ),
        },
        "claims": claims,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")

    print(f"écrit {args.out} ({os.path.getsize(args.out) / 1024:.0f} Ko)")
    print(f"  fenêtre : {len(window)} revendications, {len(french)} à consonance française")
    print(f"  cas prioritaires : {len(priority)} (dont titres structurés avec pays déclaré)")
    print(f"  échantillon : {len(claims)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
