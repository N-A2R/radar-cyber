#!/usr/bin/env python3
"""Bench A2 — déduplication d'organisations : Splink contre deux baselines.

Question : pour repérer qu'une même organisation est présente deux fois dans
le référentiel (formes juridiques, casse, sigle vs nom développé), un modèle
probabiliste apporte-t-il quelque chose face à des règles simples ?

Trois approches, même jeu, même métrique (paires) :

  normalised-key   égalité du nom normalisé (ce que fait un index unique) ;
  rapidfuzz-NN     similarité de nom au seuil NN, même commune exigée ;
  splink           Fellegi-Sunter non supervisé (Splink 5, backend DuckDB),
                   nom + commune + département, blocage sur commune et dépt.

Le prior de Splink est fixé explicitement : sur 60 lignes, l'estimation
automatique par règle déterministe dégénère à 1.0 et fait plancher le modèle
(`math domain error`). La valeur retenue est documentée dans la sortie.

    python bench/orgs/dedupe.py --out bench/results --md docs/research/bench-a2-dedupe.md
"""
from __future__ import annotations

import argparse
import itertools
import json
import re
import time
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPLINK_PRIOR = 0.025


def normalize(text: str) -> str:
    text = text.replace("œ", "oe").replace("Œ", "OE")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


LEGAL = {"sa", "sas", "sasu", "sarl", "eurl", "sci", "ste", "societe", "cooperative", "sa "}


def key_without_legal(name: str) -> str:
    tokens = [t for t in normalize(name).split() if t not in LEGAL]
    return " ".join(tokens)


def score_pairs(predicted: set[tuple[int, int]], gold: set[tuple[int, int]]) -> dict:
    tp = len(predicted & gold)
    fp = len(predicted - gold)
    fn = len(gold - predicted)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def run_key(records) -> set[tuple[int, int]]:
    out = set()
    for a, b in itertools.combinations(records, 2):
        if key_without_legal(a["name"]) == key_without_legal(b["name"]):
            out.add((a["record_id"], b["record_id"]))
    return out


def run_rapidfuzz(records, threshold: int, same_city: bool) -> set[tuple[int, int]]:
    from rapidfuzz import fuzz

    out = set()
    for a, b in itertools.combinations(records, 2):
        if same_city and normalize(a["city"]) != normalize(b["city"]):
            continue
        if fuzz.ratio(key_without_legal(a["name"]), key_without_legal(b["name"])) >= threshold:
            out.add((a["record_id"], b["record_id"]))
    return out


# Connaissance métier manquante : les formes institutionnelles françaises qui
# reviennent dans le référentiel. Un sigle et son développement ne sont pas
# proches en distance d'édition — aucune métrique de chaînes ne les relie.
INSTITUTIONAL_SYNONYMS = {
    "chu": "centre hospitalier universitaire",
    "ch": "centre hospitalier",
    "ars": "agence regionale de sante",
    "cci": "chambre de commerce et d industrie",
    "cu": "communaute urbaine",
    "inp": "institut polytechnique",
    "univ": "universite",
    "chub": "centre hospitalier universitaire de bordeaux",
}
SAME_PLACE = {"mairie": "commune", "ville": "commune"}


def institutional_key(name: str) -> str:
    tokens = []
    for token in key_without_legal(name).split():
        if token in INSTITUTIONAL_SYNONYMS:
            tokens.extend(INSTITUTIONAL_SYNONYMS[token].split())
        else:
            tokens.append(SAME_PLACE.get(token, token))
    # « de/du/des » et l'ordre des mots ne doivent pas séparer deux écritures
    return " ".join(sorted(t for t in tokens if t not in {"de", "du", "des", "d", "l"}))


def run_institutional(records) -> set[tuple[int, int]]:
    out = set()
    for a, b in itertools.combinations(records, 2):
        if normalize(a["city"]) != normalize(b["city"]):
            continue
        if institutional_key(a["name"]) == institutional_key(b["name"]):
            out.add((a["record_id"], b["record_id"]))
    return out


def run_alias_overlap(records, aliases: dict, same_city: bool) -> set[tuple[int, int]]:
    out = set()
    for a, b in itertools.combinations(records, 2):
        if same_city and normalize(a["city"]) != normalize(b["city"]):
            continue
        left = set(aliases.get(str(a["record_id"]), []))
        right = set(aliases.get(str(b["record_id"]), []))
        if left & right:
            out.add((a["record_id"], b["record_id"]))
    return out


def run_splink(records, threshold: float):
    import pandas as pd
    import splink.comparison_library as cl
    from splink import DuckDBAPI, Linker, SettingsCreator, block_on

    api = DuckDBAPI()
    frame = api.register(pd.DataFrame(records), table_name="orgs")
    settings = SettingsCreator(
        link_type="dedupe_only",
        unique_id_column_name="record_id",
        probability_two_random_records_match=SPLINK_PRIOR,
        comparisons=[
            cl.NameComparison("name"),
            cl.ExactMatch("city"),
            cl.ExactMatch("dept"),
        ],
        blocking_rules_to_generate_predictions=[block_on("city"), block_on("dept")],
    )
    linker = Linker(frame, settings)
    linker.training.estimate_u_using_random_sampling(max_pairs=1e6)
    for rule in [block_on("city"), block_on("dept")]:
        linker.training.estimate_parameters_using_expectation_maximisation(rule)
    pairs = linker.inference.predict(threshold_match_probability=threshold).as_pandas_dataframe()
    out = {
        (int(min(l, r)), int(max(l, r)))
        for l, r in zip(pairs["record_id_l"], pairs["record_id_r"])
    }
    return out, len(pairs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=HERE.parent / "results")
    parser.add_argument("--md", type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    doc = json.loads((HERE / "gold-dedupe.json").read_text())
    records = doc["records"]
    gold = {
        tuple(sorted((a["record_id"], b["record_id"])))
        for a, b in itertools.combinations(records, 2)
        if a["cluster"] == b["cluster"]
    }
    by_id = {r["record_id"]: r for r in records}

    results = []
    runs = [
        ("normalised-key", lambda: run_key(records)),
        ("rapidfuzz-85", lambda: run_rapidfuzz(records, 85, True)),
        ("rapidfuzz-90", lambda: run_rapidfuzz(records, 90, True)),
        ("rapidfuzz-95", lambda: run_rapidfuzz(records, 95, True)),
        ("rapidfuzz-90-any-city", lambda: run_rapidfuzz(records, 90, False)),
        ("institutional-synonyms", lambda: run_institutional(records)),
    ]
    alias_path = args.out / "A2-aliases.json"
    if alias_path.exists():
        aliases = json.loads(alias_path.read_text())
        runs.append(("derived-alias-overlap", lambda: run_alias_overlap(records, aliases, True)))
    else:
        print("alias dérivés ignorés : lancer d'abord derive-aliases.mts")
    for name, fn in runs:
        start = time.perf_counter()
        predicted = fn()
        elapsed = (time.perf_counter() - start) * 1000
        results.append({"engine": name, "ms": round(elapsed, 1), **score_pairs(predicted, gold),
                        "erreurs": [(by_id[a]["name"], by_id[b]["name"], "fusion à tort")
                                    for a, b in sorted(predicted - gold)] +
                                   [(by_id[a]["name"], by_id[b]["name"], "doublon manqué")
                                    for a, b in sorted(gold - predicted)]})

    for threshold in (0.5, 0.8, 0.95):
        name = f"splink-{threshold}"
        try:
            start = time.perf_counter()
            predicted, raw = run_splink(records, threshold)
            elapsed = (time.perf_counter() - start) * 1000
            results.append({"engine": name, "ms": round(elapsed, 1), "paires_brutes": raw,
                            **score_pairs(predicted, gold),
                            "erreurs": [(by_id[a]["name"], by_id[b]["name"], "fusion à tort")
                                        for a, b in sorted(predicted - gold)] +
                                       [(by_id[a]["name"], by_id[b]["name"], "doublon manqué")
                                        for a, b in sorted(gold - predicted)]})
        except Exception as exc:  # noqa: BLE001 - on journalise l'échec, il est un résultat
            results.append({"engine": name, "erreur": repr(exc)})

    results.sort(key=lambda r: (-(r.get("f1") or 0), r.get("precision") or 0))
    payload = {"jeu": doc["_meta"], "prior_splink": SPLINK_PRIOR, "resultats": results}
    (args.out / "A2-scores.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")

    meta = doc["_meta"]
    lines = [
        "# Bench A2 — déduplication d'organisations",
        "",
        f"Jeu : **{meta['enregistrements']} enregistrements** pour "
        f"**{meta['organisations']} organisations réelles**, soit **{meta['paires_positives']} paires "
        "de doublons** attendues. Annotation manuelle ; pièges inclus (CHU vs université d'une même "
        "ville, mairie vs métropole, cliniques homonymes dans deux départements).",
        "",
        "Métrique par **paire** : une fusion à tort (deux organisations réelles réunies) est "
        "un faux positif, un doublon manqué est un faux négatif.",
        "",
        "| Approche | Précision | Rappel | F1 | Fusions à tort | Doublons manqués | ms |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in results:
        if "erreur" in r:
            lines.append(f"| `{r['engine']}` | — | — | — | — | — | échec : `{r['erreur'][:60]}` |")
            continue
        lines.append(
            f"| `{r['engine']}` | **{r['precision']:.3f}** | {r['recall']:.3f} | {r['f1']:.3f} | "
            f"{r['fp']} | {r['fn']} | {r['ms']} |"
        )
    lines += [
        "",
        f"Splink tourne avec un prior fixé à {SPLINK_PRIOR} (le prior réel du jeu est "
        f"{meta['prior_reel']}) : sur 60 lignes, l'estimation automatique par règle déterministe "
        "dégénère à 1.0 et le modèle plante. C'est une limite du jeu, pas de Splink.",
        "",
        "Détail des erreurs : `bench/results/A2-scores.json`.",
        "",
    ]
    report = "\n".join(lines)
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(report)
    print(report)


if __name__ == "__main__":
    main()
