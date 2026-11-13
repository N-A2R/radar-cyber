#!/usr/bin/env python3
"""
Lance un run Exa Agent Ultra pour enrichir les entités manquantes du référentiel.

Usage:
  EXA_API_KEY=exa_... python scripts/exa-agent-manques.py
  EXA_API_KEY=exa_... python scripts/exa-agent-manques.py --dry-run   # affiche sans appeler
  EXA_API_KEY=exa_... python scripts/exa-agent-manques.py --limit 20  # test sur 20 entités

Prérequis: pip install exa-py
Doc: docs/exa-prompts-pret-a-coller.md (Prompt A)
"""
import argparse, json, os, sys, pathlib, time

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true", help="n'appelle pas l'API, affiche la requête")
parser.add_argument("--limit", type=int, default=0, help="limite inputData pour test (0 = tout)")
parser.add_argument("--effort", default="ultra", choices=["minimal","low","medium","high","xhigh","auto","ultra"])
parser.add_argument("--max-cost", type=float, default=10, help="plafond $ (défaut 10)")
parser.add_argument("--max-duration", type=int, default=1800, help="plafond secondes (défaut 1800)")
args = parser.parse_args()

ROOT = pathlib.Path(__file__).resolve().parent.parent
INPUT = ROOT / "bench/results/input-exa-manques.json"
if not INPUT.exists():
    INPUT = ROOT / "bench/results/manques-referentiel-2026-11-13.json"

data = json.loads(INPUT.read_text())
# input-exa-manques.json a {entites: [...]}, l'ancien a {manques: [...]}
entities = data.get("entites") or data.get("manques") or []
if args.limit:
    entities = entities[:args.limit]

print(f"Input: {len(entities)} entités depuis {INPUT}", file=sys.stderr)

query = """Tu es un chercheur OSINT chargé d'enrichir une liste d'entités vues dans des revendications cyber (ransomware, fuites) mais absentes d'un référentiel de 34 330 organisations françaises (focus Nouvelle-Aquitaine).

On te donne 302 entités en inputData (les 109 horsZone déjà écartées). Chacune a : nomLisible, nom (titre brut), zone actuelle (france/inconnue/horsZone), provenance, sources (nombre de sources distinctes), premiereVue, derniereVue.

Ta mission : pour CHAQUE entité d'inputData, déterminer si c'est une organisation française, et si oui retrouver son identité légale.

Règles dures :
- Ne JAMAIS répondre "absent" si un site était bloqué, inaccessible ou non rendu. Dans ce cas réponds "cannot_verify" avec raison="site inaccessible".
- Distingue bien present (preuve trouvée que c'est français) vs absent (preuve trouvée que ce n'est pas français) vs cannot_verify (pas de preuve).
- Le domaine canonique est le domaine officiel actuel, pas un sous-domaine.
- SIREN = 9 chiffres, SIRET = 14 chiffres. Ne les invente jamais.
- Une ville seule ne prouve pas la France (homonymes). Cherche pays + adresse.
- Privilégie : site officiel, societe.com, pappers.fr, annuaire-administration, Wikipedia sourcée. Ignore les blogs sans source.

Pour chaque entité, produis exactement un objet selon outputSchema. Si l'entité est horsZone et clairement étrangère, mets est_francaise="absent" avec preuves, ne cherche pas de SIREN."""

output_schema = {
  "type": "object",
  "required": ["entites", "resume"],
  "additionalProperties": False,
  "properties": {
    "entites": {
      "type": "array",
      "maxItems": 500,
      "items": {
        "type": "object",
        "required": ["nomLisible", "est_francaise", "raison"],
        "additionalProperties": False,
        "properties": {
          "nomLisible": { "type": "string" },
          "nomOriginal": { "type": ["string", "null"] },
          "est_francaise": { "type": "string", "enum": ["present", "absent", "cannot_verify"] },
          "raison": { "type": "string", "maxLength": 300 },
          "domaine_canonique": { "type": ["string", "null"] },
          "denomination_legale": { "type": ["string", "null"] },
          "siren": { "type": ["string", "null"], "pattern": "^[0-9]{9}$" },
          "siret_siege": { "type": ["string", "null"], "pattern": "^[0-9]{14}$" },
          "ville": { "type": ["string", "null"] },
          "departement": { "type": ["string", "null"] },
          "region": { "type": ["string", "null"] },
          "type_organisation": { "type": ["string", "null"], "enum": ["entreprise", "association", "collectivite", "etablissement_public", "autre", None] },
          "sources_preuves": { "type": "array", "maxItems": 5, "items": { "type": "string", "format": "uri" } },
          "confiance": { "type": "string", "enum": ["haute", "moyenne", "faible"] }
        }
      }
    },
    "resume": {
      "type": "object",
      "required": ["france_present", "france_absent", "cannot_verify", "avec_siren"],
      "additionalProperties": False,
      "properties": {
        "france_present": { "type": "integer", "minimum": 0 },
        "france_absent": { "type": "integer", "minimum": 0 },
        "cannot_verify": { "type": "integer", "minimum": 0 },
        "avec_siren": { "type": "integer", "minimum": 0 },
        "note": { "type": ["string", "null"], "maxLength": 500 }
      }
    }
  }
}

payload = {
    "query": query,
    "effort": args.effort,
    "output_schema": output_schema,
    "input_data": entities,  # exa-py attend inputData / input_data selon version
    "budget": {"maxCostDollars": args.max_cost, "maxDurationSeconds": args.max_duration},
}

if args.dry_run:
    print(json.dumps({"query": query[:200]+"...", "effort": args.effort, "budget": payload["budget"], "input_count": len(entities), "output_schema_keys": list(output_schema["properties"].keys())}, indent=2, ensure_ascii=False))
    sys.exit(0)

api_key = os.getenv("EXA_API_KEY")
if not api_key:
    print("EXA_API_KEY manquant. Export d'abord: export EXA_API_KEY=exa_...", file=sys.stderr)
    print("Astuce: teste avec --dry-run pour voir la requête sans appeler.", file=sys.stderr)
    sys.exit(1)

try:
    from exa_py import Exa
except ImportError:
    print("pip install exa-py d'abord (pip install exa-py)", file=sys.stderr)
    sys.exit(1)

exa = Exa(api_key=api_key)
print(f"Lancement Agent effort={args.effort} maxCost=${args.max_cost} maxDuration={args.max_duration}s ...", file=sys.stderr)
# Tentative avec les noms de params les plus courants (SDK évolue vite)
try:
    run = exa.agent.runs.create(
        query=query,
        effort=args.effort,
        output_schema=output_schema,
        input_data=entities,
        budget={"maxCostDollars": args.max_cost, "maxDurationSeconds": args.max_duration},
    )
except TypeError as e:
    print(f"Signature exa.agent.runs.create a changé ({e}), tentative snake/camel fallback...", file=sys.stderr)
    run = exa.agent.runs.create(
        query=query,
        effort=args.effort,
        outputSchema=output_schema,
        inputData=entities,
        budget={"maxCostDollars": args.max_cost, "maxDurationSeconds": args.max_duration},
    )

print(f"Run créé: {run.id} status={getattr(run,'status', '?')}", file=sys.stderr)
# poll_until_finished peut s'appeler poll_until_finished ou wait_until_finished selon version
poll = getattr(exa.agent.runs, "poll_until_finished", None) or getattr(exa.agent.runs, "wait_until_finished", None)
if poll:
    print("Polling (ça peut prendre 10-30 min en ultra)...", file=sys.stderr)
    run = poll(run.id, timeout_ms=args.max_duration*1000 + 60000)
else:
    # fallback: boucle manuelle
    for _ in range(120):
        time.sleep(30)
        run = exa.agent.runs.get(run.id)
        print(f"  ... {run.status} {getattr(run,'stop_reason', '')}", file=sys.stderr)
        if run.status in ("completed","failed","stopped"):
            break

print(f"Terminé: status={run.status} stop_reason={getattr(run,'stop_reason', getattr(run,'stopReason','?'))}", file=sys.stderr)
out_path = ROOT / f"bench/results/exa-manques-{time.strftime('%Y-%m-%d')}.json"
# Sauvegarde brute (avec grounding)
dump = {
    "run_id": run.id,
    "status": getattr(run, "status", None),
    "stop_reason": getattr(run, "stop_reason", getattr(run, "stopReason", None)),
    "cost": getattr(run, "cost", getattr(run, "usage", None)),
    "output": getattr(getattr(run, "output", None), "structured", None) or getattr(run, "output", None),
    "grounding": getattr(getattr(run, "output", None), "grounding", None),
}
out_path.write_text(json.dumps(dump, ensure_ascii=False, indent=2))
print(f"Sauvé: {out_path}", file=sys.stderr)
if dump["output"]:
    entites = dump["output"].get("entites", []) if isinstance(dump["output"], dict) else []
    print(f"Entités retournées: {len(entites)}", file=sys.stderr)
    if isinstance(dump["output"], dict) and "resume" in dump["output"]:
        print(f"Résumé: {dump['output']['resume']}", file=sys.stderr)
