#!/usr/bin/env python3
"""Vérification HTTP rejouable du corpus « transport » / département 87.

Pour chaque ligne de bench/corpus/sources-transport-87.jsonl, sonde réellement
(GET, redirections suivies, User-Agent navigateur) les URL de site,
d'actualités, de flux et d'article cyber, puis publie un rapport JSON dans
bench/results/verification-transport-87.json.

Usage : python3 scripts/verif-corpus-transport-87.py
"""

import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CORPUS = RACINE / "bench/corpus/sources-transport-87.jsonl"
RAPPORT = RACINE / "bench/results/verification-transport-87.json"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
TIMEOUT = 20
CHAMPS_URL = ("url_site", "url_actualites", "url_flux")


def sonder(url):
    """Un GET réel ; renvoie (code, type de contenu, URL finale, items, octets)."""
    if not url:
        return None
    requete = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},
    )
    try:
        with urllib.request.urlopen(requete, timeout=TIMEOUT, context=ssl.create_default_context()) as reponse:
            corps = reponse.read()
            texte = corps.decode("utf-8", errors="replace")
            items = len(re.findall(r"<(?:item|entry)\b", texte, re.IGNORECASE))
            return {
                "code_http": reponse.status,
                "content_type": reponse.headers.get("Content-Type", ""),
                "url_finale": reponse.url,
                "items": items,
                "octets": len(corps),
            }
    except urllib.error.HTTPError as erreur:
        return {"code_http": erreur.code, "erreur": str(erreur), "url_finale": url}
    except Exception as erreur:  # réseau, DNS, TLS, délai
        return {"code_http": 0, "erreur": str(erreur), "url_finale": url}


def url_cyber(exemple):
    correspondance = re.search(r"https?://\S+", exemple or "")
    return correspondance.group(0) if correspondance else ""


def main():
    lignes = [
        json.loads(ligne)
        for ligne in CORPUS.read_text(encoding="utf-8").splitlines()
        if ligne.strip()
    ]
    sources = []
    for numero, source in enumerate(lignes, 1):
        urls = {champ: source.get(champ, "") for champ in CHAMPS_URL}
        urls["exemple_cyber"] = url_cyber(source.get("exemple_cyber", ""))
        verifications = {}
        for etiquette, url in urls.items():
            if url:
                verifications[etiquette] = {"url": url, **sonder(url)}
        sources.append(
            {
                "nom": source["nom"],
                "secteur": source["secteur"],
                "departement": source["departement"],
                "urls": verifications,
            }
        )
        print(f"{numero:2d}. {source['nom']} : " + ", ".join(
            f"{etiquette}={donnees['code_http']}" for etiquette, donnees in verifications.items()
        ))

    codes = [v["code_http"] for s in sources for v in s["urls"].values()]
    rapport = {
        "date": date.today().isoformat(),
        "fichier": "bench/corpus/sources-transport-87.jsonl",
        "secteur": "transport",
        "departement": "87",
        "methode": (
            "GET réel avec redirections suivies, User-Agent navigateur (Mozilla/5.0), "
            "délai 20 s ; code HTTP, type de contenu, URL finale et nombre d'items RSS "
            "relevés pour chaque URL."
        ),
        "sources": len(sources),
        "urls_verifiees": len(codes),
        "urls_http_200": sum(code == 200 for code in codes),
        "flux_rss_verifies": sum(bool(s.get("urls", {}).get("url_flux")) for s in sources),
        "sources_100pct_200": sum(
            all(v["code_http"] == 200 for v in s["urls"].values()) for s in sources
        ),
        "detail": sources,
    }
    RAPPORT.parent.mkdir(parents=True, exist_ok=True)
    RAPPORT.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"\n{rapport['sources']} sources, {rapport['urls_verifiees']} URL vérifiées, "
        f"{rapport['urls_http_200']} en HTTP 200, "
        f"{rapport['sources_100pct_200']} sources intégralement en 200."
    )
    print(f"Rapport : {RAPPORT.relative_to(RACINE)}")
    return 0 if rapport["sources_100pct_200"] >= 5 else 1


if __name__ == "__main__":
    sys.exit(main())
