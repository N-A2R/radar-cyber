#!/usr/bin/env python3
"""Bench B — score les extractions avec le script d'évaluation du corpus.

On réutilise `evaluate.py` de `article-extraction-benchmark` (MIT) plutôt que
de réécrire une métrique : F1 sur shingles de tokens, plus intervalles de
confiance par bootstrap. Le script attend `ground-truth.json` et `output/*.json`
dans son répertoire courant : on lui prépare cette arborescence dans un dossier
temporaire, sans rien modifier au corpus.

    python bench/sources/score.py --corpus /chemin/article-extraction-benchmark \
        --results bench/results --md docs/research/bench-b-sources.md
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--md", type=Path)
    parser.add_argument("--n-bootstrap", type=int, default=1000)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="radar-bench-b-") as tmp:
        work = Path(tmp)
        shutil.copy(args.corpus / "evaluate.py", work / "evaluate.py")
        shutil.copy(args.results / "B-ground-truth.json", work / "ground-truth.json")
        (work / "output").mkdir()
        for path in sorted(args.results.glob("B-*.json")):
            if path.stem in {"B-ground-truth", "B-runtime", "B-scores"}:
                continue
            shutil.copy(path, work / "output" / f"{path.stem[2:]}.json")

        proc = subprocess.run(
            [
                sys.executable,
                "evaluate.py",
                "--n-bootstrap",
                str(args.n_bootstrap),
                "--output",
                "scores.json",
            ],
            cwd=work,
            capture_output=True,
            text=True,
            check=True,
        )
        table = proc.stdout.strip()
        scores = json.loads((work / "scores.json").read_text())

    runtime = json.loads((args.results / "B-runtime.json").read_text())
    # tp_fp_fns est volumineux et inutile dans le dépôt : on ne garde que les métriques.
    clean = {
        name: {k: round(v, 4) for k, v in metrics.items() if isinstance(v, (int, float))}
        for name, metrics in scores.items()
    }
    (args.results / "B-scores.json").write_text(
        json.dumps({"metrics": clean, "runtime": runtime}, indent=1, ensure_ascii=False) + "\n"
    )

    pages = next(iter(runtime.values()))["pages"]
    lines = [
        "# Bench B — extraction d'articles (HTML → texte)",
        "",
        f"Corpus : **{pages} pages HTML réelles annotées**, `scrapinghub/article-extraction-benchmark` "
        "(MIT), corpus neutre indépendant des deux extracteurs. Métrique : celle du corpus "
        "(`evaluate.py`, F1 sur shingles de tokens, ± écart-type par bootstrap 1000 tirages).",
        "",
        "| Extracteur | Version | F1 | Précision | Rappel | Page entière exacte |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for name, m in sorted(scores.items(), key=lambda kv: -kv[1]["f1"]):
        lines.append(
            f"| `{name}` | {m.get('version', '')} | **{m['f1']:.3f}** ± {m['f1_std']:.3f} | "
            f"{m['precision']:.3f} ± {m['precision_std']:.3f} | {m['recall']:.3f} ± {m['recall_std']:.3f} | "
            f"{m['accuracy']:.3f} |"
        )
    lines += [
        "",
        "« Page entière exacte » = part des pages dont le texte extrait est exactement "
        "celui de l'annotation (métrique `accuracy` du corpus).",
        "",
        "## Coût d'exécution et pages vides",
        "",
        "| Extracteur | Version | Pages vides | Erreurs | Total | ms/page |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for name, r in runtime.items():
        lines.append(
            f"| `{name}` | {r['version']} | {r['empty']}/{r['pages']} | {r['errors']} | "
            f"{r['total_s']} s | **{r['ms_per_page']}** |"
        )
    lines += ["", "Sortie brute du script du corpus :", "", "```", table, "```"]
    report = "\n".join(lines) + "\n"
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(report)
    print(report)


if __name__ == "__main__":
    main()
