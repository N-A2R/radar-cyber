#!/usr/bin/env python3
"""Bench A1 — baselines de rattachement texte -> organisation.

Trois approches comparées au cœur déterministe (`run-core.mts`) :

  substring      alias cherché comme sous-chaîne normalisée (le naïf courant) ;
  rapidfuzz-NN   meilleure fenêtre de jetons comparée par fuzz.ratio, seuil NN ;
  rapidfuzz-tf   token_set_ratio sur le texte entier (variante « sac de mots »).

Règle commune, identique au produit : à égalité de score entre deux
organisations différentes, on rend null (on ne devine pas).

    python bench/orgs/baselines.py --out bench/results
"""
from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from pathlib import Path

from rapidfuzz import fuzz

HERE = Path(__file__).resolve().parent


def normalize(text: str) -> str:
    text = text.replace("œ", "oe").replace("Œ", "OE").replace("æ", "ae").replace("Æ", "AE")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def load_gold() -> dict:
    return json.loads((HERE / "gold-attach.json").read_text())


def alias_rows(gold: dict) -> list[tuple[int, str]]:
    rows: list[tuple[int, str]] = []
    for org in gold["orgs"]:
        for alias in [*org["aliases"], org["name"]]:
            key = normalize(alias)
            # même garde-fou que le produit : pas de domaine, longueur minimale
            if "." in alias or len(key) < 4:
                continue
            rows.append((org["id"], key))
    return rows


def decide(scored: list[tuple[float, int]]) -> int | None:
    """Meilleur score ; null si deux organisations différentes sont à égalité."""
    if not scored:
        return None
    scored.sort(key=lambda x: -x[0])
    best_score, best_org = scored[0]
    if any(org != best_org and score == best_score for score, org in scored[1:]):
        return None
    return best_org


def run_substring(rows, cases):
    preds = {}
    start = time.perf_counter()
    for case in cases:
        key = normalize(case["text"])
        hits = [(len(alias), org) for org, alias in rows if alias in key]
        preds[case["id"]] = {"orgId": decide(hits), "reason": "substring"}
    return preds, (time.perf_counter() - start) * 1000


def best_window_match(tokens: list[str], rows, threshold: int) -> int | None:
    """Compare chaque alias à la fenêtre de jetons de même taille (± 1)."""
    scored: list[tuple[float, int]] = []
    for org, alias in rows:
        n = len(alias.split())
        best = 0.0
        for size in {n, n + 1}:
            for i in range(len(tokens) - size + 1):
                window = " ".join(tokens[i : i + size])
                score = fuzz.ratio(alias, window)
                if score > best:
                    best = score
        if best >= threshold:
            scored.append((best, org))
    return decide(scored)


def run_rapidfuzz_window(rows, cases, threshold: int):
    preds = {}
    start = time.perf_counter()
    for case in cases:
        tokens = normalize(case["text"]).split()
        preds[case["id"]] = {
            "orgId": best_window_match(tokens, rows, threshold),
            "reason": f"rapidfuzz-window-{threshold}",
        }
    return preds, (time.perf_counter() - start) * 1000


def run_rapidfuzz_tokenset(rows, cases, threshold: int):
    preds = {}
    start = time.perf_counter()
    for case in cases:
        key = normalize(case["text"])
        scored = []
        for org, alias in rows:
            score = fuzz.token_set_ratio(alias, key)
            if score >= threshold:
                scored.append((score, org))
        preds[case["id"]] = {"orgId": decide(scored), "reason": f"rapidfuzz-tokenset-{threshold}"}
    return preds, (time.perf_counter() - start) * 1000


def run_hybrid(rows, cases, core_path: Path, threshold: int = 90):
    """Hybride recommandé : le cœur décide ; RapidFuzz ne sert que de filet.

    Le filet n'est interrogé que lorsque le cœur s'abstient (no-alias), et
    seulement au seuil haut. Objectif : récupérer les fautes de frappe sans
    importer les faux positifs du tout-fuzzy.
    """
    core_payload = json.loads(core_path.read_text())
    core = core_payload["predictions"]
    # le temps du cœur est déjà mesuré par run-core.mts : on l'additionne,
    # sinon l'hybride aurait l'air gratuit.
    core_ms = float(core_payload.get("matchMs", 0.0))
    preds = {}
    fallbacks = 0
    start = time.perf_counter()
    for case in cases:
        cid = case["id"]
        base = core.get(cid, {})
        if base.get("orgId") is not None or base.get("reason") in {"ambiguous", "short-only"}:
            preds[cid] = {"orgId": base.get("orgId"), "reason": f"core:{base.get('reason')}"}
        else:
            # le filet n'est payé que sur les abstentions du cœur
            fallbacks += 1
            fallback = best_window_match(normalize(case["text"]).split(), rows, threshold)
            preds[cid] = {
                "orgId": fallback,
                "reason": "fuzzy-fallback" if fallback is not None else "core:no-alias",
            }
    elapsed = (time.perf_counter() - start) * 1000 + core_ms
    print(f"  hybride : {fallbacks}/{len(cases)} abstentions soumises au filet fuzzy")
    return preds, elapsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=HERE.parent / "results")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    gold = load_gold()
    rows = alias_rows(gold)
    cases = gold["cases"]

    runs = [
        ("substring", lambda: run_substring(rows, cases)),
        ("rapidfuzz-window-85", lambda: run_rapidfuzz_window(rows, cases, 85)),
        ("rapidfuzz-window-90", lambda: run_rapidfuzz_window(rows, cases, 90)),
        ("rapidfuzz-window-95", lambda: run_rapidfuzz_window(rows, cases, 95)),
        ("rapidfuzz-tokenset-90", lambda: run_rapidfuzz_tokenset(rows, cases, 90)),
    ]

    core_path = args.out / "A1-radar-core.json"
    if core_path.exists():
        runs.append(("hybrid-core-then-fuzzy", lambda: run_hybrid(rows, cases, core_path, 90)))
    else:
        print("hybride ignoré : lancer d'abord run-core.mts")

    for name, fn in runs:
        preds, elapsed = fn()
        payload = {
            "engine": name,
            "aliases": len(rows),
            "cases": len(cases),
            "matchMs": round(elapsed, 3),
            "msPerCase": round(elapsed / len(cases), 4),
            "predictions": preds,
        }
        (args.out / f"A1-{name}.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
        print(f"{name:<24} {elapsed:8.1f} ms  ({elapsed / len(cases):.3f} ms/cas)")


if __name__ == "__main__":
    main()
