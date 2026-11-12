#!/usr/bin/env python3
"""Bench B — qualité d'extraction d'articles : trafilatura vs newspaper4k.

Corpus : `scrapinghub/article-extraction-benchmark` (MIT), 181 pages HTML réelles
avec corps d'article annoté à la main. Corpus neutre : il n'est maintenu par
aucun des deux extracteurs testés. Le script produit des prédictions au format
attendu par `evaluate.py` du corpus, que l'on réutilise tel quel pour scorer
(F1 sur shingles de tokens, intervalles par bootstrap).

Le réseau du sandbox ne permet pas de joindre les sites de presse régionaux :
ce bench mesure donc l'étage « parsed » (HTML -> texte d'article) sur un corpus
externe, pas le rendement bout-en-bout de nos 594 sources. Voir README.

    python bench/sources/extract.py --corpus /chemin/article-extraction-benchmark \
        --out bench/results
    python bench/sources/extract.py --corpus ... --limit 40   # échantillon rapide
"""
from __future__ import annotations

import argparse
import gzip
import json
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read_pages(corpus: Path, limit: int | None):
    truth = json.loads((corpus / "ground-truth.json").read_text())
    keys = sorted(truth)
    if limit:
        # échantillon déterministe, spread sur le corpus
        step = max(1, len(keys) // limit)
        keys = keys[::step][:limit]
    pages = []
    for key in keys:
        with gzip.open(corpus / "html" / f"{key}.html.gz", "rt", encoding="utf-8", errors="replace") as fh:
            pages.append((key, fh.read()))
    return truth, pages


def run_trafilatura(pages):
    import trafilatura

    out, timings, failures = {}, [], []
    for key, html in pages:
        start = time.perf_counter()
        try:
            text = trafilatura.extract(
                html,
                include_comments=False,
                include_tables=True,
                favor_precision=True,
            )
        except Exception as exc:  # noqa: BLE001 - on journalise, on continue
            failures.append({"id": key, "error": repr(exc)})
            text = None
        timings.append(time.perf_counter() - start)
        out[key] = {"articleBody": text or ""}
    return out, timings, failures, trafilatura.__version__


def run_newspaper(pages):
    import newspaper

    out, timings, failures = {}, [], []
    for key, html in pages:
        start = time.perf_counter()
        try:
            article = newspaper.Article(url=f"https://example.invalid/{key}", language="en")
            article.download(input_html=html)
            article.parse()
            text = article.text
        except Exception as exc:  # noqa: BLE001
            failures.append({"id": key, "error": repr(exc)})
            text = None
        timings.append(time.perf_counter() - start)
        out[key] = {"articleBody": text or ""}
    return out, timings, failures, newspaper.__version__


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=HERE.parent / "results")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    truth, pages = read_pages(args.corpus, args.limit)
    # evaluate.py exige exactement les mêmes clés que la vérité terrain
    subset = {k: truth[k] for k, _ in pages}
    (args.out / "B-ground-truth.json").write_text(json.dumps(subset, ensure_ascii=False))

    summary = {}
    for name, runner in (("trafilatura", run_trafilatura), ("newspaper4k", run_newspaper)):
        out, timings, failures, version = runner(pages)
        empty = sum(1 for v in out.values() if not v["articleBody"].strip())
        payload = {"version": version, "output": out}
        (args.out / f"B-{name}.json").write_text(json.dumps(payload, ensure_ascii=False))
        total = sum(timings)
        summary[name] = {
            "version": version,
            "pages": len(pages),
            "empty": empty,
            "errors": len(failures),
            "total_s": round(total, 2),
            "ms_per_page": round(total / len(pages) * 1000, 1),
            "failures": failures[:10],
        }
        print(
            f"{name:<14} v{version:<10} pages={len(pages)} vides={empty} erreurs={len(failures)} "
            f"total={total:.1f}s  {total / len(pages) * 1000:.0f} ms/page"
        )

    (args.out / "B-runtime.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
