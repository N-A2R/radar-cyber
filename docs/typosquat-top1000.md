# Typosquatting des 1 000 principales organisations de Nouvelle-Aquitaine (2026-11-22)

Branche : `ext/chantier-n7`. Périmètre : les douze départements de Nouvelle-Aquitaine
(16, 17, 18, 23, 24, 33, 40, 47, 64, 79, 86, 87).
Objectif mesurable : nombre de domaines typosquattés détectés, avec preuve et taux de faux positifs.

## Résultat mesuré

**0 domaines typosquattés détectés avec preuve** sur 1 000 organisations,
10 713 variantes testées et 1 026 domaines actifs en DNS.
Taux de faux positifs : 853/853 alertes brutes rejetées (100,0 %).

OBJECTIF : partiel — 0 / 853 domaines candidats confirmés avec preuve, manque 853 confirmations, faux positifs 853/853 (100,0 %).

| Mesure | Valeur | Preuve |
| --- | ---: | --- |
| Organisations analysées | 1 000 | `bench/results/typosquat-targets-na.json` (référentiel NA live) |
| Variantes testées | 10 713 | `6` lots JSON dans `bench/results/typosquat-top1000/` |
| Domaines actifs en DNS | 1 026 | requêtes A/AAAA : 10 713 |
| Domaines typosquattés confirmés | 0 | `bench/results/typosquat-top1000.json` (clé `detections`) |
| Domaines candidats (alertes brutes) | 853 | `bench/results/typosquat-top1000.json` (clé `alarms`) |
| Faux positifs | 853/853 (100,0 %) | alerte brute = DNS actif + similarité ≥ 0,8 ; décision = page et certificat |

## Preuve par domaine (extrait)

- Aucune usurpation confirmée. Chaque alerte brute a été lue : tld 629, omission 218, substitution 89, transposition 83, tiret 5, homoglyphe 2.
- Un domaine n'est compté comme typosquatté que s'il n'est pas un changement de TLD, résout en DNS, reproduit au moins 60 % des tokens distinctifs de l'organisation et présente un titre de connexion ou un champ `type=password`.
- Les deux flux publics OpenPhish et Phishing Army ont aussi été interrogés : aucune URL rattachée aux 1 000 organisations (contrôle complémentaire).

## Commande reproductible

Chaque lot est exécuté séparément (moins de 60 s par commande) :

DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-targets.mts
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=0 --batch=100 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=100 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=300 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=500 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=700 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=900 --batch=100 --concurrence=64 --max-variantes=8
apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --aggregate
```

Durée cumulée des lots : 210.0 s. Aucune donnée personnelle de victime n'est consultée ou conservée ;
seuls des noms de domaine, des enregistrements DNS publics et des titres de pages publiques sont enregistrés.
Le diff de `apps/api/src/server.ts` est de 0 ligne : la mesure est un script autonome.

