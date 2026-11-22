#!/usr/bin/env python3
"""Vérification du corpus transport et logistique de Nouvelle-Aquitaine.

Contrôle réel : chaque URL déclarée est interrogée à nouveau avec suivi des
redirections. Une source n'est retenue que si son site, sa page d'actualités,
son flux (quand il existe) et l'article d'exemple répondent tous HTTP 200.

Usage :
    python3 scripts/verif-corpus-transport.py \
        [--corpus bench/corpus/sources-transport-logistique.jsonl] \
        [--rapport bench/results/verification-transport.json] \
        [--timeout 15] [--concurrence 8]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
CLES = (
    "nom", "type", "secteur", "url_site", "url_actualites",
    "url_flux", "code_http", "exemple_cyber",
)
SECTEUR = "transport et logistique"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
URL_RE = re.compile(r"https?://[^\s\u2014]+")


def sonder(url: str, timeout: int) -> dict:
    """GET réel avec suivi de redirection, code final et URL effective."""
    if not url:
        return {"url": url, "code": None, "url_finale": None, "erreur": "url vide"}
    try:
        p = subprocess.run(
            ["curl", "-L", "-s", "-S", "-o", "/dev/null",
             "--max-time", str(timeout), "-A", UA,
             "-w", "%{http_code}\t%{url_effective}", url],
            capture_output=True, text=True, timeout=timeout + 5,
        )
        code, _, finale = p.stdout.partition("\t")
        return {
            "url": url,
            "code": int(code) if code.isdigit() else None,
            "url_finale": finale.strip() or None,
            "erreur": p.stderr.strip()[:200] or None,
        }
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"url": url, "code": None, "url_finale": None, "erreur": str(exc)[:200]}


def article_url(exemple: object) -> str:
    if not isinstance(exemple, str):
        return ""
    trouvees = URL_RE.findall(exemple)
    return trouvees[-1] if trouvees else ""


def urls_a_sonder(source: dict) -> list[tuple[str, str]]:
    urls = [
        ("site", source.get("url_site", "")),
        ("actualites", source.get("url_actualites", "")),
    ]
    if source.get("url_flux"):
        urls.append(("flux", source["url_flux"]))
    urls.append(("exemple_cyber", article_url(source.get("exemple_cyber"))))
    return urls


def verifier(source: dict, numero: int, timeout: int) -> dict:
    problemes = []
    if set(source) != set(CLES):
        problemes.append(
            f"clés inattendues (manquantes={sorted(set(CLES)-set(source))}, "
            f"en plus={sorted(set(source)-set(CLES))})"
        )
    if source.get("secteur") != SECTEUR:
        problemes.append(f"secteur invalide : {source.get('secteur')!r}")
    if not isinstance(source.get("code_http"), int) or source["code_http"] != 200:
        problemes.append(f"code_http déclaré : {source.get('code_http')!r}")
    exemple = source.get("exemple_cyber")
    if not isinstance(exemple, str) or len(exemple.split("\u2014", 1)) != 2 or not article_url(exemple):
        problemes.append("exemple_cyber doit être 'Titre — URL'")

    sondes = [dict(role=role, **sonder(url, timeout)) for role, url in urls_a_sonder(source)]
    for sonde in sondes:
        if sonde["code"] != 200:
            problemes.append(f"{sonde['role']} : HTTP {sonde['code']}")

    return {
        "ligne": numero,
        "nom": source.get("nom"),
        "type": source.get("type"),
        "valide": not problemes,
        "problemes": problemes,
        "urls": sondes,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus", default=str(RACINE / "bench/corpus/sources-transport-logistique.jsonl"))
    ap.add_argument("--rapport", default=str(RACINE / "bench/results/verification-transport.json"))
    ap.add_argument("--timeout", type=int, default=25)
    ap.add_argument("--concurrence", type=int, default=6)
    args = ap.parse_args()

    chemin = Path(args.corpus)
    sources = []
    for i, ligne in enumerate(chemin.read_text(encoding="utf-8").splitlines(), 1):
        if not ligne.strip():
            continue
        try:
            sources.append((i, json.loads(ligne)))
        except json.JSONDecodeError as exc:
            print(f"JSON invalide ligne {i} : {exc}", file=sys.stderr)
            return 1

    with ThreadPoolExecutor(max_workers=args.concurrence) as pool:
        resultats = list(pool.map(
            lambda paire: verifier(paire[1], paire[0], args.timeout), sources
        ))

    valides = [r for r in resultats if r["valide"]]
    rapport = {
        "genere_le": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "corpus": str(chemin.relative_to(RACINE)) if chemin.is_relative_to(RACINE) else str(chemin),
        "protocole": {
            "critere": "toutes les URLs déclarées répondent HTTP 200 après redirections",
            "methode": "curl -L -s -o /dev/null -w %{http_code}\\t%{url_effective}",
            "timeout_s": args.timeout,
            "concurrence": args.concurrence,
        },
        "totaux": {
            "sources": len(resultats),
            "valides": len(valides),
            "invalides": len(resultats) - len(valides),
        },
        "resultats": resultats,
    }
    sortie = Path(args.rapport)
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{len(valides)}/{len(resultats)} sources valides — rapport : {sortie}")
    for r in resultats:
        if not r["valide"]:
            print(f"  ligne {r['ligne']} {r['nom']} : {'; '.join(r['problemes'])}")
    return 0 if len(valides) == len(resultats) and len(resultats) >= 20 else 1


if __name__ == "__main__":
    raise SystemExit(main())
