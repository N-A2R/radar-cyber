# Balayage exhaustif des variantes typo des 1 000 principales organisations de Nouvelle-Aquitaine (2026-11-22)

Branche : `ext/chantier-n7`. Périmètre : les douze départements de Nouvelle-Aquitaine
(16, 17, 18, 23, 24, 33, 40, 47, 64, 79, 86, 87).
Objectif mesurable : nombre de domaines typosquattés détectés, avec preuve et taux de faux positifs.
Mode : toutes les variantes typo générées, sans échantillonnage (les changements de TLD restent exclus de la confirmation).

## Résultat mesuré

**0 domaines typosquattés détectés avec preuve** sur 1 000 organisations,
70 827 variantes testées et 1 896 domaines actifs en DNS.
Taux de faux positifs : 1 508/1 508 alertes brutes rejetées (100,0 %).

OBJECTIF : partiel — 0 / 1 508 domaines candidats confirmés avec preuve, manque 1 508 confirmations, faux positifs 1 508/1 508 (100,0 %).

RÉSULTAT PARTIEL : toutes les variantes typo plausibles des 1 000 organisations NA ont été testées ; aucune usurpation n'a été confirmée avec preuve (1 896 domaines actifs en DNS, 1 508 candidats, 0 confirmé).

| Mesure | Valeur | Preuve |
| --- | ---: | --- |
| Organisations analysées | 1 000 | `bench/results/typosquat-targets-na.json` (référentiel NA live) |
| Variantes testées | 70 827 | `25` lots JSON dans `bench/results/typosquat-exhaustive/` |
| Domaines actifs en DNS | 1 896 | requêtes A/AAAA : 70 827 |
| Domaines typosquattés confirmés | 0 | `bench/results/typosquat-exhaustive.json` (clé `detections`) |
| Domaines candidats (alertes brutes) | 1 508 | `bench/results/typosquat-exhaustive.json` (clé `alarms`) |
| Faux positifs | 1 508/1 508 (100,0 %) | alerte brute = DNS actif + similarité ≥ 0,8 ; décision = page et certificat |

## Preuve par domaine (extrait)

- Aucune usurpation confirmée. Chaque alerte brute a été lue : tld 662, omission 564, substitution 425, transposition 153, tiret 71, homoglyphe 21.
- Un domaine n'est compté comme typosquatté que s'il n'est pas un changement de TLD, résout en DNS, reproduit au moins 60 % des tokens distinctifs de l'organisation et présente un titre de connexion ou un champ `type=password`.
- Les deux flux publics OpenPhish et Phishing Army ont aussi été interrogés : aucune URL rattachée aux 1 000 organisations (contrôle complémentaire).

## Commande reproductible

Chaque lot est exécuté séparément (moins de 60 s par commande) :

DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-targets.mts
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=0 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=40 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=80 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=120 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=160 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=200 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=240 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=280 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=320 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=360 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=400 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=440 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=480 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=520 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=560 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=600 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=640 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=680 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=720 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=760 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=800 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=840 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=880 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=920 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --targets=bench/results/typosquat-targets-na.json --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --offset=960 --batch=40 --concurrence=64 --max-variantes=1000
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --dir=bench/results/typosquat-exhaustive --label=exhaustive --final=bench/results/typosquat-exhaustive.json --report=docs/typosquat-exhaustive.md --aggregate
```

Durée cumulée des lots : 640.4 s. Aucune donnée personnelle de victime n'est consultée ou conservée ;
seuls des noms de domaine, des enregistrements DNS publics et des titres de pages publiques sont enregistrés.
Le diff de `apps/api/src/server.ts` est de 0 ligne : la mesure est un script autonome.

