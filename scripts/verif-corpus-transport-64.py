#!/usr/bin/env python3
"""Vérification HTTP réelle du corpus transport / Pyrénées-Atlantiques (64)."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

CLES = {
    "nom", "type", "secteur", "departement", "url_site",
    "url_actualites", "url_flux", "code_http", "exemple_cyber",
}
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
URL_RE = re.compile(r"https?://[^\s\u2014]+")


def sonder(url: str, timeout: int) -> dict:
    if not url:
        return {"url": url, "code": None, "content_type": None, "octets": None,
                "url_finale": None, "erreur": "url vide"}
    try:
        p = subprocess.run(
            ["curl", "-L", "-s", "-S", "-o", "/dev/null", "--max-time", str(timeout),
             "-A", UA, "-w", "%{http_code}\t%{content_type}\t%{size_download}\t%{url_effective}", url],
            capture_output=True, text=True, timeout=timeout + 5,
        )
        code, ctype, octets, finale = (p.stdout.split("\t", 3) + ["", "", "", ""])[:4]
        return {
            "url": url,
            "code": int(code) if code.isdigit() else None,
            "content_type": ctype.strip() or None,
            "octets": int(octets) if octets.isdigit() else None,
            "url_finale": finale.strip() or None,
            "erreur": p.stderr.strip()[:200] or None,
        }
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"url": url, "code": None, "content_type": None, "octets": None,
                "url_finale": None, "erreur": str(exc)[:200]}


def article_url(exemple: object) -> str:
    if not isinstance(exemple, str):
        return ""
    trouvees = URL_RE.findall(exemple)
    return trouvees[-1] if trouvees else ""


def urls_a_sonder(source: dict) -> list[tuple[str, str]]:
    urls = [("site", source.get("url_site", "")),
            ("actualites", source.get("url_actualites", ""))]
    if source.get("url_flux"):
        urls.append(("flux", source["url_flux"]))
    urls.append(("exemple_cyber", article_url(source.get("exemple_cyber", ""))))
    return urls


def verifier(source: dict, numero: int, timeout: int) -> dict:
    problemes = []
    if set(source) != CLES:
        problemes.append("clés inattendues : " + repr(sorted(set(source) ^ CLES)))
    if source.get("secteur") != "transport":
        problemes.append(f"secteur invalide : {source.get('secteur')!r}")
    if source.get("departement") != "64":
        problemes.append(f"departement invalide : {source.get('departement')!r}")
    if source.get("code_http") != 200:
        problemes.append(f"code_http déclaré : {source.get('code_http')!r}")
    exemple = source.get("exemple_cyber")
    if not isinstance(exemple, str) or "\u2014" not in exemple or not article_url(exemple):
        problemes.append("exemple_cyber doit être 'Titre — URL'")
    sondes = [dict(role=role, **sonder(url, timeout)) for role, url in urls_a_sonder(source)]
    for sonde in sondes:
        if sonde["code"] != 200:
            problemes.append(f"{sonde['role']} : HTTP {sonde['code']}")
    return {
        "ligne": numero,
        "nom": source.get("nom"),
        "type": source.get("type"),
        "secteur": source.get("secteur"),
        "departement": source.get("departement"),
        "valide": not problemes,
        "problemes": problemes,
        "sondes": sondes,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="bench/corpus/sources-transport-64.jsonl")
    ap.add_argument("--rapport", default="bench/results/verification-sources-transport-64.json")
    ap.add_argument("--timeout", type=int, default=20)
    ap.add_argument("--concurrence", type=int, default=8)
    a = ap.parse_args()
    sources = [json.loads(l) for l in Path(a.corpus).read_text().splitlines() if l.strip()]
    with ThreadPoolExecutor(max_workers=a.concurrence) as ex:
        rapports = list(ex.map(lambda x: verifier(*x),
                               [(s, i, a.timeout) for i, s in enumerate(sources, 1)]))
    valides = [r for r in rapports if r["valide"]]
    rapport = {
        "corpus": a.corpus,
        "verifie_le": datetime.now(timezone.utc).isoformat(),
        "user_agent": UA,
        "method": "curl -L GET, redirections suivies, code final",
        "sources": len(sources),
        "sources_valides": len(valides),
        "urls_sondees": sum(len(r["sondes"]) for r in rapports),
        "urls_200": sum(sum(s["code"] == 200 for s in r["sondes"]) for r in rapports),
        "detail": rapports,
    }
    Path(a.rapport).write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "sources": rapport["sources"], "valides": rapport["sources_valides"],
        "urls": rapport["urls_sondees"], "urls_200": rapport["urls_200"],
        "invalides": [{"nom": r["nom"], "problemes": r["problemes"]}
                      for r in rapports if not r["valide"]],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
