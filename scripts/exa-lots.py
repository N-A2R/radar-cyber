#!/usr/bin/env python3
"""Rattrapage référentiel par lots bornés, via l'API Exa Agent.

Pourquoi par lots : un run `ultra` facture à l'usage (recherches + ACU) et a
dépassé 10 $ sans publier de sortie structurée. Un effort fixe (`medium`
0,10 $, `high` 0,50 $) fait la même recherche pour un prix connu d'avance.

Usage :
  python3 exa-lots.py --effort medium --lot 1         # un seul lot (pilote)
  python3 exa-lots.py --effort medium --lot 1-10      # tous les lots
  python3 exa-lots.py --effort high --size 20
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://api.exa.ai/agent/runs"
HERE = Path(__file__).resolve().parent
INPUT = HERE / "input-exa-manques.json"
QUERY = HERE / "promptA-query.txt"
SCHEMA = HERE / "promptA-schema.json"
OUT = HERE / "results"


def api(path: str, body: dict | None = None) -> dict:
    key = os.environ["EXA_API_KEY"]
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"x-api-key": key, "content-type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def query_for(n: int) -> str:
    q = QUERY.read_text(encoding="utf-8")
    return q.replace("On te donne 302 entités en inputData", f"On te donne {n} entités en inputData")


def parse_lots(spec: str) -> list[int]:
    if "-" in spec:
        a, b = spec.split("-")
        return list(range(int(a), int(b) + 1))
    return [int(spec)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--effort", default="medium", choices=["minimal", "low", "medium", "high", "xhigh"])
    ap.add_argument("--size", type=int, default=30, help="entités par lot")
    ap.add_argument("--lot", default="1", help="1, ou 1-10")
    ap.add_argument("--max-cost", type=float, default=1.0)
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    entities = json.loads(INPUT.read_text(encoding="utf-8"))["entites"]
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    lots = [entities[i : i + args.size] for i in range(0, len(entities), args.size)]
    print(f"{len(entities)} entités -> {len(lots)} lots de {args.size} · effort={args.effort}")

    for n in parse_lots(args.lot):
        idx = n - 1
        if idx < 0 or idx >= len(lots):
            print(f"lot {n} : hors plage (1-{len(lots)})")
            continue
        batch = lots[idx]
        body = {
            "query": query_for(len(batch)),
            "effort": args.effort,
            "outputSchema": schema,
            "input": {"data": batch},
            "budget": {"maxCostDollars": args.max_cost},
        }
        if args.dry_run:
            print(f"lot {n}: {len(batch)} entités, {len(body['query'])} car. de requête (dry-run)")
            continue

        run = api("", body)
        rid = run["id"]
        print(f"lot {n}: {rid} · {len(batch)} entités · en cours…", flush=True)

        started = time.time()
        while True:
            time.sleep(10)
            r = api(f"/{rid}")
            if r["status"] not in ("running", "queued", "pending"):
                break
            if time.time() - started > args.timeout:
                print(f"lot {n}: timeout local après {args.timeout}s (le run continue côté Exa)")
                break

        OUT.mkdir(parents=True, exist_ok=True)
        dest = OUT / f"exa-lot-{n:02d}-{args.effort}.json"
        dest.write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")

        structured = (r.get("output") or {}).get("structured") or {}
        ents = structured.get("entites") or []
        print(
            f"lot {n}: {r['status']} · stop={r.get('stopReason')} · "
            f"{len(ents)}/{len(batch)} entités · {r['costDollars']['total']:.4f} $ -> {dest.name}"
        )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read()[:400].decode(errors='replace')}")
        sys.exit(1)
