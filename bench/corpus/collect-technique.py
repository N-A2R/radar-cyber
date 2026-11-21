#!/usr/bin/env python3
"""Collecte échantillonneuse depuis bench/corpus/technique.jsonl.

Uniquement des sources publiques et documentées : métadonnées CT, DNS,
renseignement public et revendications de rançongiciels. Aucun contenu
de fuite, aucun site miroir de données volées, aucune négociation d'extorsion.

Usage :
    python3 bench/corpus/collect-technique.py
    python3 bench/corpus/collect-technique.py --sources na-tech-010 --domain bordeaux.fr --limit 3
    python3 bench/corpus/collect-technique.py --all-accessible --out /tmp/technique-collecte.jsonl
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

CORPUS = Path(__file__).with_name("technique.jsonl")
DEFAULT_SOURCES = ("na-tech-001", "na-tech-010", "na-tech-017", "na-tech-041")
USER_AGENT = "radar-cyber-corpus-technique/1.0 (bench; collecte publique documentée)"


def fetch(url: str, accept: str | None = None, timeout: float = 25.0) -> tuple[bytes, str, int]:
    """GET simple, sans authentification, avec une seule reprise sur erreur transitoire."""
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    req = urllib.request.Request(url, headers=headers)
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read(), resp.headers.get("Content-Type", ""), resp.status
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            if attempt == 1:
                raise
            time.sleep(2)
    raise RuntimeError("reprise épuisée")


def collect_atom(url: str, limit: int, domain: str) -> list[dict]:
    raw, _, _ = fetch(url)
    root = ET.fromstring(raw)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out = []
    for entry in root.findall("a:entry", ns):
        title = entry.findtext("a:title", "", ns)
        link_el = entry.find("a:link", ns)
        link = link_el.get("href", "") if link_el is not None else ""
        updated = entry.findtext("a:updated", "", ns)
        entry_id = entry.findtext("a:id", "", ns)
        if domain and not any(domain in field for field in (title, link, entry_id)):
            continue
        out.append({"titre": title, "url": link, "id": entry_id, "date": updated[:10]})
        if len(out) >= limit:
            break
    return out


def collect_certspotter(url: str, limit: int) -> list[dict]:
    raw, _, _ = fetch(url, accept="application/json")
    data = json.loads(raw)
    return [
        {
            "id": item.get("id"),
            "dns_names": item.get("dns_names", []),
            "not_before": item.get("not_before"),
            "not_after": item.get("not_after"),
            "revoked": item.get("revoked"),
        }
        for item in data[:limit]
    ]


def collect_ct_sth(url: str, limit: int) -> list[dict]:
    raw, _, _ = fetch(url, accept="application/json")
    sth = json.loads(raw)
    return [{
        "tree_size": sth.get("tree_size"),
        "timestamp_ms": sth.get("timestamp"),
        "sha256_root_hash": sth.get("sha256_root_hash"),
    }]


def collect_ct_loglist(url: str, limit: int) -> list[dict]:
    raw, _, _ = fetch(url, accept="application/json")
    doc = json.loads(raw)
    logs = [(op.get("name"), log) for op in doc.get("operators", []) for log in op.get("logs", [])]
    return [
        {"operateur": op, "journal": log.get("description"), "url": log.get("url")}
        for op, log in logs[:limit]
    ]


def collect_doh(url: str, limit: int) -> list[dict]:
    raw, _, _ = fetch(url, accept="application/dns-json")
    doc = json.loads(raw)
    answers = doc.get("Answer", [])[:limit]
    return [
        {"nom": a.get("name"), "type": a.get("type"), "ttl": a.get("TTL"), "valeur": a.get("data")}
        for a in answers
    ]


def collect_rdap(url: str, limit: int) -> list[dict]:
    raw, _, _ = fetch(url, accept="application/rdap+json")
    doc = json.loads(raw)
    return [{
        "ldh_name": doc.get("ldhName"),
        "handle": doc.get("handle"),
        "evenements": [
            {"action": e.get("eventAction"), "date": e.get("eventDate")}
            for e in doc.get("events", [])[:limit]
        ],
    }]


def collect_hibp(url: str, limit: int) -> list[dict]:
    raw, _, _ = fetch(url)
    lines = [line for line in raw.decode("utf-8", "replace").splitlines() if ":" in line][:limit]
    # k-anonymat : on ne garde que des suffixe partiels, jamais de hash complet.
    return [{"suffixe_sha1": line.split(":", 1)[0], "occurrences": int(line.split(":", 1)[1])} for line in lines]


def collect_ransomware_page(url: str, limit: int) -> list[dict]:
    html, _, _ = fetch(url)
    text = html.decode("utf-8", "replace")
    meta = re.search(r'<meta name="description" content="([^"]+)"', text)
    title = re.search(r'<meta property="og:title" content="([^"]+)"', text)
    published = re.search(r'"datePublished":\s*"(\d{4}-\d{2}-\d{2})"', text)
    if not meta:
        return []
    pattern = r"discovered on (\d{4}-\d{2}-\d{2}) that (.+?) has been claimed by (.+?) ransomware group"
    match = re.search(pattern, meta.group(1))
    return [{
        "organisation": match.group(2) if match else (title.group(1) if title else None),
        "groupe": match.group(3) if match else None,
        "date": published.group(1) if published else (match.group(1) if match else None),
        "meta": meta.group(1),
        "url": url,
    }][:limit]


COLLECTORS = {
    "na-tech-001": ("atom", collect_atom),
    "na-tech-005": ("ct_loglist", collect_ct_loglist),
    "na-tech-006": ("ct_sth", collect_ct_sth),
    "na-tech-007": ("ct_sth", collect_ct_sth),
    "na-tech-008": ("ct_sth", collect_ct_sth),
    "na-tech-009": ("ct_sth", collect_ct_sth),
    "na-tech-010": ("certspotter", collect_certspotter),
    "na-tech-011": ("certspotter", collect_certspotter),
    "na-tech-017": ("doh", collect_doh),
    "na-tech-018": ("doh", collect_doh),
    "na-tech-019": ("rdap", collect_rdap),
    "na-tech-021": ("rdap", collect_rdap),
    "na-tech-031": ("hibp", collect_hibp),
    "na-tech-041": ("ransomware_page", collect_ransomware_page),
    "na-tech-042": ("ransomware_page", collect_ransomware_page),
}


def build_url(source: dict, domain: str) -> str:
    url = source["acces"]
    if "<" in url:
        prefix = hashlib_prefix(domain)
        return url.replace(url[url.index("<") : url.index(">") + 1], prefix)
    if "domain=gironde.fr" in url and domain != "gironde.fr":
        return url.replace("domain=gironde.fr", "domain=" + urllib.parse.quote(domain))
    if "name=gironde.fr" in url and domain != "gironde.fr":
        return url.replace("name=gironde.fr", "name=" + urllib.parse.quote(domain))
    return url


def hashlib_prefix(value: str) -> str:
    import hashlib

    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:5].upper()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--sources", nargs="+", default=list(DEFAULT_SOURCES))
    parser.add_argument("--all-accessible", action="store_true")
    parser.add_argument("--domain", default="gironde.fr", help="domaine cible pour CT/DNS")
    parser.add_argument("--limit", type=int, default=3, help="nombre max d'éléments par source")
    parser.add_argument("--out", type=Path, help="fichier JSONL de sortie (défaut : stdout)")
    args = parser.parse_args()

    sources = [json.loads(line) for line in args.corpus.read_text(encoding="utf-8").splitlines() if line.strip()]
    by_id = {s["id"]: s for s in sources}
    wanted = (
        [sid for sid, (kind, _) in COLLECTORS.items() if by_id.get(sid, {}).get("statut") == "accessible"]
        if args.all_accessible
        else args.sources
    )

    stream = args.out.open("w", encoding="utf-8") if args.out else sys.stdout
    ok = 0
    try:
        for sid in wanted:
            source = by_id.get(sid)
            if not source:
                print(f"# {sid}: id inconnu", file=sys.stderr)
                continue
            if sid not in COLLECTORS:
                print(f"# {sid}: pas de collecteur implémenté", file=sys.stderr)
                continue
            kind, collector = COLLECTORS[sid]
            url = build_url(source, args.domain)
            try:
                items = collector(url, args.limit, args.domain) if kind == "atom" else collector(url, args.limit)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
                print(f"# {sid}: échec {type(exc).__name__}: {exc}", file=sys.stderr)
                continue
            record = {
                "source_id": sid,
                "source": source["source"],
                "collecte_le": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
                "url": url,
                "type": kind,
                "items": items,
            }
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
            stream.flush()
            ok += 1
            print(f"# {sid}: {len(items)} élément(s)", file=sys.stderr)
            if "ransomware" in sid:
                time.sleep(5)  # Crawl-delay annoncé par ransomware.live
    finally:
        if args.out:
            stream.close()
    print(f"# {ok}/{len(wanted)} source(s) collectée(s)", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
