# Sources cassées — diagnostic et réparation

Mesures du 2026-11-10 (`curl -sS -o /dev/null -L -m 45 -A 'RadarCyberNA/0.2 (+https://github.com/j0ltdevv/radar-cyber)' -w '%{http_code} %{size_download} %{time_total}'`).
Script : `scripts/repair-sources.mts` (dry-run par défaut, `--apply` sur décision du parent).

| Source | Mesure | Cause | Action |
|---|---|---|---|
| `quarantine:ransomware.live` | 404 · 27 562 o · 0,19 s | `/v2/recentvictims` retiré ; `/v2/`, `/v3/`, `/docs`, `/recentvictims` → 404 | désactiver |
| `estorides:urlhaus-recent` | 401 · 25 o · 0,20 s | Auth-Key abuse.ch requise ; CSV public de repli → 410 Gone | désactiver (clé `ABUSECH_AUTH_KEY` absente) |
| `estorides:urlhaus-payloads` | 401 · 25 o · 0,12 s | idem urlhaus-recent | désactiver |
| `actu-cybernews` | 200 · 27 535 o · 0,44 s | 403 Cloudflare transitoire, non reproductible | garder |
| `feed:daniel-austin-mbcs:…` | 403 · 303 o · 0,09 s | quota dan.me.uk « every 30 minutes », 3 sources sur le même hôte | désactiver (doublon) |
| `feed:dan-me-uk:…` | 403 · 303 o · 0,10 s | URL identique à `danmeuk-torlist` | désactiver (doublon strict) |
| `ctlog` | 60 s timeout · 0 o (`?q=%.domaine`) ; 502 · 150 o (`?Identity=…`) ; 200 · 28 454 o · 1,79 s (`?q=domaine`) | `source.url` n'est pas un flux ; requête à joker du collecteur | désactiver (correctif = code `ctlog.collector.ts`) |
| `feed:abuse-ch:sslbl-sha256` | 200 · 845 945 o · 0,25 s | timeout du 10/11 non reproductible | garder |
| `feed:sentinelphishfeed:dns:…` | 200 · 11 022 998 o · 1,38 s | timeout GitHub transitoire | garder |
| `feed:spydisec:ip:…` | 200 · 13 965 441 o · 1,26 s | timeout transitoire | garder |
| `feed:threatview-io:dns:…` | 200 · 10 638 764 o · 6,05 s | « fetch failed » transitoire | garder |
| `hermes_radar_cyber` | n/a | URL non HTTP | désactiver |

## Gros flux et délai d'attente

Aucune colonne de délai par source n'existe : `source` n'a que `interval_sec`, et
`fetchResilient` impose 20 s (`generic.fetchText` : 30 s). Mesurés ici, les gros
flux passent tous (14 Mo en 1,3 s pour spydisec, 10,6 Mo en 6 s pour threatview),
donc relever le délai global ne corrigerait rien. Si un flux lent apparaît,
l'option propre est une colonne `timeout_ms` + lecture par le collecteur — hors
périmètre de ce script, qui ne modifie que `url`, `enabled` et `disabled_reason`.

## Réparables par changement d'URL

Aucune : les deux 404/401 sont des endpoints retirés de l'API amont, sans
remplacement HTTP vérifié (`/v3/` et le CSV urlhaus répondent aussi 404/410).
