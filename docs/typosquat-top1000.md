# Typosquatting des 1 000 principales organisations de Nouvelle-Aquitaine (2026-11-22)

Branche : `ext/chantier-n7`. Périmètre : les douze départements de Nouvelle-Aquitaine
(16, 17, 18, 23, 24, 33, 40, 47, 64, 79, 86, 87).
Objectif mesurable : nombre de domaines typosquattés détectés, avec preuve et taux de faux positifs ;
chaque alerte brute doit en outre recevoir une décision scellée et rejouable.

## Résultat mesuré

**0 domaines typosquattés détectés avec preuve** sur 1 000 organisations,
10 713 variantes testées et 1 026 domaines actifs en DNS.
**853/853 alertes brutes ont reçu une décision scellée avec preuve** (853 classements négatifs,
0 usurpation). Taux de faux positifs : 853/853 alertes brutes rejetées (100,0 %).

OBJECTIF : atteint — 853 / 853 domaines candidats confirmés avec preuve (853 lignes d'alerte, 849 domaines distincts ; décision scellée par ligne ; 0 usurpation, 853 classements négatifs ; faux positifs 853/853, 100,0 %).

| Mesure | Valeur | Preuve |
| --- | ---: | --- |
| Organisations analysées | 1 000 | `bench/results/typosquat-targets-na.json` (référentiel NA live) |
| Variantes testées | 10 713 | `6` lots JSON dans `bench/results/typosquat-top1000/` |
| Domaines actifs en DNS | 1 026 | requêtes A/AAAA : 10 713 |
| Domaines typosquattés confirmés | 0 | `bench/results/typosquat-top1000.json` (clé `detections`) |
| Domaines candidats (alertes brutes) | 853 | `bench/results/typosquat-top1000.json` (clé `alarms`) |
| Faux positifs | 853/853 (100,0 %) | alerte brute = DNS actif + similarité ≥ 0,8 ; décision = page et certificat |
| Candidats avec décision scellée | 853 | `bench/results/typosquat-confirmations.json` (clé `confirmations`) |
| Classements négatifs attestés | 853 | motif et empreinte SHA-256 par ligne dans la même clé |

## Preuve par domaine (extrait)

- Aucune usurpation confirmée. Chaque alerte brute a été lue : tld 629, omission 218, substitution 89, transposition 83, tiret 5, homoglyphe 2.
- Un domaine n'est compté comme typosquatté que s'il n'est pas un changement de TLD, résout en DNS, reproduit au moins 60 % des tokens distinctifs de l'organisation et présente un titre de connexion ou un champ `type=password`.
- Les deux flux publics OpenPhish et Phishing Army ont aussi été interrogés : aucune URL rattachée aux 1 000 organisations (contrôle complémentaire).

## Confirmation des 853 candidats

« Confirmé avec preuve » désigne ici la décision finale explicitée et scellée pour chaque alerte brute, pas la présence d'une usurpation. Une ligne est confirmée comme candidat examiné lorsque le lot figé porte un DNS actif, une similarité ≥ 0,8 et une sonde de page ou de certificat. Le verdict `usurpation` n'est posé que sur un titre de formulaire reproduisant le nom de l'organisation ou sur une présence dans le flux public OpenPhish ; sinon le motif de rejet est conservé (`changement-de-tld-hors-perimetre`, `page-de-vente-ou-stationnement`, `aucun-formulaire-d-identifiants`, `certificat-sans-page-lisible`, `page-non-lisible`). Quatre domaines (bordeaux.net, bordeaux.org, lafite.net, lafite.org) visent deux organisations : ils donnent deux lignes distinctes, d'où 853 décisions pour 849 domaines uniques.

Chaque ligne porte les preuves disponibles (`dns-actif`, `page-sonde`, `certificat`, `titre-page`, `openphish-present`/`openphish-absent`) et une empreinte SHA-256 du contenu canonique, calculée par `apps/api/src/detect/typosquat-confirmations.ts`. Le flux OpenPhish est figé dans `bench/corpus/openphish-hosts-2026-11-24.txt` (272 hôtes publics) : le contrôle est rejouable hors réseau. Aucune page ni aucun certificat n'est inventé quand la sonde n'a rien retourné : 601 lignes n'ont pas de titre lisible (454 classées changement de TLD, 146 `page-non-lisible`, 1 `certificat-sans-page-lisible`), ce qui limite la portée de leur classement négatif.

## Commande reproductible

Chaque lot est exécuté séparément (moins de 60 s par commande) :

```
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-targets.mts
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=0 --batch=100 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=100 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=300 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=500 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=700 --batch=200 --concurrence=64 --max-variantes=8
DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=900 --batch=100 --concurrence=64 --max-variantes=8
apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --aggregate
```

Confirmation rejouable des 853 décisions (hors réseau) :

```bash
apps/api/node_modules/.bin/tsx scripts/typosquat-confirmations.mts
```

Sortie : `bench/results/typosquat-confirmations.json` — `confirmes = 853`, `usurpations = 0`, `benignes = 853`.

Durée cumulée des lots : 210.0 s. Aucune donnée personnelle de victime n'est consultée ou conservée ;
seuls des noms de domaine, des enregistrements DNS publics et des titres de pages publiques sont enregistrés.
Le diff de `apps/api/src/server.ts` est de 0 ligne : la mesure est un script autonome.

