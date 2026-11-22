# Rapport — sources d'actualité institutionnelles de Nouvelle-Aquitaine

Branche : `ext/sources-institutions-2` ; livraison décrite dans la PR #398.

## Résultat mesuré

Le corpus `bench/corpus/sources-institutions.jsonl` contient **55 sources**, chacune avec `preuve.http_status = 200` : 42 vérifications HTTP directes et 13 pages relayées via `r.jina.ai` (origine non joignable en direct, méthode consignée dans chaque preuve). Le détail est dans `bench/results/verification-sources-institutions.json`.

Mesure reproductible, depuis la racine du dépôt :

```sh
python3 - <<'PY'
import json
from pathlib import Path
lignes = [json.loads(l) for l in Path('bench/corpus/sources-institutions.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()]
print(sum(1 for l in lignes if l['preuve'].get('http_status') == 200))
PY
# 55
```

La cible déclarée lors de la livraison était d'au moins 40 sources institutionnelles vérifiées.

OBJECTIF : atteint — 55 / 40
