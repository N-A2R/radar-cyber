#!/usr/bin/env python3
"""Bench A1 — score les prédictions produites par run-core.mts et baselines.py.

Vocabulaire, du point de vue produit (rattacher un événement à une org) :
  TP        bonne organisation rattachée ;
  FP-hors   une organisation est rattachée alors qu'il ne fallait rien rattacher ;
  FP-mauvaise  une organisation est rattachée, mais ce n'est pas la bonne ;
  FN        une organisation était attendue, rien n'est rattaché (abstention) ;
  TN        abstention correcte.

La précision est ce qui compte le plus : un faux rattachement pollue la fiche
d'une organisation et décrédibilise l'outil ; une abstention n'abîme rien.

    python bench/orgs/score.py --results bench/results --md docs/research/bench-a-orgs.md
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_gold() -> dict:
    return json.loads((HERE / "gold-attach.json").read_text())


def score(gold: dict, payload: dict) -> dict:
    tp = fp_void = fp_wrong = fn = tn = 0
    errors = []
    by_cat: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for case in gold["cases"]:
        pred = payload["predictions"].get(case["id"], {})
        got = pred.get("orgId")
        want = case["expect"]
        cat = case["category"]
        if want is None:
            if got is None:
                tn += 1
                by_cat[cat]["ok"] += 1
            else:
                fp_void += 1
                by_cat[cat]["ko"] += 1
                errors.append({**case, "got": got, "kind": "fp-hors-sujet", "reason": pred.get("reason")})
        elif got == want:
            tp += 1
            by_cat[cat]["ok"] += 1
        elif got is None:
            fn += 1
            by_cat[cat]["ko"] += 1
            errors.append({**case, "got": None, "kind": "abstention", "reason": pred.get("reason")})
        else:
            fp_wrong += 1
            by_cat[cat]["ko"] += 1
            errors.append({**case, "got": got, "kind": "mauvaise-org", "reason": pred.get("reason")})

    attached = tp + fp_void + fp_wrong
    expected = tp + fn
    precision = tp / attached if attached else 0.0
    recall = tp / expected if expected else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "engine": payload["engine"],
        "tp": tp,
        "fp_hors_sujet": fp_void,
        "fp_mauvaise_org": fp_wrong,
        "fn": fn,
        "tn": tn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "msPerCase": payload.get("msPerCase"),
        "par_categorie": {k: dict(v) for k, v in sorted(by_cat.items())},
        "erreurs": errors,
    }


def markdown(results: list[dict], gold: dict) -> str:
    lines = [
        "# Bench A — rattachement texte → organisation",
        "",
        f"Jeu : **{len(gold['cases'])} cas annotés à la main**, **{len(gold['orgs'])} organisations** "
        "du référentiel Nouvelle-Aquitaine reconstitué. Ce n'est pas un échantillon aléatoire du flux "
        "réel : les cas couvrent volontairement les modes d'échec connus.",
        "",
        "## Résultats",
        "",
        "| Moteur | Précision | Rappel | F1 | Bons | FP hors-sujet | FP mauvaise org | Abstentions | ms/cas |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in results:
        lines.append(
            f"| `{r['engine']}` | **{r['precision']:.3f}** | {r['recall']:.3f} | {r['f1']:.3f} | "
            f"{r['tp']} | {r['fp_hors_sujet']} | {r['fp_mauvaise_org']} | {r['fn']} | {r['msPerCase']} |"
        )
    lines += ["", "## Par catégorie (ok / cas)", ""]
    cats = sorted({c for r in results for c in r["par_categorie"]})
    lines.append("| Catégorie | " + " | ".join(f"`{r['engine']}`" for r in results) + " |")
    lines.append("| --- | " + " | ".join("---" for _ in results) + " |")
    for cat in cats:
        total = sum(1 for c in gold["cases"] if c["category"] == cat)
        cells = []
        for r in results:
            ok = r["par_categorie"].get(cat, {}).get("ok", 0)
            cells.append(f"{ok}/{total}")
        lines.append(f"| {cat} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, default=HERE.parent / "results")
    parser.add_argument("--md", type=Path)
    args = parser.parse_args()

    gold = load_gold()
    results = []
    for path in sorted(args.results.glob("A1-*.json")):
        if path.stem == "A1-scores":
            continue
        payload = json.loads(path.read_text())
        results.append(score(gold, payload))
    # le cœur d'abord, puis par précision décroissante
    results.sort(key=lambda r: (r["engine"] != "radar-core", -r["precision"], -r["recall"]))

    (args.results / "A1-scores.json").write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")
    report = markdown(results, gold)
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(report)
    print(report)
    for r in results:
        print(f"\n=== {r['engine']} — {len(r['erreurs'])} écarts ===")
        for e in r["erreurs"][:12]:
            print(f"  [{e['kind']}] {e['id']} ({e['category']}) attendu={e['expect']} obtenu={e['got']} — {e['text'][:80]}")


if __name__ == "__main__":
    main()
